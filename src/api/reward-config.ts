import { api } from '@/api/client'

export { getApiErrorMessage } from '@/api/client'

export type RewardRuleSetStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

// Prisma Decimal serializes to string trong JSON — không giả định number.
export type RewardRuleSet = {
  id: string
  version: number
  achievementThresholdPercent: string
  effectiveFromPeriodId: string | null
  status: RewardRuleSetStatus
  createdByUserId: string
  createdAt: string
}

export type RevenueRewardBracket = {
  id: string
  rewardRuleSetId: string
  label: string
  minRevenueAmount: string
  maxRevenueAmount: string | null
  commissionRatePercent: string
  rpmRatePer1000Views: string
  sortOrder: number
  createdAt: string
}

export type BaseSalaryHistory = {
  id: string
  employeeId: string
  monthlyBaseSalary: string
  effectiveFrom: string
  effectiveTo: string | null
  createdByUserId: string
  createdAt: string
}

export type KpiRewardRate = {
  id: string
  employeeId: string
  kpiGroupId: string
  rewardAmount: string
  effectiveFrom: string
  effectiveTo: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
  kpiGroup: {
    id: string
    code: string
    name: string
    isActive: boolean
  }
}

// ── Reward rule sets ─────────────────────────────────────────────────────────

export async function listRewardRuleSets() {
  const { data } = await api.get<RewardRuleSet[]>('/reward-rule-sets')
  return data
}

export async function getRewardRuleSet(id: string) {
  const { data } = await api.get<RewardRuleSet>(`/reward-rule-sets/${id}`)
  return data
}

export type CreateRewardRuleSetInput = {
  achievementThresholdPercent: number
  effectiveFromPeriodId?: string
  cloneRevenueBracketsFromRuleSetId?: string
}

export async function createRewardRuleSet(input: CreateRewardRuleSetInput) {
  const { data } = await api.post<RewardRuleSet>('/reward-rule-sets', input)
  return data
}

export async function activateRewardRuleSet(id: string) {
  const { data } = await api.post<RewardRuleSet>(`/reward-rule-sets/${id}/activate`)
  return data
}

export async function archiveRewardRuleSet(id: string) {
  const { data } = await api.post<RewardRuleSet>(`/reward-rule-sets/${id}/archive`)
  return data
}

// ── Revenue reward brackets ──────────────────────────────────────────────────

export async function listRevenueBrackets(ruleSetId: string) {
  const { data } = await api.get<RevenueRewardBracket[]>(`/reward-rule-sets/${ruleSetId}/revenue-brackets`)
  return data
}

export type CreateRevenueBracketInput = {
  label: string
  minRevenueAmount: string
  maxRevenueAmount?: string
  commissionRatePercent: string
  rpmRatePer1000Views: string
}

export async function createRevenueBracket(ruleSetId: string, input: CreateRevenueBracketInput) {
  const { data } = await api.post<RevenueRewardBracket>(
    `/reward-rule-sets/${ruleSetId}/revenue-brackets`,
    input,
  )
  return data
}

export type UpdateRevenueBracketInput = Partial<CreateRevenueBracketInput>

export async function updateRevenueBracket(id: string, input: UpdateRevenueBracketInput) {
  const { data } = await api.patch<RevenueRewardBracket>(`/revenue-reward-brackets/${id}`, input)
  return data
}

export async function deleteRevenueBracket(id: string) {
  await api.delete(`/revenue-reward-brackets/${id}`)
}

// ── Base salary history ──────────────────────────────────────────────────────

export async function listBaseSalaryHistory(employeeId: string) {
  const { data } = await api.get<BaseSalaryHistory[]>(`/employees/${employeeId}/base-salary-history`)
  return data
}

/** Mức lương cơ bản đang hiệu lực + số bản ghi lịch sử của một nhân sự. */
export type BaseSalaryCurrent = {
  employeeId: string
  entryCount: number
  current: BaseSalaryHistory | null
}

/**
 * Lấy mức hiện hành của nhiều nhân sự trong một request — dùng cho bảng cấu hình.
 * Bỏ trống employeeIds = toàn bộ nhân sự.
 */
export async function listCurrentBaseSalaries(employeeIds?: string[]) {
  const { data } = await api.get<BaseSalaryCurrent[]>('/base-salary-histories/current', {
    params: employeeIds?.length ? { employeeIds: employeeIds.join(',') } : undefined,
  })
  return data
}

export type CreateBaseSalaryHistoryInput = {
  monthlyBaseSalary: string
  effectiveFrom: string
}

export async function createBaseSalaryHistory(employeeId: string, input: CreateBaseSalaryHistoryInput) {
  const { data } = await api.post<BaseSalaryHistory>(
    `/employees/${employeeId}/base-salary-history`,
    input,
  )
  return data
}

export type UpdateBaseSalaryHistoryInput = {
  monthlyBaseSalary?: string
  effectiveFrom?: string
  effectiveTo?: string
}

export async function updateBaseSalaryHistory(id: string, input: UpdateBaseSalaryHistoryInput) {
  const { data } = await api.patch<BaseSalaryHistory>(`/base-salary-histories/${id}`, input)
  return data
}

// ── KPI reward rates ────────────────────────────────────────────────────────

export async function listKpiRewardRates(employeeId: string) {
  const { data } = await api.get<KpiRewardRate[]>(`/employees/${employeeId}/kpi-reward-rates`)
  return data
}

/** Các mức tiền KPI đang hiệu lực + tổng tiền khi đạt của một nhân sự. */
export type KpiRewardRateCurrent = {
  employeeId: string
  rateCount: number
  activeRates: KpiRewardRate[]
  totalRewardAmount: string
}

/** Lấy mức tiền KPI đang hiệu lực của nhiều nhân sự trong một request. */
export async function listCurrentKpiRewardRates(employeeIds?: string[]) {
  const { data } = await api.get<KpiRewardRateCurrent[]>('/employee-kpi-reward-rates/current', {
    params: employeeIds?.length ? { employeeIds: employeeIds.join(',') } : undefined,
  })
  return data
}

export type CreateKpiRewardRateInput = {
  kpiGroupId: string
  rewardAmount: string
  effectiveFrom: string
}

export async function createKpiRewardRate(employeeId: string, input: CreateKpiRewardRateInput) {
  const { data } = await api.post<KpiRewardRate>(`/employees/${employeeId}/kpi-reward-rates`, {
    ...input,
    kpiGroupId: Number(input.kpiGroupId),
  })
  return data
}

export type UpdateKpiRewardRateInput = {
  rewardAmount?: string
  effectiveFrom?: string
  effectiveTo?: string | null
}

export async function updateKpiRewardRate(id: string, input: UpdateKpiRewardRateInput) {
  const { data } = await api.patch<KpiRewardRate>(`/employee-kpi-reward-rates/${id}`, input)
  return data
}

export async function deleteKpiRewardRate(id: string) {
  await api.delete(`/employee-kpi-reward-rates/${id}`)
}
