export interface Category {
  id: string
  name: string
  color: string
  sortOrder: number
  isActive: boolean
  isDefault: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CategoryAmount {
  categoryId: string
  amount: number
}

export interface AssetRecord {
  id: string
  date: string
  cash: number
  longTermInvest: number
  stableBond: number
  categoryAmounts: Record<string, number>
  total: number
  note: string
  editCount: number
  previousSnapshot: AssetSnapshot | null
  createdAt: string
  updatedAt: string
}

export interface AssetSnapshot {
  date: string
  cash: number
  longTermInvest: number
  stableBond: number
  categoryAmounts: Record<string, number>
  total: number
  note: string | null
  editedAt: string
}

export interface AssetFormData {
  date: string
  categoryAmounts: CategoryAmount[]
  note: string
}
