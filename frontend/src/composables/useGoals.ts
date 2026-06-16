import { ref, computed } from 'vue'
import axios from 'axios'
import type { GoalProgress, GoalFormData } from '../types'

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

export function useGoals() {
  const goals = ref<GoalProgress[]>([])
  const loading = ref(false)
  const error = ref('')

  const activeGoals = computed(() =>
    goals.value.filter(g => !g.isCompleted)
  )

  const completedGoals = computed(() =>
    goals.value.filter(g => g.isCompleted)
  )

  const expiredGoals = computed(() =>
    goals.value.filter(g => g.isExpired && !g.isCompleted)
  )

  const fetchGoals = async () => {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get('/api/goals')
      goals.value = response.data.goals || []
    } catch (err: any) {
      error.value = err.response?.data?.error || '获取目标列表失败'
    } finally {
      loading.value = false
    }
  }

  const addGoal = async (formData: GoalFormData): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.post('/api/goals', formData)
      await fetchGoals()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '创建目标失败'
      return { success: false, error: message }
    }
  }

  const updateGoal = async (
    id: string,
    formData: Partial<GoalFormData> & { isCompleted?: boolean }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.put(`/api/goals/${id}`, formData)
      await fetchGoals()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '更新目标失败'
      return { success: false, error: message }
    }
  }

  const deleteGoal = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.delete(`/api/goals/${id}`)
      await fetchGoals()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '删除目标失败'
      return { success: false, error: message }
    }
  }

  return {
    goals,
    activeGoals,
    completedGoals,
    expiredGoals,
    loading,
    error,
    fetchGoals,
    addGoal,
    updateGoal,
    deleteGoal
  }
}
