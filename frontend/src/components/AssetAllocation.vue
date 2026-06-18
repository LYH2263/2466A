<template>
  <div class="asset-allocation">
    <el-card class="allocation-card">
      <template #header>
        <div class="card-header">
          <span>资产配置分析</span>
          <el-button
            v-if="!showTargetForm"
            size="small"
            type="primary"
            :icon="Setting"
            @click="toggleTargetForm"
          >
            {{ hasTarget ? '修改目标' : '设定目标' }}
          </el-button>
          <el-button
            v-else
            size="small"
            @click="cancelEdit"
          >
            取消
          </el-button>
        </div>
      </template>

      <div v-if="!latestRecord" class="empty-state">
        <el-empty description="暂无资产记录，请先添加资产数据" />
      </div>

      <template v-else>
        <div class="allocation-content">
          <div class="chart-section">
            <v-chart
              class="donut-chart"
              :option="donutChartOption"
              autoresize
            />
            <div class="chart-center">
              <div class="center-label">总资产</div>
              <div class="center-value">¥{{ formatNumber(latestRecord.total) }}</div>
              <div class="center-date">{{ latestRecord.date }}</div>
            </div>
          </div>

          <div class="detail-section">
            <div class="legend-list">
              <div
                v-for="item in allocationItems"
                :key="item.categoryId"
                class="legend-item"
                :class="{ 'legend-warning': item.isWarning, 'legend-inactive': item.isInactive }"
              >
                <div class="legend-left">
                  <span class="color-dot" :style="{ backgroundColor: item.color }" />
                  <span class="legend-name">
                    {{ item.name }}
                    <el-tag v-if="item.isInactive" size="small" type="info" effect="plain" class="inactive-tag">已停用</el-tag>
                  </span>
                </div>
                <div class="legend-right">
                  <span class="legend-amount">¥{{ formatNumber(item.amount) }}</span>
                  <span class="legend-percent">{{ item.percent.toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <transition name="slide">
          <div v-if="showTargetForm" class="target-form-section">
            <el-divider content-position="left">目标配置比例</el-divider>

            <el-form
              ref="targetFormRef"
              :model="targetForm"
              label-width="80px"
              label-position="top"
              class="target-form"
            >
              <div class="form-items">
                <div
                  v-for="(item, index) in targetForm.allocations"
                  :key="item.categoryId"
                  class="form-item-row"
                >
                  <div class="form-item-left">
                    <span class="color-dot" :style="{ backgroundColor: getCategoryColor(item.categoryId) }" />
                    <span class="form-item-name">{{ getCategoryName(item.categoryId) }}</span>
                  </div>
                  <div class="form-item-right">
                    <el-input-number
                      v-model="item.percentage"
                      :min="0"
                      :max="100"
                      :precision="1"
                      :step="5"
                      size="small"
                      style="width: 120px;"
                      @change="handlePercentageChange"
                    />
                    <span class="percent-sign">%</span>
                  </div>
                </div>
              </div>

              <div class="form-summary" :class="{ 'summary-error': !isPercentageValid }">
                <span>比例合计：</span>
                <span class="summary-value">{{ percentageSum.toFixed(1) }}%</span>
                <el-tag v-if="!isPercentageValid" type="danger" size="small" effect="dark">
                  必须等于100%
                </el-tag>
                <el-tag v-else type="success" size="small">✓</el-tag>
              </div>

              <el-form-item label="偏离预警阈值" class="threshold-item">
                <el-input-number
                  v-model="targetForm.warningThreshold"
                  :min="1"
                  :max="50"
                  :precision="0"
                  :step="5"
                  size="small"
                  style="width: 120px;"
                />
                <span class="percent-sign">%</span>
                <span class="threshold-hint">偏离超过此值时高亮预警</span>
              </el-form-item>

              <div class="form-actions">
                <el-button
                  type="primary"
                  :disabled="!isPercentageValid"
                  :loading="saving"
                  @click="handleSaveTarget"
                >
                  保存目标配置
                </el-button>
                <el-button
                  v-if="hasTarget"
                  type="danger"
                  plain
                  @click="handleDeleteTarget"
                >
                  删除配置
                </el-button>
              </div>
            </el-form>
          </div>
        </transition>

        <div v-if="rebalanceResult" class="rebalance-section">
          <el-divider content-position="left">
            再平衡建议
            <el-tag
              v-if="warningCount > 0"
              type="warning"
              size="small"
              effect="dark"
              style="margin-left: 8px;"
            >
              {{ warningCount }} 项偏离预警
            </el-tag>
          </el-divider>

          <div class="rebalance-cards">
            <div
              v-for="item in rebalanceResult.items"
              :key="item.categoryId"
              class="rebalance-card"
              :class="{ 'card-warning': item.isWarning }"
            >
              <div class="rb-header">
                <span class="color-dot" :style="{ backgroundColor: item.categoryColor }" />
                <span class="rb-name">{{ item.categoryName }}</span>
                <el-tag
                  v-if="item.isWarning"
                  type="danger"
                  size="small"
                  effect="dark"
                >
                  偏离 {{ Math.abs(item.diffPercent).toFixed(1) }}%
                </el-tag>
              </div>

              <div class="rb-bars">
                <div class="bar-row">
                  <span class="bar-label">实际</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill actual-fill"
                      :style="{
                        width: Math.min(item.actualPercent, 100) + '%',
                        backgroundColor: item.categoryColor
                      }"
                    />
                  </div>
                  <span class="bar-value">{{ item.actualPercent.toFixed(1) }}%</span>
                </div>
                <div class="bar-row">
                  <span class="bar-label">目标</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill target-fill"
                      :style="{ width: Math.min(item.targetPercent, 100) + '%' }"
                    />
                  </div>
                  <span class="bar-value">{{ item.targetPercent.toFixed(1) }}%</span>
                </div>
              </div>

              <div class="rb-suggestion">
                <template v-if="item.rebalanceAmount > 0">
                  <el-icon color="#67c23a"><Top /></el-icon>
                  <span class="suggestion-increase">
                    需调入 ¥{{ formatNumber(item.rebalanceAmount) }}
                  </span>
                </template>
                <template v-else-if="item.rebalanceAmount < 0">
                  <el-icon color="#f56c6c"><Bottom /></el-icon>
                  <span class="suggestion-decrease">
                    需调出 ¥{{ formatNumber(Math.abs(item.rebalanceAmount)) }}
                  </span>
                </template>
                <template v-else>
                  <span class="suggestion-balanced">配置平衡 ✓</span>
                </template>
              </div>
            </div>
          </div>

          <div class="rebalance-footer">
            <span class="footer-info">
              基于 {{ rebalanceLatestDate }} 数据，总资产 ¥{{ formatNumber(rebalanceResult.totalAsset) }}
            </span>
            <span class="footer-sum" v-if="Math.abs(rebalanceResult.rebalanceSum) < 0.01">
              再平衡总额守恒 ✓
            </span>
          </div>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import {
  TooltipComponent,
  LegendComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { Setting, Top, Bottom } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Category, AssetRecord, TargetAllocation, AllocationFormData, RebalanceResult, AllocationItem } from '../types'

use([CanvasRenderer, PieChart, TooltipComponent, LegendComponent])

interface Props {
  latestRecord: AssetRecord | null
  categories: Category[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'allocation-updated': []
}>()

const targetAllocation = ref<TargetAllocation | null>(null)
const rebalanceResult = ref<RebalanceResult | null>(null)
const rebalanceLatestDate = ref<string | null>(null)
const showTargetForm = ref(false)
const saving = ref(false)
const targetFormRef = ref()

const targetForm = ref<AllocationFormData>({
  allocations: [],
  warningThreshold: 10
})

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const getAuthHeaders = () => {
  const token = localStorage.getItem('accessToken')
  return { Authorization: `Bearer ${token}` }
}

const sortedCategories = computed(() =>
  [...props.categories].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.sortOrder - b.sortOrder
  })
)

const allDisplayCategories = computed(() => {
  if (!props.latestRecord) return sortedCategories.value

  const recordCategoryIds = Object.keys(props.latestRecord.categoryAmounts || {})
  const usedInactiveIds = recordCategoryIds.filter(id => {
    const cat = props.categories.find(c => c.id === id)
    return cat && !cat.isActive
  })

  if (usedInactiveIds.length === 0) return sortedCategories.value

  const usedInactive = usedInactiveIds
    .map(id => props.categories.find(c => c.id === id))
    .filter((c): c is Category => c !== undefined)

  const activeList = sortedCategories.value.filter(c => c.isActive)
  return [...activeList, ...usedInactive]
})

const targetFormCategories = computed(() =>
  [...props.categories].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.sortOrder - b.sortOrder
  })
)

const hasTarget = computed(() => !!targetAllocation.value)

const allocationItems = computed(() => {
  if (!props.latestRecord) return []

  const total = props.latestRecord.total
  if (total === 0) {
    return allDisplayCategories.value.map(cat => ({
      categoryId: cat.id,
      name: cat.name,
      color: cat.color,
      amount: 0,
      percent: 0,
      isWarning: false,
      isInactive: !cat.isActive
    }))
  }

  return allDisplayCategories.value.map(cat => {
    const amount = props.latestRecord!.categoryAmounts?.[cat.id] ?? 0
    const percent = (amount / total) * 100
    const targetPct = targetAllocation.value?.allocations.find(
      a => a.categoryId === cat.id
    )?.percentage ?? null
    const isWarning = targetPct !== null && Math.abs(percent - targetPct) > (targetAllocation.value?.warningThreshold ?? 10)

    return {
      categoryId: cat.id,
      name: cat.name,
      color: cat.color,
      amount,
      percent,
      isWarning,
      isInactive: !cat.isActive
    }
  })
})

const warningCount = computed(() => {
  if (!rebalanceResult.value) return 0
  return rebalanceResult.value.items.filter(i => i.isWarning).length
})

const percentageSum = computed(() => {
  return targetForm.value.allocations.reduce((s, a) => s + a.percentage, 0)
})

const isPercentageValid = computed(() => {
  return Math.abs(percentageSum.value - 100) < 0.1
})

const donutChartOption = computed(() => {
  if (!props.latestRecord || props.latestRecord.total === 0) {
    return {
      series: [{
        type: 'pie',
        radius: ['55%', '80%'],
        data: [{ value: 1, name: '暂无数据', itemStyle: { color: '#ebeef5' } }],
        label: { show: false },
        emphasis: { disabled: true }
      }]
    }
  }

  const data = allocationItems.value
    .map(item => ({
      value: item.amount,
      name: item.name,
      itemStyle: {
        color: item.isInactive ? undefined : item.color,
        borderColor: item.isWarning ? '#f56c6c' : (item.isInactive ? '#c0c4cc' : 'transparent'),
        borderWidth: item.isWarning ? 2 : (item.isInactive ? 1 : 0),
        opacity: item.isInactive ? 0.5 : 1
      }
    }))

  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `${params.name}<br/>¥${params.value.toLocaleString()}<br/>${params.percent.toFixed(1)}%`
      }
    },
    series: [{
      type: 'pie',
      radius: ['55%', '80%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      label: {
        show: true,
        position: 'outside',
        formatter: '{b}\n{d}%',
        fontSize: 12,
        lineHeight: 16
      },
      labelLine: {
        show: true,
        length: 10,
        length2: 15
      },
      emphasis: {
        label: { show: true, fontSize: 14, fontWeight: 'bold' },
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.3)' }
      },
      data
    }]
  }
})

const getCategoryName = (categoryId: string): string => {
  return props.categories.find(c => c.id === categoryId)?.name ?? '未知'
}

const getCategoryColor = (categoryId: string): string => {
  return props.categories.find(c => c.id === categoryId)?.color ?? '#909399'
}

const formatNumber = (num: number): string => {
  if (Math.abs(num) >= 10000) {
    return (num / 10000).toFixed(2) + '万'
  }
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

const handlePercentageChange = () => {
}

const toggleTargetForm = () => {
  if (showTargetForm.value) {
    showTargetForm.value = false
    return
  }

  if (targetAllocation.value) {
    const existingAllocIds = new Set(targetAllocation.value.allocations.map(a => a.categoryId))
    const newCategoryIds = targetFormCategories.value
      .map(c => c.id)
      .filter(id => !existingAllocIds.has(id))

    const baseAllocations = targetAllocation.value.allocations.map(a => ({ ...a }))
    const totalExistingPct = baseAllocations.reduce((s, a) => s + a.percentage, 0)
    const remainingPct = Math.max(0, 100 - totalExistingPct)
    const newCount = newCategoryIds.length
    const newPctEach = newCount > 0 ? remainingPct / newCount : 0

    const newAllocations = newCategoryIds.map(id => ({
      categoryId: id,
      percentage: Math.round(newPctEach * 10) / 10
    }))

    targetForm.value = {
      allocations: [
        ...baseAllocations,
        ...newAllocations
      ].sort((a, b) => {
        const catA = targetFormCategories.value.find(c => c.id === a.categoryId)
        const catB = targetFormCategories.value.find(c => c.id === b.categoryId)
        if (!catA || !catB) return 0
        if (catA.isActive !== catB.isActive) return catA.isActive ? -1 : 1
        return catA.sortOrder - catB.sortOrder
      }),
      warningThreshold: targetAllocation.value.warningThreshold
    }
  } else {
    const cats = targetFormCategories.value
    const count = cats.length
    const basePct = Math.floor(100 / count)
    const remainder = 100 - basePct * count
    targetForm.value = {
      allocations: cats.map((cat, idx) => ({
        categoryId: cat.id,
        percentage: basePct + (idx < remainder ? 1 : 0)
      })),
      warningThreshold: 10
    }
  }
  showTargetForm.value = true
}

const cancelEdit = () => {
  showTargetForm.value = false
}

const handleSaveTarget = async () => {
  if (!isPercentageValid.value) {
    ElMessage.warning('目标比例之和必须为100%')
    return
  }

  saving.value = true
  try {
    const response = await fetch(`${API_BASE_URL}/api/allocations`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(targetForm.value)
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || '保存失败')
    }

    const data = await response.json()
    targetAllocation.value = data.allocation
    showTargetForm.value = false
    ElMessage.success('目标配置保存成功')
    await fetchRebalance()
    emit('allocation-updated')
  } catch (err: any) {
    ElMessage.error(err.message || '保存目标配置失败')
  } finally {
    saving.value = false
  }
}

const handleDeleteTarget = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要删除目标配置吗？',
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const response = await fetch(`${API_BASE_URL}/api/allocations`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || '删除失败')
    }

    targetAllocation.value = null
    rebalanceResult.value = null
    showTargetForm.value = false
    ElMessage.success('目标配置已删除')
    emit('allocation-updated')
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '删除失败')
    }
  }
}

const fetchTargetAllocation = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/allocations`, {
      headers: getAuthHeaders()
    })
    if (!response.ok) return
    const data = await response.json()
    targetAllocation.value = data.allocation
  } catch (err) {
    console.error('Fetch allocation error:', err)
  }
}

const fetchRebalance = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/allocations/rebalance`, {
      headers: getAuthHeaders()
    })
    if (!response.ok) return
    const data = await response.json()
    rebalanceLatestDate.value = data.latestDate
    rebalanceResult.value = data.rebalance
  } catch (err) {
    console.error('Fetch rebalance error:', err)
  }
}

const loadData = async () => {
  await fetchTargetAllocation()
  await fetchRebalance()
}

watch(
  () => props.latestRecord,
  () => {
    if (props.latestRecord) {
      fetchRebalance()
    }
  }
)

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.asset-allocation {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
}

.empty-state {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.allocation-content {
  display: flex;
  gap: 24px;
  align-items: center;
}

.chart-section {
  position: relative;
  flex: 0 0 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.donut-chart {
  width: 300px;
  height: 300px;
}

.chart-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
}

.center-label {
  font-size: 12px;
  color: #909399;
}

.center-value {
  font-size: 18px;
  font-weight: 700;
  color: #303133;
  margin: 4px 0;
}

.center-date {
  font-size: 11px;
  color: #c0c4cc;
}

.detail-section {
  flex: 1;
  min-width: 0;
}

.legend-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.legend-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  transition: background 0.2s;
}

.legend-item:hover {
  background: #f5f7fa;
}

.legend-item.legend-warning {
  background: #fef0f0;
  border: 1px solid #fbc4c4;
}

.legend-item.legend-inactive {
  opacity: 0.7;
  background: #fafafa;
}

.inactive-tag {
  font-weight: normal;
  margin-left: 4px;
}

.legend-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.legend-amount {
  font-size: 14px;
  font-weight: 600;
  color: #606266;
}

.legend-percent {
  font-size: 13px;
  color: #909399;
  min-width: 50px;
  text-align: right;
}

.target-form-section {
  margin-top: 16px;
  padding-top: 8px;
}

.form-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.form-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-item-name {
  font-size: 14px;
  font-weight: 500;
}

.form-item-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.percent-sign {
  font-size: 14px;
  color: #606266;
}

.form-summary {
  margin-top: 12px;
  padding: 12px;
  border-radius: 8px;
  background: #f0f9eb;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}

.form-summary.summary-error {
  background: #fef0f0;
}

.summary-value {
  font-size: 18px;
  font-weight: 700;
}

.threshold-item {
  margin-top: 12px;
}

.threshold-hint {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
}

.form-actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
}

.rebalance-section {
  margin-top: 16px;
}

.rebalance-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.rebalance-card {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  background: #fafafa;
  transition: all 0.2s;
}

.rebalance-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.rebalance-card.card-warning {
  border-color: #fbc4c4;
  background: #fff8f8;
}

.rb-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.rb-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  flex: 1;
}

.rb-bars {
  margin-bottom: 12px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.bar-label {
  font-size: 12px;
  color: #909399;
  min-width: 28px;
}

.bar-track {
  flex: 1;
  height: 8px;
  background: #ebeef5;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.actual-fill {
  opacity: 0.85;
}

.target-fill {
  background: #c0c4cc;
}

.bar-value {
  font-size: 12px;
  color: #606266;
  min-width: 44px;
  text-align: right;
}

.rb-suggestion {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
}

.suggestion-increase {
  color: #67c23a;
}

.suggestion-decrease {
  color: #f56c6c;
}

.suggestion-balanced {
  color: #67c23a;
}

.rebalance-footer {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
}

.footer-sum {
  color: #67c23a;
  font-weight: 500;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 768px) {
  .allocation-content {
    flex-direction: column;
  }

  .chart-section {
    flex: none;
    width: 100%;
  }

  .donut-chart {
    width: 260px;
    height: 260px;
  }

  .rebalance-cards {
    grid-template-columns: 1fr;
  }
}
</style>
