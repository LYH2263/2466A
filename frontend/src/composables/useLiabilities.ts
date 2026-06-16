import { ref, computed } from 'vue'
import axios from 'axios'
import type { LiabilityRecord, LiabilityFormData, NetWorthData } from '../types'

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

export function useLiabilities() {
  const records = ref<LiabilityRecord[]>([])
  const totalLiability = ref(0)
  const loading = ref(false)
  const error = ref('')
  const netWorthData = ref<NetWorthData | null>(null)

  const sortedRecords = computed(() =>
    [...records.value].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  )

  const hasRecords = computed(() => records.value.length > 0)

  const fetchRecords = async () => {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get('/api/liabilities')
      records.value = response.data.records || []
      totalLiability.value = response.data.totalLiability || 0
    } catch (err: any) {
      error.value = err.response?.data?.error || '获取数据失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  const fetchNetWorth = async (granularity: string = 'month'): Promise<NetWorthData | null> => {
    try {
      const response = await api.get('/api/liabilities/net-worth', {
        params: { granularity }
      })
      netWorthData.value = response.data
      return response.data
    } catch (err: any) {
      console.error('Fetch net worth error:', err)
      return null
    }
  }

  const createEmptyFormData = (): LiabilityFormData => {
    return {
      name: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      note: ''
    }
  }

  const recordToFormData = (record: LiabilityRecord): LiabilityFormData => {
    return {
      name: record.name,
      amount: record.amount,
      date: record.date,
      note: record.note || ''
    }
  }

  const addRecord = async (formData: LiabilityFormData): Promise<{ success: boolean; error?: string }> => {
    try {
      const payload = {
        name: formData.name,
        amount: formData.amount || 0,
        date: formData.date,
        note: formData.note || undefined
      }
      await api.post('/api/liabilities', payload)
      await fetchRecords()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '添加失败'
      return { success: false, error: message }
    }
  }

  const updateRecord = async (
    id: string,
    formData: LiabilityFormData
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const payload = {
        name: formData.name,
        amount: formData.amount || 0,
        date: formData.date,
        note: formData.note || undefined
      }
      await api.put(`/api/liabilities/${id}`, payload)
      await fetchRecords()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '编辑失败'
      return { success: false, error: message }
    }
  }

  const deleteRecord = async (id: string) => {
    try {
      await api.delete(`/api/liabilities/${id}`)
      await fetchRecords()
    } catch (err: any) {
      throw new Error(err.response?.data?.error || '删除失败')
    }
  }

  const fillDemoData = async () => {
    const demoData = [
      { name: '房贷', amount: 800000, date: '2024-01-01', note: '首套住房贷款' },
      { name: '消费贷', amount: 50000, date: '2024-02-01', note: '装修贷款' },
      { name: '房贷', amount: 780000, date: '2024-03-01', note: '已还部分本金' },
      { name: '消费贷', amount: 40000, date: '2024-04-01', note: '已还部分' },
      { name: '房贷', amount: 760000, date: '2024-05-01', note: '正常还款' },
      { name: '消费贷', amount: 30000, date: '2024-06-01', note: '持续还款中' }
    ]

    for (const data of demoData) {
      await api.post('/api/liabilities', data)
    }
    await fetchRecords()
  }

  return {
    records: sortedRecords,
    totalLiability,
    hasRecords,
    loading,
    error,
    netWorthData,
    fetchRecords,
    fetchNetWorth,
    createEmptyFormData,
    recordToFormData,
    addRecord,
    updateRecord,
    deleteRecord,
    fillDemoData
  }
}
