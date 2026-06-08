from datetime import date
from typing import Any, List
import io
import json
import os
import pathlib
import sqlite3

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
import numpy as np
import pandas as pd
from pydantic import BaseModel


load_dotenv()

app = FastAPI(title="Smart Chart Builder API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

DAILY_LIMIT = int(os.getenv("DAILY_LIMIT", "1000"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
MAX_FILES = int(os.getenv("MAX_FILES", "5"))
DB_PATH = os.path.join(os.path.dirname(__file__), "quota.db")
SUPPORTED_CHART_TYPES = {"bar", "line", "area", "pie", "doughnut", "scatter", "bubble", "radar", "polarArea"}


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS quota (
            ip TEXT,
            date TEXT,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (ip, date)
        )
        """
    )
    conn.commit()
    conn.close()


init_db()


def check_and_use_quota(ip: str) -> int:
    today = str(date.today())
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT count FROM quota WHERE ip=? AND date=?", (ip, today)
    ).fetchone()
    current = row[0] if row else 0
    if current >= DAILY_LIMIT:
        conn.close()
        raise HTTPException(status_code=429, detail=f"Daily AI usage limit exceeded ({DAILY_LIMIT}/day)")

    new_count = current + 1
    conn.execute(
        """
        INSERT INTO quota (ip, date, count) VALUES (?, ?, ?)
        ON CONFLICT(ip, date) DO UPDATE SET count=excluded.count
        """,
        (ip, today, new_count),
    )
    conn.commit()
    conn.close()
    return DAILY_LIMIT - new_count


def detect_column_type(series: pd.Series) -> str:
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    try:
        pd.to_datetime(series.dropna().head(20))
        return "date"
    except Exception:
        return "categorical"


def parse_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    ext = filename.rsplit(".", 1)[-1].lower()
    if not file_bytes:
        raise HTTPException(status_code=400, detail=f"{filename} is empty")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"{filename} exceeds the {MAX_UPLOAD_BYTES} byte upload limit")

    if ext == "csv":
        df = pd.read_csv(io.BytesIO(file_bytes))
    elif ext in ("xlsx", "xls"):
        df = pd.read_excel(io.BytesIO(file_bytes))
    elif ext == "json":
        df = pd.read_json(io.BytesIO(file_bytes))
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV, Excel, or JSON.")

    if df.empty:
        raise HTTPException(status_code=400, detail=f"{filename} does not contain any rows")

    for col in df.columns:
        if df[col].dtype == object:
            try:
                cleaned = df[col].astype(str).str.replace(",", "").str.strip()
                df[col] = pd.to_numeric(cleaned, errors="raise")
            except Exception:
                pass
    return df


async def load_uploaded_dataframe(files: List[UploadFile]) -> pd.DataFrame:
    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Upload at most {MAX_FILES} files at once")

    dfs = []
    for file in files:
        content = await file.read()
        try:
            dfs.append(parse_file(content, file.filename or "upload.csv"))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not parse {file.filename}: {e}")

    if len(dfs) == 1:
        df = dfs[0]
    else:
        first_cols = set(dfs[0].columns)
        all_same_cols = all(set(d.columns) == first_cols for d in dfs[1:])
        if all_same_cols:
            df = pd.concat(dfs, ignore_index=True)
        else:
            df = pd.concat(dfs, axis=1)
            df = df.loc[:, ~df.columns.duplicated()].copy()

    df.columns = df.columns.astype(str)
    return df


def build_summary(df: pd.DataFrame) -> dict:
    summary: dict = {"rows": len(df), "columns": {}}
    for col in df.columns:
        s = df[col]
        col_type = detect_column_type(s)
        info: dict = {"type": col_type, "nulls": int(s.isna().sum())}
        if col_type == "numeric":
            info["min"] = float(s.min()) if not s.isna().all() else None
            info["max"] = float(s.max()) if not s.isna().all() else None
            info["mean"] = round(float(s.mean()), 4) if not s.isna().all() else None
        elif col_type == "categorical":
            info["unique"] = int(s.nunique())
            info["top"] = {str(k): int(v) for k, v in s.value_counts().head(3).items()}
        summary["columns"][col] = info
    return summary


def clean_json_response(text: str) -> str:
    import re

    text = text.strip()
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        return match.group(1).strip()

    start_idx = text.find("{")
    start_list = text.find("[")
    if start_idx == -1 and start_list != -1:
        start = start_list
    elif start_list == -1 and start_idx != -1:
        start = start_idx
    elif start_idx != -1 and start_list != -1:
        start = min(start_idx, start_list)
    else:
        start = 0

    end_idx = text.rfind("}")
    end_list = text.rfind("]")
    if end_idx == -1 and end_list != -1:
        end = end_list
    elif end_list == -1 and end_idx != -1:
        end = end_idx
    elif end_idx != -1 and end_list != -1:
        end = max(end_idx, end_list)
    else:
        end = len(text) - 1

    if start != -1 and end != -1 and end >= start:
        text = text[start:end + 1]
    return text.strip()


def normalize_recommendations(raw: Any, summary: dict) -> list[dict]:
    if isinstance(raw, dict) and isinstance(raw.get("charts"), list):
        raw = raw["charts"]
    if not isinstance(raw, list):
        raise HTTPException(status_code=500, detail="Gemini response must be a JSON array")

    columns = set(summary["columns"].keys())
    numeric_columns = {
        name for name, info in summary["columns"].items()
        if info.get("type") == "numeric"
    }
    fallback_x = next(iter(columns), "")
    fallback_y = [next(iter(numeric_columns), fallback_x)] if columns else []
    normalized = []
    seen_bar = False

    for item in raw:
        if not isinstance(item, dict):
            continue
        chart_type = item.get("type")
        if chart_type not in SUPPORTED_CHART_TYPES:
            continue
        if chart_type == "bar" and seen_bar:
            continue
        seen_bar = seen_bar or chart_type == "bar"

        x_col = item.get("x") if item.get("x") in columns else fallback_x
        y_raw = item.get("y", [])
        y_cols = y_raw if isinstance(y_raw, list) else [y_raw]
        y_cols = [col for col in y_cols if col in numeric_columns]
        if not y_cols:
            y_cols = fallback_y

        normalized.append({
            "type": chart_type,
            "title": str(item.get("title") or f"{chart_type} chart"),
            "x": x_col,
            "y": y_cols,
            "reason": str(item.get("reason") or ""),
            "score": float(item.get("score") or 0),
        })

    if not normalized:
        raise HTTPException(status_code=500, detail="Gemini did not return usable chart recommendations")
    return sorted(normalized, key=lambda c: c["score"], reverse=True)


@app.get("/")
async def root():
    index = pathlib.Path(__file__).parent.parent / "frontend" / "dist" / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"status": "ok", "message": "Smart Chart Builder API"}


@app.post("/api/upload")
async def upload_file(files: List[UploadFile] = File(...)):
    df = await load_uploaded_dataframe(files)
    columns = [{"name": col, "type": detect_column_type(df[col])} for col in df.columns]
    preview = df.head(1000).replace({np.nan: None}).to_dict(orient="records")
    summary = build_summary(df)
    return {"columns": columns, "preview": preview, "summary": summary, "rows": len(df)}


@app.post("/api/ai-recommend")
async def ai_recommend(request: Request, files: List[UploadFile] = File(...), language: str = Form("ko")):
    ip = request.client.host if request.client else "unknown"
    df = await load_uploaded_dataframe(files)
    remaining = check_and_use_quota(ip)

    summary = build_summary(df)
    sample = df.head(3).replace({np.nan: None}).to_dict(orient="records")
    lang_name = "Vietnamese" if language == "vi" else ("Korean" if language == "ko" else "English")

    prompt = f"""You are a data visualization expert.
Analyze this dataset and recommend 3-5 optimal chart types.

Dataset info:
- Rows: {summary['rows']}
- Columns: {json.dumps(summary['columns'], ensure_ascii=False)}
- Sample (3 rows): {json.dumps(sample, ensure_ascii=False, default=str)}

Guidelines:
- ONLY use chart types from this supported list: bar, line, area, pie, doughnut, scatter, bubble, radar, polarArea
- LIMIT the use of the "bar" chart. Do not recommend the "bar" chart more than once per response. Provide a diverse mix of chart types.
- For each recommendation, provide a score from 0.0 to 1.0 indicating suitability.
- Sort by score descending.
- Choose x as a real column name from the dataset.
- Choose y as one or more real numeric column names from the dataset.
- Write the "reason" field in {lang_name}.

Return ONLY a valid JSON array:
[
  {{
    "type": "one of: bar, line, area, pie, doughnut, scatter, bubble, radar, polarArea",
    "title": "descriptive chart title",
    "x": "x-axis column name",
    "y": ["column1", "column2"],
    "reason": "Why this chart is optimal for this data",
    "score": 0.95
  }}
]"""

    if not gemini_client:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")

    try:
        response = gemini_client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            contents=prompt,
        )
        raw_charts = json.loads(clean_json_response(response.text))
        charts = normalize_recommendations(raw_charts, summary)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Could not parse Gemini JSON response: {e}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {e}")

    return {"charts": charts, "remaining": remaining}


class StoryRequest(BaseModel):
    chart_type: str
    x_column: str
    y_columns: List[str]
    title: str
    data_summary: dict
    sample_data: list
    language: str = "ko"


@app.post("/api/storytelling")
async def storytelling(req: StoryRequest):
    lang = "Vietnamese" if req.language == "vi" else ("Korean" if req.language == "ko" else "English")

    prompt = f"""You are a data storytelling expert. Respond entirely in {lang}.

Chart: {req.chart_type} - {req.title}
X-axis: {req.x_column} | Y-axes: {', '.join(req.y_columns)}
Data summary: {json.dumps(req.data_summary, ensure_ascii=False, default=str)}
Sample data: {json.dumps(req.sample_data, ensure_ascii=False, default=str)}

Return ONLY a valid JSON object:
{{
  "story": "2-3 sentence narrative insight about the data",
  "insights": [
    {{"label": "short label", "value": "key metric or value", "type": "positive|negative|neutral"}},
    {{"label": "short label", "value": "key metric or value", "type": "positive|negative|neutral"}},
    {{"label": "short label", "value": "key metric or value", "type": "positive|negative|neutral"}}
  ],
  "recommendation": "1 actionable recommendation based on the data",
  "roadmap": "A strategic roadmap with 3-5 key steps or milestones based on the data analysis",
  "report": "A comprehensive report summary including key findings, trends, and future implications"
}}"""

    if not gemini_client:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")

    try:
        response = gemini_client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            contents=prompt,
        )
        result = json.loads(clean_json_response(response.text))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Could not parse Gemini JSON response: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {e}")

    return result


FRONTEND_DIST = pathlib.Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        favicon_path = FRONTEND_DIST / "favicon.ico"
        if favicon_path.exists():
            return FileResponse(favicon_path)
        raise HTTPException(status_code=404, detail="favicon.ico not found")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse(FRONTEND_DIST / "index.html")
