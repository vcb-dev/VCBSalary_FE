import { lazy, Suspense, useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileClock,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  Wallet,
  TrendingUp,
  Eye,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { listDepartments, listTeams } from '@/api/organization'
import { listPayrollPeriods, listPayrollPeriodYears } from '@/api/payroll-periods'
import { useAuth } from '@/auth/AuthContext'
import { hasAnyPermission, PAGE_PERMISSIONS } from '@/auth/permission-config'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { usePayrollPeriodSelection } from '@/contexts/PayrollPeriodContext'

import { formatCompactMoney, formatMoney, formatNumber, sumAmounts } from '@/lib/format'
import { selectDefaultPayrollPeriod } from '@/lib/payroll-period'
import { toneSurface } from '@/lib/tone'
import {
  loadDashboardRevenues, loadDashboardSalaries, loadDashboardTraffic, periodDataQuery, type DashboardSalaryRow,
} from './dashboard-data'

/** Giá trị của lựa chọn "Tất cả kỳ lương trong năm" trong ô chọn kỳ. */
const WHOLE_YEAR = 'all'

const DashboardCharts = lazy(() => import('./DashboardCharts').then((module) => ({ default: module.DashboardCharts })))
const MemberDashboard = lazy(() => import('./MemberDashboard').then((module) => ({ default: module.MemberDashboard })))

export function HomePage() {
  const queryClient = useQueryClient()
  const { periods: allPeriods, selectedPeriod, selectedPeriodId, selectPeriod } = usePayrollPeriodSelection()
  const chosenYear = selectedPeriod?.payrollYear ?? new Date().getFullYear()
  const [chosenDepartmentId, setChosenDepartmentId] = useState('all')
  const [chosenTeamId, setChosenTeamId] = useState('all')
  // Chế độ cả năm gắn với kỳ đang chọn lúc bật nó: đổi kỳ ở ô chọn kỳ trên thanh trên cùng sẽ tự quay về xem một kỳ.
  const [wholeYearAnchorId, setWholeYearAnchorId] = useState<string | null>(null)
  const wholeYear = wholeYearAnchorId !== null && wholeYearAnchorId === selectedPeriodId
  const { user } = useAuth()
  const permissions = user?.permissions ?? []
  const role = user?.roles.map((item) => item.roleName).join(', ') || 'Chưa gán vai trò'
  const can = (permission: string) => permissions.includes(permission)
  const canViewSalary = hasAnyPermission(permissions, ['salary.view_team', 'salary.view_all'])
  const canViewOwnSalary = can('salary.view_self')
  const canViewRevenue = hasAnyPermission(permissions, ['revenue.view_team', 'revenue.view_all'])
  const canViewTraffic = hasAnyPermission(permissions, ['traffic.view_team', 'traffic.view_all'])
  const canExport = can('report.export')
  const canViewCompanyDashboard = (user?.roles.some((item) => item.scopeType === 'ALL') ?? false)
    && hasAnyPermission(permissions, [
      'employee.view_all', 'traffic.view_all', 'revenue.view_all', 'salary.view_all',
    ])
  const canViewTeamDashboard = (user?.roles.some((item) => item.scopeType === 'TEAM') ?? false)
    && hasAnyPermission(permissions, ['traffic.view_team', 'revenue.view_team', 'salary.view_team'])
  const canViewAnalyticsDashboard = canViewCompanyDashboard || canViewTeamDashboard

  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', 'dashboard', chosenYear],
    queryFn: () => listPayrollPeriods({ year: chosenYear, pageSize: 12 }),
    staleTime: 30_000,
  })
  const yearsQuery = useQuery({
    queryKey: ['payroll-periods', 'years'],
    queryFn: listPayrollPeriodYears,
    staleTime: 60_000,
  })
  const periods = periodsQuery.data?.data ?? []
  const availableYears = Array.from(new Set([new Date().getFullYear(), ...(yearsQuery.data ?? [])])).sort((a, b) => b - a)
  const period = periods.find((item) => item.id === selectedPeriodId) ?? selectDefaultPayrollPeriod(periods)

  function changeYear(year: number) {
    const nextPeriod = selectDefaultPayrollPeriod(allPeriods.filter((item) => item.payrollYear === year))
    if (!nextPeriod) return
    selectPeriod(nextPeriod.id)
    // Đang xem cả năm thì đổi năm vẫn giữ nguyên chế độ cả năm.
    if (wholeYear) setWholeYearAnchorId(nextPeriod.id)
  }

  function choosePeriod(value: string) {
    if (value !== WHOLE_YEAR) {
      setWholeYearAnchorId(null)
      selectPeriod(value)
      return
    }
    if (!period) return
    // Chốt kỳ đang xem thành lựa chọn tường minh, để kỳ mặc định có đổi khi danh sách tải lại cũng không tắt chế độ cả năm.
    selectPeriod(period.id)
    setWholeYearAnchorId(period.id)
  }
  const departmentsQuery = useQuery({
    queryKey: ['departments', 'dashboard'],
    queryFn: listDepartments,
    enabled: canViewAnalyticsDashboard,
    staleTime: 60_000,
  })
  const teamsQuery = useQuery({
    queryKey: ['teams', 'dashboard'],
    queryFn: listTeams,
    enabled: canViewAnalyticsDashboard,
    staleTime: 60_000,
  })
  const salaryQuery = useQuery({
    queryKey: ['salary-records', period?.id, 'dashboard-all'],
    queryFn: () => loadDashboardSalaries(period!.id),
    enabled: canViewAnalyticsDashboard && canViewSalary && Boolean(period) && !wholeYear,
    staleTime: 30_000,
  })
  const revenueQuery = useQuery({
    queryKey: ['revenue', period?.id, 'dashboard-all'],
    queryFn: () => loadDashboardRevenues(period!.id),
    enabled: canViewAnalyticsDashboard && canViewRevenue && Boolean(period) && !wholeYear,
    staleTime: 30_000,
  })
  const trafficQuery = useQuery({
    queryKey: ['traffic', period?.id, 'dashboard-all'],
    queryFn: () => loadDashboardTraffic(period!.id),
    enabled: canViewAnalyticsDashboard && canViewTraffic && Boolean(period) && !wholeYear,
    staleTime: 30_000,
  })
  // Cùng queryKey với biểu đồ xu hướng, nên bật chế độ cả năm không tải lại kỳ nào biểu đồ đã có.
  const wholeYearPeriods = wholeYear && canViewAnalyticsDashboard
    ? [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate))
    : []
  const wholeYearQueries = useQueries({
    queries: wholeYearPeriods.map((item) => periodDataQuery(item.id, { canViewSalary, canViewRevenue, canViewTraffic })),
  })

  if (!canViewAnalyticsDashboard) {
    if (canViewOwnSalary && user?.employeeId) {
      return <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}><MemberDashboard
        periods={periods}
        currentPeriod={period}
        employeeId={user.employeeId}
        fullName={user.fullName}
        role={role}
        year={chosenYear}
        availableYears={availableYears}
        onYearChange={changeYear}
        periodsLoading={periodsQuery.isLoading}
        periodsError={periodsQuery.isError}
      /></Suspense>
    }
    return <PersonalWorkspace role={role} fullName={user?.fullName} permissions={permissions} />
  }

  const wholeYearData = wholeYearQueries.flatMap((query) => query.data ? [query.data] : [])
  const allSalaries = wholeYear ? wholeYearData.flatMap((item) => item.salaries) : salaryQuery.data ?? []
  const allRevenues = wholeYear ? wholeYearData.flatMap((item) => item.revenues) : revenueQuery.data ?? []
  const allTraffic = wholeYear ? wholeYearData.flatMap((item) => item.traffic) : trafficQuery.data ?? []
  const roleTeamIds = new Set(user?.roles.filter((item) => item.scopeType === 'TEAM' && item.scopeTeamId).map((item) => item.scopeTeamId!) ?? [])
  const dataTeamIds = new Set([...allSalaries, ...allRevenues, ...allTraffic].flatMap((item) => item.teamId ? [item.teamId] : []))
  const organizationTeams = (teamsQuery.data ?? []).filter((item) => canViewCompanyDashboard || roleTeamIds.has(item.id) || dataTeamIds.has(item.id))
  const scopedDepartmentIds = new Set(organizationTeams.map((item) => item.departmentId))
  const departments = (departmentsQuery.data ?? []).filter((item) => canViewCompanyDashboard || scopedDepartmentIds.has(item.id))
  const departmentId = !canViewCompanyDashboard && chosenDepartmentId === 'all' && departments.length === 1
    ? departments[0].id
    : chosenDepartmentId === 'all' || departments.some((item) => item.id === chosenDepartmentId) ? chosenDepartmentId : 'all'
  const visibleTeams = organizationTeams.filter((item) => departmentId !== 'all' && item.departmentId === departmentId).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  const teamId = !canViewCompanyDashboard && chosenTeamId === 'all' && visibleTeams.length === 1
    ? visibleTeams[0].id
    : visibleTeams.some((item) => item.id === chosenTeamId) ? chosenTeamId : 'all'
  const teamDepartment = new Map(organizationTeams.map((item) => [item.id, item.departmentId]))
  const inScope = (item: { teamId: string | null }) => teamId !== 'all'
    ? item.teamId === teamId
    : departmentId === 'all' || (item.teamId !== null && teamDepartment.get(item.teamId) === departmentId)
  const salaries = allSalaries.filter(inScope)
  const revenues = allRevenues.filter(inScope)
  const traffic = allTraffic.filter(inScope)
  // Đếm theo nhân sự chứ không theo dòng: xem cả năm thì mỗi người có một dòng ở từng kỳ.
  const employeeTotal = new Set([...salaries, ...revenues, ...traffic].map((item) => item.employeeId)).size
  const totalAmount = sumAmounts(salaries.map((item) => item.salaryRecord?.totalSalaryAmount))
  const totalRevenue = sumAmounts(revenues.map((item) => item.officialRevenueAmount))
  const acceptedViews = sumAmounts(traffic.map((item) => item.acceptedViews))
  const scopeNote = wholeYear ? 'cả năm' : 'trong kỳ'

  const loadingPeriods = periodsQuery.isLoading
  const loadingData = loadingPeriods || departmentsQuery.isLoading || teamsQuery.isLoading || (wholeYear
    ? wholeYearQueries.some((query) => query.isLoading)
    : salaryQuery.isLoading || revenueQuery.isLoading || trafficQuery.isLoading)
  const refreshing = periodsQuery.isFetching || salaryQuery.isFetching || revenueQuery.isFetching
    || trafficQuery.isFetching || departmentsQuery.isFetching || teamsQuery.isFetching
    || wholeYearQueries.some((query) => query.isFetching)
  const hasError = periodsQuery.isError || departmentsQuery.isError || teamsQuery.isError || (wholeYear
    ? wholeYearQueries.some((query) => query.isError || Boolean(query.data?.failedMetrics?.length))
    : salaryQuery.isError || revenueQuery.isError || trafficQuery.isError)

  function refreshAll() {
    void periodsQuery.refetch()
    // Ở chế độ cả năm, dữ liệu từng kỳ nằm trong 'dashboard-chart-history' và được làm mới ở dưới.
    if (!wholeYear) {
      void salaryQuery.refetch()
      void revenueQuery.refetch()
      void trafficQuery.refetch()
    }
    void departmentsQuery.refetch()
    void teamsQuery.refetch()
    void queryClient.invalidateQueries({ queryKey: ['dashboard-chart-history'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard-employee-salary-history'] })
  }

  function exportSalaryCsv() {
    const header = ['Mã nhân sự', 'Nhân sự', 'Team', 'Trạng thái', 'Tổng lương']
    const salaryRow = (item: DashboardSalaryRow) => [item.employeeCode, item.employeeName, item.teamName ?? '', item.salaryRecord?.status ?? 'CHƯA TÍNH', item.salaryRecord?.totalSalaryAmount ?? '']
    // Cả năm thì giữ từng dòng theo kỳ và thêm cột kỳ lương, để file đối chiếu lại được với bảng lương từng tháng.
    const rows = wholeYear
      ? [['Kỳ lương', ...header], ...wholeYearPeriods.flatMap((item, index) => (wholeYearQueries[index]?.data?.salaries ?? []).filter(inScope).map((row) => [item.name, ...salaryRow(row)]))]
      : [header, ...salaries.map(salaryRow)]
    downloadCsv(wholeYear ? `tong-quan-luong-nam-${chosenYear}.csv` : `tong-quan-luong-${period?.code ?? 'chua-co-ky'}.csv`, rows)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={period ? `${canViewTeamDashboard && !canViewCompanyDashboard ? 'Tổng quan team' : 'Kỳ lương'} · ${wholeYear ? `Cả năm ${chosenYear}` : period.code}` : 'Trung tâm điều hành'}
        title={period ? `Tổng quan năm ${chosenYear}` : `Chưa có kỳ lương năm ${chosenYear}`}
        description={!period
          ? 'Chọn một năm có dữ liệu để xem tổng quan và xu hướng theo tháng.'
          : wholeYear
            ? `Lương, doanh thu và traffic cộng dồn ${formatNumber(periods.length)} kỳ lương năm ${chosenYear}, kèm xu hướng theo tháng.`
            : `Lương, doanh thu và traffic của ${period.name.toLowerCase()}, kèm xu hướng 12 tháng.`}
        meta={period ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {role}
            </span>
            <span className="text-xs text-muted-foreground">{loadingData ? 'Đang tải…' : `${formatNumber(employeeTotal)} nhân sự`}</span>
          </>
        ) : null}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={refreshAll} disabled={refreshing} title="Làm mới dữ liệu" aria-label="Làm mới dữ liệu tổng quan">
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
            {canExport && salaries.length > 0 ? (
              <Button variant="outline" size="icon" onClick={exportSalaryCsv} title="Xuất CSV bảng lương" aria-label="Xuất CSV bảng lương">
                <Download className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
            <Button asChild>
              <Link to="/payroll-periods">Xem kỳ lương <ChevronRight className="size-4" /></Link>
            </Button>
          </div>
        )}
        filtersLabel="Bộ lọc tổng quan"
        filters={(
          // 4 ô trên một hàng khi header đủ chỗ; hẹp hơn thì lưới 2 cột rồi 1 cột. `@3xl` theo container của PageHeader.
          <div className="grid w-full gap-2 sm:grid-cols-2 @3xl:flex @3xl:w-auto">
            <Select value={String(chosenYear)} onValueChange={(value) => changeYear(Number(value))}>
              <SelectTrigger className="w-full @3xl:w-30" aria-label="Chọn năm thống kê"><SelectValue /></SelectTrigger>
              <SelectContent>{availableYears.map((year) => <SelectItem key={year} value={String(year)}>Năm {year}</SelectItem>)}</SelectContent>
            </Select>
            {period ? <Select value={wholeYear ? WHOLE_YEAR : period.id} onValueChange={choosePeriod}>
              <SelectTrigger className="w-full @3xl:w-56" aria-label="Chọn kỳ lương"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_YEAR}>Tất cả kỳ lương trong năm</SelectItem>
                <SelectSeparator />
                {periods.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select> : null}
            {!canViewCompanyDashboard && teamId !== 'all' ? (
              <span className="inline-flex min-h-9 min-w-0 items-center rounded-lg bg-muted px-3 text-sm font-medium text-foreground @3xl:max-w-50">
                <span className="truncate">{visibleTeams.find((item) => item.id === teamId)?.name ?? 'Team của tôi'}</span>
              </span>
            ) : null}
            {period && canViewCompanyDashboard ? <Select value={departmentId} onValueChange={(value) => { setChosenDepartmentId(value); setChosenTeamId('all') }} disabled={departmentsQuery.isLoading}>
              <SelectTrigger className="w-full @3xl:w-44" aria-label="Chọn phòng ban"><SelectValue /></SelectTrigger>
              <SelectContent>
                {canViewCompanyDashboard || departments.length > 1 ? <SelectItem value="all">Tất cả phòng ban</SelectItem> : null}
                {departments.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select> : null}
            {period && canViewCompanyDashboard ? <Select value={teamId} onValueChange={setChosenTeamId} disabled={departmentId === 'all' || visibleTeams.length === 0}>
              <SelectTrigger className="w-full @3xl:w-50" aria-label="Chọn team"><SelectValue /></SelectTrigger>
              <SelectContent>
                {canViewCompanyDashboard || visibleTeams.length > 1 ? <SelectItem value="all">{departmentId === 'all' ? 'Chọn phòng ban trước' : 'Tất cả team'}</SelectItem> : null}
                {visibleTeams.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select> : null}
          </div>
        )}
      />

      {hasError ? (
        <ErrorState
          description="Một phần dữ liệu tổng quan chưa tải được. Các chỉ số bên dưới có thể chưa đầy đủ."
          onRetry={refreshAll}
          retrying={refreshing}
        />
      ) : null}

      {!period && !loadingPeriods ? (
        <Card className="py-0">
          <EmptyState
            icon={CalendarPlus}
            title="Chưa có kỳ lương nào"
            description="Tạo kỳ lương đầu tiên để hệ thống bắt đầu thu thập traffic, doanh thu và tính lương cho nhân sự."
            action={<Button asChild><Link to="/payroll-periods"><CalendarPlus className="size-4" />Tạo kỳ lương</Link></Button>}
          />
        </Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số tổng quan">
            {canViewSalary ? (
              <MetricCard
                icon={Wallet}
                tone="info"
                label="Quỹ lương"
                value={formatCompactMoney(totalAmount)}
                valueTitle={formatMoney(totalAmount)}
                note={`Tổng bảng lương đã tính ${scopeNote}`}
                loading={loadingData}
                href="/salary-records"
              />
            ) : null}
            {canViewSalary && canViewRevenue ? (
              <MetricCard
                icon={TrendingUp}
                tone="info"
                label="Tỷ lệ lương / doanh thu"
                value={totalRevenue > 0 ? `${((totalAmount / totalRevenue) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` : '—'}
                note={`Chi phí lương trên doanh thu ${scopeNote}`}
                loading={loadingData}
              />
            ) : null}
            {canViewRevenue ? (
              <MetricCard
                icon={CircleDollarSign}
                tone="info"
                label="Doanh thu"
                value={formatCompactMoney(totalRevenue)}
                valueTitle={formatMoney(totalRevenue)}
                note={`Doanh thu chính thức ghi nhận ${scopeNote}`}
                loading={loadingData}
                href="/traffic-revenue"
              />
            ) : null}
            {canViewTraffic ? (
              <MetricCard
                icon={Eye}
                tone="info"
                label="Traffic hợp lệ"
                value={formatNumber(acceptedViews)}
                note={`Lượt xem đã duyệt ${scopeNote}`}
                loading={loadingData}
                href="/traffic-revenue"
              />
            ) : null}
          </section>

          {loadingData ? <DashboardSkeleton /> : null}

          {period && !loadingData ? (
            <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}><DashboardCharts
              periods={periods}
              period={wholeYear ? null : period}
              year={chosenYear}
              departmentId={departmentId}
              selectedDepartmentName={departments.find((item) => item.id === departmentId)?.name}
              teamId={teamId}
              selectedTeamName={visibleTeams.find((item) => item.id === teamId)?.name}
              departments={departments}
              organizationTeams={organizationTeams}
              salaries={allSalaries}
              revenues={allRevenues}
              traffic={allTraffic}
              canViewSalary={canViewSalary}
              canViewRevenue={canViewRevenue}
              canViewTraffic={canViewTraffic}
              showRankings={canViewCompanyDashboard}
            /></Suspense>
          ) : null}

        </>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Đang tải dữ liệu tổng quan">
      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="py-0 xl:col-span-3"><CardContent className="space-y-4 p-5"><Skeleton className="h-5 w-44" /><Skeleton className="h-8 w-full" /><Skeleton className="h-52 w-full rounded-lg" /></CardContent></Card>
        <Card className="py-0 xl:col-span-2"><CardContent className="space-y-4 p-5"><Skeleton className="h-5 w-36" /><Skeleton className="h-9 w-28" /><Skeleton className="h-52 w-full rounded-lg" /></CardContent></Card>
      </section>
    </div>
  )
}

function PersonalWorkspace({ role, fullName, permissions }: { role: string; fullName?: string; permissions: string[] }) {
  const areas = [
    { title: 'Hồ sơ nhân sự', detail: 'Xem thông tin trong phạm vi được cấp', href: '/employees', icon: UsersRound, anyOf: PAGE_PERMISSIONS.employees },
    { title: 'KPI & OKR', detail: 'Theo dõi, cập nhật và xử lý hiệu suất', href: '/kpi-okr', icon: ClipboardCheck, anyOf: PAGE_PERMISSIONS.kpiOkr },
    { title: 'Traffic & doanh thu', detail: 'Nhập liệu và theo dõi dữ liệu đầu vào', href: '/traffic-revenue', icon: CircleDollarSign, anyOf: PAGE_PERMISSIONS.trafficRevenue },
    { title: 'Lương của tôi / team', detail: 'Xem bảng lương trong phạm vi được cấp', href: '/salary-records', icon: FileClock, anyOf: PAGE_PERMISSIONS.salaryRecords },
    { title: 'Hiệu suất team', detail: 'Theo dõi dữ liệu tổng hợp của team', href: '/team-performance', icon: CheckCircle2, anyOf: PAGE_PERMISSIONS.teamPerformance },
  ].filter((item) => hasAnyPermission(permissions, item.anyOf))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Không gian làm việc"
        title={`Xin chào, ${fullName ?? 'bạn'}`}
        description="Các chức năng bên dưới được hiển thị theo vai trò và phạm vi dữ liệu đã cấp cho tài khoản của bạn."
        meta={(
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {role}
          </span>
        )}
        action={<Button asChild><Link to="/payroll-periods">Xem kỳ lương <ChevronRight className="size-4" /></Link></Button>}
      />

      {areas.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {areas.map((area) => (
            <Link
              key={area.href}
              to={area.href}
              className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/35 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className={`grid size-10 place-items-center rounded-xl ${toneSurface.info}`}>
                <area.icon className="size-5" aria-hidden="true" />
              </span>
              <strong className="mt-4 flex items-center gap-1 group-hover:text-primary">
                {area.title}
                <ChevronRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </strong>
              <span className="mt-1 block text-sm text-muted-foreground">{area.detail}</span>
            </Link>
          ))}
        </section>
      ) : (
        <Card className="py-0">
          <EmptyState
            icon={ShieldCheck}
            title="Tài khoản chưa được cấp chức năng nào"
            description="Vai trò hiện tại chưa có quyền truy cập dữ liệu. Liên hệ quản trị hệ thống để được cấp quyền phù hợp."
          />
        </Card>
      )}
    </div>
  )
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
