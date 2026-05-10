from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List
from pydantic import BaseModel
import pandas as pd
import numpy as np
import io
import json
import sqlite3
import os
import pathlib
from datetime import date
from dotenv import load_dotenv
from google import genai

load_dotenv()

app = FastAPI(title="Smart Chart Builder API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

DAILY_LIMIT = 1000  # Unlimited daily usage
DB_PATH = os.path.join(os.path.dirname(__file__), "quota.db")


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS quota (
            ip   TEXT,
            date TEXT,
            count INTEGER DEFAULT 0,
            PRIMARY KEY (ip, date)
        )
    """)
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
        raise HTTPException(status_code=429, detail="일일 사용 한도 초과 (2회/일)")
    new_count = current + 1
    conn.execute(
        """INSERT INTO quota (ip, date, count) VALUES (?, ?, ?)
           ON CONFLICT(ip, date) DO UPDATE SET count=excluded.count""",
        (ip, today, new_count),
    )
    conn.commit()
    conn.close()
    return DAILY_LIMIT - new_count


def detect_column_type(series: pd.Series) -> str:
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    try:
        pd.to_datetime(series.dropna().head(20), infer_datetime_format=True)
        return "date"
    except Exception:
        return "categorical"


def parse_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "csv":
        return pd.read_csv(io.BytesIO(file_bytes))
    elif ext in ("xlsx", "xls"):
        return pd.read_excel(io.BytesIO(file_bytes))
    elif ext == "json":
        return pd.read_json(io.BytesIO(file_bytes))
    raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식 (CSV, Excel, JSON만 가능)")


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
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


# ── API Endpoints ──────────────────────────────────────────────


@app.get("/")
async def root():
    index = pathlib.Path(__file__).parent.parent / "frontend" / "dist" / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"status": "ok", "message": "Smart Chart Builder API"}


@app.post("/api/upload")
async def upload_file(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Không có file nào được tải lên")

    dfs = []
    for file in files:
        content = await file.read()
        try:
            dfs.append(parse_file(content, file.filename or "upload.csv"))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Lỗi đọc file {file.filename}: {e}")

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

    columns = [{"name": col, "type": detect_column_type(df[col])} for col in df.columns]
    preview = df.head(5).replace({np.nan: None}).to_dict(orient="records")
    summary = build_summary(df)

    return {"columns": columns, "preview": preview, "summary": summary, "rows": len(df)}


@app.post("/api/ai-recommend")
async def ai_recommend(request: Request, files: List[UploadFile] = File(...)):
    ip = request.client.host if request.client else "unknown"

    dfs = []
    for file in files:
        content = await file.read()
        try:
            dfs.append(parse_file(content, file.filename or "upload.csv"))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Lỗi đọc file: {e}")

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

    remaining = check_and_use_quota(ip)

    summary = build_summary(df)
    sample = df.head(3).replace({np.nan: None}).to_dict(orient="records")

    prompt = f"""You are a data visualization expert.
Analyze this dataset and recommend 3-5 optimal chart types, including both standard and creative/custom chart suggestions.

Dataset info:
- Rows: {summary['rows']}
- Columns: {json.dumps(summary['columns'], ensure_ascii=False)}
- Sample (3 rows): {json.dumps(sample, ensure_ascii=False, default=str)}

Guidelines:
- Include standard charts (bar, line, pie, scatter, area, etc.) when appropriate
- Suggest creative chart types for complex data (treemap, heatmap, sankey, waterfall, funnel, etc.)
- For each recommendation, provide a score from 0.0 to 1.0 indicating suitability
- Sort by score descending (highest first)
- First recommendation should be the most optimal chart for this data

Return ONLY a valid JSON array (no markdown fences, no explanation):
[
  {{
    "type": "chart type (can be standard or custom/creative)",
    "title": "descriptive chart title",
    "y": ["column1", "column2"]  // array of y-axis column names
    "y": "y-axis column name(s) - can be single string or array of strings for multiple datasets",
    "reason": "Why this chart is optimal for this data (2-3 sentences in Vietnamese)",
    "score": 0.95
  }}
]"""

    if not gemini_client:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY가 설정되지 않았습니다.")

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash", contents=prompt
        )
        charts = json.loads(clean_json_response(response.text))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Gemini 응답 파싱 오류: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API 오류: {e}")

    return {"charts": charts, "remaining": remaining}


class StoryRequest(BaseModel):
    chart_type: str
    x_column: str
    y_columns: List[str]  # multiple Y columns
    title: str
    data_summary: dict
    sample_data: list
    language: str = "ko"


@app.post("/api/storytelling")
async def storytelling(req: StoryRequest):
    lang = "Vietnamese" if req.language == "vi" else ("Korean" if req.language == "ko" else "English")

    prompt = f"""You are a data storytelling expert. Respond entirely in {lang}.

Chart: {req.chart_type} — {req.title}
X-axis: {req.x_column} | Y-axes: {', '.join(req.y_columns)}
Data summary: {json.dumps(req.data_summary, ensure_ascii=False, default=str)}
Sample data: {json.dumps(req.sample_data, ensure_ascii=False, default=str)}

Return ONLY a valid JSON object (no markdown fences):
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
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY가 설정되지 않았습니다.")

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash", contents=prompt
        )
        result = json.loads(clean_json_response(response.text))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Gemini 응답 파싱 오류: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API 오류: {e}")

    return result


# ── Serve React Frontend (production build) ────────────────────
FRONTEND_DIST = pathlib.Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        return FileResponse(FRONTEND_DIST / "favicon.ico")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse(FRONTEND_DIST / "index.html")