const PIE_TYPES = ['pie', 'doughnut', 'polarArea']
const POINT_TYPES = ['scatter', 'bubble']

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function groupRows(rows, xAxis, yAxes) {
  const grouped = new Map()

  rows.forEach((row) => {
    const key = String(row[xAxis] ?? 'N/A')
    if (!grouped.has(key)) {
      grouped.set(key, Object.fromEntries(yAxes.map((col) => [col, 0])))
    }

    const bucket = grouped.get(key)
    yAxes.forEach((col) => {
      bucket[col] += toNumber(row[col])
    })
  })

  return Array.from(grouped.entries()).map(([label, values]) => ({ label, values }))
}

function buildPointData(rows, xAxis, yColumn, type) {
  const categoryIndex = new Map()

  return rows.map((row) => {
    const rawX = row[xAxis]
    const numericX = toNumber(rawX)
    const hasNumericX = rawX !== null && rawX !== undefined && rawX !== '' && Number.isFinite(Number(String(rawX).replace(/,/g, '').trim()))

    let x = numericX
    if (!hasNumericX) {
      const label = String(rawX ?? 'N/A')
      if (!categoryIndex.has(label)) categoryIndex.set(label, categoryIndex.size + 1)
      x = categoryIndex.get(label)
    }

    const y = toNumber(row[yColumn])
    return {
      x,
      y,
      r: type === 'bubble' ? Math.max(4, Math.min(18, Math.sqrt(Math.abs(y)) || 4)) : undefined,
    }
  })
}

export function buildChartData({ type, xAxis, yAxes, rows, palette }) {
  const activeYAxes = PIE_TYPES.includes(type) ? yAxes.slice(0, 1) : yAxes
  const chartType = type === 'area' ? 'line' : type

  if (POINT_TYPES.includes(type)) {
    return {
      chartType,
      labels: undefined,
      datasets: activeYAxes.map((col, idx) => {
        const color = palette[idx % palette.length]
        return {
          label: col,
          data: buildPointData(rows, xAxis, col, type),
          backgroundColor: color,
          borderColor: color,
          borderWidth: 1.5,
        }
      }),
      scales: {
        x: { ticks: { font: { size: 10 }, maxRotation: 40 } },
        y: { ticks: { font: { size: 10 } } },
      },
    }
  }

  const grouped = groupRows(rows, xAxis, activeYAxes)
  const labels = grouped.map((item) => item.label)
  const isPie = PIE_TYPES.includes(type)

  return {
    chartType,
    labels,
    datasets: activeYAxes.map((col, idx) => {
      const color = palette[idx % palette.length]
      return {
        label: col,
        data: grouped.map((item) => item.values[col]),
        backgroundColor: isPie ? palette : (type === 'area' ? `${color}33` : color),
        borderColor: isPie ? '#fff' : color,
        borderWidth: 1.5,
        fill: type === 'area',
        tension: 0.3,
        pointRadius: type === 'line' || type === 'area' ? 3 : undefined,
      }
    }),
    scales: isPie ? {} : {
      x: { ticks: { font: { size: 10 }, maxRotation: 40, maxTicksLimit: 12 } },
      y: { ticks: { font: { size: 10 } } },
    },
  }
}
