import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Department, Team } from '@/api/organization'
import type { PayrollPeriod } from '@/api/payroll-periods'
import { listSalaryRecords } from '@/api/salary'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompactMoney, formatMoney, formatNumber, sumAmounts } from '@/lib/format'
import {
  periodDataQuery, toDashboardSalary, type DashboardRevenueRow, type DashboardSalaryRow, type DashboardTrafficRow, type Metric, type PeriodData,
} from './dashboard-data'

type TeamTotal = { id: string; name: string; salary: number; revenue: number; traffic: number }

const METRICS: Record<Metric, { label: string; shortLabel: string; color: string; unit: string }> = {
  salary: { label: 'Quỹ lương', shortLabel: 'Lương', color: '#075aa8', unit: '₫' },
  revenue: { label: 'Doanh thu', shortLabel: 'Doanh thu', color: '#0f7a63', unit: '₫' },
  traffic: { label: 'Traffic hợp lệ', shortLabel: 'Traffic', color: '#b07d32', unit: 'views' },
}
/** Dải đơn sắc theo giá trị giảm dần: nhóm càng lớn càng đậm, mắt đọc thứ hạng ngay trên hình. */
const SHARE_COLORS = ['#082d58', '#0a4c8f', '#1a6cba', '#3f8ad0', '#6aa8e0', '#95c4ec', '#b8d9f4', '#c9a267', '#dcbb8c', '#e8d2ae']
const AXIS_TICK = '#556478'
const GRID_LINE = '#e3e9f2'
const TOOLTIP_STYLE = { borderRadius: 10, borderColor: '#d2dce8', boxShadow: '0 8px 20px rgb(15 23 42 / .08)' } as const

function amount(value: string | null | undefined) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function metricValue(data: PeriodData, metric: Metric, departmentId: string, teamId: string, teamDepartments: Map<string, string>) {
  if (data.failedMetrics?.includes(metric)) return null
  const inScope = (item: { teamId: string | null }) => teamId !== 'all'
    ? item.teamId === teamId
    : departmentId === 'all' || (item.teamId !== null && teamDepartments.get(item.teamId) === departmentId)
  if (metric === 'salary') return sumAmounts(data.salaries.filter(inScope).map((item) => item.salaryRecord?.totalSalaryAmount))
  if (metric === 'revenue') return sumAmounts(data.revenues.filter(inScope).map((item) => item.officialRevenueAmount))
  return sumAmounts(data.traffic.filter(inScope).map((item) => item.acceptedViews))
}

function formatMetric(value: number, metric: Metric) {
  return metric === 'traffic' ? `${formatNumber(value)} views` : formatMoney(value)
}

function formatAxis(value: number, metric: Metric) {
  if (metric !== 'traffic') return formatCompactMoney(value).replace(' ₫', '')
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`
  return formatNumber(value)
}

function percentage(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0
}

function groupTeams(data: PeriodData) {
  const grouped = new Map<string, TeamTotal>()
  function ensure(id: string | null, name: string | null) {
    const key = id ?? 'unassigned'
    let row = grouped.get(key)
    if (!row) {
      row = { id: key, name: name ?? 'Chưa gán team', salary: 0, revenue: 0, traffic: 0 }
      grouped.set(key, row)
    }
    return row
  }
  data.salaries.forEach((item) => {
    const row = ensure(item.teamId, item.teamName)
    row.salary += amount(item.salaryRecord?.totalSalaryAmount)
  })
  data.revenues.forEach((item) => {
    const row = ensure(item.teamId, item.teamName)
    row.revenue += amount(item.officialRevenueAmount)
  })
  data.traffic.forEach((item) => {
    const row = ensure(item.teamId, item.teamName)
    row.traffic += amount(item.acceptedViews)
  })
  return Array.from(grouped.values())
}

export function DashboardCharts({
  periods, period, year, departmentId, selectedDepartmentName, teamId, selectedTeamName, departments, organizationTeams, salaries, revenues, traffic,
  canViewSalary, canViewRevenue, canViewTraffic, showRankings,
}: {
  periods: PayrollPeriod[]
  /** `null` khi xem tất cả kỳ lương trong năm: `salaries`/`revenues`/`traffic` khi đó gộp mọi kỳ. */
  period: PayrollPeriod | null
  year: number
  departmentId: string
  selectedDepartmentName?: string
  teamId: string
  selectedTeamName?: string
  departments: Department[]
  organizationTeams: Team[]
  salaries: DashboardSalaryRow[]
  revenues: DashboardRevenueRow[]
  traffic: DashboardTrafficRow[]
  canViewSalary: boolean
  canViewRevenue: boolean
  canViewTraffic: boolean
  showRankings: boolean
}) {
  const available = (['salary', 'revenue', 'traffic'] as const).filter((metric) =>
    metric === 'salary' ? canViewSalary : metric === 'revenue' ? canViewRevenue : canViewTraffic,
  )
  const [chosenMetric, setChosenMetric] = useState<Metric>('revenue')
  const [chosenEmployeeId, setChosenEmployeeId] = useState('')
  const metric = available.includes(chosenMetric) ? chosenMetric : available[0]
  const currentData = { salaries, revenues, traffic }
  const teamDepartments = new Map(organizationTeams.map((item) => [item.id, item.departmentId]))
  const departmentNames = new Map(departments.map((item) => [item.id, item.name]))
  const chronological = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate))
  // Xem cả năm thì không có kỳ "hiện tại": mọi kỳ đều lấy từ historyQueries, và các phép so sánh với kỳ trước tự bỏ trống.
  const currentIndex = period ? chronological.findIndex((item) => item.id === period.id) : -1
  const timeline = chronological
  const dashboardYear = year
  const history = timeline.filter((item) => item.id !== period?.id)
  const historyQueries = useQueries({
    queries: history.map((item) => periodDataQuery(item.id, { canViewSalary, canViewRevenue, canViewTraffic })),
  })
  const trend = timeline.map((item) => {
    const queryIndex = history.findIndex((previous) => previous.id === item.id)
    const data = queryIndex === -1 ? currentData : historyQueries[queryIndex].data
    return {
      id: item.id,
      name: item.name,
      label: `T${String(item.payrollMonth).padStart(2, '0')}`,
      value: data ? metricValue(data, metric, departmentId, teamId, teamDepartments) : null,
    }
  })
  const salaryTrend = timeline.map((item) => {
    const queryIndex = history.findIndex((previous) => previous.id === item.id)
    const data = queryIndex === -1 ? currentData : historyQueries[queryIndex].data
    return { id: item.id, name: item.name, label: `T${String(item.payrollMonth).padStart(2, '0')}`, value: data ? metricValue(data, 'salary', departmentId, teamId, teamDepartments) : null }
  })
  const historyLoading = historyQueries.some((query) => query.isPending)
  const historyFailed = historyQueries.some((query) => query.isError || Boolean(query.data?.failedMetrics?.length))
  const annualMetricTotal = trend.reduce((sum, item) => sum + (item.value ?? 0), 0)
  const teams = groupTeams(currentData).filter((item) => teamId !== 'all'
    ? item.id === teamId
    : departmentId === 'all' || teamDepartments.get(item.id) === departmentId)
  const ranked = [...teams].sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, 'vi'))
  const scopedSalaries = salaries.filter((item) => teamId !== 'all'
    ? item.teamId === teamId
    : departmentId === 'all' || (item.teamId !== null && teamDepartments.get(item.teamId) === departmentId))
  // Xem cả năm thì mỗi nhân sự có một dòng lương ở từng kỳ, nên cộng dồn theo nhân sự trước khi xếp hạng.
  const employeeSalaries = new Map<string, { employeeId: string; employeeCode: string; employeeName: string; salary: number }>()
  scopedSalaries.forEach((item) => {
    if (!item.salaryRecord) return
    const row = employeeSalaries.get(item.employeeId) ?? { employeeId: item.employeeId, employeeCode: item.employeeCode, employeeName: item.employeeName, salary: 0 }
    row.salary += amount(item.salaryRecord.totalSalaryAmount)
    employeeSalaries.set(item.employeeId, row)
  })
  const selectableEmployees = [...employeeSalaries.values()]
  const topEarners = selectableEmployees
    .filter((item) => item.salary > 0)
    .sort((a, b) => b.salary - a.salary || a.employeeName.localeCompare(b.employeeName, 'vi'))
    .slice(0, 10)
  const selectedEmployee = selectableEmployees.find((item) => item.employeeId === chosenEmployeeId)
  const employeeHistoryPeriods = chronological.filter((item) => item.id !== period?.id && !history.some((recent) => recent.id === item.id))
  const employeeHistoryQueries = useQueries({
    queries: employeeHistoryPeriods.map((item) => ({
      queryKey: ['dashboard-employee-salary-history', selectedEmployee?.employeeId, item.id],
      queryFn: async () => {
        const response = await listSalaryRecords(item.id, { search: selectedEmployee?.employeeCode, pageSize: 100 })
        return response.data.map(toDashboardSalary)
      },
      enabled: Boolean(selectedEmployee),
      staleTime: 60_000,
      retry: 1,
    })),
  })
  const employeeTrend = selectedEmployee ? chronological.map((item) => {
    const recentIndex = history.findIndex((recent) => recent.id === item.id)
    const olderIndex = employeeHistoryPeriods.findIndex((older) => older.id === item.id)
    const current = item.id === period?.id
    const recentQuery = recentIndex >= 0 ? historyQueries[recentIndex] : null
    const olderQuery = olderIndex >= 0 ? employeeHistoryQueries[olderIndex] : null
    const records = current ? salaries : recentQuery ? recentQuery.data?.salaries : olderQuery?.data
    const unavailable = Boolean(recentQuery?.data?.failedMetrics?.includes('salary')) || recentQuery?.isError || olderQuery?.isError
    const record = records?.find((row) => row.employeeId === selectedEmployee.employeeId)?.salaryRecord
    return {
      id: item.id,
      name: item.name,
      label: `T${String(item.payrollMonth).padStart(2, '0')}`,
      value: record ? amount(record.totalSalaryAmount) : null,
      status: unavailable ? 'error' : records === undefined ? 'loading' : record ? 'ready' : 'missing',
    }
  }) : []
  const employeeHistoryLoading = selectedEmployee && employeeTrend.some((item) => item.status === 'loading')
  const employeeHistoryFailed = employeeTrend.some((item) => item.status === 'error')
  const employeePreviousSalary = employeeTrend[currentIndex - 1]?.value
  const employeeCurrentSalary = period
    ? employeeTrend[currentIndex]?.value
    : employeeTrend.reduce((sum, item) => sum + (item.value ?? 0), 0)
  const employeeSalaryChange = employeeCurrentSalary !== null && employeeCurrentSalary !== undefined
    && employeePreviousSalary !== null && employeePreviousSalary !== undefined && employeePreviousSalary > 0
    ? ((employeeCurrentSalary - employeePreviousSalary) / employeePreviousSalary) * 100
    : null
  const salaryGroups = new Map<string, { id: string; name: string; value: number }>()
  salaries.forEach((item) => {
    const value = amount(item.salaryRecord?.totalSalaryAmount)
    if (value <= 0) return
    const itemDepartmentId = item.teamId ? teamDepartments.get(item.teamId) : undefined
    if (departmentId !== 'all' && itemDepartmentId !== departmentId) return
    const id = departmentId === 'all' ? itemDepartmentId ?? 'unknown' : item.teamId ?? 'unknown'
    const name = departmentId === 'all'
      ? departmentNames.get(id) ?? 'Chưa xác định phòng ban'
      : item.teamName ?? organizationTeams.find((team) => team.id === id)?.name ?? 'Chưa gán team'
    const group = salaryGroups.get(id) ?? { id, name, value: 0 }
    group.value += value
    salaryGroups.set(id, group)
  })
  const salaryShares = [...salaryGroups.values()].sort((a, b) => b.value - a.value)
  const salaryShareTotal = salaryShares.reduce((sum, item) => sum + item.value, 0)
  const currentSalary = salaryTrend[currentIndex]?.value
  const previousSalary = salaryTrend[currentIndex - 1]?.value
  const annualSalary = salaryTrend.reduce((sum, item) => sum + (item.value ?? 0), 0)
  const salaryChange = currentSalary !== null && currentSalary !== undefined && previousSalary !== null && previousSalary !== undefined && previousSalary > 0
    ? ((currentSalary - previousSalary) / previousSalary) * 100
    : null
  const totals = {
    salary: teams.reduce((sum, item) => sum + item.salary, 0),
    revenue: teams.reduce((sum, item) => sum + item.revenue, 0),
    traffic: teams.reduce((sum, item) => sum + item.traffic, 0),
  }

  // Phạm vi đã hiện rõ ở bộ lọc trên header, nên phần phụ đề dưới mỗi biểu đồ chỉ nhắc lại thật ngắn.
  const scopeLabel = teamId !== 'all'
    ? selectedTeamName ?? 'Team đã chọn'
    : departmentId !== 'all' ? selectedDepartmentName ?? 'Phòng ban đã chọn' : 'Toàn hệ thống'

  if (available.length === 0) return null

  return (
    <section className="space-y-4" aria-label="Biểu đồ phân tích lương, doanh thu và traffic">
      <h2 className="pt-2 text-lg font-bold tracking-tight text-foreground">Phân tích chi tiết</h2>

      {canViewSalary ? (
        <div className="grid gap-4 xl:grid-cols-5">
          <Card className="py-0 xl:col-span-2">
            <CardContent className="p-5">
              <ChartHeading
                title="Tỷ trọng quỹ lương"
                detail={departmentId === 'all' ? 'Theo phòng ban' : `Theo team · ${selectedDepartmentName ?? 'Phòng ban đã chọn'}`}
              />
              {salaryShareTotal === 0 ? <ChartEmpty text="Chưa có quỹ lương đã tính trong phạm vi này." /> : (
                <>
                  <div className="relative mt-4 h-58 w-full" role="img" aria-label={`Biểu đồ tỷ trọng quỹ lương ${departmentId === 'all' ? 'theo phòng ban' : 'theo team'}`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={salaryShares} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={1} stroke="#fff" strokeWidth={2}>
                          {salaryShares.map((item, index) => <Cell key={item.id} fill={SHARE_COLORS[index % SHARE_COLORS.length]} opacity={teamId === 'all' || item.id === teamId ? 1 : 0.3} />)}
                        </Pie>
                        <Tooltip formatter={(value, name) => [formatMoney(Number(value)), String(name)]} contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[11px] text-muted-foreground">Tổng quỹ lương</span>
                      <strong className="text-lg font-bold tabular-nums" title={formatMoney(salaryShareTotal)}>{formatCompactMoney(salaryShareTotal)}</strong>
                    </div>
                  </div>
                  <ul className="mt-4 max-h-40 space-y-2 overflow-y-auto pr-1" aria-label="Chi tiết tỷ trọng quỹ lương">
                    {salaryShares.map((item, index) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SHARE_COLORS[index % SHARE_COLORS.length] }} aria-hidden="true" /><span className="truncate text-muted-foreground" title={item.name}>{item.name}</span></span>
                        <span className="shrink-0 font-semibold tabular-nums" title={formatMoney(item.value)}>{percentage(item.value, salaryShareTotal).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="py-0 xl:col-span-3">
            <CardContent className="p-5">
              <ChartHeading
                title="Biến động tổng quỹ lương"
                detail={`Riêng quỹ lương · ${scopeLabel}`}
              />
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
                <span className="text-xs text-muted-foreground">Tổng quỹ lương năm {dashboardYear}</span>
                <span className="flex items-baseline gap-2">
                  <strong className="text-lg font-bold tabular-nums" title={historyLoading ? undefined : formatMoney(annualSalary)}>{historyLoading ? 'Đang tổng hợp…' : formatCompactMoney(annualSalary)}</strong>
                  {salaryChange === null ? null : <span className="text-xs font-semibold tabular-nums text-muted-foreground">{salaryChange > 0 ? '+' : ''}{salaryChange.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</span>}
                </span>
              </div>
              {timeline.length < 2 ? <ChartEmpty text="Cần ít nhất 2 kỳ lương để hiển thị biến động." /> : historyLoading ? (
                <Skeleton className="mt-5 h-64 w-full rounded-lg" />
              ) : (
                <div className="mt-5 h-64 w-full" role="img" aria-label="Biểu đồ đường tổng quỹ lương qua từng kỳ">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={salaryTrend} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_LINE} strokeDasharray="3 5" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} minTickGap={12} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} tickFormatter={(value: number) => formatAxis(value, 'salary')} width={60} />
                      <Tooltip formatter={(value) => [formatMoney(Number(value)), 'Tổng quỹ lương']} labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''} contentStyle={TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="value" stroke={METRICS.salary.color} strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {historyFailed ? <p className="mt-2 text-xs text-[var(--warning-700)]">Một số kỳ chưa tải được dữ liệu lương. Điểm tương ứng được để trống.</p> : null}
              {timeline.length >= 2 && !historyLoading ? (
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="w-fit cursor-pointer rounded-sm font-medium transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Xem quỹ lương từng kỳ</summary>
                  <div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-1 pr-3">Kỳ lương</th><th className="py-1 text-right">Tổng quỹ lương</th></tr></thead><tbody>{salaryTrend.map((item) => <tr key={item.id} className="border-t"><td className="py-1.5 pr-3">{item.name}</td><td className="py-1.5 text-right tabular-nums">{item.value === null ? 'Chưa tải được' : formatMoney(item.value)}</td></tr>)}</tbody></table></div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className={`py-0 ${showRankings ? 'xl:col-span-3' : 'xl:col-span-5'}`}>
          <CardContent className="p-5">
            <ChartHeading title={`Xu hướng năm ${dashboardYear}`} detail={`Theo chỉ số đã chọn · ${scopeLabel}`} />
            <MetricTabs available={available} metric={metric} onChange={setChosenMetric} />
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
              <span className="text-xs text-muted-foreground">Tổng {METRICS[metric].label.toLowerCase()} năm {dashboardYear}</span>
              <strong className="text-lg font-bold tabular-nums" title={historyLoading ? undefined : formatMetric(annualMetricTotal, metric)}>
                {historyLoading ? 'Đang tổng hợp…' : metric === 'traffic' ? formatNumber(annualMetricTotal) : formatCompactMoney(annualMetricTotal)}
              </strong>
            </div>
            {timeline.length < 2 ? (
              <ChartEmpty text="Cần ít nhất 2 kỳ lương để hiển thị xu hướng." />
            ) : historyLoading ? (
              <Skeleton className="mt-5 h-64 w-full rounded-lg" />
            ) : trend.every((item) => item.value === null) ? (
              <ChartEmpty text="Chưa có dữ liệu xu hướng cho các kỳ đã chọn." />
            ) : (
              <div className="mt-5 h-64 w-full" role="img" aria-label={`Biểu đồ xu hướng ${METRICS[metric].label.toLowerCase()} qua ${timeline.length} kỳ`}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_LINE} strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} minTickGap={12} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} tickFormatter={(value: number) => formatAxis(value, metric)} width={60} />
                    <Tooltip formatter={(value) => [formatMetric(Number(value), metric), METRICS[metric].label]} labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''} contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="value" stroke={METRICS[metric].color} strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {historyFailed ? <p className="mt-2 text-xs text-[var(--warning-700)]">Một số kỳ chưa tải được dữ liệu. Điểm tương ứng được để trống.</p> : null}
            {timeline.length >= 2 && !historyLoading ? (
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="w-fit cursor-pointer rounded-sm font-medium transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Xem số liệu từng kỳ</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left"><thead><tr><th className="py-1 pr-3">Kỳ lương</th><th className="py-1 text-right">{METRICS[metric].label}</th></tr></thead><tbody>{trend.map((item) => <tr key={item.id} className="border-t"><td className="py-1.5 pr-3">{item.name}</td><td className="py-1.5 text-right tabular-nums">{item.value === null ? 'Chưa tải được' : formatMetric(item.value, metric)}</td></tr>)}</tbody></table>
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>

        {showRankings ? <Card className="py-0 xl:col-span-2">
          <CardContent className="p-5">
            <ChartHeading title="Xếp hạng team" detail={`Theo ${METRICS[metric].label.toLowerCase()} · đổi chỉ số ở biểu đồ xu hướng`} />
            {ranked.length === 0 || totals[metric] === 0 ? <ChartEmpty text={`Chưa có ${METRICS[metric].label.toLowerCase()} để so sánh team.`} /> : (
              <TeamRanking ranked={ranked} metric={metric} total={totals[metric]} />
            )}
          </CardContent>
        </Card> : null}
      </div>

      {canViewSalary ? (
        <div className="grid gap-4 xl:grid-cols-5">
          {showRankings ? <Card className="py-0 xl:col-span-3">
            <CardContent className="p-5">
              <ChartHeading title="Top 10 nhân sự lương cao nhất" detail={`${scopeLabel} · Bấm một người để xem xu hướng`} />
              {topEarners.length === 0 ? <ChartEmpty text="Chưa có bảng lương đã tính trong phạm vi này để xếp hạng." /> : (
                <ol className="mt-4 space-y-1.5" aria-label="Xếp hạng lương nhân sự">
                  {topEarners.map((item, index) => {
                    const salary = item.salary
                    const selected = selectedEmployee?.employeeId === item.employeeId
                    return <li key={item.employeeId}>
                      <button
                        type="button"
                        onClick={() => setChosenEmployeeId(item.employeeId)}
                        aria-pressed={selected}
                        aria-label={`Hạng ${index + 1}: ${item.employeeName}, ${formatMoney(salary)}. Xem xu hướng lương`}
                        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${selected ? 'border-primary/35 bg-primary/5' : 'border-transparent hover:bg-muted/40'}`}
                      >
                        <span className="flex items-center gap-3">
                          <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={item.employeeName}>{item.employeeName}</span>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-foreground" title={formatMoney(salary)}>{formatCompactMoney(salary)}</span>
                        </span>
                        <span className="mt-2 ml-9 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-primary/85 transition-[width] duration-300" style={{ width: `${percentage(salary, topEarners[0].salary)}%` }} /></span>
                      </button>
                    </li>
                  })}
                </ol>
              )}
            </CardContent>
          </Card> : null}

          <Card className={`py-0 ${showRankings ? 'xl:col-span-2' : 'xl:col-span-5'}`}>
            <CardContent className="p-5">
              <ChartHeading title="Xu hướng lương nhân sự" detail="Lương đã tính qua các kỳ" />
              <Select value={selectedEmployee?.employeeId} onValueChange={setChosenEmployeeId} disabled={selectableEmployees.length === 0}>
                <SelectTrigger className="mt-4 w-full" aria-label="Chọn nhân sự xem xu hướng lương"><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger>
                <SelectContent searchPlaceholder="Tìm theo tên nhân sự..." emptySearchMessage="Không tìm thấy nhân sự phù hợp.">{[...selectableEmployees].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'vi')).map((item) => <SelectItem key={item.employeeId} value={item.employeeId}>{item.employeeName}</SelectItem>)}</SelectContent>
              </Select>
              {!selectedEmployee ? <ChartEmpty text={showRankings ? 'Chọn một nhân sự trong top 10 hoặc từ danh sách để xem biến động lương.' : 'Chọn một nhân sự từ danh sách để xem biến động lương.'} /> : (
                <>
                  <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
                    <span className="min-w-0 truncate text-xs text-muted-foreground" title={selectedEmployee.employeeName}>{selectedEmployee.employeeName}{period ? null : ` · tổng năm ${dashboardYear}`}</span>
                    <span className="flex items-baseline gap-2">
                      <strong className="text-lg font-bold tabular-nums" title={formatMoney(employeeCurrentSalary)}>{formatCompactMoney(employeeCurrentSalary)}</strong>
                      {employeeSalaryChange !== null ? <span className="text-xs font-semibold tabular-nums text-muted-foreground">{employeeSalaryChange > 0 ? '+' : ''}{employeeSalaryChange.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</span> : null}
                    </span>
                  </div>
                  {employeeHistoryLoading ? <Skeleton className="mt-5 h-64 w-full rounded-lg" /> : employeeTrend.filter((item) => item.value !== null).length < 2 ? (
                    <ChartEmpty text="Chưa đủ 2 kỳ có lương đã tính để hiển thị xu hướng." />
                  ) : (
                    <div className="mt-5 w-full overflow-x-auto" role="img" aria-label={`Biểu đồ đường xu hướng lương của ${selectedEmployee.employeeName} qua các kỳ`}>
                      <div className="h-64" style={{ minWidth: Math.max(360, employeeTrend.length * 48) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={employeeTrend} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke={GRID_LINE} strokeDasharray="3 5" vertical={false} />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} minTickGap={12} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: AXIS_TICK, fontSize: 11 }} tickFormatter={(value: number) => formatAxis(value, 'salary')} width={60} />
                            <Tooltip formatter={(value) => [formatMoney(Number(value)), 'Lương đã tính']} labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''} contentStyle={TOOLTIP_STYLE} />
                            <Line type="monotone" dataKey="value" stroke={METRICS.salary.color} strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {employeeHistoryFailed ? <p className="mt-2 text-xs text-[var(--warning-700)]">Một số kỳ chưa tải được lương của nhân sự. Điểm tương ứng được để trống.</p> : null}
                  {!employeeHistoryLoading ? <details className="mt-3 text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm font-medium transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Xem lương từng kỳ</summary><div className="mt-2 max-h-55 overflow-y-auto"><table className="w-full text-left"><thead><tr><th className="py-1 pr-3">Kỳ lương</th><th className="py-1 text-right">Lương đã tính</th></tr></thead><tbody>{employeeTrend.map((item) => <tr key={item.id} className="border-t"><td className="py-1.5 pr-3">{item.name}</td><td className="py-1.5 text-right tabular-nums">{item.status === 'error' ? 'Không tải được' : item.value === null ? 'Chưa có lương' : formatMoney(item.value)}</td></tr>)}</tbody></table></div></details> : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  )
}

function formatCompactMetric(value: number, metric: Metric) {
  return metric === 'traffic' ? `${formatAxis(value, 'traffic')} views` : formatCompactMoney(value)
}

/**
 * Danh sách xếp hạng thay cho biểu đồ cột: tên team dài không bị gãy dòng, số liệu đọc ngay không
 * cần rê chuột, và team bằng 0 không chiếm một hàng trống mỗi team.
 */
function TeamRanking({ ranked, metric, total }: { ranked: TeamTotal[]; metric: Metric; total: number }) {
  const withValue = ranked.filter((item) => item[metric] > 0)
  const withoutValue = ranked.filter((item) => item[metric] <= 0)
  const top = withValue[0]?.[metric] ?? 0
  const label = METRICS[metric].label.toLowerCase()

  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <span className="text-xs text-muted-foreground">
          {formatNumber(withValue.length)}/{formatNumber(ranked.length)} team có {label}
        </span>
        <strong className="text-lg font-bold tabular-nums" title={formatMetric(total, metric)}>{formatCompactMetric(total, metric)}</strong>
      </div>
      <ol className="mt-3 max-h-96 space-y-1 overflow-y-auto pr-1" aria-label={`Xếp hạng ${label} giữa các team`}>
        {withValue.map((item, index) => {
          const value = item[metric]
          return (
            <li key={item.id} className="px-1 py-2">
              <div className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={item.name}>{item.name}</span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-foreground" title={formatMetric(value, metric)}>{formatCompactMetric(value, metric)}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground" title="Tỷ trọng trong tổng">
                  {percentage(value, total).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%
                </span>
              </div>
              <span className="mt-1.5 ml-9 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className="block h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${percentage(value, top)}%`, backgroundColor: METRICS[metric].color }}
                />
              </span>
            </li>
          )
        })}
      </ol>
      {withoutValue.length ? (
        <details className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded-sm font-medium transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            {formatNumber(withoutValue.length)} team chưa có {label}
          </summary>
          <p className="mt-2 leading-5">{withoutValue.map((item) => item.name).join(', ')}</p>
        </details>
      ) : null}
    </>
  )
}

function ChartHeading({ title, detail }: { title: string; detail: string }) {
  return <div><h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}

function MetricTabs({ available, metric, onChange }: { available: Metric[]; metric: Metric; onChange: (value: Metric) => void }) {
  return <div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Chọn chỉ số biểu đồ">{available.map((item) => <button key={item} type="button" onClick={() => onChange(item)} aria-pressed={metric === item} className={`min-h-9 flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring ${metric === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{METRICS[item].shortLabel}</button>)}</div>
}

function ChartEmpty({ text }: { text: string }) {
  return <div className="mt-4 flex min-h-42 items-center justify-center rounded-lg border border-dashed bg-muted/20 px-5 text-center text-sm text-muted-foreground">{text}</div>
}
