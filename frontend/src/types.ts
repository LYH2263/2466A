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

export interface Tag {
  id: string
  name: string
  color: string
  recordCount?: number
  createdAt: string
  updatedAt: string
}

export interface TagStat {
  tagId: string
  tagName: string
  tagColor: string
  recordCount: number
  totalAssetSum: number
  avgAsset: number
  latestTotal: number
  latestDate: string | null
}

export interface TagStatistics {
  tagStats: TagStat[]
  totalRecords: number
  taggedRecords: number
  untaggedCount: number
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
  tags: Tag[]
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
  tagIds: string[]
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
  totalLiability: {
    amount: number
    mom: TrendCompare
    yoy: TrendCompare
  }
  netWorth: {
    amount: number
    mom: TrendCompare
    yoy: TrendCompare
  }
  hasSufficientData: {
    mom: boolean
    yoy: boolean
  }
}

export interface LiabilityRecord {
  id: string
  name: string
  amount: number
  date: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface LiabilityFormData {
  name: string
  amount: number
  date: string
  note: string
}

export interface NetWorthTimePoint {
  date: string
  totalAsset: number
  totalLiability: number
  netWorth: number
  hasAsset: boolean
  hasLiability: boolean
}

export interface NetWorthData {
  series: NetWorthTimePoint[]
  summary: {
    latestDate: string | null
    totalAsset: number
    totalLiability: number
    netWorth: number
    isNegative: boolean
    hasAssetData: boolean
    hasLiabilityData: boolean
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

export interface GoalGrowth {
  monthlyRate: number | null
  canPredict: boolean
  reason?: string
}

export interface GoalPrediction {
  estimatedDate: string | null
  daysRemaining: number | null
  canPredict: boolean
  reason?: string
}

export interface GoalProgress {
  id: string
  name: string
  scope: 'total' | 'category'
  categoryId: string | null
  targetAmount: number
  targetDate: string
  currentValue: number
  latestDate: string | null
  progressPercent: number
  diff: number
  remaining: number
  isExceeded: boolean
  isCompleted: boolean
  isExpired: boolean
  growth: GoalGrowth
  prediction: GoalPrediction
  createdAt: string
  updatedAt: string
}

export interface GoalFormData {
  name: string
  targetAmount: number
  targetDate: string
  scope: 'total' | 'category'
  categoryId?: string | null
}

export interface AllocationItem {
  categoryId: string
  percentage: number
}

export interface TargetAllocation {
  id: string
  allocations: AllocationItem[]
  warningThreshold: number
  createdAt: string
  updatedAt: string
}

export interface RebalanceItem {
  categoryId: string
  categoryName: string
  categoryColor: string
  actualAmount: number
  actualPercent: number
  targetPercent: number
  targetAmount: number
  diffAmount: number
  diffPercent: number
  isWarning: boolean
  rebalanceAmount: number
}

export interface RebalanceResult {
  totalAsset: number
  warningThreshold: number
  items: RebalanceItem[]
  roundingCorrection: number
  rebalanceSum: number
}

export interface RebalanceResponse {
  hasTarget: boolean
  hasLatest: boolean
  latestDate: string | null
  rebalance: RebalanceResult | null
}

export interface AllocationFormData {
  allocations: AllocationItem[]
  warningThreshold: number
}

export type CashFlowType = 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out' | 'dividend' | 'interest' | 'other'

export interface CashFlow {
  id: string
  date: string
  amount: number
  type: CashFlowType
  note: string | null
  assetRecordId: string | null
  createdAt: string
  updatedAt: string
}

export interface CashFlowSummary {
  totalDeposit: number
  totalWithdraw: number
  netCashFlow: number
  count: number
}

export interface CashFlowListResponse {
  cashFlows: CashFlow[]
  summary: CashFlowSummary
}

export interface CashFlowFormData {
  date: string
  amount: number
  type: CashFlowType
  note: string
  assetRecordId?: string | null
}

export interface ReturnMetrics {
  startValue: number
  endValue: number
  absoluteReturn: number
  simpleReturn: number | null
  timeWeightedReturn: number | null
  annualizedSimpleReturn: number | null
  annualizedTimeWeightedReturn: number | null
}

export interface CategoryReturn {
  categoryId: string
  categoryName: string
  categoryColor: string
  startValue: number
  endValue: number
  absoluteReturn: number
  simpleReturn: number | null
  timeWeightedReturn: number | null
  annualizedSimpleReturn: number | null
  annualizedTimeWeightedReturn: number | null
  percentageInTotal: number
}

export interface CumulativeReturnPoint {
  date: string
  total: number
  cumulativeSimpleReturn: number | null
  cumulativeTimeWeightedReturn: number | null
}

export interface ReturnsAnalysis {
  startDate: string
  endDate: string
  actualDays: number
  hasSufficientData: boolean
  warnings: string[]
  total: ReturnMetrics
  cashFlowSummary: CashFlowSummary
  categoryReturns: CategoryReturn[]
  cumulativeCurve: CumulativeReturnPoint[]
}

export const CASH_FLOW_TYPE_LABELS: Record<CashFlowType, string> = {
  deposit: '存入',
  withdraw: '取出',
  transfer_in: '转入',
  transfer_out: '转出',
  dividend: '分红',
  interest: '利息',
  other: '其他'
}

export const CASH_FLOW_TYPE_COLORS: Record<CashFlowType, string> = {
  deposit: '#67c23a',
  withdraw: '#f56c6c',
  transfer_in: '#409eff',
  transfer_out: '#e6a23c',
  dividend: '#909399',
  interest: '#909399',
  other: '#909399'
}

export type BackupIntegrity = 'valid' | 'tampered' | 'tampered_allowed'
export type RestoreStrategy = 'merge' | 'overwrite'

export interface BackupDiffItem {
  total: number
  toAdd: number
  toUpdate: number
  toDelete: number
  conflicts: string[]
}

export interface BackupDiff {
  categories: BackupDiffItem
  tags: BackupDiffItem
  assetRecords: BackupDiffItem
  assetItems: BackupDiffItem
  assetRecordTags: BackupDiffItem
  liabilityRecords: BackupDiffItem
  goals: BackupDiffItem
  targetAllocation: BackupDiffItem
  cashFlows: BackupDiffItem
  warnings: string[]
}

export interface BackupStats {
  categories: number
  tags: number
  assetRecords: number
  assetItems: number
  assetRecordTags: number
  liabilityRecords: number
  goals: number
  targetAllocation: number
  cashFlows: number
}

export interface BackupExportedBy {
  userId: string
  userEmail: string
}

export interface BackupValidateResponse {
  valid: boolean
  backup: {
    version: string
    exportedAt: string
    exportedBy: BackupExportedBy
    stats: BackupStats
  }
  integrity: BackupIntegrity
  integrityWarnings: string[]
  diff: BackupDiff
  backupVersion?: string
  currentVersion?: string
  versionError?: string
  tampered?: boolean
}

export interface BackupImportResponse {
  success: boolean
  message: string
  strategy: RestoreStrategy
  integrity: BackupIntegrity
  rollback?: boolean
  detail?: string
}

export interface BackupSchemaInfo {
  version: string
  maxSizeMB: number
  supportedStrategies: RestoreStrategy[]
  entities: string[]
}

export interface BackupEntityLabel {
  key: keyof BackupDiff
  label: string
  icon: string
}
