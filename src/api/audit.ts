import type { Paginated } from '@/api/access-control'
import { api } from '@/api/client'

export type AuditLog = {
  id: string
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  targetEmployeeId: string | null
  payrollPeriodId: string | null
  beforeData: unknown
  afterData: unknown
  reason: string | null
  createdAt: string
  actor: {
    id: string
    fullName: string
    email: string
    employee: {
      employeeCode: string
      jobTitle: string
      team: { name: string; department: { name: string } }
    } | null
    userRoles: Array<{ role: { name: string } }>
  }
  targetEmployee: {
    id: string
    employeeCode: string
    fullName: string
    jobTitle: string
    employmentStatus: string
    joinedAt: string | null
    leftAt: string | null
    team: { id: string; code: string; name: string; department: { name: string } }
    leader: { id: string; fullName: string } | null
    manager: { id: string; fullName: string } | null
    employeeGroups: Array<{ id: string; name: string }>
  } | null
  payrollPeriod: {
    id: string
    code: string
    name: string
    status: string
    startDate: string
    endDate: string
    approvalDeadline: string | null
  } | null
  references?: {
    teams: Array<{ id: string; name: string }>
    employees: Array<{ id: string; fullName: string }>
    employeeGroups: Array<{ id: string; name: string }>
  }
}

export type AuditFilters = {
  page?: number
  pageSize?: number
  search?: string
  action?: string
  payrollPeriodId?: string
  dateFrom?: string
  dateTo?: string
}

function toParams(filters: AuditFilters) {
  return { ...filters, payrollPeriodId: filters.payrollPeriodId ? Number(filters.payrollPeriodId) : undefined }
}

export async function listAuditLogs(filters: AuditFilters = {}) {
  const { data } = await api.get<Paginated<AuditLog>>('/audit-logs', { params: toParams(filters) })
  return data
}

export async function getAuditLog(id: string) {
  const { data } = await api.get<AuditLog>(`/audit-logs/${id}`)
  return data
}

export async function exportAuditLogs(filters: Omit<AuditFilters, 'page' | 'pageSize'> = {}) {
  const { data } = await api.get<Blob>('/audit-logs/export', {
    params: toParams(filters), responseType: 'blob',
  })
  return data
}
