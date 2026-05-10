import { useState } from 'react'
import axios from 'axios'
import FileUpload  from './components/FileUpload'
import DataPreview from './components/DataPreview'
import ManualChart from './components/ManualChart'
import AiPanel     from './components/AiPanel'
import StoryPanel  from './components/StoryPanel'

const API = ''  // Vite proxy: /api/* → http://localhost:8000

export default function App() {
  const [columns,     setColumns]     = useState([])
  const [preview,     setPreview]     = useState([])
  const [dataSummary, setDataSummary] = useState({})
  const [files,       setFiles]       = useState([])
  const [aiCharts,    setAiCharts]    = useState([])
  const [remaining,   setRemaining]   = useState(2)
  const [loading,     setLoading]     = useState(false)
  const [chartConfig, setChartConfig] = useState(null)

  const handleUpload = async (uploadedFiles) => {
    const fArray = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles]
    setFiles(fArray)
    const fd = new FormData()
    fArray.forEach(f => fd.append('files', f))
    try {
      const res = await axios.post(`${API}/api/upload`, fd)
      setColumns(res.data.columns)
      setPreview(res.data.preview)
      setDataSummary(res.data.summary) // lưu summary
    } catch (e) {
      alert('파일 업로드 실패: ' + (e.response?.data?.detail || e.message))
    }
  }

  const handleAiRecommend = async () => {
    if (!files || files.length === 0) return
    setLoading(true)
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    try {
      const res = await axios.post(`${API}/api/ai-recommend`, fd)
      setAiCharts(res.data.charts)
      setRemaining(res.data.remaining)
    } catch (e) {
      alert(e.response?.data?.detail || '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  const handleApplyAiChart = (aiChart) => {
    // Apply AI suggestion to chart config
    const yAxes = Array.isArray(aiChart.y) ? aiChart.y : (aiChart.y ? [aiChart.y] : [])
    const config = {
      type: aiChart.type,
      title: aiChart.title,
      xAxis: aiChart.x,
      yAxes: yAxes,
    }
    setChartConfig(config)
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">📊 스마트 차트 빌더</span>
        <nav className="nav">
          <a>프로젝트</a>
          <a>데이터셋</a>
          <a>차트</a>
          <a>내보내기</a>
        </nav>
        <span className="quota">AI 무제한 사용</span>
      </header>

      <div className="body">
        {/* Sidebar: file list */}
        <aside className="sidebar">
          <FileUpload onUpload={handleUpload} />
          {preview.length > 0 && (
            <DataPreview columns={columns} preview={preview} />
          )}
        </aside>

        {/* Main: manual chart + story panel */}
        <main className="main">
          <ManualChart
            columns={columns}
            preview={preview}
            config={chartConfig}
            onConfigChange={(cfg) => setChartConfig(cfg)}
          />

          {/* Data Storytelling */}
          {chartConfig && (
            <StoryPanel
              chartConfig={chartConfig}
              dataSummary={dataSummary}
              sampleData={preview}
              language="ko"
            />
          )}
        </main>

        {/* Right: AI panel */}
        <aside className="right">
          <AiPanel
            charts={aiCharts}
            loading={loading}
            onRequest={handleAiRecommend}
            onApply={handleApplyAiChart}
            preview={preview}
          />
        </aside>
      </div>
    </div>
  )
}
