<template>
  <div class="asset-chart">
    <el-card class="chart-card">
      <template #header>
        <div class="card-header">
          <span>资产趋势图</span>
          <div class="header-controls">
            <div class="control-group">
              <span class="control-label">时间粒度</span>
              <el-radio-group v-model="granularity" size="small">
                <el-radio-button value="month">月</el-radio-button>
                <el-radio-button value="quarter">季</el-radio-button>
                <el-radio-button value="year">年</el-radio-button>
              </el-radio-group>
            </div>
            <div class="control-group">
              <span class="control-label">聚合方式</span>
              <el-radio-group v-model="aggregateStrategy" size="small">
                <el-radio-button value="last">期末值</el-radio-button>
                <el-radio-button value="average">平均值</el-radio-button>
              </el-radio-group>
            </div>
            <div class="control-group">
              <span class="control-label">图表类型</span>
              <el-radio-group v-model="chartType" size="small">
                <el-radio-button value="line">折线</el-radio-button>
                <el-radio-button value="stackedArea">堆叠面积</el-radio-button>
                <el-radio-button value="bar">柱状</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </div>
      </template>

      <div v-if="!hasData" class="empty-state">
        <el-empty description="暂无数据，请先添加资产记录或填充示例数据">
          <el-button type="primary" @click="$emit('fill-demo')">填充示例数据</el-button>
        </el-empty>
      </div>

      <template v-else>
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">区间最高(资产)</span>
            <span class="stat-value stat-max">¥{{ formatNumber(stats.maxTotal) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">区间最低(资产)</span>
            <span class="stat-value stat-min">¥{{ formatNumber(stats.minTotal) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">资产增长</span>
            <span :class="['stat-value', stats.growthAmount >= 0 ? 'stat-up' : 'stat-down']">
              {{ stats.growthAmount >= 0 ? '+' : '' }}¥{{ formatNumber(stats.growthAmount) }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">资产增长率</span>
            <span :class="['stat-value', stats.growthRate !== null && stats.growthRate >= 0 ? 'stat-up' : 'stat-down']">
              {{ stats.growthRate !== null ? (stats.growthRate >= 0 ? '+' : '') + stats.growthRate.toFixed(2) + '%' : '--' }}
            </span>
          </div>
          <div class="stat-item" v-if="hasNetWorthData">
            <span class="stat-label">净资产</span>
            <span :class="['stat-value', stats.endNetWorth >= 0 ? 'stat-networth' : 'stat-negative']">
              ¥{{ formatNumber(stats.endNetWorth) }}
              <el-tag v-if="stats.endNetWorth < 0" type="danger" size="small" effect="dark">资不抵债</el-tag>
            </span>
          </div>
          <div class="stat-item" v-if="hasNetWorthData">
            <span class="stat-label">净资产增长</span>
            <span :class="['stat-value', stats.netWorthGrowthAmount >= 0 ? 'stat-up' : 'stat-down']">
              {{ stats.netWorthGrowthAmount >= 0 ? '+' : '' }}¥{{ formatNumber(stats.netWorthGrowthAmount) }}
            </span>
          </div>
        </div>

        <v-chart
          ref="chartRef"
          class="chart"
          :option="chartOption"
          autoresize
          @datazoom="handleDataZoom"
          @finished="handleChartReady"
        />
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import type { AssetRecord, Category, NetWorthTimePoint } from '../types'
import {
  aggregateRecords,
  calculateVisibleStats,
  buildChartOption,
  type TimeGranularity,
  type ChartType,
  type AggregateStrategy,
  type AggregatedDataPoint,
  type VisibleStats
} from '../utils/chartUtils'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent
])

interface Props {
  chartData: AssetRecord[]
  categories: Category[]
  netWorthSeries?: NetWorthTimePoint[]
}

const props = withDefaults(defineProps<Props>(), {
  netWorthSeries: () => []
})

defineEmits<{
  'fill-demo': []
}>()

const chartRef = ref<InstanceType<typeof VChart> | null>(null)
const granularity = ref<TimeGranularity>('month')
const aggregateStrategy = ref<AggregateStrategy>('last')
const chartType = ref<ChartType>('line')
const visibleStart = ref(0)
const visibleEnd = ref(0)
const chartReady = ref(false)

const displayCategories = computed(() =>
  [...props.categories].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.sortOrder - b.sortOrder
  }).map(category => ({
    ...category,
    displayName: category.isActive ? category.name : `${category.name}（已停用）`
  }))
)

const displayCategoryIds = computed(() =>
  displayCategories.value.map(c => c.id)
)

const hasData = computed(() => {
  const hasAssetData = props.chartData && props.chartData.length > 0
  const hasNetWorthData = props.netWorthSeries && props.netWorthSeries.length > 0
  return hasAssetData || hasNetWorthData
})

const hasNetWorthData = computed(() =>
  props.netWorthSeries && props.netWorthSeries.length > 0 &&
  props.netWorthSeries.some(p => p.totalLiability > 0 || p.netWorth !== p.totalAsset)
)

const aggregatedData = computed<AggregatedDataPoint[]>(() => {
  return aggregateRecords(
    props.chartData,
    granularity.value,
    aggregateStrategy.value,
    displayCategoryIds.value,
    props.netWorthSeries
  )
})

const chartOption = computed(() => {
  return buildChartOption(
    aggregatedData.value,
    displayCategories.value,
    chartType.value,
    hasNetWorthData.value
  )
})

const stats = computed<VisibleStats>(() => {
  if (aggregatedData.value.length === 0) {
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

  const start = chartReady.value ? visibleStart.value : 0
  const end = chartReady.value ? visibleEnd.value : aggregatedData.value.length - 1

  return calculateVisibleStats(aggregatedData.value, start, end)
})

const formatNumber = (num: number): string => {
  if (Math.abs(num) >= 10000) {
    return (num / 10000).toFixed(2) + '万'
  }
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

const updateVisibleRange = () => {
  if (!chartRef.value) return
  const echartsInstance = chartRef.value.getEchartsInstance()
  if (!echartsInstance) return

  try {
    const option = echartsInstance.getOption()
    const dataZoom = option?.dataZoom?.[0]
    if (!dataZoom) return

    const total = aggregatedData.value.length
    if (total === 0) return

    let startIdx: number
    let endIdx: number

    if (typeof dataZoom.startValue === 'number' && typeof dataZoom.endValue === 'number') {
      startIdx = Math.max(0, Math.floor(dataZoom.startValue))
      endIdx = Math.min(total - 1, Math.ceil(dataZoom.endValue))
    } else if (typeof dataZoom.start === 'number' && typeof dataZoom.end === 'number') {
      startIdx = Math.max(0, Math.floor((dataZoom.start / 100) * (total - 1)))
      endIdx = Math.min(total - 1, Math.ceil((dataZoom.end / 100) * (total - 1)))
    } else {
      startIdx = 0
      endIdx = total - 1
    }

    visibleStart.value = startIdx
    visibleEnd.value = endIdx
  } catch (e) {
    visibleStart.value = 0
    visibleEnd.value = aggregatedData.value.length - 1
  }
}

const handleDataZoom = () => {
  updateVisibleRange()
}

const handleChartReady = () => {
  chartReady.value = true
  updateVisibleRange()
}

watch(
  [aggregatedData, granularity, aggregateStrategy],
  () => {
    chartReady.value = false
    visibleStart.value = 0
    visibleEnd.value = Math.max(0, aggregatedData.value.length - 1)
    setTimeout(() => {
      chartReady.value = true
      updateVisibleRange()
    }, 50)
  }
)
</script>

<style scoped>
.asset-chart {
  margin-bottom: 20px;
}

.chart-card {
  min-height: 480px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 16px;
  font-weight: 600;
}

.header-controls {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control-label {
  font-size: 13px;
  font-weight: 400;
  color: #606266;
}

.stats-bar {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  margin-bottom: 8px;
  background: linear-gradient(135deg, #f0f7ff 0%, #f5f0ff 100%);
  border-radius: 8px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 120px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-max {
  color: #e6a23c;
}

.stat-min {
  color: #909399;
}

.stat-up {
  color: #67c23a;
}

.stat-down {
  color: #f56c6c;
}

.stat-networth {
  color: #67c23a;
}

.stat-negative {
  color: #f56c6c;
}

.chart {
  height: 420px;
}

.empty-state {
  height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .header-controls {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .stats-bar {
    gap: 12px;
  }

  .stat-item {
    min-width: calc(50% - 6px);
  }
}
</style>
