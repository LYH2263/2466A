import { ref, computed } from 'vue'
import axios from 'axios'
import type { AssetRecord, AssetFormData, Category, CategoryAmount } from '../types'

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

const mapRecord = (r: any, categories: Category[]): AssetRecord => {
  const categoryMap = new Map(categories.map(c => [c.id, c.name]))
  let cash = 0, longTermInvest = 0, stableBond = 0

  if (r.categoryAmounts) {
    for (const [categoryId, amount] of Object.entries(r.categoryAmounts)) {
      const name = categoryMap.get(categoryId)
      if (name === '活钱') cash = Number(amount)
      else if (name === '长期投资') longTermInvest = Number(amount)
      else if (name === '稳定债券') stableBond = Number(amount)
    }
  }

  return {
    ...r,
    date: r.date.split('T')[0],
    cash: cash,
    longTermInvest: longTermInvest,
    stableBond: stableBond,
    total: Number(r.total),
    categoryAmounts: r.categoryAmounts || {},
    editCount: r.editCount ?? 0,
    previousSnapshot: r.previousSnapshot ?? null,
    updatedAt: r.updatedAt ?? r.createdAt
  }
}

export function useAssets() {
  const records = ref<AssetRecord[]>([])
  const categories = ref<Category[]>([])
  const loading = ref(false)
  const error = ref('')

  const activeCategories = computed(() =>
    categories.value.filter(c => c.isActive)
  )

  const categoryMap = computed(() => {
    const map = new Map<string, Category>()
    categories.value.forEach(c => map.set(c.id, c))
    return map
  })

  const fetchRecords = async () => {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get('/api/assets', {
        params: { includeInactive: true }
      })
      categories.value = response.data.categories || []
      records.value = response.data.records.map((r: any) => mapRecord(r, categories.value))
    } catch (err: any) {
      error.value = err.response?.data?.error || '获取数据失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  const createEmptyFormData = (): AssetFormData => {
    return {
      date: new Date().toISOString().split('T')[0],
      categoryAmounts: activeCategories.value.map(c => ({
        categoryId: c.id,
        amount: 0
      })),
      note: ''
    }
  }

  const addRecord = async (formData: AssetFormData): Promise<{ success: boolean; error?: string }> => {
    try {
      const payload = {
        date: formData.date,
        categoryAmounts: formData.categoryAmounts.map(ca => ({
          categoryId: ca.categoryId,
          amount: ca.amount || 0
        })),
        note: formData.note || undefined
      }
      await api.post('/api/assets', payload)
      await fetchRecords()
      return { success: true }
    } catch (err: any) {
      const message = err.response?.data?.error || '添加失败'
      return { success: false, error: message }
    }
  }

  const recordToFormData = (record: AssetRecord): AssetFormData => {
    const categoryAmounts: CategoryAmount[] = activeCategories.value.map(c => ({
      categoryId: c.id,
      amount: record.categoryAmounts?.[c.id] ?? 0
    }))

    return {
      date: record.date,
      categoryAmounts,
      note: record.note || ''
    }
  }

  const updateRecord = async (
    id: string,
    formData: AssetFormData
  ): Promise<{ success: boolean; error?: string; conflict?: boolean }> => {
    const originalRecords = [...records.value]
    const originalIndex = originalRecords.findIndex((r) => r.id === id)
    if (originalIndex === -1) {
      return { success: false, error: '本地未找到该记录', conflict: true }
    }

    const total = formData.categoryAmounts.reduce((sum, ca) => sum + (ca.amount || 0), 0)
    const newCategoryAmounts: Record<string, number> = {}
    for (const ca of formData.categoryAmounts) {
      newCategoryAmounts[ca.categoryId] = ca.amount || 0
    }

    const updatedOptimistic: AssetRecord = {
      ...originalRecords[originalIndex],
      date: formData.date,
      categoryAmounts: newCategoryAmounts,
      total,
      note: formData.note,
      editCount: originalRecords[originalIndex].editCount + 1,
      updatedAt: new Date().toISOString()
    }

    records.value = originalRecords.map((r, idx) =>
      idx === originalIndex ? updatedOptimistic : r
    )

    try {
      const payload = {
        date: formData.date,
        categoryAmounts: formData.categoryAmounts.map(ca => ({
          categoryId: ca.categoryId,
          amount: ca.amount || 0
        })),
        note: formData.note || undefined
      }

      const response = await api.put(`/api/assets/${id}`, payload)
      const serverRecord = mapRecord(response.data.record, categories.value)
      records.value = records.value.map((r) => (r.id === id ? serverRecord : r))
      return { success: true }
    } catch (err: any) {
      records.value = originalRecords

      const status = err.response?.status
      const message = err.response?.data?.error || '编辑失败'

      if (status === 404) {
        return { success: false, error: message, conflict: true }
      }
      return { success: false, error: message }
    }
  }

  const deleteRecord = async (id: string) => {
    try {
      await api.delete(`/api/assets/${id}`)
      await fetchRecords()
    } catch (err: any) {
      throw new Error(err.response?.data?.error || '删除失败')
    }
  }

  const fillDemoData = async () => {
    const activeCats = activeCategories.value
    if (activeCats.length < 3) {
      throw new Error('需要至少3个活动类别才能填充示例数据')
    }

    const [cashCat, investCat, bondCat] = activeCats
    const demoData = [
      { date: '2024-01-01', amounts: { [cashCat.id]: 50000, [investCat.id]: 100000, [bondCat.id]: 30000 }, note: '年初盘点' },
      { date: '2024-02-01', amounts: { [cashCat.id]: 55000, [investCat.id]: 105000, [bondCat.id]: 30000 }, note: '月度盘点' },
      { date: '2024-03-01', amounts: { [cashCat.id]: 60000, [investCat.id]: 110000, [bondCat.id]: 35000 }, note: '季度盘点' },
      { date: '2024-04-01', amounts: { [cashCat.id]: 58000, [investCat.id]: 115000, [bondCat.id]: 35000 }, note: '月度盘点' },
      { date: '2024-05-01', amounts: { [cashCat.id]: 62000, [investCat.id]: 120000, [bondCat.id]: 40000 }, note: '月度盘点' },
      { date: '2024-06-01', amounts: { [cashCat.id]: 65000, [investCat.id]: 125000, [bondCat.id]: 40000 }, note: '半年盘点' }
    ]
    
    for (const data of demoData) {
      const categoryAmounts = Object.entries(data.amounts).map(([categoryId, amount]) => ({
        categoryId,
        amount
      }))
      await api.post('/api/assets', {
        date: data.date,
        categoryAmounts,
        note: data.note
      })
    }
    await fetchRecords()
  }

  const latestRecord = computed(() => records.value[0] || null)
  const sortedRecords = computed(() => [...records.value].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  ))
  const chartData = computed(() => {
    return [...records.value].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )
  })
  const hasRecords = computed(() => records.value.length > 0)

  return {
    records: sortedRecords,
    categories,
    activeCategories,
    categoryMap,
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
    recordToFormData
  }
}
