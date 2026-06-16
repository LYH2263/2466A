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

export interface TrendCompare {
  diff: number
  percent: number | null
  hasBase: boolean
  compareDate?: string
}

export interface CategoryTrend {
  categoryId: string
  amount: number
  percentageInTotal: number
  mom: TrendCompare
  yoy: TrendCompare
}

export interface AssetTrend {
  latestDate: string
  categories: CategoryTrend[]
  total: {
    amount: number
    mom: TrendCompare
    yoy: TrendCompare
  }
  hasSufficientData: {
    mom: boolean
    yoy: boolean
  }
}

export interface CategoryContribution {
  categoryId: string
  startAmount: number
  endAmount: number
  diff: number
  contributionPercent: number | null
  percentageChange: {
    start: number
    end: number
    diff: number
  }
}

export interface RangeAnalysis {
  startDate: string
  endDate: string
  startTotal: number
  endTotal: number
  netGrowth: number
  netGrowthPercent: number | null
  categoryContributions: CategoryContribution[]
  maxDrawdown: {
    value: number
    percent: number | null
    peakDate: string
    troughDate: string
    hasData: boolean
  }
  avgMonthlyGrowthRate: number | null
  monthlyCount: number
  hasSufficientData: boolean
}
