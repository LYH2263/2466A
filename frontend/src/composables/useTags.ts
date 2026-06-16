import { ref, computed } from 'vue'
import axios from 'axios'
import type { Tag, TagStatistics } from '../types'

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

const MAX_TAGS_PER_RECORD = 5

export function useTags() {
  const tags = ref<Tag[]>([])
  const tagStatistics = ref<TagStatistics | null>(null)
  const loading = ref(false)
  const error = ref('')

  const tagMap = computed(() => {
    const map = new Map<string, Tag>()
    tags.value.forEach(t => map.set(t.id, t))
    return map
  })

  const sortedTags = computed(() => 
    [...tags.value].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  )

  const fetchTags = async () => {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get('/api/tags')
      tags.value = response.data.tags || []
    } catch (err: any) {
      error.value = err.response?.data?.error || '获取标签列表失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  const createTag = async (name: string, color?: string): Promise<{ success: boolean; tag?: Tag; error?: string }> => {
    try {
      const response = await api.post('/api/tags', { name, color })
      const newTag = response.data.tag
      tags.value.push(newTag)
      return { success: true, tag: newTag }
    } catch (err: any) {
      const message = err.response?.data?.error || '创建标签失败'
      return { success: false, error: message }
    }
  }

  const updateTag = async (id: string, data: { name?: string; color?: string }): Promise<{ success: boolean; tag?: Tag; error?: string }> => {
    try {
      const response = await api.put(`/api/tags/${id}`, data)
      const updatedTag = response.data.tag
      const index = tags.value.findIndex(t => t.id === id)
      if (index !== -1) {
        tags.value[index] = updatedTag
      }
      return { success: true, tag: updatedTag }
    } catch (err: any) {
      const message = err.response?.data?.error || '更新标签失败'
      return { success: false, error: message }
    }
  }

  const deleteTag = async (id: string, cascadeRecords = false): Promise<{ success: boolean; error?: string; needConfirm?: boolean; referencedCount?: number }> => {
    try {
      const params = cascadeRecords ? { cascadeRecords: 'true' } : {}
      await api.delete(`/api/tags/${id}`, { params })
      tags.value = tags.value.filter(t => t.id !== id)
      return { success: true }
    } catch (err: any) {
      const status = err.response?.status
      const data = err.response?.data
      
      if (status === 400 && data?.code === 'TAG_IN_USE') {
        return { 
          success: false, 
          error: data.error,
          needConfirm: true,
          referencedCount: data.referencedCount
        }
      }
      
      const message = data?.error || '删除标签失败'
      return { success: false, error: message }
    }
  }

  const fetchTagStatistics = async () => {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get('/api/tags/statistics')
      tagStatistics.value = response.data
      return response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || '获取标签统计失败'
      return null
    } finally {
      loading.value = false
    }
  }

  const getPresetColors = async () => {
    try {
      const response = await api.get('/api/tags/preset-colors')
      return response.data
    } catch (err: any) {
      return {
        presetColors: [],
        usedColors: [],
        availableColors: [],
        nextSuggestedColor: '#67c23a'
      }
    }
  }

  const getOrCreateTag = async (name: string): Promise<Tag | null> => {
    const existingTag = tags.value.find(t => 
      t.name.toLowerCase() === name.trim().toLowerCase()
    )
    
    if (existingTag) {
      return existingTag
    }

    const result = await createTag(name.trim())
    if (result.success && result.tag) {
      return result.tag
    }
    
    return null
  }

  return {
    tags,
    tagMap,
    sortedTags,
    tagStatistics,
    loading,
    error,
    MAX_TAGS_PER_RECORD,
    fetchTags,
    createTag,
    updateTag,
    deleteTag,
    fetchTagStatistics,
    getPresetColors,
    getOrCreateTag
  }
}
