const PIE_TYPES = ['pie', 'doughnut', 'polarArea']
const POINT_TYPES = ['scatter', 'bubble']
const BAR_ALIASES = {
  horizontalBar: 'bar',
  stackedBar: 'bar',
  histogram: 'bar',
}

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

function buildHistogram(rows, column, palette) {
  const values = rows
    .map((row) => toNumber(row[column]))
    .filter((value) => Number.isFinite(value))

  if (values.length === 0) {
    return {
      chartType: 'bar',
      labels: [],
      datasets: [],
      indexAxis: 'x',
      scales: {},
    }
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const binCount = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(values.length))))
  const width = max === min ? 1 : (max - min) / binCount
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + index * width
    const end = index === binCount - 1 ? max : start + width
    return { start, end, count: 0 }
  })

  values.forEach((value) => {
    const index = max === min ? 0 : Math.min(binCount - 1, Math.floor((value - min) / width))
    bins[index].count += 1
  })

  return {
    chartType: 'bar',
    labels: bins.map((bin) => `${bin.start.toFixed(1)}-${bin.end.toFixed(1)}`),
    datasets: [{
      label: `${column} distribution`,
      data: bins.map((bin) => bin.count),
      backgroundColor: palette[0],
      borderColor: palette[0],
      borderWidth: 1.5,
    }],
    indexAxis: 'x',
    scales: {
      x: { ticks: { font: { size: 10 }, maxRotation: 40, maxTicksLimit: 12 } },
      y: { ticks: { font: { size: 10 } } },
    },
  }
}

export function buildChartData({ type, xAxis, yAxes, rows, palette }) {
  const activeYAxes = PIE_TYPES.includes(type) ? yAxes.slice(0, 1) : yAxes
  const chartType = type === 'area' ? 'line' : (BAR_ALIASES[type] || type)

  if (type === 'histogram') {
    return buildHistogram(rows, yAxes[0] || xAxis, palette)
  }

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
  const isCombo = type === 'combo'

  return {
    chartType: isCombo ? 'bar' : chartType,
    labels,
    datasets: activeYAxes.map((col, idx) => {
      const color = palette[idx % palette.length]
      return {
        type: isCombo && idx > 0 ? 'line' : undefined,
        label: col,
        data: grouped.map((item) => item.values[col]),
        backgroundColor: isPie ? palette : (type === 'area' ? `${color}33` : color),
        borderColor: isPie ? '#fff' : color,
        borderWidth: 1.5,
        fill: type === 'area' ? 'origin' : false,
        tension: 0.3,
        pointRadius: type === 'line' || type === 'area' || (isCombo && idx > 0) ? 3 : undefined,
      }
    }),
    indexAxis: type === 'horizontalBar' ? 'y' : 'x',
    scales: isPie ? {} : {
      x: { stacked: type === 'stackedBar', ticks: { font: { size: 10 }, maxRotation: 40, maxTicksLimit: 12 } },
      y: { stacked: type === 'stackedBar', ticks: { font: { size: 10 } } },
    },
  }
}
