<template>
  <el-card class="returns-analysis" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="header-title">
          <el-icon class="header-icon"><TrendCharts /></el-icon>
          收益分析
        </span>
        <div class="date-range-picker">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            :shortcuts="dateShortcuts"
            @change="handleDateChange"
          />
          <el-button
            type="primary"
            :icon="Search"
            @click="fetchAnalysis"
            :loading="loading"
            size="default"
            style="margin-left: 8px;"
          >分析</el-button>
        </div>
      </div>
    </template>

    <div v-if="analysisData" class="analysis-content">
      <div v-if="analysisData.warnings.length > 0" class="warnings-section">
        <el-alert
          v-for="(warning, idx) in analysisData.warnings"
          :key="idx"
          :title="warning"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 8px;"
        />
      </div>

      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="6">
          <div class="metric-card">
            <div class="metric-label">
              <el-tooltip content="期末资产 - 期初资产" placement="top">
                <span>区间绝对收益 <el-icon><QuestionFilled /></el-icon></span>
              </el-tooltip>
            </div>
            <div class="metric-value" :class="getValueClass(analysisData.total.absoluteReturn)">
              {{ formatSignedMoney(analysisData.total.absoluteReturn) }}
            </div>
            <div class="metric-desc">
              <span>期初: {{ formatMoney(analysisData.total.startValue) }}</span>
              <span class="arrow">→</span>
              <span>期末: {{ formatMoney(analysisData.total.endValue) }}</span>
            </div>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <div class="metric-card highlight">
            <div class="metric-label">
              <el-tooltip content="(期末-期初)/期初×100%，包含本金注入影响" placement="top">
                <span>累计收益率(含本金) <el-icon><QuestionFilled /></el-icon></span>
              </el-tooltip>
            </div>
            <template v-if="analysisData.total.simpleReturn !== null">
              <div class="metric-value" :class="getValueClass(analysisData.total.simpleReturn)">
                {{ formatSignedPercent(analysisData.total.simpleReturn) }}
              </div>
            </template>
            <template v-else>
              <div class="metric-value na">--%</div>
              <div class="metric-sub na">期初金额为0</div>
            </template>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <div class="metric-card success">
            <div class="metric-label">
              <el-tooltip content="时间加权收益率，剔除资金流入/流出影响，更真实反映投资能力" placement="top">
                <span>累计收益率(TWR) <el-icon><QuestionFilled /></el-icon></span>
              </el-tooltip>
            </div>
            <template v-if="analysisData.total.timeWeightedReturn !== null">
              <div class="metric-value" :class="getValueClass(analysisData.total.timeWeightedReturn)">
                {{ formatSignedPercent(analysisData.total.timeWeightedReturn) }}
              </div>
            </template>
            <template v-else>
              <div class="metric-value na">--%</div>
              <div class="metric-sub na">数据不足无法计算</div>
            </template>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <div class="metric-card info">
            <div class="metric-label">
              <el-tooltip content="按实际天数折算的年化收益率，提供含本金和TWR两种口径" placement="top">
                <span>年化收益率 <el-icon><QuestionFilled /></el-icon></span>
              </el-tooltip>
            </div>
            <template v-if="analysisData.total.annualizedTimeWeightedReturn !== null">
              <div class="metric-value small" :class="getValueClass(analysisData.total.annualizedTimeWeightedReturn)">
                TWR: {{ formatSignedPercent(analysisData.total.annualizedTimeWeightedReturn) }}
              </div>
            </template>
            <template v-else>
              <div class="metric-value small na">TWR: --%</div>
            </template>
            <template v-if="analysisData.total.annualizedSimpleReturn !== null">
              <div class="metric-sub" :class="getValueClass(analysisData.total.annualizedSimpleReturn)">
                含本金: {{ formatSignedPercent(analysisData.total.annualizedSimpleReturn) }}
              </div>
            </template>
            <template v-else>
              <div class="metric-sub na">含本金: --%</div>
            </template>
            <div class="metric-desc">
              区间 {{ analysisData.actualDays }} 天
            </div>
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="20" style="margin-top: 8px;">
        <el-col :xs="24" :sm="12" :md="8">
          <div class="metric-card cashflow">
            <div class="metric-label">
              <span class="label-icon up">↓</span>
              资金存入
            </div>
            <div class="metric-value up">
              {{ formatMoney(analysisData.cashFlowSummary.totalDeposit) }}
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <div class="metric-card cashflow">
            <div class="metric-label">
              <span class="label-icon down">↑</span>
              资金取出
            </div>
            <div class="metric-value down">
              {{ formatMoney(Math.abs(analysisData.cashFlowSummary.totalWithdraw)) }}
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="8">
          <div class="metric-card cashflow">
            <div class="metric-label">
              <span class="label-icon">Σ</span>
              净资金流
            </div>
            <div class="metric-value" :class="getValueClass(analysisData.cashFlowSummary.netCashFlow)">
              {{ formatSignedMoney(analysisData.cashFlowSummary.netCashFlow) }}
            </div>
            <div class="metric-sub na">
              共 {{ analysisData.cashFlowSummary.count }} 笔记录
            </div>
          </div>
        </el-col>
      </el-row>

      <el-divider />

      <div class="section">
        <div class="section-title">
          <el-icon><TrendCharts /></el-icon>
          累计收益率曲线
        </div>
        <div v-if="analysisData.cumulativeCurve.length > 0" ref="chartRef" class="returns-chart"></div>
        <el-empty v-else description="暂无足够数据绘制曲线" />
      </div>

      <el-divider />

      <div class="section">
        <div class="section-title">
          <el-icon><PieChart /></el-icon>
          类别收益分析
        </div>
        <el-table :data="categoryTableData" stripe style="width: 100%">
          <el-table-column label="类别" min-width="140">
            <template #default="{ row }">
              <span class="category-cell">
                <span class="color-dot" :style="{ backgroundColor: row.categoryColor }"></span>
                <span class="category-name">{{ row.categoryName }}</span>
                <el-tag size="small" type="info" style="margin-left: 6px;">
                  {{ row.percentageInTotal.toFixed(1) }}%
                </el-tag>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="绝对收益" min-width="130" align="right">
            <template #default="{ row }">
              <span :class="getValueClass(row.absoluteReturn)">
                {{ formatSignedMoney(row.absoluteReturn) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="收益率(含本金)" min-width="140" align="right">
            <template #default="{ row }">
              <template v-if="row.simpleReturn !== null">
                <span :class="getValueClass(row.simpleReturn)">
                  {{ formatSignedPercent(row.simpleReturn) }}
                </span>
              </template>
              <span v-else class="na">--%</span>
            </template>
          </el-table-column>
          <el-table-column label="收益率(TWR)" min-width="140" align="right">
            <template #default="{ row }">
              <template v-if="row.timeWeightedReturn !== null">
                <span :class="getValueClass(row.timeWeightedReturn)">
                  {{ formatSignedPercent(row.timeWeightedReturn) }}
                </span>
              </template>
              <span v-else class="na">--%</span>
            </template>
          </el-table-column>
          <el-table-column label="年化(TWR)" min-width="130" align="right">
            <template #default="{ row }">
              <template v-if="row.annualizedTimeWeightedReturn !== null">
                <span :class="getValueClass(row.annualizedTimeWeightedReturn)">
                  {{ formatSignedPercent(row.annualizedTimeWeightedReturn) }}
                </span>
              </template>
              <span v-else class="na">--%</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <el-empty v-else-if="!loading" description="选择日期范围后点击分析按钮开始计算收益" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
import { TrendCharts, Search, QuestionFilled, PieChart } from '@element-plus/icons-vue'
import type { ReturnsAnalysis, CategoryReturn } from '../types'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'

interface Props {
  fetchReturnsAnalysis: (startDate: string, endDate: string) => Promise<ReturnsAnalysis | null>
}

const props = defineProps<Props>()

const loading = ref(false)
const analysisData = ref<ReturnsAnalysis | null>(null)
const dateRange = ref<string[]>([])
const chartRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null

const dateShortcuts = [
  { text: '近7天', value: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 7); return [start, end] as const } },
  { text: '近30天', value: () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30); return [start, end] as const } },
  { text: '近3个月', value: () => { const end = new Date(); const start = new Date(); start.setMonth(start.getMonth() - 3); return [start, end] as const } },
  { text: '近6个月', value: () => { const end = new Date(); const start = new Date(); start.setMonth(start.getMonth() - 6); return [start, end] as const } },
  { text: '近1年', value: () => { const end = new Date(); const start = new Date(); start.setFullYear(start.getFullYear() - 1); return [start, end] as const } },
  { text: '今年以来', value: () => { const end = new Date(); const start = new Date(end.getFullYear(), 0, 1); return [start, end] as const } }
]

const categoryTableData = computed<CategoryReturn[]>(() => {
  if (!analysisData.value) return []
  return [...analysisData.value.categoryReturns].sort((a, b) => Math.abs(b.absoluteReturn) - Math.abs(a.absoluteReturn))
})

const formatMoney = (value: number): string => {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 }).format(value)
}

const formatSignedMoney = (value: number): string => {
  const sign = value > 0 ? '+' : ''
  return sign + formatMoney(value)
}

const formatSignedPercent = (value: number): string => {
  const sign = value > 0 ? '+' : ''
  return sign + value.toFixed(2) + '%'
}

const getValueClass = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return 'na'
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

const initChart = () => {
  if (!chartRef.value || !analysisData.value || analysisData.value.cumulativeCurve.length === 0) return

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  const dates = analysisData.value.cumulativeCurve.map(p => p.date)
  const simpleReturns = analysisData.value.cumulativeCurve.map(p => p.cumulativeSimpleReturn)
  const twrReturns = analysisData.value.cumulativeCurve.map(p => p.cumulativeTimeWeightedReturn)

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        if (!params || params.length === 0) return ''
        const date = params[0].axisValue
        let html = `<div style="font-weight:600;margin-bottom:8px;">${date}</div>`
        for (const p of params) {
          const val = p.value
          const isNeg = val !== null && val !== undefined && val < 0
          html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color}"></span>
            <span>${p.seriesName}:</span>
            <span style="font-weight:600;color:${isNeg ? '#f56c6c' : (val > 0 ? '#67c23a' : '#909399')};">
              ${val === null || val === undefined ? '--' : (val > 0 ? '+' : '') + val.toFixed(2) + '%'}
            </span>
          </div>`
        }
        return html
      }
    },
    legend: {
      data: ['累计收益率(含本金)', '累计收益率(TWR)'],
      bottom: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLabel: { rotate: 45, interval: 0 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => value + '%' }
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100, bottom: 30, height: 20 }
    ],
    series: [
      {
        name: '累计收益率(含本金)',
        type: 'line',
        smooth: true,
        data: simpleReturns,
        itemStyle: { color: '#f56c6c' },
        lineStyle: { width: 3 },
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: { opacity: 0.1 },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#909399', type: 'dashed', width: 1 },
          data: [{ yAxis: 0, label: { formatter: '零线', color: '#909399' } }]
        }
      },
      {
        name: '累计收益率(TWR)',
        type: 'line',
        smooth: true,
        data: twrReturns,
        itemStyle: { color: '#409eff' },
        lineStyle: { width: 3 },
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: { opacity: 0.1 }
      }
    ]
  }

  chartInstance.setOption(option, true)
}

const handleResize = () => {
  chartInstance?.resize()
}

const fetchAnalysis = async () => {
  if (!dateRange.value || dateRange.value.length < 2) {
    ElMessage.warning('请选择开始和结束日期')
    return
  }
  const [start, end] = dateRange.value
  loading.value = true
  try {
    const result = await props.fetchReturnsAnalysis(start, end)
    if (result) {
      analysisData.value = result
      ElMessage.success('收益分析完成')
      await nextTick()
      initChart()
    } else {
      ElMessage.error('分析失败，请稍后重试')
    }
  } finally {
    loading.value = false
  }
}

const handleDateChange = () => {
}

watch(analysisData, () => {
  nextTick(() => {
    if (chartInstance && analysisData.value) {
      initChart()
    }
  })
})

onMounted(() => {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 3)
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  dateRange.value = [fmt(start), fmt(end)]

  window.addEventListener('resize', handleResize)
  fetchAnalysis()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style scoped>
.returns-analysis {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-icon {
  color: #409eff;
  font-size: 18px;
}

.date-range-picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.analysis-content {
  margin-top: 8px;
}

.warnings-section {
  margin-bottom: 16px;
}

.metric-card {
  background: #fafafa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  transition: all 0.3s;
  border: 1px solid #ebeef5;
}

.metric-card:hover {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
}

.metric-card.highlight {
  background: linear-gradient(135deg, #fef0f0 0%, #fde2e2 100%);
  border-color: #fbc4c4;
}

.metric-card.success {
  background: linear-gradient(135deg, #ecf5ff 0%, #d9ecff 100%);
  border-color: #b3d8ff;
}

.metric-card.info {
  background: linear-gradient(135deg, #f0f9eb 0%, #e1f3d8 100%);
  border-color: #c2e7b0;
}

.metric-card.cashflow {
  padding: 16px;
}

.metric-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.label-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e4e7ed;
  color: #909399;
  font-size: 12px;
  font-weight: 700;
}

.label-icon.up {
  background: #f0f9eb;
  color: #67c23a;
}

.label-icon.down {
  background: #fef0f0;
  color: #f56c6c;
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
  margin-bottom: 6px;
}

.metric-value.small {
  font-size: 18px;
}

.metric-value.up {
  color: #67c23a;
}

.metric-value.down {
  color: #f56c6c;
}

.metric-value.na {
  color: #c0c4cc;
  font-size: 20px;
}

.metric-sub {
  font-size: 13px;
  margin-bottom: 4px;
}

.metric-sub.up { color: #67c23a; }
.metric-sub.down { color: #f56c6c; }
.metric-sub.na { color: #909399; }

.metric-desc {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
  flex-wrap: wrap;
}

.metric-desc .arrow {
  color: #c0c4cc;
}

.section {
  margin-top: 8px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #409eff;
}

.returns-chart {
  width: 100%;
  height: 360px;
}

.category-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.category-name {
  font-weight: 500;
}

.up { color: #67c23a; }
.down { color: #f56c6c; }
.flat { color: #909399; }
.na { color: #c0c4cc; }

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: stretch;
  }
  .date-range-picker {
    justify-content: space-between;
  }
  .date-range-picker :deep(.el-date-editor) {
    flex: 1;
  }
  .returns-chart {
    height: 280px;
  }
}
</style>
