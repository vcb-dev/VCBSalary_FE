import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown, ArrowUp, ArrowUpDown, BarChart3, ChevronRight, Download, Eye, FileClock,
  Filter, RefreshCw, Search, UsersRound, X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { listPayrollPeriods, listPayrollPeriodYears } from '@/api/payroll-periods'
import {
  getMyTeamPerformance,
  getTeamPerformance,
  type TeamPerformanceGoalSummary,
  type TeamPerformanceMember,
} from '@/api/team-performance'
import { useAuth } from '@/auth/AuthContext'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { usePayrollPeriodSelection } from '@/contexts/PayrollPeriodContext'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCompactMoney, formatMoney, formatNumber, toPercent } from '@/lib/format'
import { selectDefaultPayrollPeriod } from '@/lib/payroll-period'
import { type Tone } from '@/lib/tone'
import { useDebouncedValue } from '@/lib/use-debounced-value'

type MemberRow = {
  employeeId: string
  employeeCode: string
  name: string
  title: string
  teamId: string | null
  teamName: string | null
  revenue: string | null
  views: string | null
  traffic: TeamPerformanceMember['traffic']
  salary: TeamPerformanceMember['salary']
  kpi: TeamPerformanceGoalSummary | null
  okr: TeamPerformanceGoalSummary | null
  isComplete: boolean
}

type SortKey = 'name' | 'revenue' | 'views'

export function TeamPerformancePage() {
  const { user } = useAuth()
  const { periods: allPeriods, selectedPeriod, selectedPeriodId, selectPeriod } = usePayrollPeriodSelection()
  const chosenYear = selectedPeriod?.payrollYear ?? new Date().getFullYear()
  const permissions = user?.permissions ?? []
  const can = (permission: string) => permissions.includes(permission)
  const canRevenueByPermission = can('revenue.view_team') || can('revenue.view_all')
  const canExport = can('report.export')
  const [teamId, setTeamId] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim().toLowerCase(), 250)
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>(canRevenueByPermission ? 'revenue' : 'name')
  const [sortDescending, setSortDescending] = useState(true)

  const periodsQuery = useQuery({ queryKey: ['payroll-periods', 'team-performance', chosenYear], queryFn: () => listPayrollPeriods({ year: chosenYear, pageSize: 12 }) })
  const yearsQuery = useQuery({ queryKey: ['payroll-periods', 'years'], queryFn: listPayrollPeriodYears, staleTime: 60_000 })
  const periods = periodsQuery.data?.data ?? []
  const availableYears = Array.from(new Set([new Date().getFullYear(), ...(yearsQuery.data ?? [])])).sort((a, b) => b - a)
  const defaultPeriod = selectDefaultPayrollPeriod(periods)
  const periodId = periods.some((item) => item.id === selectedPeriodId) ? selectedPeriodId! : defaultPeriod?.id || ''
  const currentPeriod = periods.find((item) => item.id === periodId) ?? null

  function changeYear(year: number) {
    setTeamId('all')
    const nextPeriod = selectDefaultPayrollPeriod(allPeriods.filter((item) => item.payrollYear === year))
    if (nextPeriod) selectPeriod(nextPeriod.id)
  }

  function changePeriod(nextPeriodId: string) {
    setTeamId('all')
    selectPeriod(nextPeriodId)
  }

  const performanceQuery = useQuery({
    queryKey: ['team-performance', periodId, teamId],
    queryFn: () => teamId === 'all'
      ? getMyTeamPerformance(periodId)
      : getTeamPerformance(periodId, teamId),
    enabled: Boolean(periodId),
  })

  const performance = performanceQuery.data
  const canKpi = performance?.capabilities.kpi ?? (can('kpi.view_team') || can('kpi.view_all'))
  const canOkr = performance?.capabilities.okr ?? (can('okr.view_team') || can('okr.view_all'))
  const canTraffic = performance?.capabilities.traffic ?? (can('traffic.view_team') || can('traffic.view_all'))
  const canRevenue = performance?.capabilities.revenue ?? (can('revenue.view_team') || can('revenue.view_all'))
  const canSalary = performance?.capabilities.salary ?? (can('salary.view_team') || can('salary.view_all'))
  const members = useMemo(
    () => (performance?.members ?? []).map(toMemberRow),
    [performance?.members],
  )
  const teams = (performance?.teams ?? []).map((team) => [team.id, team.name] as const)
  const summary = performance?.summary
  const totalRevenue = integerValue(summary?.revenue.totalAmount)
  const acceptedViews = integerValue(summary?.traffic.acceptedViews)
  const revenueReady = summary?.revenue.readyCount ?? 0
  const trafficReady = summary?.traffic.readyCount ?? 0
  const salaryLocked = summary?.salary.lockedCount ?? 0
  const topRevenue = members.reduce((max, item) => (integerValue(item.revenue) > max ? integerValue(item.revenue) : max), 0n)
  const allReady = members.length > 0 && members.every((member) => member.isComplete)

  const loading = periodsQuery.isLoading || performanceQuery.isLoading
  const refreshing = periodsQuery.isFetching || yearsQuery.isFetching || performanceQuery.isFetching
  const hasError = periodsQuery.isError || yearsQuery.isError || performanceQuery.isError

  const isFiltering = search !== '' || onlyIncomplete
  const visibleMembers = useMemo(() => {
    const filtered = members.filter((item) => {
      if (onlyIncomplete && item.isComplete) return false
      if (!search) return true
      return item.name.toLowerCase().includes(search)
        || item.employeeCode.toLowerCase().includes(search)
        || item.title.toLowerCase().includes(search)
        || (item.teamName ?? '').toLowerCase().includes(search)
    })
    const direction = sortDescending ? -1 : 1
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'vi') * (sortDescending ? -1 : 1)
      const left = sortKey === 'revenue' ? integerValue(a.revenue) : integerValue(a.traffic?.acceptedViews ?? null)
      const right = sortKey === 'revenue' ? integerValue(b.revenue) : integerValue(b.traffic?.acceptedViews ?? null)
      if (left === right) return a.name.localeCompare(b.name, 'vi')
      return left > right ? direction : -direction
    })
  }, [members, search, onlyIncomplete, sortKey, sortDescending])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDescending((current) => !current)
      return
    }
    setSortKey(key)
    setSortDescending(key !== 'name')
  }

  function refreshAll() {
    void periodsQuery.refetch()
    void yearsQuery.refetch()
    void performanceQuery.refetch()
  }

  function clearFilters() {
    setSearchInput('')
    setOnlyIncomplete(false)
  }

  function exportCsv() {
    downloadCsv(`hieu-suat-team-${currentPeriod?.code ?? 'chua-co-ky'}.csv`, [
      ['Mã nhân sự', 'Nhân sự', 'Chức danh', 'Team', 'KPI đạt', 'OKR đạt', 'Doanh thu', 'Views hợp lệ', 'Traffic', 'Lương'],
      ...visibleMembers.map((item) => [
        item.employeeCode, item.name, item.title, item.teamName ?? '',
        goalExportValue(item.kpi), goalExportValue(item.okr),
        item.revenue ?? '', item.traffic?.acceptedViews ?? '',
        trafficLabel(item.traffic), salaryLabel(item.salary),
      ]),
    ])
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Báo cáo"
        title="Hiệu suất team"
        description={`Dữ liệu tổng hợp theo từng tháng của năm ${chosenYear}, giới hạn theo phạm vi dữ liệu của tài khoản.`}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={refreshAll} disabled={refreshing} title="Làm mới dữ liệu hiệu suất" aria-label="Làm mới dữ liệu hiệu suất">
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
            {canExport && members.length > 0 ? (
              <Button variant="outline" size="icon" onClick={exportCsv} title="Xuất CSV hiệu suất team" aria-label="Xuất CSV hiệu suất team">
                <Download className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        )}
      />

      {/* Bộ lọc tách khỏi header: ba ô chọn nhồi vào vùng hành động làm header phình ra và xuống dòng lộn xộn. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5" aria-label="Bộ lọc hiệu suất team">
        <Select value={String(chosenYear)} onValueChange={(value) => changeYear(Number(value))}>
          <SelectTrigger className="w-full sm:w-30" aria-label="Chọn năm báo cáo"><SelectValue /></SelectTrigger>
          <SelectContent>{availableYears.map((year) => <SelectItem key={year} value={String(year)}>Năm {year}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={periodId || undefined} onValueChange={changePeriod}>
          <SelectTrigger className="w-full sm:w-46" aria-label="Chọn kỳ lương"><SelectValue placeholder="Chọn kỳ lương" /></SelectTrigger>
          <SelectContent>
            {periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-full sm:w-46" aria-label="Lọc theo team"><SelectValue /></SelectTrigger>
          <SelectContent searchPlaceholder="Tìm team...">
            <SelectItem value="all">Tất cả team</SelectItem>
            {teams.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground sm:ml-auto sm:pr-1">
          {loading ? 'Đang tải…' : `${formatNumber(members.length)} thành viên`}
        </span>
      </div>

      {hasError ? (
        <ErrorState
          description="Không tải được dữ liệu hiệu suất đã tổng hợp. Hãy thử làm mới hoặc chọn kỳ khác."
          onRetry={refreshAll}
          retrying={refreshing}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số hiệu suất team">
        <MetricCard
          icon={UsersRound}
          tone="info"
          label="Thành viên"
          value={formatNumber(members.length)}
          note="Không tính bản thân Leader của team"
          loading={loading}
        />
        {canRevenue ? (
          <MetricCard
            icon={BarChart3}
            tone={revenueReady === summary?.revenue.eligibleMemberCount && revenueReady > 0 ? 'success' : 'warning'}
            label="Doanh thu team"
            value={formatCompactMoney(Number(totalRevenue))}
            valueTitle={formatMoney(Number(totalRevenue))}
            note={`${formatNumber(revenueReady)}/${formatNumber(summary?.revenue.eligibleMemberCount ?? 0)} nhân sự đã có số liệu`}
            loading={loading}
          />
        ) : null}
        {canTraffic ? (
          <MetricCard
            icon={Eye}
            tone={trafficReady === summary?.traffic.eligibleMemberCount && trafficReady > 0 ? 'success' : 'warning'}
            label="Traffic hợp lệ"
            value={formatNumber(Number(acceptedViews))}
            note={`${formatNumber(trafficReady)}/${formatNumber(summary?.traffic.eligibleMemberCount ?? 0)} hồ sơ hoàn tất`}
            loading={loading}
          />
        ) : null}
        {canSalary ? (
          <MetricCard
            icon={FileClock}
            tone={salaryLocked === summary?.salary.eligibleMemberCount && salaryLocked > 0 ? 'success' : 'warning'}
            label="Bảng lương đã khóa"
            value={`${formatNumber(salaryLocked)} / ${formatNumber(summary?.salary.eligibleMemberCount ?? 0)}`}
            note="Đã phê duyệt cuối"
            loading={loading}
          />
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="py-0 xl:col-span-3">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-foreground">Mức độ sẵn sàng</h2>
                <p className="mt-1 text-xs text-muted-foreground">Đủ dữ liệu để tính và khóa lương chưa</p>
              </div>
              <StatusBadge tone={allReady ? 'success' : 'warning'}>
                {allReady ? 'Đã sẵn sàng' : 'Còn thiếu dữ liệu'}
              </StatusBadge>
            </div>
            <div className="mt-5 space-y-4">
              {canRevenue ? <Readiness label="Doanh thu" ready={revenueReady} total={summary?.revenue.eligibleMemberCount ?? 0} /> : null}
              {canTraffic ? <Readiness label="Traffic" ready={trafficReady} total={summary?.traffic.eligibleMemberCount ?? 0} /> : null}
              {canSalary ? <Readiness label="Bảng lương đã khóa" ready={salaryLocked} total={summary?.salary.eligibleMemberCount ?? 0} /> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="py-0 xl:col-span-2">
          <CardContent className="flex h-full flex-col p-5">
            <h2 className="text-base font-semibold tracking-tight text-foreground">KPI &amp; OKR</h2>
            <p className="mt-1 text-xs text-muted-foreground">Tổng hợp theo đầu mục đã được duyệt</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {canKpi ? <GoalOverview label="Nhóm KPI" summary={summary?.kpi} /> : null}
              {canOkr ? <GoalOverview label="OKR" summary={summary?.okr} /> : null}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Tiến độ trung bình chỉ là chỉ số dashboard, không dùng để tính lương. Hệ thống không phát sinh thưởng hiệu suất team cho Leader.
            </p>
            {canKpi || canOkr ? (
              <Button asChild variant="outline" className="mt-auto w-full">
                <Link to="/kpi-okr">Mở KPI &amp; OKR <ChevronRight className="size-4" aria-hidden="true" /></Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <MembersTable
        rows={visibleMembers}
        totalCount={members.length}
        topRevenue={topRevenue}
        loading={loading}
        isFiltering={isFiltering}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onlyIncomplete={onlyIncomplete}
        onToggleIncomplete={() => setOnlyIncomplete((current) => !current)}
        onClearFilters={clearFilters}
        sortKey={sortKey}
        sortDescending={sortDescending}
        onSort={toggleSort}
        canRevenue={canRevenue}
        canTraffic={canTraffic}
        canSalary={canSalary}
        canKpi={canKpi}
        canOkr={canOkr}
      />
    </div>
  )
}

function MembersTable({
  rows, totalCount, topRevenue, loading, isFiltering, searchInput, onSearchChange,
  onlyIncomplete, onToggleIncomplete, onClearFilters, sortKey, sortDescending, onSort,
  canRevenue, canTraffic, canSalary, canKpi, canOkr,
}: {
  rows: MemberRow[]
  totalCount: number
  topRevenue: bigint
  loading: boolean
  isFiltering: boolean
  searchInput: string
  onSearchChange: (value: string) => void
  onlyIncomplete: boolean
  onToggleIncomplete: () => void
  onClearFilters: () => void
  sortKey: SortKey
  sortDescending: boolean
  onSort: (key: SortKey) => void
  canRevenue: boolean
  canTraffic: boolean
  canSalary: boolean
  canKpi: boolean
  canOkr: boolean
}) {
  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Thành viên trong phạm vi</h2>
              <p className="mt-1 text-xs text-muted-foreground">Dữ liệu theo từng hồ sơ</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {isFiltering ? `${formatNumber(rows.length)}/${formatNumber(totalCount)} hồ sơ` : `${formatNumber(totalCount)} hồ sơ`}
              </span>
              {canKpi || canOkr ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/kpi-okr">Xem KPI &amp; OKR</Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="w-full pr-9 pl-8"
                placeholder="Tìm theo tên, mã nhân sự, chức danh hoặc team"
                aria-label="Tìm thành viên"
                value={searchInput}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Xoá từ khoá tìm kiếm"
                  className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <Button variant={onlyIncomplete ? 'default' : 'outline'} size="sm" onClick={onToggleIncomplete} aria-pressed={onlyIncomplete}>
              <Filter className="size-4" aria-hidden="true" />
              {onlyIncomplete ? 'Đang lọc: chưa hoàn tất' : 'Chỉ hiện chưa hoàn tất'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={isFiltering ? Filter : UsersRound}
            tone={onlyIncomplete && totalCount > 0 ? 'success' : 'muted'}
            title={onlyIncomplete && totalCount > 0
              ? 'Mọi hồ sơ đều đã hoàn tất'
              : isFiltering ? 'Không có hồ sơ phù hợp' : 'Chưa có dữ liệu trong kỳ và phạm vi đã chọn'}
            description={onlyIncomplete && totalCount > 0
              ? 'Doanh thu, traffic và bảng lương của mọi thành viên trong phạm vi đều đã đủ.'
              : isFiltering ? 'Thử từ khoá khác hoặc bỏ bộ lọc để xem toàn bộ danh sách.'
                : 'Chọn kỳ lương khác, hoặc kiểm tra lại snapshot nhân sự của kỳ này.'}
            action={isFiltering ? <Button variant="outline" onClick={onClearFilters}><X className="size-4" aria-hidden="true" />Xoá bộ lọc</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-200">
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortButton label="Nhân sự" active={sortKey === 'name'} descending={sortDescending} onClick={() => onSort('name')} />
                  </TableHead>
                  <TableHead>Team</TableHead>
                  {canKpi ? <TableHead>KPI</TableHead> : null}
                  {canOkr ? <TableHead>OKR</TableHead> : null}
                  {canRevenue ? (
                    <TableHead className="text-right">
                      <SortButton label="Doanh thu" align="right" active={sortKey === 'revenue'} descending={sortDescending} onClick={() => onSort('revenue')} />
                    </TableHead>
                  ) : null}
                  {canTraffic ? (
                    <>
                      <TableHead className="text-right">
                        <SortButton label="Views hợp lệ" align="right" active={sortKey === 'views'} descending={sortDescending} onClick={() => onSort('views')} />
                      </TableHead>
                      <TableHead>Traffic</TableHead>
                    </>
                  ) : null}
                  {canSalary ? <TableHead>Lương</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => {
                  const revenueValue = integerValue(item.revenue)
                  const sharePercent = topRevenue > 0n ? Number((revenueValue * 100n) / topRevenue) : 0

                  return (
                    <TableRow key={item.employeeId}>
                      <TableCell>
                        <strong className="block font-semibold text-foreground">{item.name}</strong>
                        <span className="text-xs text-muted-foreground">{item.employeeCode} · {item.title}</span>
                      </TableCell>
                      <TableCell>{item.teamName ?? '—'}</TableCell>
                      {canKpi ? <TableCell><GoalStatus summary={item.kpi} /></TableCell> : null}
                      {canOkr ? <TableCell><GoalStatus summary={item.okr} /></TableCell> : null}
                      {canRevenue ? (
                        <TableCell className="text-right">
                          {item.revenue === null ? (
                            <span className="text-muted-foreground">Chưa nhập</span>
                          ) : (
                            <>
                              <span className="block font-semibold whitespace-nowrap tabular-nums">{formatMoney(Number(revenueValue))}</span>
                              {/* So sánh nhanh với người có doanh thu cao nhất trong phạm vi đang xem. */}
                              <ProgressBar className="mt-1.5 ml-auto h-1 w-24" value={sharePercent} tone="info" label={`Doanh thu của ${item.name} so với mức cao nhất`} />
                            </>
                          )}
                        </TableCell>
                      ) : null}
                      {canTraffic ? (
                        <>
                          <TableCell className="text-right whitespace-nowrap tabular-nums">
                            {formatNumber(Number(integerValue(item.traffic?.acceptedViews ?? null)))}
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={trafficTone(item.traffic)}>{trafficLabel(item.traffic)}</StatusBadge>
                          </TableCell>
                        </>
                      ) : null}
                      {canSalary ? (
                        <TableCell>
                          <StatusBadge tone={salaryTone(item.salary)}>{salaryLabel(item.salary)}</StatusBadge>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SortButton({
  label, active, descending, onClick, align = 'left',
}: {
  label: string
  active: boolean
  descending: boolean
  onClick: () => void
  align?: 'left' | 'right'
}) {
  const Icon = !active ? ArrowUpDown : descending ? ArrowDown : ArrowUp

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sắp xếp theo ${label}`}
      className={`inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
        active ? 'text-primary' : ''
      } ${align === 'right' ? 'flex-row-reverse' : ''}`}
    >
      {label}
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  )
}

function Readiness({ label, ready, total }: { label: string; ready: number; total: number }) {
  const percent = toPercent(ready, total)
  const complete = total > 0 && ready === total

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm font-semibold">{label}</strong>
        <span className="text-sm font-semibold tabular-nums">
          {formatNumber(ready)} <span className="text-muted-foreground">/ {formatNumber(total)}</span>
        </span>
      </div>
      <ProgressBar className="mt-2" value={percent} tone={complete ? 'success' : percent >= 50 ? 'info' : 'warning'} label={`Mức độ sẵn sàng ${label}`} />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {total === 0 ? 'Chưa có dữ liệu trong phạm vi này' : complete ? 'Đã đầy đủ' : `${formatNumber(total - ready)} hồ sơ chưa hoàn tất`}
      </p>
    </div>
  )
}

function GoalOverview({ label, summary }: { label: string; summary: TeamPerformanceGoalSummary | undefined }) {
  const total = summary?.totalCount ?? 0
  const achieved = summary?.achievedCount ?? 0
  const average = summary?.averageProgressPercent
  return (
    <div className="rounded-xl border bg-muted/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm font-semibold">{label}</strong>
        <StatusBadge tone={total > 0 && achieved === total ? 'success' : 'warning'}>
          {formatNumber(achieved)}/{formatNumber(total)} đạt
        </StatusBadge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {formatNumber(summary?.notAchievedCount ?? 0)} chưa đạt · {formatNumber(summary?.pendingCount ?? 0)} chờ duyệt
      </p>
      <p className="mt-1 text-xs font-medium tabular-nums text-foreground">
        Tiến độ TB: {average === null || average === undefined ? '—' : `${formatNumber(average)}%`}
      </p>
    </div>
  )
}

function GoalStatus({ summary }: { summary: TeamPerformanceGoalSummary | null }) {
  if (!summary || summary.totalCount === 0) {
    return <span className="text-sm text-muted-foreground">Chưa có</span>
  }
  const tone: Tone = summary.pendingCount > 0
    ? 'warning'
    : summary.notAchievedCount > 0 ? 'danger' : 'success'
  return (
    <div className="space-y-1">
      <StatusBadge tone={tone}>{formatNumber(summary.achievedCount)}/{formatNumber(summary.totalCount)} đạt</StatusBadge>
      <p className="text-xs tabular-nums text-muted-foreground">
        TB {summary.averageProgressPercent === null ? '—' : `${formatNumber(summary.averageProgressPercent)}%`}
      </p>
    </div>
  )
}

function toMemberRow(member: TeamPerformanceMember): MemberRow {
  return {
    employeeId: member.employeeId,
    employeeCode: member.employeeCode,
    name: member.employeeName,
    title: member.jobTitle,
    teamId: member.teamId,
    teamName: member.teamName,
    revenue: member.revenueAmount,
    views: member.traffic?.acceptedViews ?? null,
    traffic: member.traffic,
    salary: member.salary,
    kpi: member.kpi,
    okr: member.okr,
    isComplete: member.isComplete,
  }
}

function integerValue(value: string | null | undefined) {
  if (!value) return 0n
  try { return BigInt(value.split('.')[0]) } catch { return 0n }
}

function trafficLabel(item: TeamPerformanceMember['traffic']) {
  if (!item || item.completedPlatforms === 0) return 'Chưa nhập'
  if (item.rejectedPlatforms > 0) return 'Bị từ chối'
  if (item.pendingPlatforms > 0) return 'Chờ duyệt'
  return 'Hợp lệ'
}

function trafficTone(item: TeamPerformanceMember['traffic']): Tone {
  if (!item || item.completedPlatforms === 0) return 'muted'
  if (item.rejectedPlatforms > 0) return 'danger'
  if (item.pendingPlatforms > 0) return 'warning'
  return 'success'
}

function salaryLabel(item: TeamPerformanceMember['salary']) {
  if (!item) return 'Chưa tính'
  return { PENDING: 'Chờ duyệt', WARNING: 'Cảnh báo', LOCKED: 'Đã khóa', SUPERSEDED: 'Đã thay thế' }[item.status]
}

function salaryTone(item: TeamPerformanceMember['salary']): Tone {
  if (!item || item.status === 'SUPERSEDED') return 'muted'
  if (item.status === 'WARNING') return 'danger'
  if (item.status === 'PENDING') return 'warning'
  return 'success'
}

function goalExportValue(summary: TeamPerformanceGoalSummary | null) {
  return summary ? `${summary.achievedCount}/${summary.totalCount}` : ''
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
