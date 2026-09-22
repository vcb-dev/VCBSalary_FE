import { api } from '@/api/client'
import type { Paginated } from '@/api/access-control'

export type RevenueActor = {
  id: string
  fullName: string
}

export type EmployeeRevenue = {
  id: string | null
  employeeId: string
  payrollPeriodId: string
  employeeCode: string
  employeeName: string
  jobTitle: string
  teamId: string | null
  teamName: string | null
  officialRevenueAmount: string | null
  enteredBy: RevenueActor | null
  enteredAt: string | null
  lastUpdatedBy: RevenueActor | null
  updatedAt: string | null
}

export type ListRevenueParams = {
  page?: number
  pageSize?: number
  search?: string
  teamId?: string
}

export async function listRevenue(periodId: string, params: ListRevenueParams = {}) {
  const { data } = await api.get<Paginated<EmployeeRevenue>>(
    `/payroll-periods/${periodId}/revenue`,
    { params },
  )
  return data
}

export async function getEmployeeRevenue(periodId: string, employeeId: string) {
  const { data } = await api.get<EmployeeRevenue>(
    `/payroll-periods/${periodId}/employees/${employeeId}/revenue`,
  )
  return data
}

export async function putEmployeeRevenue(
  periodId: string,
  employeeId: string,
  officialRevenueAmount: string,
) {
  const { data } = await api.put<EmployeeRevenue>(
    `/payroll-periods/${periodId}/employees/${employeeId}/revenue`,
    { officialRevenueAmount },
  )
  return data
}
