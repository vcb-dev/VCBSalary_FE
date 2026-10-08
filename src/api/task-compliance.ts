import { api } from '@/api/client'

export type TaskComplianceSource = 'AUTO_A4' | 'DAILY_PLAN'

/** Trạng thái hiện tại của task, nên có thể là task nộp bù sau khi số thiếu đã chốt. */
export type TaskComplianceTask = {
  id: string
  title: string | null
  product_name: string | null
  status: string
  deadline: string | null
  submitted_at: string | null
  on_time: boolean
}

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
  /** Phần thiếu không ứng với task nào: kế hoạch tuyến là task chưa tạo, A4 là task đã huỷ/xoá. */
  untracked_missing: number
  tasks: TaskComplianceTask[]
}

export type TaskComplianceCounts = {
  expected: number
  completed: number
  missing: number
}

/** Một ngày có tuyến bị thiếu, giống một dòng của màn "Nhiệm vụ còn thiếu" bên VCBI. */
export type TaskComplianceDay = {
  key: string
  work_date: string
  user_id: string
  employee_id: string | null
  user_name: string
  /** Chỉ cộng các tuyến thiếu. */
  expected_count: number
  completed_count: number
  missing_count: number
  /** Cộng mọi tuyến đã chốt trong ngày, kể cả tuyến đủ. */
  day_total: TaskComplianceCounts
  /** Mọi tuyến của ngày, tuyến thiếu nhiều nhất đứng đầu. */
  lines: TaskComplianceRecord[]
}

export type TaskComplianceResponse = {
  contract_version: string
  generated_at: string
  timezone: string
  range: { from: string; to: string }
  team: { id: string; name: string }
  filters: { user_id: string | null; group_by: 'person_day' }
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
  /** Tổng chỉ trên các tuyến bị thiếu; tỷ lệ hoàn thành cả kỳ vẫn lấy từ `summary`. */
  shortfall_summary: TaskComplianceCounts & { person_days: number; lines: number }
  records: TaskComplianceRecord[]
  /** Phân trang theo ngày: `pagination.total` là số ngày bị thiếu. */
  days: TaskComplianceDay[]
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
