import type { ScopeType, UserRoleAssignment, UserStatus } from '@/types'
import { api } from '@/api/client'

export { getApiErrorMessage } from '@/api/client'

export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type Paginated<T> = {
  data: T[]
  meta: PaginationMeta
}

export type Permission = {
  id: string
  code: string
  name: string
  description: string | null
}

export type RolePermissionLink = {
  roleId: string
  permissionId: string
  permission: Permission
}

export type Role = {
  id: string
  code: string
  name: string
  description: string | null
  isSystemRole: boolean
  createdAt: string
  rolePermissions: RolePermissionLink[]
}

export type UserSummary = {
  id: string
  // employeeId/employee: nhân sự liên kết với tài khoản (null = tài khoản thuần hệ thống, chưa gắn).
  employeeId: string | null
  employee: { id: string; employeeCode: string; fullName: string } | null
  email: string
  fullName: string
  status: UserStatus
  lastLoginAt: string | null
  roles: UserRoleAssignment[]
  permissions: string[]
}

export type Team = {
  id: string
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
}

// ── Users ───────────────────────────────────────────────────────────────────

export type ListUsersParams = {
  page?: number
  pageSize?: number
}

export async function listUsers(params: ListUsersParams = {}) {
  const { data } = await api.get<Paginated<UserSummary>>('/users', { params })
  return data
}

export type CreateUserInput = {
  email: string
  password: string
  status?: UserStatus
  // Gắn nhân sự ngay lúc tạo (không bắt buộc).
  employeeId?: string
  // Vai trò + phạm vi dữ liệu gán ngay lúc tạo:
  //  - bỏ trống (undefined): BE tự suy vai trò mặc định theo nhóm nghiệp vụ của nhân sự (nếu có
  //    employeeId) — thường là STAFF "Nhân viên" với scope SELF; nhân sự không có nhóm → 0 vai trò.
  //  - [] : tạo tài khoản KHÔNG vai trò một cách tường minh.
  //  - có phần tử: dùng đúng danh sách này.
  roles?: RoleAssignmentInput[]
}

export async function createUser(input: CreateUserInput) {
  const { data } = await api.post<UserSummary>('/users', input)
  return data
}

export type UpdateUserInput = {
  email?: string
  fullName?: string
  status?: UserStatus
  // undefined = không đổi liên kết hiện tại; null = gỡ liên kết; uuid = gắn/đổi nhân sự.
  employeeId?: string | null
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const { data } = await api.patch<UserSummary>(`/users/${id}`, input)
  return data
}

export type RoleAssignmentInput = {
  roleId: string
  scopeType: ScopeType
  scopeTeamId?: string
}

export async function setUserRoles(id: string, roles: RoleAssignmentInput[]) {
  const { data } = await api.put<UserSummary>(`/users/${id}/roles`, { roles })
  return data
}

// ── Roles ───────────────────────────────────────────────────────────────────

export async function listRoles() {
  const { data } = await api.get<Role[]>('/roles')
  return data
}

export type CreateRoleInput = {
  name: string
  description?: string
}

export async function createRole(input: CreateRoleInput) {
  const { data } = await api.post<Role>('/roles', input)
  return data
}

export type UpdateRoleInput = {
  name?: string
  description?: string
}

export async function updateRole(id: string, input: UpdateRoleInput) {
  const { data } = await api.patch<Role>(`/roles/${id}`, input)
  return data
}

export async function setRolePermissions(id: string, permissionCodes: string[]) {
  const { data } = await api.put<Role>(`/roles/${id}/permissions`, { permissionCodes })
  return data
}

// ── Permissions ─────────────────────────────────────────────────────────────

export async function listPermissions() {
  const { data } = await api.get<Permission[]>('/permissions')
  return data
}

// ── Teams ───────────────────────────────────────────────────────────────────

export async function listTeams() {
  const { data } = await api.get<Team[]>('/teams')
  return data
}
