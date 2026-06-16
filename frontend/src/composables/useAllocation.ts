import { ref, computed } from 'vue'
import axios from 'axios'
import type { TargetAllocation, AllocationFormData, RebalanceResponse, AllocationItem } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {}, {
          withCredentials: true
        })

        const { accessToken } = response.data
        localStorage.setItem('accessToken', accessToken)

        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        localStorage.removeItem('accessToken')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export function useAllocation() {
  const targetAllocation = ref<TargetAllocation | null>(null)
  const rebalanceData = ref<RebalanceResponse | null>(null)
  const loading = ref(false)
  const error = ref('')

  const hasTarget = computed(() => !!targetAllocation.value)

  const fetchTargetAllocation = async () => {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get('/api/allocations')
      targetAllocation.value = response.data.allocation
    } catch (err: any) {
      error.value = err.response?.data?.error || '获取目标配置失败'
    } finally {
      loading.value = false
    }
  }

  const fetchRebalance = async () => {
    try {
      const response = await api.get('/api/allocations/rebalance')
      rebalanceData.value = response.data
    } catch (err: any) {
      console.error('Fetch rebalance error:', err)
    }
  }

  const saveTargetAllocation = async (
    formData: AllocationFormData
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await api.put('/api/allocations', {
        allocations: formData.allocations,
        warningThreshold: formData.warningThreshold
      })
      targetAllocation.value = response.data.allocation
      await fetchRebalance()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '保存目标配置失败'
      return { success: false, error: message }
    }
  }

  const deleteTargetAllocation = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.delete('/api/allocations')
      targetAllocation.value = null
      rebalanceData.value = null
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '删除目标配置失败'
      return { success: false, error: message }
    }
  }

  const createDefaultAllocations = (activeCategoryIds: string[]): AllocationItem[] => {
    const count = activeCategoryIds.length
    if (count === 0) return []

    const basePct = Math.floor(100 / count)
    const remainder = 100 - basePct * count

    return activeCategoryIds.map((id, idx) => ({
      categoryId: id,
      percentage: basePct + (idx < remainder ? 1 : 0)
    }))
  }

  return {
    targetAllocation,
    rebalanceData,
    hasTarget,
    loading,
    error,
    fetchTargetAllocation,
    fetchRebalance,
    saveTargetAllocation,
    deleteTargetAllocation,
    createDefaultAllocations
  }
}
