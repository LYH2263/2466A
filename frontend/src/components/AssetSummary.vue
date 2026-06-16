<template>
  <div class="asset-summary">
    <el-row :gutter="20">
      <el-col
        v-for="category in displayCategories"
        :key="category.id"
        :xs="24"
        :sm="12"
        :md="Math.max(6, Math.floor(24 / Math.min(displayCategories.length + 3, 7)))"
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
                {{ formatMoney(getCategoryAmount(category.id)) }}
              </div>
              <div class="value empty" v-else>--</div>
              <div class="percent" v-if="latestRecord && latestRecord.total > 0">
                {{ ((getCategoryAmount(category.id) / latestRecord.total) * 100).toFixed(1) }}%
              </div>
              <div class="trend-row" v-if="trendData">
                <div class="trend-item" :class="getTrendClass(getCategoryTrend(category.id)?.mom)">
                  <span class="trend-label">环比</span>
                  <template v-if="getCategoryTrend(category.id)?.mom?.hasBase">
                    <el-icon v-if="getCategoryTrend(category.id)!.mom!.diff !== 0" class="trend-arrow">
                      <Top v-if="getCategoryTrend(category.id)!.mom!.diff > 0" />
                      <Bottom v-else />
                    </el-icon>
                    <span class="trend-amount">{{ formatSignedMoney(getCategoryTrend(category.id)!.mom!.diff) }}</span>
                    <span class="trend-percent" v-if="getCategoryTrend(category.id)!.mom!.percent !== null">
                      {{ formatSignedPercent(getCategoryTrend(category.id)!.mom!.percent) }}
                    </span>
                    <span class="trend-percent na" v-else>--%</span>
                  </template>
                  <span class="trend-na" v-else>暂无对比</span>
                </div>
                <div class="trend-item" :class="getTrendClass(getCategoryTrend(category.id)?.yoy)">
                  <span class="trend-label">同比</span>
                  <template v-if="getCategoryTrend(category.id)?.yoy?.hasBase">
                    <el-icon v-if="getCategoryTrend(category.id)!.yoy!.diff !== 0" class="trend-arrow">
                      <Top v-if="getCategoryTrend(category.id)!.yoy!.diff > 0" />
                      <Bottom v-else />
                    </el-icon>
                    <span class="trend-amount">{{ formatSignedMoney(getCategoryTrend(category.id)!.yoy!.diff) }}</span>
                    <span class="trend-percent" v-if="getCategoryTrend(category.id)!.yoy!.percent !== null">
                      {{ formatSignedPercent(getCategoryTrend(category.id)!.yoy!.percent) }}
                    </span>
                    <span class="trend-percent na" v-else>--%</span>
                  </template>
                  <span class="trend-na" v-else>暂无对比</span>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col
        :xs="24"
        :sm="12"
        :md="Math.max(6, Math.floor(24 / Math.min(displayCategories.length + 3, 7)))"
      >
        <el-card class="summary-card total-card" shadow="hover">
          <div class="card-content">
            <div class="card-icon"><Coin /></div>
            <div class="card-info">
              <div class="label">总资产</div>
              <div class="value total" v-if="latestRecord">{{ formatMoney(latestRecord.total) }}</div>
              <div class="value empty" v-else>--</div>
              <div class="date" v-if="latestRecord">{{ latestRecord.date }}</div>
              <div class="trend-row" v-if="trendData">
                <div class="trend-item" :class="getTrendClass(trendData.total.mom)">
                  <span class="trend-label">环比</span>
                  <template v-if="trendData.total.mom.hasBase">
                    <el-icon v-if="trendData.total.mom.diff !== 0" class="trend-arrow">
                      <Top v-if="trendData.total.mom.diff > 0" />
                      <Bottom v-else />
                    </el-icon>
                    <span class="trend-amount">{{ formatSignedMoney(trendData.total.mom.diff) }}</span>
                    <span class="trend-percent" v-if="trendData.total.mom.percent !== null">
                      {{ formatSignedPercent(trendData.total.mom.percent) }}
                    </span>
                    <span class="trend-percent na" v-else>--%</span>
                  </template>
                  <span class="trend-na" v-else>暂无对比</span>
                </div>
                <div class="trend-item" :class="getTrendClass(trendData.total.yoy)">
                  <span class="trend-label">同比</span>
                  <template v-if="trendData.total.yoy.hasBase">
                    <el-icon v-if="trendData.total.yoy.diff !== 0" class="trend-arrow">
                      <Top v-if="trendData.total.yoy.diff > 0" />
                      <Bottom v-else />
                    </el-icon>
                    <span class="trend-amount">{{ formatSignedMoney(trendData.total.yoy.diff) }}</span>
                    <span class="trend-percent" v-if="trendData.total.yoy.percent !== null">
                      {{ formatSignedPercent(trendData.total.yoy.percent) }}
                    </span>
                    <span class="trend-percent na" v-else>--%</span>
                  </template>
                  <span class="trend-na" v-else>暂无对比</span>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col
        :xs="24"
        :sm="12"
        :md="Math.max(6, Math.floor(24 / Math.min(displayCategories.length + 3, 7)))"
      >
        <el-card class="summary-card liability-card" shadow="hover">
          <div class="card-content">
            <div class="card-icon"><CreditCard /></div>
            <div class="card-info">
              <div class="label">
                <span class="color-dot" style="background-color: #f56c6c" />
                总负债
              </div>
              <div class="value liability" v-if="trendData">{{ formatMoney(trendData.totalLiability.amount) }}</div>
              <div class="value empty" v-else>--</div>
              <div class="date" v-if="trendData?.latestDate">{{ trendData.latestDate }}</div>
              <div class="trend-row" v-if="trendData">
                <div class="trend-item" :class="getLiabilityTrendClass(trendData.totalLiability.mom)">
                  <span class="trend-label">环比</span>
                  <template v-if="trendData.totalLiability.mom.hasBase">
                    <el-icon v-if="trendData.totalLiability.mom.diff !== 0" class="trend-arrow">
                      <Top v-if="trendData.totalLiability.mom.diff > 0" />
                      <Bottom v-else />
                    </el-icon>
                    <span class="trend-amount">{{ formatSignedMoney(trendData.totalLiability.mom.diff) }}</span>
                    <span class="trend-percent" v-if="trendData.totalLiability.mom.percent !== null">
                      {{ formatSignedPercent(trendData.totalLiability.mom.percent) }}
                    </span>
                    <span class="trend-percent na" v-else>--%</span>
                  </template>
                  <span class="trend-na" v-else>暂无对比</span>
                </div>
                <div class="trend-item" :class="getLiabilityTrendClass(trendData.totalLiability.yoy)">
                  <span class="trend-label">同比</span>
                  <template v-if="trendData.totalLiability.yoy.hasBase">
                    <el-icon v-if="trendData.totalLiability.yoy.diff !== 0" class="trend-arrow">
                      <Top v-if="trendData.totalLiability.yoy.diff > 0" />
                      <Bottom v-else />
                    </el-icon>
                    <span class="trend-amount">{{ formatSignedMoney(trendData.totalLiability.yoy.diff) }}</span>
                    <span class="trend-percent" v-if="trendData.totalLiability.yoy.percent !== null">
                      {{ formatSignedPercent(trendData.totalLiability.yoy.percent) }}
                    </span>
                    <span class="trend-percent na" v-else>--%</span>
                  </template>
                  <span class="trend-na" v-else>暂无对比</span>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col
        :xs="24"
        :sm="12"
        :md="Math.max(6, Math.floor(24 / Math.min(displayCategories.length + 3, 7)))"
      >
        <el-card
          class="summary-card networth-card"
          shadow="hover"
          :class="{ 'networth-negative': trendData?.netWorth?.amount < 0 }"
        >
          <div class="card-content">
            <div class="card-icon">
              <el-icon :class="{ 'icon-negative': trendData?.netWorth?.amount < 0 }">
                <TrendCharts v-if="!trendData?.netWorth || trendData.netWorth.amount >= 0" />
                <Warning v-else />
              </el-icon>
            </div>
            <div class="card-info">
              <div class="label">
                <span class="color-dot" :style="{ backgroundColor: getNetWorthColor() }" />
                净资产
              </div>
              <div
                class="value networth"
                :class="{ 'value-negative': trendData?.netWorth?.amount < 0 }"
                v-if="trendData"
              >
                {{ formatMoney(trendData.netWorth.amount) }}
                <el-tag
                  v-if="trendData.netWorth.amount < 0"
                  type="danger"
                  size="small"
                  effect="dark"
                  class="negative-tag"
                >
                  资不抵债
                </el-tag>
              </div>
              <div class="value empty" v-else>--</div>
              <div class="date" v-if="trendData?.latestDate">{{ trendData.latestDate }}</div>
              <div class="trend-row" v-if="trendData">
                <div class="trend-item" :class="getTrendClass(trendData.netWorth.mom)">
                  <span class="trend-label">环比</span>
                  <template v-if="trendData.netWorth.mom.hasBase">
                    <el-icon v-if="trendData.netWorth.mom.diff !== 0" class="trend-arrow">
                      <Top v-if="trendData.netWorth.mom.diff > 0" />
                      <Bottom v-else />
                    </el-icon>
                    <span class="trend-amount">{{ formatSignedMoney(trendData.netWorth.mom.diff) }}</span>
                    <span class="trend-percent" v-if="trendData.netWorth.mom.percent !== null">
                      {{ formatSignedPercent(trendData.netWorth.mom.percent) }}
                    </span>
                    <span class="trend-percent na" v-else>--%</span>
                  </template>
                  <span class="trend-na" v-else>暂无对比</span>
                </div>
                <div class="trend-item" :class="getTrendClass(trendData.netWorth.yoy)">
                  <span class="trend-label">同比</span>
                  <template v-if="trendData.netWorth.yoy.hasBase">
                    <el-icon v-if="trendData.netWorth.yoy.diff !== 0" class="trend-arrow">
                      <Top v-if="trendData.netWorth.yoy.diff > 0" />
                      <Bottom v-else />
                    </el-icon>
                    <span class="trend-amount">{{ formatSignedMoney(trendData.netWorth.yoy.diff) }}</span>
                    <span class="trend-percent" v-if="trendData.netWorth.yoy.percent !== null">
                      {{ formatSignedPercent(trendData.netWorth.yoy.percent) }}
                    </span>
                    <span class="trend-percent na" v-else>--%</span>
                  </template>
                  <span class="trend-na" v-else>暂无对比</span>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Wallet, TrendCharts, Money, Coin, Top, Bottom, CreditCard, Warning } from '@element-plus/icons-vue'
import type { AssetRecord, Category, AssetTrend, TrendCompare } from '../types'

interface Props {
  latestRecord: AssetRecord | null
  categories: Category[]
  trendData: AssetTrend | null
}

const props = defineProps<Props>()

const displayCategories = computed(() =>
  props.categories.filter(c => c.isActive)
)

const categoryTrendMap = computed(() => {
  if (!props.trendData) return new Map()
  const map = new Map()
  for (const ct of props.trendData.categories) {
    map.set(ct.categoryId, ct)
  }
  return map
})

const getCategoryTrend = (categoryId: string) => {
  return categoryTrendMap.value.get(categoryId)
}

const getCategoryAmount = (categoryId: string): number => {
  if (props.trendData) {
    const ct = getCategoryTrend(categoryId)
    if (ct) return ct.amount
  }
  return props.latestRecord?.categoryAmounts?.[categoryId] ?? 0
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
  return sign + formatMoney(value)
}

const formatSignedPercent = (value: number): string => {
  const sign = value > 0 ? '+' : ''
  return sign + value.toFixed(2) + '%'
}

const getTrendClass = (compare?: TrendCompare) => {
  if (!compare || !compare.hasBase) return 'trend-neutral'
  if (compare.diff > 0) return 'trend-up'
  if (compare.diff < 0) return 'trend-down'
  return 'trend-flat'
}

const getLiabilityTrendClass = (compare?: TrendCompare) => {
  if (!compare || !compare.hasBase) return 'trend-neutral'
  if (compare.diff < 0) return 'trend-up'
  if (compare.diff > 0) return 'trend-down'
  return 'trend-flat'
}

const getNetWorthColor = (): string => {
  if (!props.trendData) return '#409eff'
  return props.trendData.netWorth.amount >= 0 ? '#67c23a' : '#f56c6c'
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
  align-items: flex-start;
  gap: 16px;
}

.card-icon {
  font-size: 32px;
  color: #409eff;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding-top: 4px;
}

.total-card .card-icon {
  color: #f56c6c;
}

.liability-card .card-icon {
  color: #f56c6c;
}

.networth-card .card-icon {
  color: #67c23a;
}

.networth-card.networth-negative .card-icon {
  color: #f56c6c;
}

.icon-negative {
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.value.total {
  font-size: 24px;
  color: #f56c6c;
}

.value.liability {
  font-size: 24px;
  color: #f56c6c;
}

.value.networth {
  font-size: 24px;
  color: #67c23a;
}

.value.networth.value-negative {
  color: #f56c6c;
}

.value.empty {
  color: #c0c4cc;
}

.negative-tag {
  margin-left: 8px;
  animation: blink 2s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
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

.trend-row {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px dashed #ebeef5;
}

.trend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  flex-wrap: wrap;
}

.trend-label {
  color: #909399;
  flex-shrink: 0;
  min-width: 28px;
}

.trend-arrow {
  font-size: 12px;
}

.trend-up {
  color: #67c23a;
}

.trend-down {
  color: #f56c6c;
}

.trend-flat {
  color: #909399;
}

.trend-neutral {
  color: #c0c4cc;
}

.trend-amount {
  font-weight: 500;
}

.trend-percent {
  font-weight: 500;
}

.trend-percent.na {
  color: #c0c4cc;
  font-weight: 400;
}

.trend-na {
  color: #c0c4cc;
}
</style>
