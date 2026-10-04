import { api } from '@/api/client'

export type TaskComplianceSource = 'AUTO_A4' | 'DAILY_PLAN'

export type TaskComplianceRecord = {
  id: string
  user_id: string
  employee_id: string | null
  user_name: string
  team_id: string
  work_date: string
  content_line: { id: string; name: string }
  source: TaskComplianceSource
  expected_count: number
  completed_count: number
  missing_count: number
  deadline: string
  evaluated_at: string
}

export type TaskComplianceResponse = {
  contract_version: string
  generated_at: string
  timezone: string
  range: { from: string; to: string }
  team: { id: string; name: string }
  filters: { user_id: string | null }
  coverage: {
    snapshot_count: number
    evaluated_from: string | null
    evaluated_through: string | null
  }
  summary: {
    expected: number
    completed_on_time: number
    missing: number
    affected_days: number
    affected_records: number
  }
  records: TaskComplianceRecord[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
  warnings: Array<{ code: string; user_id?: string; message: string }>
  local_context: {
    payroll_period_id: number
    employee_id: number
    team_id: number
    team_name: string
  }
}

export async function getTaskCompliance(
  periodId: string,
  employeeId: string,
  params: { teamId?: string | null; page: number; pageSize: number },
) {
  const { data } = await api.get<TaskComplianceResponse>(
    `/payroll-periods/${periodId}/employees/${employeeId}/task-compliance`,
    {
      params: {
        page: params.page,
        pageSize: params.pageSize,
        ...(params.teamId ? { teamId: params.teamId } : {}),
      },
    },
  )
  return data
}
