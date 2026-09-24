import type { Paginated } from '@/api/access-control'
import { api } from '@/api/client'
import type { TrafficPlatform } from '@/api/traffic'

export { getApiErrorMessage } from '@/api/client'

export type TrafficSyncStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED'
export type TrafficSyncItemStatus = 'SUCCESS' | 'SKIPPED' | 'FAILED' | 'CONFLICT'

export type TrafficSyncRun = {
  id: string
  payrollPeriodId: string
  dateFrom: string
  dateTo: string
  externalTeamName: string | null
  status: TrafficSyncStatus
  startedAt: string
  finishedAt: string | null
  receivedRows: number
  matchedEmployees: number
  unmatchedRows: number
  successfulRecords: number
  skippedRecords: number
  conflictRecords: number
  failedRecords: number
  warningCount: number
  sourceWarnings: Array<{ code: string; email: string | null; message: string }> | null
  errorSummary: string | null
  payrollPeriod: { id: string; code: string; name: string }
  triggeredBy: { id: string; fullName: string }
}

export type TrafficSyncRunItem = {
  id: string
  externalRecordKey: string
  externalEmail: string | null
  externalName: string | null
  externalTeam: string | null
  platform: TrafficPlatform | null
  sourceReportDate: string | null
  resultStatus: TrafficSyncItemStatus
  /** BigInt được BE trả về dưới dạng chuỗi. */
  previousViews: string | null
  incomingViews: string | null
  appliedViews: string | null
  hasConflict: boolean
  message: string | null
  employee: { id: string; fullName: string } | null
}

export type TrafficSyncRunDetail = TrafficSyncRun & { items: TrafficSyncRunItem[] }

export async function listTrafficSyncRuns(params: { page?: number; pageSize?: number } = {}) {
  const { data } = await api.get<Paginated<TrafficSyncRun>>('/traffic-sync-runs', { params })
  return data
}

export async function getTrafficSyncRun(id: string) {
  const { data } = await api.get<TrafficSyncRunDetail>(`/traffic-sync-runs/${id}`)
  return data
}

export type TrafficSyncTeams = {
  /** Chỉ tài khoản phạm vi toàn hệ thống mới được kéo traffic không lọc team. */
  canSyncAllTeams: boolean
  teams: Array<{ id: string; code: string; name: string; externalId: string }>
}

export async function listTrafficSyncTeams() {
  const { data } = await api.get<TrafficSyncTeams>('/traffic-sync-runs/teams')
  return data
}

export async function triggerTrafficSync(input: {
  payrollPeriodId: string
  externalTeamName?: string
}) {
  const { data } = await api.post<TrafficSyncRun>('/traffic-sync-runs', {
    payrollPeriodId: Number(input.payrollPeriodId),
    ...(input.externalTeamName ? { externalTeamName: input.externalTeamName } : {}),
  })
  return data
}
