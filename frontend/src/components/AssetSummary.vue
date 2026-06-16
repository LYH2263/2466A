<template>
  <div class="asset-summary">
    <el-row :gutter="20">
      <el-col
        v-for="category in displayCategories"
        :key="category.id"
        :xs="24"
        :sm="12"
        :md="Math.max(6, Math.floor(24 / Math.min(displayCategories.length + 1, 5)))"
      >
        <el-card
          class="summary-card"
          shadow="hover"
          :class="`category-card-${category.id}`"
        >
          <div class="card-content">
            <div class="card-icon" :style="{ color: category.color }">
              <Wallet v-if="category.name === '活钱'" />
              <TrendCharts v-else-if="category.name === '长期投资'" />
              <Money v-else-if="category.name === '稳定债券'" />
              <Coin v-else />
            </div>
            <div class="card-info">
              <div class="label">
                <span class="color-dot" :style="{ backgroundColor: category.color }" />
                {{ category.name }}
              </div>
              <div class="value" v-if="latestRecord">
                {{ formatMoney(getCategoryAmount(latestRecord, category.id)) }}
              </div>
              <div class="value empty" v-else>--</div>
              <div class="percent" v-if="latestRecord && latestRecord.total > 0">
                {{ ((getCategoryAmount(latestRecord, category.id) / latestRecord.total) * 100).toFixed(1) }}%
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col
        :xs="24"
        :sm="12"
        :md="Math.max(6, Math.floor(24 / Math.min(displayCategories.length + 1, 5)))"
      >
        <el-card class="summary-card total-card" shadow="hover">
          <div class="card-content">
            <div class="card-icon"><Coin /></div>
            <div class="card-info">
              <div class="label">总资产</div>
              <div class="value total" v-if="latestRecord">{{ formatMoney(latestRecord.total) }}</div>
              <div class="value empty" v-else>--</div>
              <div class="date" v-if="latestRecord">{{ latestRecord.date }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Wallet, TrendCharts, Money, Coin } from '@element-plus/icons-vue'
import type { AssetRecord, Category } from '../types'

interface Props {
  latestRecord: AssetRecord | null
  categories: Category[]
}

const props = defineProps<Props>()

const displayCategories = computed(() =>
  props.categories.filter(c => c.isActive)
)

const getCategoryAmount = (record: AssetRecord, categoryId: string): number => {
  return record.categoryAmounts?.[categoryId] ?? 0
}

const formatMoney = (value: number): string => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  }).format(value)
}
</script>

<style scoped>
.asset-summary {
  margin-bottom: 20px;
}

.summary-card {
  margin-bottom: 20px;
}

.card-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.card-icon {
  font-size: 32px;
  color: #409eff;
  display: flex;
  align-items: center;
}

.total-card .card-icon {
  color: #f56c6c;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.value {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value.total {
  font-size: 24px;
  color: #f56c6c;
}

.value.empty {
  color: #c0c4cc;
}

.percent {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.date {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
