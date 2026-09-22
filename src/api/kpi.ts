import { api } from '@/api/client'
import type { EmployeeGroupRef } from '@/api/employee-groups'

export { getApiErrorMessage } from '@/api/client'

export type KpiDataSource = 'INTERNAL' | 'AUTOMATION_GEN_VIDEO'

export type KpiGroup = {
  id: string
  code: string
  name: string
  description: string | null
  dataSource: KpiDataSource
  applicableEmployeeGroups: EmployeeGroupRef[]
  isActive: boolean
  createdByUserId: string
  createdAt: string
  updatedAt: string
  // Rỗng chỉ xuất hiện với nhóm dữ liệu cũ, được hiểu là áp dụng toàn hệ thống.
  teams: Array<{ id: string; code: string; name: string }>
  // Chỉ có ở listKpiGroups() — GET /kpi-groups include _count.items.
  _count?: { items: number }
}

export type KpiItem = {
  id: string
  kpiGroupId: string
  code: string
  name: string
  unit: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type KpiGroupDetail = KpiGroup & { items: KpiItem[] }

// Prisma Decimal serializes to string trong JSON — targetValue không giả định number.
export type KpiPeriodTarget = {
  id: string
  payrollPeriodId: string
  kpiItemId: string
  kpiItemCode: string
  kpiItemName: string
  kpiItemUnit: string
  kpiGroupId: string
  kpiGroupCode: string
  kpiGroupName: string
  targetValue: string
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

// ── KPI groups ────────────────────────────────────────────────────────────────

export async function listKpiGroups() {
  const { data } = await api.get<KpiGroup[]>('/kpi-groups')
  return data
}

export async function getKpiGroup(id: string) {
  const { data } = await api.get<KpiGroupDetail>(`/kpi-groups/${id}`)
  return data
}

export type CreateKpiGroupInput = {
  name: string
  description?: string
  dataSource?: KpiDataSource
  // Chỉ nhận nhóm nghiệp vụ cùng phòng ban với teamIds (hoặc nhóm dùng chung mọi phòng ban).
  applicableEmployeeGroupIds?: string[]
  teamIds: string[]
}

export async function createKpiGroup(input: CreateKpiGroupInput) {
  const { data } = await api.post<KpiGroup>('/kpi-groups', input)
  return data
}

export type UpdateKpiGroupInput = {
  name?: string
  description?: string
  dataSource?: KpiDataSource
  applicableEmployeeGroupIds?: string[]
  teamIds?: string[]
  isActive?: boolean
}

export async function updateKpiGroup(id: string, input: UpdateKpiGroupInput) {
  const { data } = await api.patch<KpiGroup>(`/kpi-groups/${id}`, input)
  return data
}

// Xóa cứng nhóm KPI — chỉ ADMIN (quyền `kpi.delete_group`). BE trả 409 nếu nhóm đã phát sinh
// dữ liệu (assignment/target/actual/đề xuất); khi đó dùng "Sửa nhóm" để tắt (isActive=false).
export async function deleteKpiGroup(id: string) {
  await api.delete(`/kpi-groups/${id}`)
}

// ── KPI items ─────────────────────────────────────────────────────────────────

export type CreateKpiItemInput = {
  name: string
  unit: string
  sortOrder?: number
}

export async function createKpiItem(groupId: string, input: CreateKpiItemInput) {
  const { data } = await api.post<KpiItem>(`/kpi-groups/${groupId}/items`, input)
  return data
}

export type UpdateKpiItemInput = {
  name?: string
  unit?: string
  sortOrder?: number
  isActive?: boolean
}

export async function updateKpiItem(id: string, input: UpdateKpiItemInput) {
  const { data } = await api.patch<KpiItem>(`/kpi-items/${id}`, input)
  return data
}

// ── KPI period targets ──────────────────────────────────────────────────────

export async function listKpiTargetsForPeriod(periodId: string) {
  const { data } = await api.get<KpiPeriodTarget[]>(`/payroll-periods/${periodId}/kpi-targets`)
  return data
}

export async function setKpiPeriodTarget(periodId: string, kpiItemId: string, targetValue: number) {
  const { data } = await api.put<KpiPeriodTarget>(
    `/payroll-periods/${periodId}/kpi-items/${kpiItemId}/target`,
    { targetValue },
  )
  return data
}

// Target riêng của một nhân sự trong kỳ. BE kiểm tra actor có scope TEAM/ALL; target này sẽ
// được ưu tiên khi tính tiến độ KPI, còn target theo kỳ là giá trị mặc định/fallback.
export async function setEmployeeKpiTarget(
  periodId: string,
  employeeId: string,
  kpiItemId: string,
  targetValue: number,
  teamId?: string,
) {
  const { data } = await api.put(
    `/payroll-periods/${periodId}/employees/${employeeId}/kpi-items/${kpiItemId}/target`,
    { targetValue },
    { params: teamId ? { teamId } : undefined },
  )
  return data
}

export async function overrideEmployeeKpiTarget(
  periodId: string,
  employeeId: string,
  kpiItemId: string,
  input: { overrideValue: number; reason: string },
  teamId?: string,
) {
  const { data } = await api.post(
    `/payroll-periods/${periodId}/employees/${employeeId}/kpi-items/${kpiItemId}/target/override`,
    input,
    { params: teamId ? { teamId } : undefined },
  )
  return data
}

export async function clearEmployeeKpiTargetOverride(periodId: string, employeeId: string, kpiItemId: string, teamId?: string) {
  const { data } = await api.delete(
    `/payroll-periods/${periodId}/employees/${employeeId}/kpi-items/${kpiItemId}/target/override`,
    { params: teamId ? { teamId } : undefined },
  )
  return data
}

// ── KPI assignments (M07) ────────────────────────────────────────────────────

export type KpiAssignmentStatus = 'ASSIGNED' | 'CANCELLED'

export type KpiAssignment = {
  id: string
  employeeId: string
  kpiGroupId: string
  payrollPeriodId: string
  teamId: string
  assignmentStatus: KpiAssignmentStatus
  assignedByUserId: string
  assignedAt: string
  // Chỉ có ở listKpiAssignments() — GET .../kpi-assignments include employee/kpiGroup rút gọn.
  employee?: { id: string; employeeCode: string; fullName: string }
  kpiGroup?: { id: string; code: string; name: string }
  team?: { id: string; code: string; name: string }
}

export async function listKpiAssignments(periodId: string, employeeId?: string, teamId?: string) {
  const { data } = await api.get<KpiAssignment[]>(`/payroll-periods/${periodId}/kpi-assignments`, {
    params: { ...(employeeId ? { employeeId } : {}), ...(teamId ? { teamId } : {}) },
  })
  return data
}

export async function createKpiAssignment(periodId: string, input: { employeeId: string; kpiGroupId: string; teamId?: string }) {
  const { data } = await api.post<KpiAssignment>(`/payroll-periods/${periodId}/kpi-assignments`, input)
  return data
}

export async function cancelKpiAssignment(periodId: string, assignmentId: string) {
  await api.delete(`/payroll-periods/${periodId}/kpi-assignments/${assignmentId}`)
}

// ── KPI actuals & kpi-profile (M07) ──────────────────────────────────────────

export type KpiActualDataSource = 'MANUAL' | 'AUTOMATION_GEN_VIDEO'
export type SelfConfirmationStatus = 'DRAFT' | 'CONFIRMED'
export type LeaderReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type KpiProfileItem = {
  actualId: string | null
  kpiItemId: string
  kpiItemCode: string
  kpiItemName: string
  kpiItemUnit: string
  // targetValue/actualValue/overrideValue: Decimal Prisma — string (hoặc null) trong JSON.
  targetValue: string | null
  targetOriginalValue: string | null
  targetOverrideValue: string | null
  targetOverrideReason: string | null
  targetSource: 'EMPLOYEE' | 'PERIOD' | 'NONE'
  targetDataSource: KpiActualDataSource | null
  targetSyncedAt: string | null
  actualValue: string | null
  overrideValue: string | null
  overrideReason: string | null
  // effectiveActualValue/cappedActualValue: BE đã tính sẵn — number thật, không phải Decimal.
  effectiveActualValue: number
  cappedActualValue: number
  selfAssessment: string | null
  selfConfirmationStatus: SelfConfirmationStatus
  leaderReviewStatus: LeaderReviewStatus
  leaderRejectionReason: string | null
  dataSource: KpiActualDataSource
  syncedAt: string | null
  requiresManualEntry: boolean
  manualEnteredAt: string | null
  syncMessage: string | null
}

export type KpiProfileGroup = {
  assignmentId: string
  teamId: string
  teamCode: string
  teamName: string
  kpiGroupId: string
  kpiGroupCode: string
  kpiGroupName: string
  dataSource: KpiDataSource
  // null nếu group chưa có target nào (tránh chia 0) — BE đã tính sẵn.
  progressPercent: number | null
  items: KpiProfileItem[]
}

export type KpiProfile = {
  employeeId: string
  payrollPeriodId: string
  groups: KpiProfileGroup[]
}

export async function getKpiProfile(periodId: string, employeeId: string) {
  const { data } = await api.get<KpiProfile>(
    `/payroll-periods/${periodId}/employees/${employeeId}/kpi-profile`,
  )
  return data
}

export async function updateKpiActual(id: string, input: { actualValue: number; selfAssessment?: string }) {
  const { data } = await api.put(`/employee-kpi-actuals/${id}`, input)
  return data
}

export async function selfConfirmKpiActual(id: string) {
  const { data } = await api.post(`/employee-kpi-actuals/${id}/self-confirm`)
  return data
}

export async function overrideKpiActual(id: string, input: { overrideValue: number; reason: string }) {
  const { data } = await api.post(`/employee-kpi-actuals/${id}/override`, input)
  return data
}

export async function manualEnterKpiActual(id: string, input: { actualValue: number; note?: string }) {
  const { data } = await api.post(`/employee-kpi-actuals/${id}/manual-entry`, input)
  return data
}

export async function leaderApproveKpiGroup(groupId: string, employeeId: string, periodId: string, teamId?: string) {
  const { data } = await api.post(
    `/kpi-groups/${groupId}/employees/${employeeId}/periods/${periodId}/leader-approve`,
    undefined,
    { params: teamId ? { teamId } : undefined },
  )
  return data
}

export async function leaderRejectKpiGroup(
  groupId: string,
  employeeId: string,
  periodId: string,
  reason: string,
  teamId?: string,
) {
  const { data } = await api.post(
    `/kpi-groups/${groupId}/employees/${employeeId}/periods/${periodId}/leader-reject`,
    { reason },
    { params: teamId ? { teamId } : undefined },
  )
  return data
}
