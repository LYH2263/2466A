import { ref } from 'vue'
import axios from 'axios'
import type { CashFlow, CashFlowFormData, CashFlowListResponse, ReturnsAnalysis } from '../types'

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

export function useCashFlows() {
  const cashFlows = ref<CashFlow[]>([])
  const summary = ref({
    totalDeposit: 0,
    totalWithdraw: 0,
    netCashFlow: 0,
    count: 0
  })
  const loading = ref(false)
  const error = ref('')

  const fetchCashFlows = async (params?: { startDate?: string; endDate?: string; type?: string }) => {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get<CashFlowListResponse>('/api/cash-flows', { params })
      cashFlows.value = response.data.cashFlows
      summary.value = response.data.summary
      return response.data
    } catch (err: any) {
      error.value = err.response?.data?.error || '获取资金流记录失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  const addCashFlow = async (formData: CashFlowFormData): Promise<{ success: boolean; error?: string }> => {
    try {
      const payload = {
        date: formData.date,
        amount: formData.amount,
        type: formData.type,
        note: formData.note || undefined,
        assetRecordId: formData.assetRecordId || undefined
      }
      await api.post('/api/cash-flows', payload)
      await fetchCashFlows()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '添加失败'
      return { success: false, error: message }
    }
  }

  const updateCashFlow = async (
    id: string,
    formData: CashFlowFormData
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const payload = {
        date: formData.date,
        amount: formData.amount,
        type: formData.type,
        note: formData.note || undefined,
        assetRecordId: formData.assetRecordId || undefined
      }
      await api.put(`/api/cash-flows/${id}`, payload)
      await fetchCashFlows()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '更新失败'
      return { success: false, error: message }
    }
  }

  const deleteCashFlow = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.delete(`/api/cash-flows/${id}`)
      await fetchCashFlows()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '删除失败'
      return { success: false, error: message }
    }
  }

  const createEmptyFormData = (): CashFlowFormData => {
    return {
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      type: 'deposit',
      note: '',
      assetRecordId: null
    }
  }

  const fetchReturnsAnalysis = async (startDate: string, endDate: string): Promise<ReturnsAnalysis | null> => {
    try {
      const response = await api.get<ReturnsAnalysis>('/api/returns', {
        params: { startDate, endDate }
      })
      return response.data
    } catch (err: any) {
      console.error('Fetch returns analysis error:', err)
      return null
    }
  }

  return {
    cashFlows,
    summary,
    loading,
    error,
    fetchCashFlows,
    addCashFlow,
    updateCashFlow,
    deleteCashFlow,
    createEmptyFormData,
    fetchReturnsAnalysis
  }
}
