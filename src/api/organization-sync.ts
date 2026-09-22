import { api } from '@/api/client'

export type OrganizationSyncStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED'

export type OrganizationSyncRun = {
  id: string
  externalTeamId: string
  status: OrganizationSyncStatus
  startedAt: string
  finishedAt: string | null
  totalRecords: number
  successfulRecords: number
  failedRecords: number
  errorSummary: string | null
  createdAt: string
}

export type OrganizationSyncBatchResult = {
  totalTeams: number
  successfulTeams: number
  partialTeams: number
  failedTeams: number
  failedTeamIds: string[]
  runs: OrganizationSyncRun[]
}

export async function triggerAllOrganizationSync() {
  const { data } = await api.post<OrganizationSyncBatchResult>('/organization-sync/teams')
  return data
}

export async function triggerOrganizationSync(externalTeamId: string) {
  const { data } = await api.post<OrganizationSyncRun>(
    `/organization-sync/teams/${encodeURIComponent(externalTeamId)}`,
  )
  return data
}
