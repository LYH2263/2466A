<template>
  <div class="goal-progress-section">
    <div class="section-header">
      <span class="section-title">
        <el-icon><DataLine /></el-icon>
        目标进度
      </span>
      <el-tag v-if="expiredCount > 0" type="danger" size="small" effect="dark">
        {{ expiredCount }} 个目标已过期
      </el-tag>
    </div>

    <div v-if="goals.length === 0" class="empty-progress">
      <el-empty description="暂未设定目标" :image-size="60" />
    </div>

    <el-row v-else :gutter="16">
      <el-col
        v-for="goal in goals"
        :key="goal.id"
        :xs="24"
        :sm="12"
        :md="8"
      >
        <el-card
          class="progress-card"
          shadow="hover"
          :class="{
            'card-completed': goal.isCompleted,
            'card-expired': goal.isExpired && !goal.isCompleted,
            'card-exceeded': goal.isExceeded && !goal.isCompleted
          }"
        >
          <div class="card-top">
            <div class="card-top-left">
              <span class="goal-label">{{ goal.name }}</span>
              <el-tag size="small" :type="goal.scope === 'total' ? '' : 'warning'">
                {{ goal.scope === 'total' ? '总资产' : getCategoryName(goal.categoryId) }}
              </el-tag>
            </div>
            <div class="card-top-right">
              <el-tag
                v-if="goal.isCompleted"
                type="success"
                size="small"
                effect="dark"
                round
              >
                已完成
              </el-tag>
              <el-tag
                v-else-if="goal.isExpired"
                type="danger"
                size="small"
                effect="dark"
                round
              >
                <el-icon><WarningFilled /></el-icon>
                已过期
              </el-tag>
              <el-tag
                v-else-if="goal.isExceeded"
                type="success"
                size="small"
                effect="dark"
                round
              >
                已超额
              </el-tag>
            </div>
          </div>

          <div class="progress-amounts">
            <div class="current-amount">
              <span class="amount-label">当前</span>
              <span class="amount-value">{{ formatMoney(goal.currentValue) }}</span>
            </div>
            <div class="target-amount">
              <span class="amount-label">目标</span>
              <span class="amount-value">{{ formatMoney(goal.targetAmount) }}</span>
            </div>
          </div>

          <div class="progress-bar-wrapper">
            <el-progress
              :percentage="Math.min(goal.progressPercent, 100)"
              :stroke-width="12"
              :color="getProgressColor(goal)"
              :format="() => goal.progressPercent.toFixed(1) + '%'"
            />
          </div>

          <div class="progress-detail">
            <div v-if="goal.isExceeded" class="detail-item exceeded">
              <span class="detail-label">超额</span>
              <span class="detail-value positive">{{ formatMoney(goal.diff) }}</span>
            </div>
            <div v-else class="detail-item">
              <span class="detail-label">差额</span>
              <span class="detail-value">{{ formatMoney(goal.remaining) }}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">目标日期</span>
              <span class="detail-value">{{ goal.targetDate }}</span>
            </div>

            <div v-if="goal.growth.monthlyRate !== null" class="detail-item">
              <span class="detail-label">月增速</span>
              <span class="detail-value" :class="goal.growth.monthlyRate > 0 ? 'positive' : goal.growth.monthlyRate < 0 ? 'negative' : ''">
                {{ formatSignedMoney(goal.growth.monthlyRate) }}/月
              </span>
            </div>

            <div v-if="goal.prediction.canPredict && goal.prediction.estimatedDate" class="detail-item prediction">
              <span class="detail-label">预计达成</span>
              <span class="detail-value">{{ goal.prediction.estimatedDate }}</span>
              <span v-if="goal.prediction.daysRemaining !== null" class="days-remaining">
                (约{{ goal.prediction.daysRemaining }}天)
              </span>
            </div>

            <div v-if="!goal.prediction.canPredict && !goal.isExceeded && !goal.isCompleted" class="detail-item">
              <span class="detail-label">预测</span>
              <span class="detail-value no-predict">{{ goal.growth.reason || goal.prediction.reason || '无法预测' }}</span>
            </div>
          </div>

          <div v-if="goal.isExpired && !goal.isCompleted" class="expired-warning">
            <el-icon><WarningFilled /></el-icon>
            <span>目标已过期未达成</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DataLine, WarningFilled } from '@element-plus/icons-vue'
import type { GoalProgress, Category } from '../types'

interface Props {
  goals: GoalProgress[]
  categories: Category[]
}

const props = defineProps<Props>()

const expiredCount = computed(() =>
  props.goals.filter(g => g.isExpired && !g.isCompleted).length
)

const getCategoryName = (categoryId: string | null): string => {
  if (!categoryId) return '类别'
  const cat = props.categories.find(c => c.id === categoryId)
  return cat ? cat.name : '未知类别'
}

const formatMoney = (value: number): string => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  }).format(value)
}

const formatSignedMoney = (value: number): string => {
  const sign = value > 0 ? '+' : ''
  const formatted = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(value))
  return sign + (value < 0 ? '-' : '') + formatted
}

const getProgressColor = (goal: GoalProgress): string => {
  if (goal.isCompleted || goal.isExceeded) return '#67c23a'
  if (goal.isExpired) return '#f56c6c'
  if (goal.progressPercent >= 75) return '#e6a23c'
  if (goal.progressPercent >= 50) return '#409eff'
  return '#909399'
}
</script>

<style scoped>
.goal-progress-section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.empty-progress {
  padding: 20px 0;
}

.progress-card {
  margin-bottom: 16px;
  transition: all 0.2s;
}

.progress-card.card-completed {
  border-color: #e1f3d8;
}

.progress-card.card-expired {
  border-color: #fde2e2;
}

.progress-card.card-exceeded {
  border-color: #e1f3d8;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.card-top-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.goal-label {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}

.progress-amounts {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.current-amount,
.target-amount {
  display: flex;
  flex-direction: column;
}

.target-amount {
  text-align: right;
}

.amount-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
}

.amount-value {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.target-amount .amount-value {
  color: #409eff;
}

.progress-bar-wrapper {
  margin-bottom: 12px;
}

.progress-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px dashed #ebeef5;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.detail-item.exceeded .detail-value {
  color: #67c23a;
  font-weight: 600;
}

.detail-label {
  color: #909399;
  min-width: 60px;
  flex-shrink: 0;
}

.detail-value {
  color: #303133;
  font-weight: 500;
}

.detail-value.positive {
  color: #67c23a;
}

.detail-value.negative {
  color: #f56c6c;
}

.detail-value.no-predict {
  color: #c0c4cc;
  font-style: italic;
  font-weight: 400;
}

.days-remaining {
  font-size: 12px;
  color: #909399;
}

.detail-item.prediction .detail-value {
  color: #e6a23c;
  font-weight: 500;
}

.expired-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 12px;
  background: #fef0f0;
  border-radius: 6px;
  color: #f56c6c;
  font-size: 13px;
  font-weight: 500;
}
</style>
