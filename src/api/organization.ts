import { api } from '@/api/client'
import type { Paginated } from '@/api/access-control'
import type { EmployeeGroupRef } from '@/api/employee-groups'

export { getApiErrorMessage } from '@/api/client'
export type { Paginated } from '@/api/access-control'

export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'LEFT'
export type TeamStatus = 'ACTIVE' | 'INACTIVE'
export type DepartmentStatus = 'ACTIVE' | 'INACTIVE'

export type Department = {
  id: string
  code: string
  name: string
  status: DepartmentStatus
  createdAt: string
  updatedAt: string
  _count?: { teams: number }
}

export type Team = {
  id: string
  code: string
  name: string
  status: TeamStatus
  departmentId: string
  department: Department
  sourceSystem: string | null
  externalId: string | null
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Employee = {
  id: string
  employeeCode: string
  fullName: string
  jobTitle: string
  teamId: string
  leaderEmployeeId: string | null
  managerEmployeeId: string | null
  employeeGroups: EmployeeGroupRef[]
  employmentStatus: EmploymentStatus
  joinedAt: string | null
  leftAt: string | null
  sourceSystem: string | null
  externalId: string | null
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
  team: Team
  teamMemberships: EmployeeTeamMembership[]
  externalIdentities: Array<{
    sourceSystem: string
    externalUserId: string
    externalEmployeeCode: string | null
    lastKnownEmail: string | null
  }>
  // Tài khoản đăng nhập đã gắn với nhân sự này (null nếu chưa gắn).
  user: { id: string; email: string; status: 'ACTIVE' | 'LOCKED' | 'DISABLED' } | null
}

export type EmployeeTeamMembership = {
  id: string
  employeeId: string
  teamId: string
  isPrimary: boolean
  defaultSalaryWeightPercent: string
  leaderEmployeeId: string | null
  managerEmployeeId: string | null
  joinedAt: string | null
  leftAt: string | null
  isActive: boolean
  sourceSystem: string | null
  team: Team
  leader: { id: string; employeeCode: string; fullName: string } | null
  manager: { id: string; employeeCode: string; fullName: string } | null
}

// ── Employees ───────────────────────────────────────────────────────────────

export type ListEmployeesParams = {
  page?: number
  pageSize?: number
  search?: string
  teamId?: string
  jobTitle?: string
  employmentStatus?: EmploymentStatus
  // Bỏ nhân sự đã nghỉ (LEFT) khỏi kết quả — dùng cho các dropdown chọn nhân sự.
  excludeLeft?: boolean
  leaderEmployeeId?: string
  managerEmployeeId?: string
}

export async function listEmployees(params: ListEmployeesParams = {}) {
  const { data } = await api.get<Paginated<Employee>>('/employees', { params })
  return data
}

// Không có chức danh: BE lấy tên các nhóm nghiệp vụ làm chức danh hiển thị.
export type CreateEmployeeInput = {
  fullName: string
  employeeGroupIds?: string[]
  teamId: string
  leaderEmployeeId?: string | null
  managerEmployeeId?: string | null
  employmentStatus?: EmploymentStatus
  joinedAt?: string | null
}

export async function createEmployee(input: CreateEmployeeInput) {
  const { data } = await api.post<Employee>('/employees', input)
  return data
}

export type UpdateEmployeeInput = {
  fullName?: string
  employeeGroupIds?: string[]
  teamId?: string
  leaderEmployeeId?: string | null
  managerEmployeeId?: string | null
  employmentStatus?: EmploymentStatus
  joinedAt?: string | null
  leftAt?: string | null
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput) {
  const { data } = await api.patch<Employee>(`/employees/${id}`, input)
  return data
}

export type UpsertEmployeeTeamMembershipInput = {
  teamId: string
  isPrimary?: boolean
  salaryWeightPercent: number
  leaderEmployeeId?: string | null
  managerEmployeeId?: string | null
  joinedAt?: string | null
}

export async function upsertEmployeeTeamMembership(
  employeeId: string,
  input: UpsertEmployeeTeamMembershipInput,
) {
  const { data } = await api.post<EmployeeTeamMembership>(
    `/employees/${employeeId}/team-memberships`,
    input,
  )
  return data
}

export async function deactivateEmployeeTeamMembership(employeeId: string, teamId: string) {
  await api.delete(`/employees/${employeeId}/team-memberships/${teamId}`)
}

// ── Teams ───────────────────────────────────────────────────────────────────

export async function listTeams() {
  const { data } = await api.get<Team[]>('/teams')
  return data
}

export type CreateTeamInput = {
  name: string
  departmentId: string
  status?: TeamStatus
}

export async function createTeam(input: CreateTeamInput) {
  const { data } = await api.post<Team>('/teams', input)
  return data
}

export type UpdateTeamInput = {
  name?: string
  departmentId?: string
  status?: TeamStatus
}

export async function updateTeam(id: string, input: UpdateTeamInput) {
  const { data } = await api.patch<Team>(`/teams/${id}`, input)
  return data
}

// Xóa cứng team. BE trả 409 kèm số lượng nếu team còn nhân sự, còn phân quyền lấy team làm phạm vi,
// hoặc còn nhóm KPI áp dụng; trả 400 với team đồng bộ từ AutomationGenVideo (sync sẽ tạo lại).
export async function deleteTeam(id: string) {
  await api.delete(`/teams/${id}`)
}

// ── Departments ─────────────────────────────────────────────────────────────

export async function listDepartments() {
  const { data } = await api.get<Department[]>('/departments')
  return data
}

export type CreateDepartmentInput = {
  name: string
  status?: DepartmentStatus
}

export async function createDepartment(input: CreateDepartmentInput) {
  const { data } = await api.post<Department>('/departments', input)
  return data
}

export type UpdateDepartmentInput = {
  name?: string
  status?: DepartmentStatus
}

export async function updateDepartment(id: string, input: UpdateDepartmentInput) {
  const { data } = await api.patch<Department>(`/departments/${id}`, input)
  return data
}

export async function deleteDepartment(id: string) {
  await api.delete(`/departments/${id}`)
}
