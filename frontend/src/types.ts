export interface AssetRecord {
  id: string
  date: string
  cash: number
  longTermInvest: number
  stableBond: number
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
  total: number
  note: string | null
  editedAt: string
}

export interface AssetFormData {
  date: string
  cash: number | null
  longTermInvest: number | null
  stableBond: number | null
  note: string
}
