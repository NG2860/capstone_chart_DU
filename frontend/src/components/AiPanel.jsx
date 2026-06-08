import { useEffect, useRef, useMemo } from 'react'
import { Chart, registerables } from 'chart.js'
import { buildChartData } from '../utils/chartData'
Chart.register(...registerables)

const PALETTE = ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40']

const SUPPORTED_CHART_TYPES = [
  'bar', 'line', 'area', 'pie', 'doughnut', 'radar', 'polarArea', 'scatter', 'bubble',
  'horizontalBar', 'stackedBar', 'combo', 'histogram',
]

function AiChartCard({ chart, preview, index, onApply }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  const isSupported = SUPPORTED_CHART_TYPES.includes((chart.type || '').toLowerCase())
  const yColumns = useMemo(
    () => Array.isArray(chart.y) ? chart.y : (chart.y ? [chart.y] : []),
    [chart.y]
  )

  useEffect(() => {
    if (!isSupported || !canvasRef.current || !preview?.length || !chart.x || yColumns.length === 0) return
    if (chartRef.current) chartRef.current.destroy()

    const ctx = canvasRef.current.getContext('2d')
    const chartData = buildChartData({
      type: chart.type,
      xAxis: chart.x,
      yAxes: yColumns,
      rows: preview,
      palette: PALETTE,
    })

    chartRef.current = new Chart(ctx, {
      type: chartData.chartType,
      data: {
        labels: chartData.labels,
        datasets: chartData.datasets,
      },
      options: {
        responsive: true,
        indexAxis: chartData.indexAxis,
        plugins: {
          legend: { display: ['pie', 'doughnut', 'polarArea'].includes(chart.type), labels: { font: { size: 9 }, boxWidth: 10 } },
        },
        scales: chartData.scales,
      },
    })

    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [chart, preview, isSupported, yColumns])

  const isBest = index === 0

  return (
    <div style={{
      border: isBest ? '2px solid #534AB7' : '1px solid #eee',
      borderRadius: 10, padding: '10px 12px',
      background: isBest ? '#EEEDFE' : '#fff',
    }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600,
                       color: isBest ? '#3C3489' : '#333' }}>
          {chart.title || `${chart.type} 차트`}
          {isBest && <span style={{ fontSize: 9, color: '#534AB7', marginLeft: 4 }}>⭐</span>}
        </span>
        {isBest && (
          <span style={{ fontSize: 9, background: '#534AB7', color: '#fff',
                         padding: '2px 7px', borderRadius: 20, fontWeight: 500 }}>
            최적 추천
          </span>
        )}
      </div>

      {/* mini chart */}
      {isSupported && preview?.length > 0 && chart.x && yColumns.length > 0 ? (
        <canvas ref={canvasRef} style={{ maxHeight: 150, marginBottom: 8 }} />
      ) : (
        <div style={{ height: 80, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#999', fontSize: 10,
                      border: '1px dashed #ddd', borderRadius: 6, marginBottom: 8,
                      background: '#f9f9f9', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <span>{!isSupported ? `${chart.type} — 미리보기 불가` : '데이터 없음'}</span>
        </div>
      )}

      {/* axis info */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, background: '#f0f0f0', color: '#555',
                       padding: '2px 6px', borderRadius: 4 }}>X: {chart.x}</span>
        <span style={{ fontSize: 9, background: '#f0f0f0', color: '#555',
                       padding: '2px 6px', borderRadius: 4 }}>
          Y: {Array.isArray(chart.y) ? chart.y.join(', ') : chart.y}
        </span>
      </div>

      {/* reason */}
      <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>{chart.reason}</div>

      {/* Apply button */}
      <button
        onClick={() => onApply(chart)}
        disabled={!isSupported}
        title={!isSupported ? `${chart.type} 차트는 지원되지 않습니다` : ''}
        style={{
          width: '100%', marginTop: 8, padding: '6px 0', borderRadius: 6,
          border: 'none',
          background: isSupported ? '#534AB7' : '#ccc',
          color: '#fff', fontSize: 10,
          fontWeight: 500, cursor: isSupported ? 'pointer' : 'not-allowed',
        }}>
        {isSupported ? '이 차트 생성' : '지원하지 않는 차트 유형'}
      </button>

      {chart.score > 0 && (
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>
          신뢰도: {Math.round(chart.score * 100)}%
        </div>
      )}
    </div>
  )
}

export default function AiPanel({ charts, loading, onRequest, onApply, preview }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0F6E56' }} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>AI 추천 결과</span>
      </div>

      {charts.map((c, i) => (
        <AiChartCard key={i} chart={c} preview={preview} index={i} onApply={onApply} />
      ))}

      <div style={{ borderTop: '1px solid #eee', paddingTop: 8 }}>
        <button
          onClick={onRequest}
          disabled={loading}
          style={{
            width: '100%', background: loading ? '#aaa' : '#534AB7',
            color: '#EEEDFE', border: 'none', borderRadius: 8,
            padding: 9, fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>
          {loading ? '분석 중...' : 'AI 차트 추천 실행'}
        </button>
      </div>
    </div>
  )
}
