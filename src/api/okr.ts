import { api } from '@/api/client'
import type { LeaderReviewStatus, SelfConfirmationStatus } from '@/api/kpi'

export { getApiErrorMessage } from '@/api/client'
export type { LeaderReviewStatus, SelfConfirmationStatus } from '@/api/kpi'

// ── Employee OKRs (M08) ──────────────────────────────────────────────────────

// targetValue/actualValue/rewardAmount: Decimal Prisma — string trong JSON.
// progressPercent: BE đã tính sẵn (MIN(actual/target,1)*100, 0 nếu target<=0) — number thật.
export type EmployeeOkr = {
  id: string
  employeeId: string
  payrollPeriodId: string
  teamId: string | null
  goalType: 'KPI' | 'OKR'
  title: string
  description: string | null
  unit: string | null
  metricType: 'NUMBER' | 'PERCENT' | 'BOOLEAN'
  direction: 'AT_LEAST' | 'AT_MOST'
  targetValue: string
  actualValue: string
  actualMissing: boolean
  overrideValue: string | null
  overrideReason: string | null
  rewardAmount: string
  dataSource: 'MANUAL' | 'AUTOMATION_GEN_VIDEO'
  externalItemId: string | null
  externalRevision: number | null
  sourceUpdatedAt: string | null
  syncedAt: string | null
  isActive: boolean
  deadline: string | null
  selfAssessment: string | null
  selfConfirmationStatus: SelfConfirmationStatus
  selfConfirmedByUserId: string | null
  selfConfirmedAt: string | null
  leaderReviewStatus: LeaderReviewStatus
  leaderReviewedByUserId: string | null
  leaderReviewedAt: string | null
  leaderRejectionReason: string | null
  createdAt: string
  updatedAt: string
  progressPercent: number
}

export async function listEmployeeOkrs(periodId: string, employeeId: string) {
  const { data } = await api.get<EmployeeOkr[]>(
    `/payroll-periods/${periodId}/employees/${employeeId}/okrs`,
  )
  return data
}

export type CreateEmployeeOkrInput = {
  title: string
  description?: string
  unit?: string
  targetValue: number
  rewardAmount: string
  deadline?: string
}

export async function createEmployeeOkr(periodId: string, employeeId: string, input: CreateEmployeeOkrInput) {
  const { data } = await api.post<EmployeeOkr>(
    `/payroll-periods/${periodId}/employees/${employeeId}/okrs`,
    input,
  )
  return data
}

export async function updateEmployeeOkr(id: string, input: { actualValue: number; selfAssessment?: string }) {
  const { data } = await api.patch<EmployeeOkr>(`/employee-okrs/${id}`, input)
  return data
}

export async function updateEmployeeOkrReward(id: string, rewardAmount: string) {
  const { data } = await api.patch<EmployeeOkr>(`/employee-okrs/${id}/reward`, { rewardAmount })
  return data
}

// Chỉ xóa được khi còn DRAFT (OKR tạo nhầm, chưa ai tự xác nhận/duyệt) — BE trả VALIDATION_ERROR
// nếu gọi lúc đã CONFIRMED/APPROVED.
export async function deleteEmployeeOkr(id: string) {
  await api.delete(`/employee-okrs/${id}`)
}

export async function selfConfirmOkr(id: string) {
  const { data } = await api.post<EmployeeOkr>(`/employee-okrs/${id}/self-confirm`)
  return data
}

export async function leaderApproveOkr(id: string) {
  const { data } = await api.post<EmployeeOkr>(`/employee-okrs/${id}/leader-approve`)
  return data
}

export async function leaderRejectOkr(id: string, reason: string) {
  const { data } = await api.post<EmployeeOkr>(`/employee-okrs/${id}/leader-reject`, { reason })
  return data
}

export async function overrideOkrActual(id: string, input: { overrideValue: number; reason: string }) {
  const { data } = await api.post<EmployeeOkr>(`/employee-okrs/${id}/override`, input)
  return data
}

// ── KPI/OKR proposals (M08) ──────────────────────────────────────────────────

export type ProposalType = 'KPI_ITEM' | 'OKR'
export type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

// proposedTargetValue/proposedRewardAmount: Decimal Prisma — string (hoặc null) trong JSON.
export type KpiOkrProposal = {
  id: string
  payrollPeriodId: string
  proposerEmployeeId: string
  proposalType: ProposalType
  proposedKpiGroupId: string | null
  proposedName: string
  proposedUnit: string | null
  proposedTargetValue: string
  proposedRewardAmount: string | null
  proposedDeadline: string | null
  reason: string
  status: ProposalStatus
  reviewedByUserId: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  resultEntityType: string | null
  resultEntityId: string | null
  createdAt: string
  updatedAt: string
  // Chỉ có ở listProposals()/getProposal() — GET include rút gọn.
  proposedKpiGroup?: { id: string; code: string; name: string } | null
  proposerEmployee?: { id: string; employeeCode: string; fullName: string }
}

export async function listProposals() {
  const { data } = await api.get<KpiOkrProposal[]>('/kpi-okr-proposals')
  return data
}

export async function getProposal(id: string) {
  const { data } = await api.get<KpiOkrProposal>(`/kpi-okr-proposals/${id}`)
  return data
}

export type CreateProposalInput = {
  payrollPeriodId: string
  proposalType: ProposalType
  proposedKpiGroupId?: string
  proposedName: string
  proposedUnit?: string
  proposedTargetValue: number
  proposedRewardAmount?: string
  proposedDeadline?: string
  reason: string
}

export async function createProposal(input: CreateProposalInput) {
  const { data } = await api.post<KpiOkrProposal>('/kpi-okr-proposals', input)
  return data
}

export async function approveProposal(id: string) {
  const { data } = await api.post<KpiOkrProposal>(`/kpi-okr-proposals/${id}/approve`)
  return data
}

export async function rejectProposal(id: string, reason: string) {
  const { data } = await api.post<KpiOkrProposal>(`/kpi-okr-proposals/${id}/reject`, { reason })
  return data
}
