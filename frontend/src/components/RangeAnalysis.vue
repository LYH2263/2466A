<template>
  <el-card class="range-analysis" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="header-title">
          <el-icon class="header-icon"><DataLine /></el-icon>
          区间分析
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
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="6">
          <div class="metric-card">
            <div class="metric-label">区间净增长</div>
            <div class="metric-value" :class="getValueClass(analysisData.netGrowth)">
              {{ formatSignedMoney(analysisData.netGrowth) }}
            </div>
            <div class="metric-sub" v-if="analysisData.netGrowthPercent !== null" :class="getValueClass(analysisData.netGrowthPercent)">
              {{ formatSignedPercent(analysisData.netGrowthPercent) }}
            </div>
            <div v-else class="metric-sub na">--%</div>
            <div class="metric-desc">
              <span>{{ analysisData.startDate }}</span>
              <span class="arrow">→</span>
              <span>{{ analysisData.endDate }}</span>
            </div>
            <div class="metric-compare">
              <span>期初: {{ formatMoney(analysisData.startTotal) }}</span>
              <span>期末: {{ formatMoney(analysisData.endTotal) }}</span>
            </div>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <div class="metric-card">
            <div class="metric-label">最大回撤</div>
            <template v-if="analysisData.maxDrawdown.hasData">
              <div class="metric-value down">
                {{ formatMoney(analysisData.maxDrawdown.value) }}
              </div>
              <div class="metric-sub down" v-if="analysisData.maxDrawdown.percent !== null">
                -{{ analysisData.maxDrawdown.percent.toFixed(2) }}%
              </div>
              <div class="metric-sub na" v-else>--%</div>
              <div class="metric-desc">
                <el-tooltip :content="analysisData.maxDrawdown.peakDate" placement="top">
                  <span class="peak">峰值 <el-icon><WarningFilled /></el-icon></span>
                </el-tooltip>
                <span class="arrow">→</span>
                <el-tooltip :content="analysisData.maxDrawdown.troughDate" placement="top">
                  <span class="trough"><el-icon><WarningFilled /></el-icon> 谷值</span>
                </el-tooltip>
              </div>
            </template>
            <template v-else>
              <div class="metric-value na">--</div>
              <div class="metric-sub na">数据不足</div>
            </template>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <div class="metric-card">
            <div class="metric-label">平均月度增速</div>
            <template v-if="analysisData.avgMonthlyGrowthRate !== null">
              <div class="metric-value" :class="getValueClass(analysisData.avgMonthlyGrowthRate)">
                {{ formatSignedPercent(analysisData.avgMonthlyGrowthRate) }}
              </div>
              <div class="metric-sub">
                共 {{ analysisData.monthlyCount }} 个月
              </div>
            </template>
            <template v-else>
              <div class="metric-value na">--</div>
              <div class="metric-sub na">
                <span v-if="analysisData.monthlyCount === 0">区间不足一个月</span>
                <span v-else>期初金额为0无法计算</span>
              </div>
            </template>
          </div>
        </el-col>

        <el-col :xs="24" :sm="12" :md="6">
          <div class="metric-card info">
            <div class="metric-label">数据状态</div>
            <div class="metric-value small" :class="analysisData.hasSufficientData ? 'sufficient' : 'insufficient'">
              {{ analysisData.hasSufficientData ? '✔ 数据充分' : '⚠ 数据有限' }}
            </div>
            <div class="metric-sub">
              {{ analysisData.hasSufficientData ? '区间内至少2条记录' : '结果可能存在偏差' }}
            </div>
          </div>
        </el-col>
      </el-row>

      <el-divider />

      <div class="section">
        <div class="section-title">
          <el-icon><PieChart /></el-icon>
          类别贡献分析
        </div>
        <el-table :data="contributionTableData" stripe style="width: 100%">
          <el-table-column prop="name" label="类别" min-width="120">
            <template #default="{ row }">
              <span class="category-cell">
                <span class="color-dot" :style="{ backgroundColor: row.color }"></span>
                {{ row.name }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="startAmount" label="期初金额" min-width="140" align="right">
            <template #default="{ row }">{{ formatMoney(row.startAmount) }}</template>
          </el-table-column>
          <el-table-column prop="endAmount" label="期末金额" min-width="140" align="right">
            <template #default="{ row }">{{ formatMoney(row.endAmount) }}</template>
          </el-table-column>
          <el-table-column prop="diff" label="增减" min-width="140" align="right">
            <template #default="{ row }">
              <span :class="getValueClass(row.diff)">
                {{ formatSignedMoney(row.diff) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="contributionPercent" label="净增长贡献" min-width="160" align="center">
            <template #default="{ row }">
              <template v-if="row.contributionPercent !== null">
                <el-progress
                  :percentage="Math.min(Math.abs(row.contributionPercent), 100)"
                  :status="row.contributionPercent >= 0 ? 'success' : 'exception'"
                  :format="() => formatSignedPercent(row.contributionPercent)"
                  :stroke-width="8"
                />
              </template>
              <span v-else class="na">--</span>
            </template>
          </el-table-column>
          <el-table-column label="占比变化" min-width="160" align="center">
            <template #default="{ row }">
              <div class="pct-change">
                <span>{{ row.percentageStart }}%</span>
                <el-icon :size="12"><Right /></el-icon>
                <span>{{ row.percentageEnd }}%</span>
                <span :class="'diff-tag ' + getValueClass(row.percentageDiff)">
                  {{ formatSignedPercent(row.percentageDiff) }}
                </span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <el-empty v-else-if="!loading" description="选择日期范围后点击分析按钮" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { DataLine, Search, WarningFilled, PieChart, Right } from '@element-plus/icons-vue'
import type { Category, RangeAnalysis as RangeAnalysisType } from '../types'
import { ElMessage } from 'element-plus'

interface Props {
  categories: Category[]
  fetchRangeAnalysis: (startDate: string, endDate: string) => Promise<RangeAnalysisType | null>
}

const props = defineProps<Props>()

const loading = ref(false)
const analysisData = ref<RangeAnalysisType | null>(null)
const dateRange = ref<string[]>([])

const dateShortcuts = [
  {
    text: '近7天',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      return [start, end] as const
    }
  },
  {
    text: '近30天',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      return [start, end] as const
    }
  },
  {
    text: '近3个月',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 3)
      return [start, end] as const
    }
  },
  {
    text: '近6个月',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 6)
      return [start, end] as const
    }
  },
  {
    text: '近1年',
    value: () => {
      const end = new Date()
      const start = new Date()
      start.setFullYear(start.getFullYear() - 1)
      return [start, end] as const
    }
  },
  {
    text: '今年以来',
    value: () => {
      const end = new Date()
      const start = new Date(end.getFullYear(), 0, 1)
      return [start, end] as const
    }
  }
]

const categoryMap = computed(() => {
  const map = new Map<string, Category>()
  props.categories.forEach(c => map.set(c.id, c))
  return map
})

const contributionTableData = computed(() => {
  if (!analysisData.value) return []
  return analysisData.value.categoryContributions.map(cc => {
    const cat = categoryMap.value.get(cc.categoryId)
    return {
      name: cat?.name || '未知类别',
      color: cat?.color || '#909399',
      startAmount: cc.startAmount,
      endAmount: cc.endAmount,
      diff: cc.diff,
      contributionPercent: cc.contributionPercent,
      percentageStart: cc.percentageChange.start.toFixed(1),
      percentageEnd: cc.percentageChange.end.toFixed(1),
      percentageDiff: cc.percentageChange.diff
    }
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
})

const formatMoney = (value: number): string => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  }).format(value)
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

const fetchAnalysis = async () => {
  if (!dateRange.value || dateRange.value.length < 2) {
    ElMessage.warning('请选择开始和结束日期')
    return
  }
  const [start, end] = dateRange.value
  loading.value = true
  try {
    const result = await props.fetchRangeAnalysis(start, end)
    if (result) {
      analysisData.value = result
      ElMessage.success('分析完成')
    } else {
      ElMessage.error('分析失败，请稍后重试')
    }
  } finally {
    loading.value = false
  }
}

const handleDateChange = () => {
  // User can click Analyze button
}

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
  fetchAnalysis()
})
</script>

<style scoped>
.range-analysis {
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

.metric-card.info {
  background: linear-gradient(135deg, #ecf5ff 0%, #d9ecff 100%);
  border-color: #d9ecff;
}

.metric-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 10px;
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

.metric-value.sufficient {
  color: #67c23a;
}

.metric-value.insufficient {
  color: #e6a23c;
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
  margin-bottom: 8px;
}

.metric-sub.up {
  color: #67c23a;
}

.metric-sub.down {
  color: #f56c6c;
}

.metric-sub.na {
  color: #909399;
}

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

.metric-desc .peak,
.metric-desc .trough {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.metric-compare {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
  flex-wrap: wrap;
  gap: 8px;
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

.pct-change {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
  justify-content: center;
}

.diff-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.diff-tag.up {
  background: #f0f9eb;
  color: #67c23a;
}

.diff-tag.down {
  background: #fef0f0;
  color: #f56c6c;
}

.diff-tag.flat {
  background: #f4f4f5;
  color: #909399;
}

.up {
  color: #67c23a;
}

.down {
  color: #f56c6c;
}

.flat {
  color: #909399;
}

.na {
  color: #c0c4cc;
}

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
}
</style>
