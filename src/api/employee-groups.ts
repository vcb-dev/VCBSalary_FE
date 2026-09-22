import { api } from '@/api/client'
import type { Department } from '@/api/organization'

export { getApiErrorMessage } from '@/api/client'

export type EmployeeGroupStatus = 'ACTIVE' | 'INACTIVE'

/**
 * Nhóm nghiệp vụ dùng để tự động gán KPI khi mở kỳ. Danh mục do Admin/HR quản lý:
 * `departmentId = null` là nhóm dùng chung mọi phòng ban, có giá trị thì chỉ chọn được trong
 * phòng ban đó.
 */
export type EmployeeGroup = {
  id: string
  code: string
  name: string
  description: string | null
  departmentId: string | null
  defaultRoleId: string | null
  // Từ khóa chức danh (đã bỏ dấu, viết hoa) để tự đoán nhóm khi tạo nhân sự không chọn nhóm.
  jobTitleKeywords: string[]
  status: EmployeeGroupStatus
  createdAt: string
  updatedAt: string
  department: Department | null
  defaultRole: { id: string; code: string; name: string } | null
  _count: { employees: number; kpiGroups: number }
}

/** Dạng rút gọn trả kèm nhân sự và nhóm KPI. */
export type EmployeeGroupRef = {
  id: string
  code: string
  name: string
  departmentId: string | null
  defaultRoleId?: string | null
}

export type ListEmployeeGroupsParams = {
  // Lọc theo phòng ban trả về cả nhóm dùng chung — đúng tập nhóm gán được cho phòng ban đó.
  departmentId?: string
  status?: EmployeeGroupStatus
}

export async function listEmployeeGroups(params: ListEmployeeGroupsParams = {}) {
  const { data } = await api.get<EmployeeGroup[]>('/employee-groups', { params })
  return data
}

export type CreateEmployeeGroupInput = {
  name: string
  description?: string
  departmentId?: string | null
  defaultRoleId?: string | null
  jobTitleKeywords?: string[]
  status?: EmployeeGroupStatus
}

export async function createEmployeeGroup(input: CreateEmployeeGroupInput) {
  const { data } = await api.post<EmployeeGroup>('/employee-groups', input)
  return data
}

export type UpdateEmployeeGroupInput = Partial<CreateEmployeeGroupInput>

export async function updateEmployeeGroup(id: string, input: UpdateEmployeeGroupInput) {
  const { data } = await api.patch<EmployeeGroup>(`/employee-groups/${id}`, input)
  return data
}

// BE trả 409 nếu nhóm đang được nhân sự hoặc nhóm KPI dùng — khi đó chuyển status=INACTIVE.
export async function deleteEmployeeGroup(id: string) {
  await api.delete(`/employee-groups/${id}`)
}
