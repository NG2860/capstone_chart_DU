import { useState } from 'react'
import axios from 'axios'

const API = ''  // Vite proxy

const INSIGHT_COLORS = {
  positive: { bg: '#E1F5EE', text: '#085041', border: '#9FE1CB' },
  negative: { bg: '#FCEBEB', text: '#A32D2D', border: '#F7C1C1' },
  neutral:  { bg: '#EEEDFE', text: '#3C3489', border: '#AFA9EC' },
}

export default function StoryPanel({ chartConfig, dataSummary, sampleData, language = 'ko', onStoryGenerated }) {
  const [story,   setStory]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const downloadReport = () => {
    if (!story) return
    const lines = [
      `=== ${chartConfig.title} ===`,
      '',
      '[ 데이터 스토리 ]',
      story.story,
      '',
      '[ 인사이트 ]',
      ...story.insights.map(ins => `• ${ins.label}: ${ins.value}`),
      '',
      '[ 권고 ]',
      story.recommendation,
      '',
      '[ 로드맵 ]',
      story.roadmap,
      '',
      '[ 보고서 ]',
      story.report,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.download = `report_${chartConfig.title || 'story'}.txt`
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
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
      setError('스토리 생성 실패. 다시 시도해주세요.')
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
          <span style={{ fontSize: 12, fontWeight: 500 }}>데이터 스토리텔링</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {story && (
            <button
              onClick={downloadReport}
              style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 20,
                border: '1px solid #0F6E56', background: '#fff',
                color: '#0F6E56', cursor: 'pointer', fontWeight: 500,
              }}>
              ⬇ 보고서 다운로드
            </button>
          )}
          <span style={{ fontSize: 10, color: '#888', background: '#f5f5f5',
                         padding: '2px 8px', borderRadius: 20 }}>
            AI 무제한 사용
          </span>
        </div>
      </div>

      {/* 생성 버튼 */}
      <button
        onClick={generate}
        disabled={loading}
        style={{
          width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
          background: loading ? '#aaa' : '#0F6E56',
          color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}>
        {loading ? '스토리 생성 중...' : 'AI 스토리 생성'}
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

          {/* Insight cards */}
          <div style={{ display: 'flex', gap: 6 }}>
            {story.insights.map((ins, i) => {
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
              데이터 스토리
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
              <span style={{ fontWeight: 500, flexShrink: 0 }}>권고:</span>
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
                로드맵
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
                보고서
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
