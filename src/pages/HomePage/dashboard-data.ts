import type { Paginated } from '@/api/access-control'
import { listRevenue, type EmployeeRevenue } from '@/api/revenue'
import { listSalaryRecords, type SalaryListItem, type SalaryRecord } from '@/api/salary'
import { listTraffic, type TrafficListItem } from '@/api/traffic'

export type Metric = 'salary' | 'revenue' | 'traffic'

// Tổng quan chỉ cần vài trường mỗi dòng, nhưng phải giữ dòng của mọi nhân sự ở mọi kỳ trong năm.
// Rút gọn ngay khi từng trang về để cache không ôm nguyên bản ghi lương (~30 trường, kèm người tính/duyệt).
export type DashboardSalaryRow = Pick<SalaryListItem, 'employeeId' | 'employeeCode' | 'employeeName' | 'teamId' | 'teamName'> & {
  salaryRecord: Pick<SalaryRecord, 'status' | 'totalSalaryAmount'> | null
}
export type DashboardRevenueRow = Pick<EmployeeRevenue, 'employeeId' | 'teamId' | 'teamName' | 'officialRevenueAmount'>
export type DashboardTrafficRow = Pick<TrafficListItem, 'employeeId' | 'teamId' | 'teamName' | 'acceptedViews'>

export type PeriodData = { salaries: DashboardSalaryRow[]; revenues: DashboardRevenueRow[]; traffic: DashboardTrafficRow[]; failedMetrics?: Metric[] }
export type MetricAccess = { canViewSalary: boolean; canViewRevenue: boolean; canViewTraffic: boolean }

export function toDashboardSalary(item: SalaryListItem): DashboardSalaryRow {
  return {
    employeeId: item.employeeId,
    employeeCode: item.employeeCode,
    employeeName: item.employeeName,
    teamId: item.teamId,
    teamName: item.teamName,
    salaryRecord: item.salaryRecord ? { status: item.salaryRecord.status, totalSalaryAmount: item.salaryRecord.totalSalaryAmount } : null,
  }
}

export function toDashboardRevenue(item: EmployeeRevenue): DashboardRevenueRow {
  return { employeeId: item.employeeId, teamId: item.teamId, teamName: item.teamName, officialRevenueAmount: item.officialRevenueAmount }
}

export function toDashboardTraffic(item: TrafficListItem): DashboardTrafficRow {
  return { employeeId: item.employeeId, teamId: item.teamId, teamName: item.teamName, acceptedViews: item.acceptedViews }
}

// Xu hướng cả năm cần mỗi kỳ × 3 loại dữ liệu × số trang request. Bắn cùng lúc sẽ chiếm hết pool kết
// nối DB của BE (dùng chung cho mọi người dùng) và làm trình duyệt máy yếu giữ hàng chục response cùng
// lúc, nên xếp hàng: chỉ chạy tối đa 4 request, request xong mới nhường chỗ cho request kế tiếp.
const MAX_CONCURRENT_REQUESTS = 4
let activeRequests = 0
const waitingRequests: Array<() => void> = []

async function limitConcurrency<T>(task: () => Promise<T>): Promise<T> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) activeRequests += 1
  else await new Promise<void>((resolve) => waitingRequests.push(resolve))
  try {
    return await task()
  } finally {
    // Trao thẳng chỗ cho request đang chờ, để request mới gọi chen vào không vượt giới hạn.
    const next = waitingRequests.shift()
    if (next) next()
    else activeRequests -= 1
  }
}

export async function loadAllPages<T, R>(fetchPage: (page: number) => Promise<Paginated<T>>, toRow: (item: T) => R): Promise<R[]> {
  const first = await limitConcurrency(() => fetchPage(1))
  const firstRows = first.data.map(toRow)
  if (first.meta.totalPages <= 1) return firstRows
  const rest = await Promise.all(Array.from({ length: first.meta.totalPages - 1 }, (_, index) =>
    limitConcurrency(() => fetchPage(index + 2)).then((page) => page.data.map(toRow))))
  return firstRows.concat(...rest)
}

export function loadDashboardSalaries(periodId: string) {
  return loadAllPages((page) => listSalaryRecords(periodId, { page, pageSize: 100 }), toDashboardSalary)
}

export function loadDashboardRevenues(periodId: string) {
  return loadAllPages((page) => listRevenue(periodId, { page, pageSize: 100 }), toDashboardRevenue)
}

export function loadDashboardTraffic(periodId: string) {
  return loadAllPages((page) => listTraffic(periodId, { page, pageSize: 100 }), toDashboardTraffic)
}

/**
 * Lương, doanh thu và traffic của một kỳ. Biểu đồ xu hướng và chế độ "tất cả kỳ lương trong năm"
 * dùng chung queryKey này nên mỗi kỳ chỉ tải một lần dù xem theo kỳ hay cả năm.
 */
export function periodDataQuery(periodId: string, { canViewSalary, canViewRevenue, canViewTraffic }: MetricAccess) {
  return {
    queryKey: ['dashboard-chart-history', periodId, canViewSalary, canViewRevenue, canViewTraffic],
    queryFn: async (): Promise<PeriodData> => {
      const [salaries, revenues, traffic] = await Promise.allSettled([
        canViewSalary ? loadDashboardSalaries(periodId) : Promise.resolve([]),
        canViewRevenue ? loadDashboardRevenues(periodId) : Promise.resolve([]),
        canViewTraffic ? loadDashboardTraffic(periodId) : Promise.resolve([]),
      ])
      return {
        salaries: salaries.status === 'fulfilled' ? salaries.value : [],
        revenues: revenues.status === 'fulfilled' ? revenues.value : [],
        traffic: traffic.status === 'fulfilled' ? traffic.value : [],
        failedMetrics: [
          salaries.status === 'rejected' ? 'salary' : null,
          revenues.status === 'rejected' ? 'revenue' : null,
          traffic.status === 'rejected' ? 'traffic' : null,
        ].filter((metric): metric is Metric => metric !== null),
      }
    },
    staleTime: 60_000,
    retry: 1,
  }
}
