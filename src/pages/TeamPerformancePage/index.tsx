import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown, ArrowUp, ArrowUpDown, BarChart3, ChevronRight, Download, Eye, FileClock,
  Filter, RefreshCw, Search, UsersRound, X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Paginated } from '@/api/access-control'
import { listPayrollPeriods, listPayrollPeriodYears } from '@/api/payroll-periods'
import { listRevenue, type EmployeeRevenue } from '@/api/revenue'
import { listSalaryRecords, type SalaryListItem } from '@/api/salary'
import { listTraffic, type TrafficListItem } from '@/api/traffic'
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
  traffic: TrafficListItem | null
  salary: SalaryListItem['salaryRecord']
}

type SortKey = 'name' | 'revenue' | 'views'

export function TeamPerformancePage() {
  const { user } = useAuth()
  const { periods: allPeriods, selectedPeriod, selectedPeriodId, selectPeriod } = usePayrollPeriodSelection()
  const chosenYear = selectedPeriod?.payrollYear ?? new Date().getFullYear()
  const permissions = user?.permissions ?? []
  const can = (permission: string) => permissions.includes(permission)
  const canKpi = can('kpi.view_team') || can('kpi.view_all')
  const canOkr = can('okr.view_team') || can('okr.view_all')
  const canTraffic = can('traffic.view_team') || can('traffic.view_all')
  const canRevenue = can('revenue.view_team') || can('revenue.view_all')
  const canSalary = can('salary.view_team') || can('salary.view_all')
  const canExport = can('report.export')
  const [teamId, setTeamId] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim().toLowerCase(), 250)
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>(canRevenue ? 'revenue' : 'name')
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

  const salaryQuery = useQuery({
    queryKey: ['salary-records', periodId, 'team-performance'],
    queryFn: () => loadAllPages((page) => listSalaryRecords(periodId, { page, pageSize: 100 })),
    enabled: canSalary && Boolean(periodId),
  })
  const revenueQuery = useQuery({
    queryKey: ['revenue', periodId, 'team-performance'],
    queryFn: () => loadAllPages((page) => listRevenue(periodId, { page, pageSize: 100 })),
    enabled: canRevenue && Boolean(periodId),
  })
  const trafficQuery = useQuery({
    queryKey: ['traffic', periodId, 'team-performance'],
    queryFn: () => loadAllPages((page) => listTraffic(periodId, { page, pageSize: 100 })),
    enabled: canTraffic && Boolean(periodId),
  })

  const allMembers = useMemo(
    () => mergeMembers(salaryQuery.data ?? [], revenueQuery.data ?? [], trafficQuery.data ?? []),
    [salaryQuery.data, revenueQuery.data, trafficQuery.data],
  )
  const teams = Array.from(
    new Map(allMembers.filter((item) => item.teamId).map((item) => [item.teamId!, item.teamName ?? 'Chưa đặt tên'])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], 'vi'))
  const members = teamId === 'all' ? allMembers : allMembers.filter((item) => item.teamId === teamId)

  const totalRevenue = members.reduce((sum, item) => sum + integerValue(item.revenue), 0n)
  const acceptedViews = members.reduce((sum, item) => sum + integerValue(item.traffic?.acceptedViews ?? null), 0n)
  const revenueReady = members.filter((item) => item.revenue !== null).length
  const trafficReady = members.filter((item) => isTrafficComplete(item.traffic)).length
  const salaryLocked = members.filter((item) => item.salary?.status === 'LOCKED').length
  const topRevenue = members.reduce((max, item) => (integerValue(item.revenue) > max ? integerValue(item.revenue) : max), 0n)

  const loading = periodsQuery.isLoading || salaryQuery.isLoading || revenueQuery.isLoading || trafficQuery.isLoading
  const refreshing = periodsQuery.isFetching || yearsQuery.isFetching || salaryQuery.isFetching || revenueQuery.isFetching || trafficQuery.isFetching
  const hasError = periodsQuery.isError || yearsQuery.isError || salaryQuery.isError || revenueQuery.isError || trafficQuery.isError

  const isFiltering = search !== '' || onlyIncomplete
  const visibleMembers = useMemo(() => {
    const filtered = members.filter((item) => {
      if (onlyIncomplete && isMemberComplete(item, { canRevenue, canTraffic, canSalary })) return false
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
  }, [members, search, onlyIncomplete, sortKey, sortDescending, canRevenue, canTraffic, canSalary])

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
    void salaryQuery.refetch()
    void revenueQuery.refetch()
    void trafficQuery.refetch()
  }

  function clearFilters() {
    setSearchInput('')
    setOnlyIncomplete(false)
  }

  function exportCsv() {
    downloadCsv(`hieu-suat-team-${currentPeriod?.code ?? 'chua-co-ky'}.csv`, [
      ['Mã nhân sự', 'Nhân sự', 'Chức danh', 'Team', 'Doanh thu', 'Views hợp lệ', 'Traffic', 'Lương'],
      ...visibleMembers.map((item) => [
        item.employeeCode, item.name, item.title, item.teamName ?? '',
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
        <Select value={periodId || undefined} onValueChange={selectPeriod}>
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
          description="Một phần dữ liệu hiệu suất chưa tải được. Các chỉ số bên dưới có thể chưa đầy đủ."
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
          note="Trong phạm vi dữ liệu được cấp"
          loading={loading}
        />
        {canRevenue ? (
          <MetricCard
            icon={BarChart3}
            tone={revenueReady === members.length && members.length > 0 ? 'success' : 'warning'}
            label="Doanh thu team"
            value={formatCompactMoney(Number(totalRevenue))}
            valueTitle={formatMoney(Number(totalRevenue))}
            note={`${formatNumber(revenueReady)}/${formatNumber(members.length)} nhân sự đã có số liệu`}
            loading={loading}
          />
        ) : null}
        {canTraffic ? (
          <MetricCard
            icon={Eye}
            tone={trafficReady === members.length && members.length > 0 ? 'success' : 'warning'}
            label="Traffic hợp lệ"
            value={formatNumber(Number(acceptedViews))}
            note={`${formatNumber(trafficReady)}/${formatNumber(members.length)} hồ sơ hoàn tất`}
            loading={loading}
          />
        ) : null}
        {canSalary ? (
          <MetricCard
            icon={FileClock}
            tone={salaryLocked === members.length && members.length > 0 ? 'success' : 'warning'}
            label="Bảng lương đã khóa"
            value={`${formatNumber(salaryLocked)} / ${formatNumber(members.length)}`}
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
              <StatusBadge tone={members.length > 0 && salaryLocked === members.length ? 'success' : 'warning'}>
                {members.length > 0 && salaryLocked === members.length ? 'Đã sẵn sàng' : 'Còn thiếu dữ liệu'}
              </StatusBadge>
            </div>
            <div className="mt-5 space-y-4">
              {canRevenue ? <Readiness label="Doanh thu" ready={revenueReady} total={members.length} /> : null}
              {canTraffic ? <Readiness label="Traffic" ready={trafficReady} total={members.length} /> : null}
              {canSalary ? <Readiness label="Bảng lương đã khóa" ready={salaryLocked} total={members.length} /> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="py-0 xl:col-span-2">
          <CardContent className="flex h-full flex-col p-5">
            <h2 className="text-base font-semibold tracking-tight text-foreground">KPI &amp; OKR</h2>
            <p className="mt-1 text-xs text-muted-foreground">Chi tiết hiệu suất từng người</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              KPI và OKR được xét theo từng đầu mục. Mở màn KPI &amp; OKR để xem tiến độ và trạng thái duyệt hiện thời của từng người.
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Màn này chỉ tổng hợp dữ liệu thành viên trong phạm vi được cấp — hệ thống không phát sinh khoản thưởng riêng cho Leader.
            </p>
            {canKpi || canOkr ? (
              <Button asChild variant="outline" className="mt-auto w-full">
                <Link to="/kpi-okr">Mở KPI &amp; OKR <ChevronRight className="size-4" /></Link>
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
                  <X className="size-4" />
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
            action={isFiltering ? <Button variant="outline" onClick={onClearFilters}><X className="size-4" />Xoá bộ lọc</Button> : undefined}
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

function mergeMembers(salaries: SalaryListItem[], revenues: EmployeeRevenue[], traffic: TrafficListItem[]) {
  const rows = new Map<string, MemberRow>()
  const ensure = (source: { employeeId: string; employeeCode: string; employeeName: string; jobTitle: string; teamId: string | null; teamName: string | null }) => {
    const existing = rows.get(source.employeeId)
    if (existing) return existing
    const row: MemberRow = {
      employeeId: source.employeeId, employeeCode: source.employeeCode, name: source.employeeName,
      title: source.jobTitle, teamId: source.teamId, teamName: source.teamName,
      revenue: null, views: null, traffic: null, salary: null,
    }
    rows.set(source.employeeId, row)
    return row
  }
  salaries.forEach((item) => { ensure(item).salary = item.salaryRecord })
  revenues.forEach((item) => { ensure(item).revenue = item.officialRevenueAmount })
  traffic.forEach((item) => { const row = ensure(item); row.traffic = item; row.views = item.acceptedViews })
  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}

async function loadAllPages<T>(fetchPage: (page: number) => Promise<Paginated<T>>) {
  const first = await fetchPage(1)
  if (first.meta.totalPages <= 1) return first.data
  const rest = await Promise.all(Array.from({ length: first.meta.totalPages - 1 }, (_, index) => fetchPage(index + 2)))
  return [first, ...rest].flatMap((page) => page.data)
}

function integerValue(value: string | null | undefined) {
  if (!value) return 0n
  try { return BigInt(value.split('.')[0]) } catch { return 0n }
}

function isTrafficComplete(item: TrafficListItem | null) {
  return Boolean(item && item.pendingPlatforms === 0 && item.rejectedPlatforms === 0 && item.completedPlatforms > 0)
}

function isMemberComplete(
  item: MemberRow,
  scope: { canRevenue: boolean; canTraffic: boolean; canSalary: boolean },
) {
  if (scope.canRevenue && item.revenue === null) return false
  if (scope.canTraffic && !isTrafficComplete(item.traffic)) return false
  if (scope.canSalary && item.salary?.status !== 'LOCKED') return false
  return true
}

function trafficLabel(item: TrafficListItem | null) {
  if (!item || item.completedPlatforms === 0) return 'Chưa nhập'
  if (item.rejectedPlatforms > 0) return 'Bị từ chối'
  if (item.pendingPlatforms > 0) return 'Chờ duyệt'
  return 'Hợp lệ'
}

function trafficTone(item: TrafficListItem | null): Tone {
  if (!item || item.completedPlatforms === 0) return 'muted'
  if (item.rejectedPlatforms > 0) return 'danger'
  if (item.pendingPlatforms > 0) return 'warning'
  return 'success'
}

function salaryLabel(item: SalaryListItem['salaryRecord']) {
  if (!item) return 'Chưa tính'
  return { PENDING: 'Chờ duyệt', WARNING: 'Cảnh báo', LOCKED: 'Đã khóa', SUPERSEDED: 'Đã thay thế' }[item.status]
}

function salaryTone(item: SalaryListItem['salaryRecord']): Tone {
  if (!item || item.status === 'SUPERSEDED') return 'muted'
  if (item.status === 'WARNING') return 'danger'
  if (item.status === 'PENDING') return 'warning'
  return 'success'
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
