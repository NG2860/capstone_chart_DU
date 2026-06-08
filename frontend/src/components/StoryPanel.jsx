import { useState } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_BASE_URL || ''

const INSIGHT_COLORS = {
  positive: { bg: '#E1F5EE', text: '#085041', border: '#9FE1CB' },
  negative: { bg: '#FCEBEB', text: '#A32D2D', border: '#F7C1C1' },
  neutral:  { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC' },
}

const T = {
  ko: {
    heading: '데이터 스토리텔링',
    generate: 'AI 스토리 생성',
    generating: '스토리 생성 중...',
    error: '스토리 생성 실패. 다시 시도해주세요.',
    unlimited: 'AI 무제한 사용',
    storyLabel: '데이터 스토리',
    recommend: '권고:',
    roadmap: '로드맵',
    report: '보고서',
    chartSection: '📊 차트 미리보기',
    includeChart: '차트 포함',
  },
  vi: {
    heading: 'Kể chuyện dữ liệu',
    generate: 'Tạo AI Story',
    generating: 'Đang tạo story...',
    error: 'Tạo story thất bại. Vui lòng thử lại.',
    unlimited: 'AI không giới hạn',
    storyLabel: 'Câu chuyện dữ liệu',
    recommend: 'Đề xuất:',
    roadmap: 'Lộ trình',
    report: 'Báo cáo',
    chartSection: '📊 Xem trước biểu đồ',
    includeChart: 'Bao gồm biểu đồ',
  },
  en: {
    heading: 'Data Storytelling',
    generate: 'Generate AI Story',
    generating: 'Generating story...',
    error: 'Story generation failed. Please try again.',
    unlimited: 'AI Unlimited',
    storyLabel: 'Data Story',
    recommend: 'Recommendation:',
    roadmap: 'Roadmap',
    report: 'Report',
    chartSection: '📊 Chart Preview',
    includeChart: 'Include chart',
  },
}

export default function StoryPanel({
  chartConfig,
  dataSummary,
  sampleData,
  language = 'ko',
  onStoryGenerated,
  chartContainerId = 'chart-container',
}) {
  const [story,        setStory]        = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [chartImage,   setChartImage]   = useState(null)
  const [includeChart, setIncludeChart] = useState(true)

  const t = T[language] || T.ko

  /**
   * Capture the current chart canvas as a data URL for embedding in the story
   */
  const captureChart = () => {
    const container = document.getElementById(chartContainerId)
    if (!container) return null
    const canvas = container.querySelector('canvas')
    if (!canvas) return null
    return canvas.toDataURL('image/png')
  }

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      // Capture chart before generating story
      const imgUrl = captureChart()
      if (imgUrl) setChartImage(imgUrl)

      const res = await axios.post(`${API}/api/storytelling`, {
        chart_type:   chartConfig.type,
        x_column:     chartConfig.xAxis,
        y_columns:    chartConfig.yAxes,  // send array
        title:        chartConfig.title,
        data_summary: dataSummary,
        sample_data:  sampleData.slice(0, 5),
        language,
      })
      setStory(res.data)
      if (onStoryGenerated) onStoryGenerated(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message || t.error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #eee',
      borderRadius: 10, padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0F6E56' }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>{t.heading}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#888', background: '#f5f5f5',
                         padding: '2px 8px', borderRadius: 20 }}>
            {t.unlimited}
          </span>
        </div>
      </div>

      {/* Include chart toggle */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: '#555', cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={includeChart}
          onChange={(e) => setIncludeChart(e.target.checked)}
          style={{ accentColor: '#534AB7' }}
        />
        {t.includeChart}
      </label>

      {/* 생성 버튼 */}
      <button
        onClick={generate}
        disabled={loading}
        style={{
          width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
          background: loading ? '#aaa' : 'linear-gradient(135deg, #0F6E56, #15967A)',
          color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          boxShadow: loading ? 'none' : '0 2px 6px rgba(15,110,86,0.25)',
          transition: 'all 0.2s ease',
        }}>
        {loading ? t.generating : t.generate}
      </button>

      {/* 에러 */}
      {error && (
        <div style={{ fontSize: 11, color: '#A32D2D', background: '#FCEBEB',
                      padding: '7px 10px', borderRadius: 6 }}>
          {error}
        </div>
      )}

      {/* 결과 */}
      {story && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Embedded Chart Image in Story */}
          {includeChart && chartImage && (
            <div style={{
              background: '#f8f9fa', border: '1px solid #e9ecef',
              borderRadius: 8, padding: 10, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#534AB7', marginBottom: 6 }}>
                {t.chartSection}
              </div>
              <img
                src={chartImage}
                alt="Chart"
                style={{
                  maxWidth: '100%', borderRadius: 6,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                }}
              />
            </div>
          )}

          {/* Insight cards */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(story.insights || []).map((ins, i) => {
              const c = INSIGHT_COLORS[ins.type] || INSIGHT_COLORS.neutral
              return (
                <div key={i} style={{
                  flex: 1, background: c.bg, border: `1px solid ${c.border}`,
                  borderRadius: 8, padding: '8px 6px', textAlign: 'center',
                }}>
                  <div style={{ fontWeight: 500, fontSize: 12, color: c.text }}>
                    {ins.value}
                  </div>
                  <div style={{ fontSize: 10, color: c.text, marginTop: 2, opacity: 0.8 }}>
                    {ins.label}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Story text */}
          <div style={{
            background: '#E1F5EE', border: '1px solid #9FE1CB',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#085041', marginBottom: 5 }}>
              {t.storyLabel}
            </div>
            <div style={{ fontSize: 12, color: '#333', lineHeight: 1.7 }}>
              {story.story}
            </div>
          </div>

          {/* Recommendation */}
          {story.recommendation && (
            <div style={{
              fontSize: 11, color: '#534AB7', background: '#EEEDFE',
              border: '1px solid #AFA9EC', borderRadius: 6, padding: '7px 10px',
              display: 'flex', gap: 6, alignItems: 'flex-start',
            }}>
              <span style={{ fontWeight: 500, flexShrink: 0 }}>{t.recommend}</span>
              <span>{story.recommendation}</span>
            </div>
          )}

          {/* Roadmap */}
          {story.roadmap && (
            <div style={{
              background: '#FFF3CD', border: '1px solid #FFEAA7',
              borderRadius: 8, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#856404', marginBottom: 5 }}>
                {t.roadmap}
              </div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.7 }}>
                {story.roadmap}
              </div>
            </div>
          )}

          {/* Report */}
          {story.report && (
            <div style={{
              background: '#D1ECF1', border: '1px solid #BEE5EB',
              borderRadius: 8, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#0C5460', marginBottom: 5 }}>
                {t.report}
              </div>
              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.7 }}>
                {story.report}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
