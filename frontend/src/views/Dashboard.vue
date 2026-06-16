<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-content">
        <div class="logo">
          <WalletFilled style="font-size: 32px; color: #409eff;" />
          <div class="title">
            <h1>资产统计</h1>
            <p>个人资产管理工具</p>
          </div>
        </div>
        
        <div class="header-actions">
          <div v-if="user" class="user-info">
            <span>{{ user.email }}</span>
            <el-button
              type="danger"
              size="small"
              :icon="SwitchButton"
              @click="handleLogout"
            >
              退出
            </el-button>
          </div>
          <el-button
            size="small"
            :icon="Setting"
            @click="showCategoryManager = !showCategoryManager"
            :type="showCategoryManager ? 'primary' : 'default'"
          >
            类别管理
          </el-button>
          <el-button
            size="small"
            :icon="CollectionTag"
            @click="showTagManager = !showTagManager"
            :type="showTagManager ? 'primary' : 'default'"
          >
            标签管理
          </el-button>
          <el-button
            size="small"
            :icon="DataAnalysis"
            @click="showTagStats = !showTagStats"
            :type="showTagStats ? 'primary' : 'default'"
          >
            标签统计
          </el-button>
          <el-button
            size="small"
            :icon="Aim"
            @click="showGoalManager = !showGoalManager"
            :type="showGoalManager ? 'primary' : 'default'"
          >
            目标管理
          </el-button>
          <el-button
            size="small"
            :icon="CreditCard"
            @click="showLiabilityManager = !showLiabilityManager"
            :type="showLiabilityManager ? 'primary' : 'default'"
          >
            负债管理
          </el-button>
          <el-button
            v-if="!hasRecords"
            type="primary"
            :icon="DataLine"
            @click="handleFillDemo"
          >
            填充示例数据
          </el-button>
          <el-button
            v-else
            type="danger"
            :icon="DeleteFilled"
            @click="handleClearAll"
          >
            清空数据
          </el-button>
        </div>
      </div>
    </header>

    <main class="main-content">
      <div v-if="loading || liabilityLoading" class="loading-state">
        <el-skeleton :rows="10" animated />
      </div>
      
      <div v-else-if="error || liabilityError" class="error-state">
        <el-alert
          :title="error || liabilityError"
          type="error"
          :closable="false"
          show-icon
        >
          <template #default>
            <el-button @click="fetchRecords" style="margin-top: 16px">重试</el-button>
          </template>
        </el-alert>
      </div>
      
      <template v-else>
        <transition name="slide">
          <CategoryManager
            v-if="showCategoryManager"
            @categories-updated="handleCategoriesUpdated"
          />
        </transition>

        <transition name="slide">
          <TagManager
            v-if="showTagManager"
            @tags-updated="handleTagsUpdated"
          />
        </transition>

        <transition name="slide">
          <TagStats
            v-if="showTagStats"
            ref="tagStatsRef"
          />
        </transition>

        <transition name="slide">
          <GoalManager
            v-if="showGoalManager"
            :goals="goals"
            :active-categories="activeCategories"
            :add-goal="addGoal"
            :update-goal="updateGoal"
            :delete-goal="deleteGoal"
          />
        </transition>

        <GoalProgress
          v-if="goals.length > 0"
          :goals="goals"
          :categories="categories"
        />

        <AssetSummary
          :latest-record="latestRecord"
          :categories="categories"
          :trend-data="trendData"
        />

        <RangeAnalysis
          :categories="categories"
          :fetch-range-analysis="fetchRangeAnalysis"
        />

        <AssetForm
          :mode="formMode"
          :editing-record="editingRecord"
          :active-categories="activeCategories"
          :create-empty-form-data="createEmptyFormData"
          :record-to-form-data="recordToFormData"
          @submit="handleFormSubmit"
          @fill-demo="handleFillDemo"
          @cancel="handleCancelEdit"
          @tags-updated="handleTagsUpdated"
        />

        <AssetChart
          :chart-data="chartData"
          :categories="categories"
          :net-worth-series="netWorthSeries"
          @fill-demo="handleFillDemo"
        />

        <AssetList
          :records="records"
          :categories="categories"
          :tags="tags"
          :filter-tag-id="filterTagId"
          @edit="handleStartEdit"
          @delete="handleDelete"
          @fill-demo="handleFillDemo"
          @filter-tag="handleTagFilter"
        />

        <transition name="slide">
          <div v-if="showLiabilityManager">
            <LiabilityForm
              :mode="liabilityFormMode"
              :editing-record="editingLiability"
              :create-empty-form-data="createEmptyLiabilityFormData"
              :record-to-form-data="liabilityRecordToFormData"
              :has-records="hasLiabilityRecords"
              @submit="handleLiabilityFormSubmit"
              @cancel="handleCancelLiabilityEdit"
              @fill-demo="handleFillLiabilityDemo"
            />

            <LiabilityList
              :records="liabilityRecords"
              :loading="liabilityLoading"
              @edit="handleStartLiabilityEdit"
              @delete="handleLiabilityDelete"
              @fill-demo="handleFillLiabilityDemo"
            />
          </div>
        </transition>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { WalletFilled, DataLine, DeleteFilled, SwitchButton, Setting, CollectionTag, DataAnalysis, Aim, CreditCard } from '@element-plus/icons-vue'
import { useAssets } from '../composables/useAssets'
import { useGoals } from '../composables/useGoals'
import { useLiabilities } from '../composables/useLiabilities'
import type { AssetFormData, AssetRecord, AssetTrend, LiabilityFormData, LiabilityRecord, NetWorthTimePoint } from '../types'
import axios from 'axios'
import AssetSummary from '../components/AssetSummary.vue'
import AssetForm from '../components/AssetForm.vue'
import AssetChart from '../components/AssetChart.vue'
import AssetList from '../components/AssetList.vue'
import CategoryManager from '../components/CategoryManager.vue'
import RangeAnalysis from '../components/RangeAnalysis.vue'
import TagManager from '../components/TagManager.vue'
import TagStats from '../components/TagStats.vue'
import GoalManager from '../components/GoalManager.vue'
import GoalProgress from '../components/GoalProgress.vue'
import LiabilityForm from '../components/LiabilityForm.vue'
import LiabilityList from '../components/LiabilityList.vue'

const router = useRouter()
const {
  records,
  categories,
  activeCategories,
  tags,
  filterTagId,
  latestRecord,
  chartData,
  hasRecords,
  loading,
  error,
  fetchRecords,
  addRecord,
  updateRecord,
  deleteRecord,
  fillDemoData,
  createEmptyFormData,
  recordToFormData,
  fetchTrendAnalysis,
  fetchRangeAnalysis
} = useAssets()

const {
  goals,
  fetchGoals,
  addGoal,
  updateGoal,
  deleteGoal
} = useGoals()

const {
  records: liabilityRecords,
  hasRecords: hasLiabilityRecords,
  loading: liabilityLoading,
  error: liabilityError,
  fetchRecords: fetchLiabilityRecords,
  fetchNetWorth,
  createEmptyFormData: createEmptyLiabilityFormData,
  recordToFormData: liabilityRecordToFormData,
  addRecord: addLiabilityRecord,
  updateRecord: updateLiabilityRecord,
  deleteRecord: deleteLiabilityRecord,
  fillDemoData: fillLiabilityDemoData
} = useLiabilities()

const user = ref<{ id: string; email: string } | null>(null)
const formMode = ref<'create' | 'edit'>('create')
const editingRecord = ref<AssetRecord | null>(null)
const liabilityFormMode = ref<'create' | 'edit'>('create')
const editingLiability = ref<LiabilityRecord | null>(null)
const showCategoryManager = ref(false)
const showTagManager = ref(false)
const showTagStats = ref(false)
const showGoalManager = ref(false)
const showLiabilityManager = ref(false)
const trendData = ref<AssetTrend | null>(null)
const netWorthSeries = ref<NetWorthTimePoint[]>([])
const tagStatsRef = ref<InstanceType<typeof TagStats> | null>(null)

const fetchUser = async () => {
  try {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
    const token = localStorage.getItem('accessToken')
    
    const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    user.value = response.data.user
  } catch (err) {
    // User not logged in, router guard will handle redirect
  }
}

const loadAllData = async () => {
  await Promise.all([
    fetchRecords(),
    fetchLiabilityRecords()
  ])
  trendData.value = await fetchTrendAnalysis()
  const netWorthData = await fetchNetWorth('month')
  netWorthSeries.value = netWorthData?.series || []
  await fetchGoals()
}

const handleCategoriesUpdated = async () => {
  await loadAllData()
}

const handleTagsUpdated = async () => {
  await loadAllData()
  if (showTagStats && tagStatsRef.value) {
    await tagStatsRef.value.loadStatistics()
  }
}

const handleTagFilter = async (tagId: string | null) => {
  await fetchRecords(tagId)
}

const handleFormSubmit = async (formData: AssetFormData) => {
  if (formMode.value === 'create') {
    const result = await addRecord(formData)
    if (result.success) {
      ElMessage.success('添加成功')
      trendData.value = await fetchTrendAnalysis()
      const netWorthData = await fetchNetWorth('month')
      netWorthSeries.value = netWorthData?.series || []
      await fetchGoals()
    } else {
      ElMessage.error(result.error || '添加失败')
    }
  } else {
    if (!editingRecord.value) return
    const result = await updateRecord(editingRecord.value.id, formData)
    if (result.success) {
      ElMessage.success('编辑成功')
      formMode.value = 'create'
      editingRecord.value = null
      trendData.value = await fetchTrendAnalysis()
      const netWorthData = await fetchNetWorth('month')
      netWorthSeries.value = netWorthData?.series || []
      await fetchGoals()
    } else {
      if (result.conflict) {
        ElNotification({
          title: '编辑冲突',
          message: result.error || '该记录可能已被删除，请刷新列表后重试。',
          type: 'error',
          duration: 5000
        })
        await loadAllData()
        formMode.value = 'create'
        editingRecord.value = null
      } else {
        ElMessage.error(result.error || '编辑失败')
      }
    }
  }
}

const handleStartEdit = (record: AssetRecord) => {
  editingRecord.value = record
  formMode.value = 'edit'
  showCategoryManager.value = false
  showTagManager.value = false
  showTagStats.value = false
  showGoalManager.value = false
  showLiabilityManager.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const handleCancelEdit = () => {
  formMode.value = 'create'
  editingRecord.value = null
}

const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除这条记录吗？',
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await deleteRecord(id)
    if (editingRecord.value?.id === id) {
      formMode.value = 'create'
      editingRecord.value = null
    }
    trendData.value = await fetchTrendAnalysis()
    const netWorthData = await fetchNetWorth('month')
    netWorthSeries.value = netWorthData?.series || []
    await fetchGoals()
    ElMessage.success('删除成功')
  } catch (err) {
    // Cancelled
  }
}

const handleFillDemo = async () => {
  try {
    await fillDemoData()
    trendData.value = await fetchTrendAnalysis()
    const netWorthData = await fetchNetWorth('month')
    netWorthSeries.value = netWorthData?.series || []
    if (tagStatsRef.value) {
      await tagStatsRef.value.loadStatistics()
    }
    ElMessage.success('示例数据已填充')
  } catch (err: any) {
    ElMessage.error(err.message || '填充失败')
  }
}

const handleFillLiabilityDemo = async () => {
  try {
    await fillLiabilityDemoData()
    trendData.value = await fetchTrendAnalysis()
    const netWorthData = await fetchNetWorth('month')
    netWorthSeries.value = netWorthData?.series || []
    ElMessage.success('负债示例数据已填充')
  } catch (err: any) {
    ElMessage.error(err.message || '填充失败')
  }
}

const handleLiabilityFormSubmit = async (formData: LiabilityFormData) => {
  if (liabilityFormMode.value === 'create') {
    const result = await addLiabilityRecord(formData)
    if (result.success) {
      ElMessage.success('添加成功')
      trendData.value = await fetchTrendAnalysis()
      const netWorthData = await fetchNetWorth('month')
      netWorthSeries.value = netWorthData?.series || []
    } else {
      ElMessage.error(result.error || '添加失败')
    }
  } else {
    if (!editingLiability.value) return
    const result = await updateLiabilityRecord(editingLiability.value.id, formData)
    if (result.success) {
      ElMessage.success('编辑成功')
      liabilityFormMode.value = 'create'
      editingLiability.value = null
      trendData.value = await fetchTrendAnalysis()
      const netWorthData = await fetchNetWorth('month')
      netWorthSeries.value = netWorthData?.series || []
    } else {
      ElMessage.error(result.error || '编辑失败')
    }
  }
}

const handleStartLiabilityEdit = (record: LiabilityRecord) => {
  editingLiability.value = record
  liabilityFormMode.value = 'edit'
  const el = document.querySelector('.liability-form-card')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const handleCancelLiabilityEdit = () => {
  liabilityFormMode.value = 'create'
  editingLiability.value = null
}

const handleLiabilityDelete = async (id: string) => {
  try {
    await deleteLiabilityRecord(id)
    if (editingLiability.value?.id === id) {
      liabilityFormMode.value = 'create'
      editingLiability.value = null
    }
    trendData.value = await fetchTrendAnalysis()
    const netWorthData = await fetchNetWorth('month')
    netWorthSeries.value = netWorthData?.series || []
    ElMessage.success('删除成功')
  } catch (err: any) {
    ElMessage.error(err.message || '删除失败')
  }
}

const handleClearAll = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有记录吗？此操作不可恢复。',
      '确认清空',
      {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'danger'
      }
    )
    
    for (const record of records.value) {
      await deleteRecord(record.id)
    }
    for (const record of liabilityRecords.value) {
      await deleteLiabilityRecord(record.id)
    }
    formMode.value = 'create'
    editingRecord.value = null
    liabilityFormMode.value = 'create'
    editingLiability.value = null
    trendData.value = await fetchTrendAnalysis()
    const netWorthData = await fetchNetWorth('month')
    netWorthSeries.value = netWorthData?.series || []
    if (tagStatsRef.value) {
      await tagStatsRef.value.loadStatistics()
    }
    ElMessage.success('数据已清空')
  } catch (err) {
    // Cancelled
  }
}

const handleLogout = async () => {
  try {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
    
    await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
      withCredentials: true
    })
    
    localStorage.removeItem('accessToken')
    ElMessage.success('已退出登录')
    router.push('/login')
  } catch (err) {
    localStorage.removeItem('accessToken')
    router.push('/login')
  }
}

onMounted(() => {
  fetchUser()
  loadAllData()
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: #f5f7fa;
  min-height: 100vh;
}

.app-container {
  min-height: 100vh;
}

.app-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 16px;
}

.title h1 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.title p {
  font-size: 14px;
  opacity: 0.9;
  margin: 4px 0 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  color: white;
}

.main-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px 20px;
}

.loading-state,
.error-state {
  padding: 40px 0;
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
  .header-content {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }

  .logo {
    flex-direction: column;
  }

  .header-actions {
    flex-direction: column;
    width: 100%;
  }

  .user-info {
    flex-direction: column;
  }

  .main-content {
    padding: 16px 12px;
  }
}
</style>
