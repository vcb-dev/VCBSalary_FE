import { api } from '@/api/client'
import type { Paginated } from '@/api/access-control'

export { getApiErrorMessage } from '@/api/client'
export type { Paginated } from '@/api/access-control'

export type PayrollPeriodStatus = 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'CLOSED'

export type PayrollPeriod = {
  id: string
  code: string
  name: string
  payrollYear: number
  payrollMonth: number
  startDate: string
  endDate: string
  approvalDeadline: string | null
  status: PayrollPeriodStatus
  openedByUserId: string | null
  openedAt: string | null
  closedAt: string | null
  createdAt: string
  automaticKpiAssignmentCount?: number
}

export type PayrollPeriodEmployeeSnapshot = {
  id: string
  payrollPeriodId: string
  employeeId: string
  employeeCodeSnapshot: string
  employeeNameSnapshot: string
  jobTitleSnapshot: string
  // Mã nhóm nghiệp vụ tại thời điểm chốt kỳ — ảnh chụp lịch sử, không tra ngược danh mục hiện tại.
  employeeGroupsSnapshot: string[]
  teamIdSnapshot: string | null
  teamCodeSnapshot: string | null
  teamNameSnapshot: string | null
  leaderEmployeeIdSnapshot: string | null
  leaderNameSnapshot: string | null
  managerEmployeeIdSnapshot: string | null
  managerNameSnapshot: string | null
  employmentStatusSnapshot: string
  createdAt: string
}

// ── Payroll periods ─────────────────────────────────────────────────────────

export type ListPayrollPeriodsParams = {
  page?: number
  pageSize?: number
  year?: number
}

export async function listPayrollPeriods(params: ListPayrollPeriodsParams = {}) {
  const { data } = await api.get<Paginated<PayrollPeriod>>('/payroll-periods', { params })
  return data
}

export async function listPayrollPeriodYears() {
  const { data } = await api.get<number[]>('/payroll-periods/years')
  return data
}

export async function getPayrollPeriod(id: string) {
  const { data } = await api.get<PayrollPeriod>(`/payroll-periods/${id}`)
  return data
}

export type CreatePayrollPeriodInput = {
  name: string
  startDate: string
  endDate: string
  approvalDeadline?: string | null
}

export async function createPayrollPeriod(input: CreatePayrollPeriodInput) {
  const { data } = await api.post<PayrollPeriod>('/payroll-periods', input)
  return data
}

export type UpdatePayrollPeriodInput = {
  name?: string
  startDate?: string
  endDate?: string
  approvalDeadline?: string | null
}

export async function updatePayrollPeriod(id: string, input: UpdatePayrollPeriodInput) {
  const { data } = await api.patch<PayrollPeriod>(`/payroll-periods/${id}`, input)
  return data
}

export async function openPayrollPeriod(id: string) {
  const { data } = await api.post<PayrollPeriod>(`/payroll-periods/${id}/open`)
  return data
}

export async function startReviewPayrollPeriod(id: string) {
  const { data } = await api.post<PayrollPeriod>(`/payroll-periods/${id}/start-review`)
  return data
}

export async function closePayrollPeriod(id: string) {
  const { data } = await api.post<PayrollPeriod>(`/payroll-periods/${id}/close`)
  return data
}

// Thêm nhân sự MỚI (tạo sau khi kỳ đã mở) vào snapshot — không đụng dòng đã snapshot, chỉ hoạt
// động khi kỳ đang OPEN.
export async function syncPayrollPeriodEmployeeSnapshots(id: string) {
  const { data } = await api.post<{
    addedCount: number
    addedEmployeeNames: string[]
    automaticKpiAssignmentCount: number
  }>(
    `/payroll-periods/${id}/sync-employee-snapshots`,
  )
  return data
}

// ── Tiền kiểm dữ liệu nhân sự ───────────────────────────────────────────────

export type PayrollPeriodEmployeeIssue = {
  id: string
  employeeCode?: string
  fullName: string
  totalWeightPercent: string
  activeTeamCount: number
  primaryTeamCount: number
  reasons: string[]
}

export type PayrollPeriodEmployeeReadiness = {
  periodId: string
  status: PayrollPeriodStatus
  // ALL: soi toàn bộ nhân sự còn làm việc (kỳ Nháp) · MISSING: chỉ người chưa snapshot (kỳ Đang
  // mở) · NONE: kỳ đã qua giai đoạn snapshot.
  scope: 'ALL' | 'MISSING' | 'NONE'
  ready: boolean
  checkedEmployeeCount: number
  invalidEmployeeCount: number
  employees: PayrollPeriodEmployeeIssue[]
}

// Gọi trước khi mở kỳ / đồng bộ để biết ai chưa đủ điều kiện snapshot, thay vì bấm nút rồi mới
// nhận lỗi "Chưa thể snapshot…".
export async function getPayrollPeriodEmployeeReadiness(id: string) {
  const { data } = await api.get<PayrollPeriodEmployeeReadiness>(
    `/payroll-periods/${id}/employee-readiness`,
  )
  return data
}

// ── Employee snapshots ──────────────────────────────────────────────────────

export type ListEmployeeSnapshotsParams = {
  page?: number
  pageSize?: number
}

export async function listPayrollPeriodEmployeeSnapshots(
  id: string,
  params: ListEmployeeSnapshotsParams = {},
) {
  const { data } = await api.get<Paginated<PayrollPeriodEmployeeSnapshot>>(
    `/payroll-periods/${id}/employee-snapshots`,
    { params },
  )
  return data
}
