import { ref, computed } from 'vue'
import axios from 'axios'
import type { Category } from '../types'

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

export function useCategories() {
  const categories = ref<Category[]>([])
  const allCategories = ref<Category[]>([])
  const loading = ref(false)
  const error = ref('')

  const activeCategories = computed(() =>
    allCategories.value.filter(c => c.isActive)
  )

  const categoryMap = computed(() => {
    const map = new Map<string, Category>()
    allCategories.value.forEach(c => map.set(c.id, c))
    return map
  })

  const fetchCategories = async (includeInactive = true) => {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get('/api/categories', {
        params: { includeInactive }
      })
      allCategories.value = response.data.categories
      categories.value = response.data.categories
    } catch (err: any) {
      error.value = err.response?.data?.error || '获取类别列表失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  const createCategory = async (name: string, color: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await api.post('/api/categories', { name, color })
      allCategories.value.push(response.data.category)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || '创建类别失败' }
    }
  }

  const updateCategory = async (
    id: string,
    data: { name?: string; color?: string; isActive?: boolean; sortOrder?: number }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await api.put(`/api/categories/${id}`, data)
      const index = allCategories.value.findIndex(c => c.id === id)
      if (index !== -1) {
        allCategories.value[index] = response.data.category
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || '更新类别失败' }
    }
  }

  const reorderCategories = async (orders: { id: string; sortOrder: number }[]): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.patch('/api/categories/reorder', { orders })
      for (const order of orders) {
        const category = allCategories.value.find(c => c.id === order.id)
        if (category) {
          category.sortOrder = order.sortOrder
        }
      }
      allCategories.value.sort((a, b) => a.sortOrder - b.sortOrder)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || '更新排序失败' }
    }
  }

  const deleteCategory = async (id: string): Promise<{ success: boolean; error?: string; hasHistory?: boolean }> => {
    try {
      await api.delete(`/api/categories/${id}`)
      const index = allCategories.value.findIndex(c => c.id === id)
      if (index !== -1) {
        allCategories.value.splice(index, 1)
      }
      return { success: true }
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'HAS_HISTORY_DATA') {
        return { success: false, error: err.response.data.error, hasHistory: true }
      }
      return { success: false, error: err.response?.data?.error || '删除类别失败' }
    }
  }

  const getPresetColors = async (): Promise<{
    presetColors: string[]
    usedColors: string[]
    availableColors: string[]
    nextSuggestedColor: string
  }> => {
    const response = await api.get('/api/categories/preset-colors')
    return response.data
  }

  const getCategoryById = (id: string): Category | undefined => {
    return categoryMap.value.get(id)
  }

  return {
    categories,
    allCategories,
    activeCategories,
    categoryMap,
    loading,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    reorderCategories,
    deleteCategory,
    getPresetColors,
    getCategoryById
  }
}
