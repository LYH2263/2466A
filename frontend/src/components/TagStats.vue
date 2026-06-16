<template>
  <div class="tag-stats">
    <el-card class="stats-card">
      <template #header>
        <div class="card-header">
          <span>标签维度统计</span>
          <el-button
            size="small"
            :icon="Refresh"
            @click="loadStatistics"
            :loading="loading"
          >
            刷新
          </el-button>
        </div>
      </template>

      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="!statistics" class="empty-state">
        <el-empty description="暂无统计数据" />
      </div>

      <div v-else>
        <div class="summary-row">
          <el-statistic title="总记录数" :value="statistics.totalRecords" />
          <el-statistic title="已打标签" :value="statistics.taggedRecords" />
          <el-statistic title="未打标签" :value="statistics.untaggedCount" />
          <el-statistic
            title="标签覆盖率"
            :value="coverageRate"
            suffix="%"
            :precision="1"
          />
        </div>

        <el-divider />

        <div v-if="statistics.tagStats.length === 0" class="empty-tags">
          <el-empty description="暂无标签数据" />
        </div>

        <div v-else class="stats-grid">
          <div
            v-for="stat in sortedStats"
            :key="stat.tagId"
            class="stat-card"
            :style="{ borderLeftColor: stat.tagColor }"
          >
            <div class="stat-header">
              <el-tag
                :style="{ backgroundColor: stat.tagColor, borderColor: stat.tagColor }"
                class="tag-name"
              >
                {{ stat.tagName }}
              </el-tag>
              <span class="record-count">{{ stat.recordCount }} 条记录</span>
            </div>
            
            <div class="stat-details">
              <div class="stat-item">
                <span class="stat-label">总资产合计</span>
                <span class="stat-value total">{{ formatMoney(stat.totalAssetSum) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">平均资产</span>
                <span class="stat-value">{{ formatMoney(stat.avgAsset) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">最新资产</span>
                <span class="stat-value latest">{{ formatMoney(stat.latestTotal) }}</span>
              </div>
              <div class="stat-item" v-if="stat.latestDate">
                <span class="stat-label">最新日期</span>
                <span class="stat-value">{{ stat.latestDate }}</span>
              </div>
            </div>

            <div class="asset-bar">
              <div
                class="asset-fill"
                :style="{
                  width: `${getPercentage(stat.totalAssetSum)}%`,
                  backgroundColor: stat.tagColor
                }"
              />
            </div>
            <div class="percentage-label">
              占比 {{ getPercentage(stat.totalAssetSum).toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { useTags } from '../composables/useTags'
import type { TagStatistics } from '../types'

const { fetchTagStatistics } = useTags()

const loading = ref(false)
const statistics = ref<TagStatistics | null>(null)

const loadStatistics = async () => {
  loading.value = true
  try {
    statistics.value = await fetchTagStatistics()
  } finally {
    loading.value = false
  }
}

const coverageRate = computed(() => {
  if (!statistics.value || statistics.value.totalRecords === 0) return 0
  return (statistics.value.taggedRecords / statistics.value.totalRecords) * 100
})

const sortedStats = computed(() => {
  if (!statistics.value) return []
  return [...statistics.value.tagStats].sort((a, b) => b.totalAssetSum - a.totalAssetSum)
})

const maxTotal = computed(() => {
  if (!statistics.value || statistics.value.tagStats.length === 0) return 0
  return Math.max(...statistics.value.tagStats.map(s => s.totalAssetSum))
})

const getPercentage = (value: number) => {
  if (maxTotal.value === 0) return 0
  return (value / maxTotal.value) * 100
}

const formatMoney = (value: number): string => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2
  }).format(value)
}

onMounted(() => {
  loadStatistics()
})

defineExpose({
  loadStatistics
})
</script>

<style scoped>
.tag-stats {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.summary-row :deep(.el-statistic__head) {
  font-size: 13px;
  color: #909399;
}

.summary-row :deep(.el-statistic__number) {
  font-size: 24px;
  font-weight: 600;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.stat-card {
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  border-left: 4px solid;
  background: #fafafa;
  transition: box-shadow 0.2s;
}

.stat-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.tag-name {
  color: white !important;
  font-weight: 500;
  border: 1px solid;
}

.record-count {
  color: #909399;
  font-size: 13px;
}

.stat-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  color: #606266;
  font-size: 13px;
}

.stat-value {
  font-family: 'Courier New', monospace;
  font-weight: 500;
  font-size: 14px;
}

.stat-value.total {
  color: #f56c6c;
  font-weight: 600;
}

.stat-value.latest {
  color: #67c23a;
}

.asset-bar {
  height: 8px;
  background: #ebeef5;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 4px;
}

.asset-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.percentage-label {
  text-align: right;
  font-size: 12px;
  color: #909399;
}

.loading-state,
.empty-state,
.empty-tags {
  padding: 40px 0;
}
</style>
