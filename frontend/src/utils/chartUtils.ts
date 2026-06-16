import type { AssetRecord, Category } from '../types'

export type TimeGranularity = 'month' | 'quarter' | 'year'
export type ChartType = 'line' | 'stackedArea' | 'bar'
export type AggregateStrategy = 'last' | 'average'

export interface AggregatedDataPoint {
  periodKey: string
  periodLabel: string
  startDate: string
  endDate: string
  total: number
  categoryAmounts: Record<string, number>
}

export interface VisibleStats {
  maxTotal: number
  minTotal: number
  startTotal: number
  endTotal: number
  growthAmount: number
  growthRate: number | null
  hasData: boolean
}

const pad = (n: number): string => n.toString().padStart(2, '0')

export const getPeriodKey = (dateStr: string, granularity: TimeGranularity): string => {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const quarter = Math.floor((month - 1) / 3) + 1

  switch (granularity) {
    case 'month':
      return `${year}-${pad(month)}`
    case 'quarter':
      return `${year}-Q${quarter}`
    case 'year':
      return `${year}`
  }
}

export const formatPeriodLabel = (periodKey: string, granularity: TimeGranularity): string => {
  switch (granularity) {
    case 'month': {
      const [year, month] = periodKey.split('-')
      return `${year}年${parseInt(month, 10)}月`
    }
    case 'quarter': {
      const [year, q] = periodKey.split('-Q')
      return `${year}年第${q}季度`
    }
    case 'year':
      return `${periodKey}年`
  }
}

export const getPeriodDateRange = (periodKey: string, granularity: TimeGranularity): { startDate: string; endDate: string } => {
  switch (granularity) {
    case 'month': {
      const [year, month] = periodKey.split('-').map(Number)
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 0)
      return {
        startDate: `${year}-${pad(month)}-01`,
        endDate: `${year}-${pad(month)}-${pad(end.getDate())}`
      }
    }
    case 'quarter': {
      const [yearStr, qStr] = periodKey.split('-Q')
      const year = parseInt(yearStr, 10)
      const q = parseInt(qStr, 10)
      const startMonth = (q - 1) * 3
      const endMonth = startMonth + 2
      const start = new Date(year, startMonth, 1)
      const end = new Date(year, endMonth + 1, 0)
      return {
        startDate: `${year}-${pad(startMonth + 1)}-01`,
        endDate: `${year}-${pad(endMonth + 1)}-${pad(end.getDate())}`
      }
    }
    case 'year': {
      const year = parseInt(periodKey, 10)
      return {
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`
      }
    }
  }
}

export const generateAllPeriods = (
  startDate: string,
  endDate: string,
  granularity: TimeGranularity
): string[] => {
  const periods: string[] = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return periods
  }

  let current = new Date(start.getFullYear(), start.getMonth(), 1)

  while (current <= end) {
    const key = getPeriodKey(current.toISOString().split('T')[0], granularity)
    if (!periods.includes(key)) {
      periods.push(key)
    }

    switch (granularity) {
      case 'month':
        current.setMonth(current.getMonth() + 1)
        break
      case 'quarter':
        current.setMonth(current.getMonth() + 3)
        break
      case 'year':
        current.setFullYear(current.getFullYear() + 1)
        break
    }
  }

  return periods
}

export const aggregateRecords = (
  records: AssetRecord[],
  granularity: TimeGranularity,
  strategy: AggregateStrategy = 'last',
  activeCategoryIds: string[]
): AggregatedDataPoint[] => {
  if (!records || records.length === 0) {
    return []
  }

  const sorted = [...records].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const minDate = sorted[0].date
  const maxDate = sorted[sorted.length - 1].date

  const periodMap = new Map<string, AssetRecord[]>()

  for (const record of sorted) {
    const key = getPeriodKey(record.date, granularity)
    if (!periodMap.has(key)) {
      periodMap.set(key, [])
    }
    periodMap.get(key)!.push(record)
  }

  const allPeriods = generateAllPeriods(minDate, maxDate, granularity)

  const result: AggregatedDataPoint[] = []
  let previousTotal = 0
  const previousCategoryAmounts: Record<string, number> = {}
  activeCategoryIds.forEach(id => (previousCategoryAmounts[id] = 0))

  for (const periodKey of allPeriods) {
    const { startDate, endDate } = getPeriodDateRange(periodKey, granularity)
    const periodRecords = periodMap.get(periodKey) || []

    let total: number
    const categoryAmounts: Record<string, number> = {}

    if (periodRecords.length === 0) {
      total = previousTotal
      activeCategoryIds.forEach(id => (categoryAmounts[id] = previousCategoryAmounts[id]))
    } else {
      if (strategy === 'last') {
        const lastRecord = periodRecords[periodRecords.length - 1]
        total = lastRecord.total
        activeCategoryIds.forEach(
          id => (categoryAmounts[id] = lastRecord.categoryAmounts?.[id] ?? 0)
        )
      } else {
        total = periodRecords.reduce((sum, r) => sum + r.total, 0) / periodRecords.length
        activeCategoryIds.forEach(id => {
          const sum = periodRecords.reduce((s, r) => s + (r.categoryAmounts?.[id] ?? 0), 0)
          categoryAmounts[id] = sum / periodRecords.length
        })
      }
    }

    previousTotal = total
    activeCategoryIds.forEach(id => (previousCategoryAmounts[id] = categoryAmounts[id]))

    result.push({
      periodKey,
      periodLabel: formatPeriodLabel(periodKey, granularity),
      startDate,
      endDate,
      total,
      categoryAmounts
    })
  }

  return result
}

export const calculateVisibleStats = (
  data: AggregatedDataPoint[],
  startIndex: number,
  endIndex: number
): VisibleStats => {
  if (!data || data.length === 0 || startIndex < 0 || endIndex < startIndex || endIndex >= data.length) {
    return {
      maxTotal: 0,
      minTotal: 0,
      startTotal: 0,
      endTotal: 0,
      growthAmount: 0,
      growthRate: null,
      hasData: false
    }
  }

  const visible = data.slice(startIndex, endIndex + 1)
  const totals = visible.map(d => d.total)

  const maxTotal = Math.max(...totals)
  const minTotal = Math.min(...totals)
  const startTotal = visible[0].total
  const endTotal = visible[visible.length - 1].total
  const growthAmount = endTotal - startTotal
  const growthRate = startTotal !== 0 ? (growthAmount / Math.abs(startTotal)) * 100 : null

  return {
    maxTotal,
    minTotal,
    startTotal,
    endTotal,
    growthAmount,
    growthRate,
    hasData: true
  }
}

export const buildChartOption = (
  aggregatedData: AggregatedDataPoint[],
  activeCategories: Category[],
  chartType: ChartType
): any => {
  if (!aggregatedData || aggregatedData.length === 0) {
    return {}
  }

  const xAxisData = aggregatedData.map(d => d.periodLabel)
  const totalData = aggregatedData.map(d => d.total)

  const formatValue = (value: number): string => {
    if (value >= 10000) {
      return (value / 10000).toFixed(1) + '万'
    }
    return value.toLocaleString()
  }

  const buildSeries = () => {
    if (chartType === 'stackedArea') {
      return activeCategories.map(category => {
        const data = aggregatedData.map(d => d.categoryAmounts[category.id] ?? 0)
        return {
          name: category.name,
          type: 'line',
          stack: 'total',
          areaStyle: { opacity: 0.6 },
          smooth: true,
          data,
          itemStyle: { color: category.color },
          lineStyle: { width: 2 },
          symbol: 'circle',
          symbolSize: 4
        }
      })
    }

    if (chartType === 'bar') {
      const categorySeries = activeCategories.map(category => {
        const data = aggregatedData.map(d => d.categoryAmounts[category.id] ?? 0)
        return {
          name: category.name,
          type: 'bar',
          stack: 'total',
          emphasis: { focus: 'series' },
          data,
          itemStyle: { color: category.color }
        }
      })

      return [
        ...categorySeries,
        {
          name: '总资产',
          type: 'line',
          smooth: true,
          data: totalData,
          itemStyle: { color: '#f56c6c' },
          lineStyle: { width: 4, type: 'dashed' },
          symbol: 'circle',
          symbolSize: 8,
          z: 100
        }
      ]
    }

    const categorySeries = activeCategories.map(category => {
      const data = aggregatedData.map(d => d.categoryAmounts[category.id] ?? 0)
      return {
        name: category.name,
        type: 'line',
        smooth: true,
        data,
        itemStyle: { color: category.color },
        lineStyle: { width: 3 },
        symbol: 'circle',
        symbolSize: 6
      }
    })

    return [
      ...categorySeries,
      {
        name: '总资产',
        type: 'line',
        smooth: true,
        data: totalData,
        itemStyle: { color: '#f56c6c' },
        lineStyle: { width: 4, type: 'dashed' },
        symbol: 'circle',
        symbolSize: 8
      }
    ]
  }

  const legendData =
    chartType === 'stackedArea'
      ? activeCategories.map(c => c.name)
      : [...activeCategories.map(c => c.name), '总资产']

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any[]) => {
        if (!params || params.length === 0) return ''
        const periodLabel = params[0].axisValue
        let html = `<div style="font-weight:600;margin-bottom:8px;">${periodLabel}</div>`

        if (chartType === 'stackedArea') {
          let sum = 0
          const sortedParams = [...params].sort((a, b) => (b.value || 0) - (a.value || 0))
          sortedParams.forEach(p => {
            sum += p.value || 0
          })
          sortedParams.forEach(p => {
            const pct = sum > 0 ? ((p.value || 0) / sum * 100).toFixed(1) : '0.0'
            html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
              <span style="flex:1;">${p.seriesName}</span>
              <span style="font-weight:500;">¥${(p.value || 0).toLocaleString()}</span>
              <span style="color:#909399;font-size:12px;width:50px;text-align:right;">${pct}%</span>
            </div>`
          })
          html += `<div style="border-top:1px solid #eee;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;">
            <span style="font-weight:600;">合计</span>
            <span style="font-weight:600;">¥${sum.toLocaleString()}</span>
          </div>`
        } else {
          params.forEach(p => {
            html += `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
              <span>${p.seriesName}: ¥${(p.value || 0).toLocaleString()}</span>
            </div>`
          })
        }

        return html
      }
    },
    legend: {
      data: legendData,
      bottom: 0,
      type: 'scroll',
      pageTextStyle: { color: '#909399' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '18%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: chartType === 'bar',
      data: xAxisData,
      axisLabel: {
        rotate: 45,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => formatValue(value)
      }
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      {
        type: 'slider',
        start: 0,
        end: 100,
        bottom: 30,
        height: 20
      }
    ],
    series: buildSeries()
  }
}
