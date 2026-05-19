import { useEffect, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

const CHART_TYPES = [
  { value: 'bar',       label: '막대' },
  { value: 'line',      label: '꺾은선' },
  { value: 'area',      label: '영역' },
  { value: 'pie',       label: '원형' },
  { value: 'doughnut',  label: '도넛' },
  { value: 'scatter',   label: '산점도' },
  { value: 'bubble',    label: '버블' },
  { value: 'radar',     label: '방사형' },
  { value: 'polarArea', label: '극좌표' },
]

const PALETTE = [
  '#534AB7', '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#FF9F40', '#9966FF', '#C9CBCF',
]

export default function ManualChart({ columns, preview = [], config, onConfigChange }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)
  const [xAxis,  setXAxis]  = useState('')
  const [yAxes,  setYAxes]  = useState([])   // multi-select
  const [type,   setType]   = useState('bar')

  // Update state when config changes (e.g., from AI apply)
  useEffect(() => {
    if (config) {
      setType(config.type || 'bar')
      setXAxis(config.xAxis || '')
      setYAxes(config.yAxes || [])
    }
  }, [config])

  const numericCols = columns.filter(c => c.type === 'numeric')

  const toggleY = (col) => {
    setYAxes(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  // notify parent on change
  useEffect(() => {
    if (xAxis && yAxes.length > 0 && onConfigChange) {
      onConfigChange({
        type,
        xAxis,
        yAxes,  // pass array instead of single
        title: `${xAxis} 별 ${yAxes.join(', ')}`,
      })
    }
  }, [xAxis, yAxes, type])

  // render chart
  useEffect(() => {
    if (!xAxis || yAxes.length === 0 || !canvasRef.current || preview.length === 0) return
    if (chartRef.current) chartRef.current.destroy()

    const ctx = canvasRef.current.getContext('2d')
    const labels = preview.map(row => String(row[xAxis] ?? ''))
    const isPieOrDonut = ['pie', 'doughnut', 'polarArea'].includes(type)
    const chartType = type === 'area' ? 'line' : type

    // for pie/donut only use first Y column
    const activeCols = isPieOrDonut ? [yAxes[0]] : yAxes

    const datasets = activeCols.map((col, idx) => {
      const color = PALETTE[idx % PALETTE.length]
      let data = preview.map(row => Number(row[col] ?? 0))

      if (type === 'scatter' || type === 'bubble') {
        data = preview.map(row => ({
          x: isNaN(Number(row[xAxis])) ? idx * 20 + Math.random() * 10 : Number(row[xAxis]),
          y: Number(row[col] ?? 0),
          r: type === 'bubble' ? Math.random() * 12 + 5 : undefined,
        }))
      }

      return {
        label: col,
        data,
        backgroundColor: isPieOrDonut
          ? ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40']
          : (type === 'area' ? color + '33' : color),
        borderColor: isPieOrDonut ? '#fff' : color,
        borderWidth: 1.5,
        fill: type === 'area',
        tension: 0.3,
        pointRadius: type === 'line' || type === 'area' ? 3 : undefined,
      }
    })

    chartRef.current = new Chart(ctx, {
      type: chartType,
      data: {
        labels: type === 'scatter' || type === 'bubble' ? undefined : labels,
        datasets,
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: yAxes.length > 1 || isPieOrDonut, position: 'top',
                    labels: { font: { size: 10 }, boxWidth: 10 } },
        },
        scales: isPieOrDonut ? {} : {
          x: { ticks: { font: { size: 10 }, maxRotation: 40 } },
          y: { ticks: { font: { size: 10 } } },
        },
      },
    })
  }, [xAxis, yAxes, type, preview])

  return (
    <div style={{ background: '#fff', border: '1px solid #eee',
                  borderRadius: 10, padding: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>
        수동 모드 — 차트 설정
      </p>

      {/* chart type buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {CHART_TYPES.map(t => (
          <button key={t.value} onClick={() => setType(t.value)}
            style={{
              flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 6,
              border: type === t.value ? '2px solid #534AB7' : '1px solid #ddd',
              background: type === t.value ? '#EEEDFE' : '#fff',
              color: type === t.value ? '#3C3489' : '#666',
              cursor: 'pointer', fontWeight: type === t.value ? 500 : 400,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* axis selectors */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {/* X axis */}
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: '#888' }}>X축</label>
          <select value={xAxis} onChange={e => setXAxis(e.target.value)}
            style={{ width: '100%', marginTop: 3, padding: '5px 8px',
                     fontSize: 11, borderRadius: 6, border: '1px solid #ddd' }}>
            <option value="">선택</option>
            {columns.map(c => <option key={c.name}>{c.name}</option>)}
          </select>
        </div>

        {/* Y axis — multi checkbox */}
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: '#888' }}>
            Y축 <span style={{ color: '#534AB7' }}>(복수 선택 가능)</span>
          </label>
          <div style={{
            marginTop: 3, maxHeight: 90, overflowY: 'auto',
            border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px',
            background: '#fafafa',
          }}>
            {numericCols.length === 0
              ? <span style={{ fontSize: 10, color: '#aaa' }}>수치 열 없음</span>
              : numericCols.map(c => (
                <label key={c.name} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, cursor: 'pointer', padding: '2px 0',
                  color: yAxes.includes(c.name) ? '#3C3489' : '#444',
                }}>
                  <input
                    type="checkbox"
                    checked={yAxes.includes(c.name)}
                    onChange={() => toggleY(c.name)}
                    style={{ accentColor: '#534AB7' }}
                  />
                  {c.name}
                </label>
              ))
            }
          </div>
        </div>
      </div>

      {/* canvas */}
      {xAxis && yAxes.length > 0 ? (
        <div id="chart-container" style={{ position: 'relative' }}>
          <canvas ref={canvasRef} style={{ maxHeight: 240 }} />
          <button
            onClick={() => {
              if (!canvasRef.current) return
              const link = document.createElement('a')
              link.download = `chart_${xAxis}.png`
              link.href = canvasRef.current.toDataURL('image/png')
              link.click()
            }}
            style={{
              position: 'absolute', top: 6, right: 6,
              padding: '4px 10px', fontSize: 10, borderRadius: 6,
              border: '1px solid #ddd', background: 'rgba(255,255,255,0.9)',
              cursor: 'pointer', color: '#534AB7', fontWeight: 500,
            }}>
            ⬇ PNG 다운로드
          </button>
        </div>
      ) : (
        <div style={{ height: 160, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#aaa', fontSize: 12,
                      border: '1px dashed #ddd', borderRadius: 8 }}>
          X축과 Y축을 선택하면 차트가 표시됩니다
        </div>
      )}
    </div>
  )
}