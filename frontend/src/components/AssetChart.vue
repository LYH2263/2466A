<template>
  <div class="asset-chart">
    <el-card class="chart-card">
      <template #header>
        <div class="card-header">
          <span>资产趋势图</span>
        </div>
      </template>

      <div v-if="chartData.length === 0" class="empty-state">
        <el-empty description="暂无数据，请先添加资产记录或填充示例数据">
          <el-button type="primary" @click="$emit('fill-demo')">填充示例数据</el-button>
        </el-empty>
      </div>

      <v-chart
        v-else
        class="chart"
        :option="chartOption"
        autoresize
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import type { AssetRecord, Category } from '../types'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent
])

interface Props {
  chartData: AssetRecord[]
  categories: Category[]
}

const props = defineProps<Props>()

defineEmits<{
  'fill-demo': []
}>()

const activeCategories = computed(() =>
  props.categories.filter(c => c.isActive)
)

const categoryMap = computed(() => {
  const map = new Map<string, Category>()
  props.categories.forEach(c => map.set(c.id, c))
  return map
})

const chartOption = computed(() => {
  const dates = props.chartData.map(r => r.date)
  const totalData = props.chartData.map(r => r.total)

  const categorySeries = activeCategories.value.map(category => {
    const data = props.chartData.map(r => {
      const amount = r.categoryAmounts?.[category.id] ?? 0
      return amount
    })

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

  const legendData = [
    ...activeCategories.value.map(c => c.name),
    '总资产'
  ]

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      },
      formatter: (params: any[]) => {
        let html = `<div style="font-weight:600;margin-bottom:5px;">${params[0].axisValue}</div>`
        params.forEach(p => {
          html += `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
            <span>${p.seriesName}: ¥${p.value.toLocaleString()}</span>
          </div>`
        })
        return html
      }
    },
    legend: {
      data: legendData,
      bottom: 0,
      type: 'scroll',
      pageTextStyle: {
        color: '#909399'
      }
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
      boundaryGap: false,
      data: dates,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => {
          if (value >= 10000) {
            return (value / 10000).toFixed(0) + '万'
          }
          return value
        }
      }
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      }
    ],
    series: [
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
})
</script>

<style scoped>
.asset-chart {
  margin-bottom: 20px;
}

.chart-card {
  min-height: 400px;
}

.card-header {
  font-size: 16px;
  font-weight: 600;
}

.chart {
  height: 400px;
}

.empty-state {
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
