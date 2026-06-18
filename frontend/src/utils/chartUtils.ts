import type { AssetRecord, Category, NetWorthTimePoint } from '../types'

export type TimeGranularity = 'month' | 'quarter' | 'year'
export type ChartType = 'line' | 'stackedArea' | 'bar'
export type AggregateStrategy = 'last' | 'average'

export interface AggregatedDataPoint {
  periodKey: string
  periodLabel: string
  startDate: string
  endDate: string
  total: number
  totalLiability: number
  netWorth: number
  categoryAmounts: Record<string, number>
}

export interface VisibleStats {
  maxTotal: number
  minTotal: number
  maxNetWorth: number
  minNetWorth: number
  startTotal: number
  endTotal: number
  startNetWorth: number
  endNetWorth: number
  growthAmount: number
  growthRate: number | null
  netWorthGrowthAmount: number
  netWorthGrowthRate: number | null
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
  activeCategoryIds: string[],
  netWorthSeries: NetWorthTimePoint[] = []
): AggregatedDataPoint[] => {
  const hasAssetRecords = records && records.length > 0
  const hasNetWorthRecords = netWorthSeries && netWorthSeries.length > 0

  if (!hasAssetRecords && !hasNetWorthRecords) {
    return []
  }

  let minDate: string
  let maxDate: string

  let sorted: AssetRecord[] = []

  if (hasAssetRecords) {
    sorted = [...records].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    minDate = sorted[0].date
    maxDate = sorted[sorted.length - 1].date
  } else {
    const sortedNW = [...netWorthSeries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )
    minDate = sortedNW[0].date
    maxDate = sortedNW[sortedNW.length - 1].date
  }

  const periodMap = new Map<string, AssetRecord[]>()

  for (const record of sorted) {
    const key = getPeriodKey(record.date, granularity)
    if (!periodMap.has(key)) {
      periodMap.set(key, [])
    }
    periodMap.get(key)!.push(record)
  }

  const netWorthByPeriod = new Map<string, NetWorthTimePoint[]>()
  for (const point of netWorthSeries) {
    const key = getPeriodKey(point.date, granularity)
    if (!netWorthByPeriod.has(key)) {
      netWorthByPeriod.set(key, [])
    }
    netWorthByPeriod.get(key)!.push(point)
  }

  const allPeriods = generateAllPeriods(minDate, maxDate, granularity)

  const result: AggregatedDataPoint[] = []
  let previousTotal = 0
  const previousCategoryAmounts: Record<string, number> = {}
  activeCategoryIds.forEach(id => (previousCategoryAmounts[id] = 0))
  let previousLiability = 0
  let previousNetWorth = 0

  for (const periodKey of allPeriods) {
    const { startDate, endDate } = getPeriodDateRange(periodKey, granularity)
    const periodRecords = periodMap.get(periodKey) || []
    const periodNetWorth = netWorthByPeriod.get(periodKey) || []

    let total: number
    let totalLiability: number
    let netWorth: number
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

    if (periodNetWorth.length === 0) {
      totalLiability = previousLiability
      netWorth = previousNetWorth
    } else {
      const lastPoint = periodNetWorth[periodNetWorth.length - 1]
      if (strategy === 'last') {
        totalLiability = lastPoint.totalLiability
        netWorth = lastPoint.netWorth
      } else {
        totalLiability = periodNetWorth.reduce((s, p) => s + p.totalLiability, 0) / periodNetWorth.length
        netWorth = periodNetWorth.reduce((s, p) => s + p.netWorth, 0) / periodNetWorth.length
      }
    }

    previousTotal = total
    previousLiability = totalLiability
    previousNetWorth = netWorth
    activeCategoryIds.forEach(id => (previousCategoryAmounts[id] = categoryAmounts[id]))

    result.push({
      periodKey,
      periodLabel: formatPeriodLabel(periodKey, granularity),
      startDate,
      endDate,
      total,
      totalLiability,
      netWorth,
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
      maxNetWorth: 0,
      minNetWorth: 0,
      startTotal: 0,
      endTotal: 0,
      startNetWorth: 0,
      endNetWorth: 0,
      growthAmount: 0,
      growthRate: null,
      netWorthGrowthAmount: 0,
      netWorthGrowthRate: null,
      hasData: false
    }
  }

  const visible = data.slice(startIndex, endIndex + 1)
  const totals = visible.map(d => d.total)
  const netWorths = visible.map(d => d.netWorth)

  const maxTotal = Math.max(...totals)
  const minTotal = Math.min(...totals)
  const maxNetWorth = Math.max(...netWorths)
  const minNetWorth = Math.min(...netWorths)
  const startTotal = visible[0].total
  const endTotal = visible[visible.length - 1].total
  const startNetWorth = visible[0].netWorth
  const endNetWorth = visible[visible.length - 1].netWorth
  const growthAmount = endTotal - startTotal
  const growthRate = startTotal !== 0 ? (growthAmount / Math.abs(startTotal)) * 100 : null
  const netWorthGrowthAmount = endNetWorth - startNetWorth
  const netWorthGrowthRate = startNetWorth !== 0 ? (netWorthGrowthAmount / Math.abs(startNetWorth)) * 100 : null

  return {
    maxTotal,
    minTotal,
    maxNetWorth,
    minNetWorth,
    startTotal,
    endTotal,
    startNetWorth,
    endNetWorth,
    growthAmount,
    growthRate,
    netWorthGrowthAmount,
    netWorthGrowthRate,
    hasData: true
  }
}

export const buildChartOption = (
  aggregatedData: AggregatedDataPoint[],
  activeCategories: Category[],
  chartType: ChartType,
  showLiabilityAndNetWorth: boolean = true
): any => {
  if (!aggregatedData || aggregatedData.length === 0) {
    return {}
  }

  const xAxisData = aggregatedData.map(d => d.periodLabel)
  const totalData = aggregatedData.map(d => d.total)
  const totalLiabilityData = aggregatedData.map(d => d.totalLiability)
  const netWorthData = aggregatedData.map(d => d.netWorth)

  const hasNetWorthData = totalLiabilityData.some(v => v > 0) || netWorthData.some((v, i) => v !== totalData[i])

  const formatValue = (value: number): string => {
    if (Math.abs(value) >= 10000) {
      return (value / 10000).toFixed(1) + '万'
    }
    return value.toLocaleString()
  }

  const buildSeries = () => {
    if (chartType === 'stackedArea') {
      const categorySeries = activeCategories.map(category => {
        const data = aggregatedData.map(d => d.categoryAmounts[category.id] ?? 0)
        return {
          name: (category as any).displayName || category.name,
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

      if (showLiabilityAndNetWorth && hasNetWorthData) {
        return [
          ...categorySeries,
          {
            name: '总负债',
            type: 'line',
            smooth: true,
            data: totalLiabilityData,
            itemStyle: { color: '#f56c6c' },
            lineStyle: { width: 3, type: 'dashed' },
            symbol: 'circle',
            symbolSize: 6,
            z: 90
          },
          {
            name: '净资产',
            type: 'line',
            smooth: true,
            data: netWorthData,
            itemStyle: { color: '#67c23a' },
            lineStyle: { width: 4 },
            symbol: 'circle',
            symbolSize: 8,
            z: 100,
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: {
                color: '#909399',
                type: 'dashed',
                width: 1
              },
              data: [
                { yAxis: 0, label: { formatter: '零线', color: '#909399' } }
              ]
            }
          }
        ]
      }

      return categorySeries
    }

    if (chartType === 'bar') {
      const categorySeries = activeCategories.map(category => {
        const data = aggregatedData.map(d => d.categoryAmounts[category.id] ?? 0)
        return {
          name: (category as any).displayName || category.name,
          type: 'bar',
          stack: 'total',
          emphasis: { focus: 'series' },
          data,
          itemStyle: { color: category.color }
        }
      })

      const extraSeries: any[] = [
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

      if (showLiabilityAndNetWorth && hasNetWorthData) {
        extraSeries.push(
          {
            name: '总负债',
            type: 'line',
            smooth: true,
            data: totalLiabilityData,
            itemStyle: { color: '#e6a23c' },
            lineStyle: { width: 3, type: 'dotted' },
            symbol: 'circle',
            symbolSize: 6,
            z: 95
          },
          {
            name: '净资产',
            type: 'line',
            smooth: true,
            data: netWorthData,
            itemStyle: { color: '#67c23a' },
            lineStyle: { width: 4 },
            symbol: 'circle',
            symbolSize: 8,
            z: 110,
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: {
                color: '#909399',
                type: 'dashed',
                width: 1
              },
              data: [
                { yAxis: 0, label: { formatter: '零线', color: '#909399' } }
              ]
            }
          }
        )
      }

      return [
        ...categorySeries,
        ...extraSeries
      ]
    }

    const categorySeries = activeCategories.map(category => {
      const data = aggregatedData.map(d => d.categoryAmounts[category.id] ?? 0)
      return {
        name: (category as any).displayName || category.name,
        type: 'line',
        smooth: true,
        data,
        itemStyle: { color: category.color },
        lineStyle: { width: 3 },
        symbol: 'circle',
        symbolSize: 6
      }
    })

    const extraSeries: any[] = [
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

    if (showLiabilityAndNetWorth && hasNetWorthData) {
      extraSeries.push(
        {
          name: '总负债',
          type: 'line',
          smooth: true,
          data: totalLiabilityData,
          itemStyle: { color: '#e6a23c' },
          lineStyle: { width: 3, type: 'dotted' },
          symbol: 'circle',
          symbolSize: 6
        },
        {
          name: '净资产',
          type: 'line',
          smooth: true,
          data: netWorthData,
          itemStyle: { color: '#67c23a' },
          lineStyle: { width: 4 },
          symbol: 'circle',
          symbolSize: 8,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: {
              color: '#909399',
              type: 'dashed',
              width: 1
            },
            data: [
              { yAxis: 0, label: { formatter: '零线', color: '#909399' } }
            ]
          }
        }
      )
    }

    return [
      ...categorySeries,
      ...extraSeries
    ]
  }

  const getLegendData = () => {
    const base = chartType === 'stackedArea'
      ? activeCategories.map(c => (c as any).displayName || c.name)
      : [...activeCategories.map(c => (c as any).displayName || c.name), '总资产']

    if (showLiabilityAndNetWorth && hasNetWorthData) {
      return [...base, '总负债', '净资产']
    }
    return base
  }

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
            if (p.seriesName !== '总负债' && p.seriesName !== '净资产') {
              sum += p.value || 0
            }
          })
          sortedParams.forEach(p => {
            const isSpecial = p.seriesName === '总负债' || p.seriesName === '净资产'
            const pct = !isSpecial && sum > 0 ? ((p.value || 0) / sum * 100).toFixed(1) : null
            html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
              <span style="flex:1;">${p.seriesName}</span>
              <span style="font-weight:500;">¥${(p.value || 0).toLocaleString()}</span>
              ${pct !== null ? `<span style="color:#909399;font-size:12px;width:50px;text-align:right;">${pct}%</span>` : ''}
            </div>`
          })
          const netWorthParam = params.find(p => p.seriesName === '净资产')
          const liabilityParam = params.find(p => p.seriesName === '总负债')
          if (liabilityParam || netWorthParam) {
            html += `<div style="border-top:1px solid #eee;margin-top:6px;padding-top:6px;">`
            html += `<div style="display:flex;justify-content:space-between;">
              <span style="font-weight:600;">合计(资产)</span>
              <span style="font-weight:600;">¥${sum.toLocaleString()}</span>
            </div>`
            if (liabilityParam) {
              html += `<div style="display:flex;justify-content:space-between;">
                <span style="color:#e6a23c;">总负债</span>
                <span style="color:#e6a23c;font-weight:500;">¥${(liabilityParam.value || 0).toLocaleString()}</span>
              </div>`
            }
            if (netWorthParam) {
              const isNegative = (netWorthParam.value || 0) < 0
              html += `<div style="display:flex;justify-content:space-between;">
                <span style="font-weight:600;color:${isNegative ? '#f56c6c' : '#67c23a'};">净资产${isNegative ? ' (资不抵债)' : ''}</span>
                <span style="font-weight:600;color:${isNegative ? '#f56c6c' : '#67c23a'};">¥${(netWorthParam.value || 0).toLocaleString()}</span>
              </div>`
            }
            html += `</div>`
          } else {
            html += `<div style="border-top:1px solid #eee;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;">
              <span style="font-weight:600;">合计</span>
              <span style="font-weight:600;">¥${sum.toLocaleString()}</span>
            </div>`
          }
        } else {
          params.forEach(p => {
            const isNegative = p.seriesName === '净资产' && (p.value || 0) < 0
            html += `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${isNegative ? '#f56c6c' : p.color}"></span>
              <span style="${isNegative ? 'color:#f56c6c;font-weight:500;' : ''}">${p.seriesName}${isNegative ? ' (资不抵债)' : ''}: ¥${(p.value || 0).toLocaleString()}</span>
            </div>`
          })
        }

        return html
      }
    },
    legend: {
      data: getLegendData(),
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
