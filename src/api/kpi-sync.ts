import { api } from '@/api/client'
import type { Paginated } from '@/api/access-control'

export { getApiErrorMessage } from '@/api/client'

export type KpiSyncStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED'
export type KpiSyncItemStatus = 'SUCCESS' | 'SKIPPED' | 'FAILED' | 'CONFLICT'

export type KpiSyncRun = {
  id: string
  externalTeamId: string
  payrollPeriodId: string
  month: string
  status: KpiSyncStatus
  startedAt: string
  finishedAt: string | null
  receivedRecords: number
  successfulRecords: number
  skippedRecords: number
  conflictRecords: number
  failedRecords: number
  manualEntryCount: number
  warningCount: number
  sourceWarnings: Array<{ code: string; user_id?: string; message: string }> | null
  errorSummary: string | null
  payrollPeriod: { id: string; code: string; name: string; status: string }
  triggeredBy: { id: string; fullName: string }
}

export type KpiSyncRunItem = {
  id: string
  externalRecordKey: string
  externalEmployeeCode: string | null
  groupCode: string
  metricCode: string
  recordKind: 'TARGET' | 'ACTUAL'
  resultStatus: KpiSyncItemStatus
  previousValue: string | null
  incomingValue: string | null
  appliedValue: string | null
  hasConflict: boolean
  manualEntryRequired: boolean
  message: string | null
  employee: { id: string; employeeCode: string; fullName: string } | null
  kpiItem: { id: string; code: string; name: string } | null
}

export type KpiSyncRunDetail = KpiSyncRun & { items: KpiSyncRunItem[] }

export async function listKpiSyncRuns(params: { page?: number; pageSize?: number } = {}) {
  const { data } = await api.get<Paginated<KpiSyncRun>>('/kpi-sync-runs', { params })
  return data
}

export async function getKpiSyncRun(id: string) {
  const { data } = await api.get<KpiSyncRunDetail>(`/kpi-sync-runs/${id}`)
  return data
}

export async function triggerKpiSync(input: { externalTeamId: string; payrollPeriodId: string }) {
  const { data } = await api.post<KpiSyncRun>('/kpi-sync-runs', {
    externalTeamId: input.externalTeamId,
    payrollPeriodId: Number(input.payrollPeriodId),
  })
  return data
}
