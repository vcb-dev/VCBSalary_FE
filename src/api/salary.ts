import { api } from '@/api/client'
import type { Paginated } from '@/api/access-control'

export { getApiErrorMessage } from '@/api/client'

export type SalaryRecordStatus = 'PENDING' | 'WARNING' | 'LOCKED' | 'SUPERSEDED'
export type SalaryCalculationMode = 'PREVIEW' | 'PERSIST'

export type SalaryCalculationResult = {
  id: string
  employeeId: string
  payrollPeriodId: string
  status: SalaryRecordStatus
  warningCount: number
  warnings: SalaryWarning[]
}

export type SalaryWorkflowResult = {
  id: string
  status: SalaryRecordStatus
  versionNumber: number
  approvedAt?: string
  lockedAt?: string
}

export type SalaryWarning = {
  code: string
  message: string
  context?: Record<string, string | number | boolean | null>
}

export type PayrollClosingBlocker = 'UNCALCULATED' | 'WARNING' | 'PENDING_APPROVAL' | 'NEEDS_REVISION'

export type PayrollClosingEmployee = {
  employeeId: string
  employeeCode: string
  employeeName: string
  jobTitle: string
  teamId: string | null
  teamName: string | null
  salaryRecord: null | {
    id: string
    versionNumber: number
    status: SalaryRecordStatus
    totalSalaryAmount: string
    warningCount: number
    warnings: SalaryWarning[]
    calculatedAt: string
    approvedAt: string | null
    lockedAt: string | null
  }
  blocker: PayrollClosingBlocker | null
}

export type PayrollClosingReadiness = {
  period: {
    id: string
    code: string
    name: string
    status: 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'CLOSED'
    approvalDeadline: string | null
    closedAt: string | null
  }
  scope: 'SELF' | 'TEAM' | 'ALL' | 'NONE'
  capabilities: {
    canManagePeriod: boolean
    canCalculate: boolean
    canApprove: boolean
  }
  scopeReady: boolean
  readyToClose: boolean
  summary: {
    employeeCount: number
    lockedCount: number
    pendingApprovalCount: number
    warningCount: number
    uncalculatedCount: number
    needsRevisionCount: number
    blockerCount: number
  }
  closingSummary: {
    employeeCount: number
    lockedCount: number
    pendingApprovalCount: number
    warningCount: number
    uncalculatedCount: number
    needsRevisionCount: number
    blockerCount: number
  }
  employees: PayrollClosingEmployee[]
}

export type SalaryRecord = {
  id: string
  employeeId: string
  payrollPeriodId: string
  versionNumber: number
  parentSalaryRecordId: string | null
  rewardRuleSetId: string
  rewardRuleSetVersion: number
  revenueRewardBracketId: string | null
  revenueRewardBracketLabel: string | null
  baseSalaryAmount: string
  kpiRewardAmount: string
  okrRewardAmount: string
  revenueAmount: string
  commissionRatePercent: string
  commissionAmount: string
  totalViews: string
  rpmRatePer1000Views: string
  rpmRewardAmount: string
  additionalComponentAmount: string
  totalSalaryAmount: string
  status: SalaryRecordStatus
  warnings: SalaryWarning[]
  calculatedAt: string
  approvedAt: string | null
  lockedAt: string | null
  calculatedBy: SalaryActor
  approvedBy: SalaryActor | null
}

export type SalaryActor = {
  id: string
  fullName: string
}

export type SalaryVersionSummary = {
  id: string
  versionNumber: number
  parentSalaryRecordId: string | null
  status: SalaryRecordStatus
  totalSalaryAmount: string
  calculatedAt: string
  lockedAt: string | null
  calculatedBy: SalaryActor
  approvedBy: SalaryActor | null
}

export type SalaryListItem = {
  employeeId: string
  employeeCode: string
  employeeName: string
  jobTitle: string
  teamId: string | null
  teamName: string | null
  salaryRecord: SalaryRecord | null
}

export type SalaryBreakdownItem = {
  id: string
  progressPercent: string
  thresholdPercent: string
  rewardAmount: string
  isAchieved: boolean
  earnedAmount: string
}

export type SalaryBreakdown = SalaryRecord & {
  employeeCode: string
  employeeName: string
  jobTitle: string
  teamId: string | null
  teamName: string | null
  revenueBrackets: Array<{
    label: string
    minRevenueAmount: string
    maxRevenueAmount: string | null
    commissionRatePercent: string
    rpmRatePer1000Views: string
  }>
  kpiItems: Array<SalaryBreakdownItem & {
    kpiGroupId: string
    kpiGroupName: string
    teamId: string
    teamName: string
    salaryWeightPercent: string
  }>
  okrItems: Array<SalaryBreakdownItem & { employeeOkrId: string; goalType: 'KPI' | 'OKR'; title: string }>
  components: SalaryComponent[]
  versionHistory: SalaryVersionSummary[]
}

/** Khoản cộng thêm ngoài công thức; khoản `MANUAL` mã `BONUS` là thưởng thêm do leader/admin nhập. */
export type SalaryComponent = {
  id: string
  code: string | null
  name: string
  amount: string
  note: string | null
  source: 'MANUAL' | 'SYSTEM'
  createdAt: string
  createdBy: SalaryActor
}

export type SalaryBonusInput = {
  name: string
  amount: string
  note?: string
}

export type SalaryBonusResult = {
  id: string
  salaryRecordId: string
  totalSalaryAmount: string
}

export async function listSalaryRecords(
  periodId: string,
  params: { page?: number; pageSize?: number; search?: string; departmentId?: string; teamId?: string } = {},
) {
  const { data } = await api.get<Paginated<SalaryListItem>>(`/payroll-periods/${periodId}/salaries`, { params })
  return data
}

export async function calculatePeriodSalary(periodId: string, mode: SalaryCalculationMode = 'PERSIST') {
  const { data } = await api.post<{
    mode: SalaryCalculationMode
    processedCount: number
    skippedLockedCount: number
    warningCount: number
    data: unknown[]
  }>(`/payroll-periods/${periodId}/salaries/calculate`, undefined, { params: { mode } })
  return data
}

export async function getPayrollClosingReadiness(periodId: string) {
  const { data } = await api.get<PayrollClosingReadiness>(`/payroll-periods/${periodId}/closing-readiness`)
  return data
}

export async function approveReadySalaries(periodId: string) {
  const { data } = await api.post<{
    candidateCount: number
    approvedCount: number
    failedCount: number
    approvedIds: string[]
    failed: Array<{ id: string; message: string }>
  }>(`/payroll-periods/${periodId}/salaries/approve-ready`)
  return data
}

export async function calculateEmployeeSalary(
  periodId: string,
  employeeId: string,
  mode: SalaryCalculationMode = 'PERSIST',
) {
  const { data } = await api.post<SalaryCalculationResult>(
    `/payroll-periods/${periodId}/employees/${employeeId}/salary/calculate`,
    undefined,
    { params: { mode } },
  )
  return data
}

export async function getSalaryBreakdown(id: string) {
  const { data } = await api.get<SalaryBreakdown>(`/salary-records/${id}/breakdown`)
  return data
}

export async function approveSalaryRecord(id: string) {
  const { data } = await api.post<SalaryWorkflowResult>(`/salary-records/${id}/approve`)
  return data
}

export async function createSalaryRevision(id: string) {
  const { data } = await api.post<SalaryWorkflowResult>(`/salary-records/${id}/create-revision`)
  return data
}

export async function addSalaryBonus(recordId: string, input: SalaryBonusInput) {
  const { data } = await api.post<SalaryBonusResult>(`/salary-records/${recordId}/bonuses`, input)
  return data
}

export async function removeSalaryBonus(recordId: string, bonusId: string) {
  const { data } = await api.delete<SalaryBonusResult>(`/salary-records/${recordId}/bonuses/${bonusId}`)
  return data
}
