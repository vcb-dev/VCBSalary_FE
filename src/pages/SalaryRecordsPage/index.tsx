import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Building2, Calculator, CalendarDays, CheckCircle2, Eye, FileWarning, FilterX, History, Loader2, LockKeyhole, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Target, UsersRound, WalletCards, X } from 'lucide-react'
import { toast } from 'sonner'
import { listDepartments, listTeams } from '@/api/organization'
import { listPayrollPeriods } from '@/api/payroll-periods'
import {
  calculateEmployeeSalary,
  calculatePeriodSalary,
  approveSalaryRecord,
  createSalaryRevision,
  getApiErrorMessage,
  getSalaryBreakdown,
  listSalaryRecords,
  type SalaryBreakdown,
  type SalaryRecord,
  type SalaryRecordStatus,
} from '@/api/salary'
import { useAuth } from '@/auth/AuthContext'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatCompactMoney, toPercent } from '@/lib/format'
import { calculateSalaryGoal } from '@/lib/salary-goal'
import { toneSurface, type Tone } from '@/lib/tone'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PAGE_SIZE = 100
const ALL = '__all__'

const STATUS_META: Record<SalaryRecordStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  WARNING: { label: 'Có cảnh báo', tone: 'danger' },
  LOCKED: { label: 'Đã khóa', tone: 'success' },
  SUPERSEDED: { label: 'Đã thay thế', tone: 'muted' },
}

/** Bộ lọc trạng thái của bảng lương, gồm cả nhánh "chưa tính" (không có bản ghi lương). */
const ROW_STATUS_FILTERS = {
  UNCALCULATED: 'Chưa tính',
  PENDING: 'Chờ duyệt',
  WARNING: 'Có cảnh báo',
  LOCKED: 'Đã khóa',
} as const
type RowStatusFilter = typeof ALL | keyof typeof ROW_STATUS_FILTERS
type SortKey = 'name' | 'total'

export function SalaryRecordsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [periodId, setPeriodId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim(), 350)
  const [statusFilter, setStatusFilter] = useState<RowStatusFilter>(ALL)
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDescending, setSortDescending] = useState(true)
  const [departmentId, setDepartmentId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [selfVersion, setSelfVersion] = useState<{ periodId: string; id: string } | null>(null)
  const [goalRecord, setGoalRecord] = useState<{ id: string; employeeName: string } | null>(null)
  const [salaryAction, setSalaryAction] = useState<{ type: 'approve' | 'revision'; record: SalaryRecord; employeeName: string } | null>(null)
  const canCalculate = user?.permissions.includes('salary.calculate') ?? false
  const canApprove = user?.permissions.includes('salary.final_approve') ?? false
  const canCreateRevision = user?.permissions.includes('salary.create_revision') ?? false
  const canViewSalary = user?.permissions.some((permission) =>
    ['salary.view_self', 'salary.view_team', 'salary.view_all'].includes(permission),
  ) ?? false
  const canFilterOrganization = user?.permissions.some((permission) =>
    ['salary.view_team', 'salary.view_all'].includes(permission),
  ) ?? false
  const personalSalaryView = canViewSalary && !canFilterOrganization

  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', 'salary'],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: 100 }),
  })
  const departmentsQuery = useQuery({ queryKey: ['departments', 'salary-filter'], queryFn: listDepartments, enabled: canFilterOrganization })
  const teamsQuery = useQuery({ queryKey: ['teams', 'salary-filter'], queryFn: listTeams, enabled: canFilterOrganization })
  const periods = useMemo(() => periodsQuery.data?.data ?? [], [periodsQuery.data])
  const departments = useMemo(() => departmentsQuery.data ?? [], [departmentsQuery.data])
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data])
  const visibleTeams = useMemo(() => departmentId ? teams.filter((team) => team.departmentId === departmentId) : teams, [departmentId, teams])
  const selectedPeriodId = periodId || (periods.find((period) => period.status === 'OPEN' || period.status === 'IN_REVIEW') ?? periods[0])?.id || ''
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? null

  const salariesQuery = useQuery({
    queryKey: ['salary-records', selectedPeriodId, departmentId, teamId, search],
    queryFn: () => listSalaryRecords(selectedPeriodId, { page: 1, pageSize: PAGE_SIZE, departmentId: departmentId || undefined, teamId: teamId || undefined, search: search || undefined }),
    enabled: Boolean(selectedPeriodId && canViewSalary),
  })
  const rows = useMemo(() => salariesQuery.data?.data ?? [], [salariesQuery.data])
  const selfRow = personalSalaryView ? rows.find((row) => row.employeeId === user?.employeeId) : undefined
  const selfRecordId = selfVersion?.periodId === selectedPeriodId ? selfVersion.id : selfRow?.salaryRecord?.id ?? null
  const selfDetailQuery = useQuery({
    queryKey: ['salary-record', selfRecordId],
    queryFn: () => getSalaryBreakdown(selfRecordId!),
    enabled: personalSalaryView && Boolean(selfRecordId),
  })
  const records = useMemo(() => rows.flatMap((row) => row.salaryRecord ? [row.salaryRecord] : []), [rows])
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])
  const totals = useMemo(() => ({
    payroll: records.reduce((sum, record) => sum + BigInt(record.totalSalaryAmount.split('.')[0]), 0n),
    locked: records.filter((record) => record.status === 'LOCKED').length,
    pending: records.filter((record) => record.status === 'PENDING').length,
    warnings: records.filter((record) => record.status === 'WARNING').length,
    uncalculated: rows.filter((row) => !row.salaryRecord).length,
  }), [records, rows])

  const calculateAllMutation = useMutation({
    mutationFn: () => calculatePeriodSalary(selectedPeriodId, 'PERSIST'),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['salary-records', selectedPeriodId] })
      const skippedMessage = result.skippedLockedCount > 0
        ? `; bỏ qua ${result.skippedLockedCount} hồ sơ đã khóa`
        : ''
      toast.success(`Đã tính ${result.processedCount} hồ sơ; ${result.warningCount} hồ sơ có cảnh báo${skippedMessage}`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const calculateOneMutation = useMutation({
    mutationFn: (employeeId: string) => calculateEmployeeSalary(selectedPeriodId, employeeId, 'PERSIST'),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['salary-records', selectedPeriodId] })
      toast.success(result.status === 'WARNING' ? 'Đã tính lương, cần xử lý cảnh báo' : 'Đã tính lương thành công')
      setDetailId(result.id)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const approveMutation = useMutation({
    mutationFn: (id: string) => approveSalaryRecord(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['salary-records', selectedPeriodId] })
      void queryClient.invalidateQueries({ queryKey: ['salary-record'] })
      setSalaryAction(null)
      setDetailId(result.id)
      toast.success('Đã duyệt và khóa bảng lương')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const revisionMutation = useMutation({
    mutationFn: (id: string) => createSalaryRevision(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['salary-records', selectedPeriodId] })
      void queryClient.invalidateQueries({ queryKey: ['salary-record'] })
      setSalaryAction(null)
      setDetailId(result.id)
      toast.success(`Đã tạo phiên bản điều chỉnh v${result.versionNumber}`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  const periodCalculable = selectedPeriod?.status === 'OPEN' || selectedPeriod?.status === 'IN_REVIEW'
  const hasFilters = Boolean(departmentId || teamId || search || statusFilter !== ALL)

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (statusFilter === ALL) return true
      if (statusFilter === 'UNCALCULATED') return !row.salaryRecord
      return row.salaryRecord?.status === statusFilter
    })
    const direction = sortDescending ? -1 : 1
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.employeeName.localeCompare(b.employeeName, 'vi') * (sortDescending ? -1 : 1)
      const left = BigInt(a.salaryRecord?.totalSalaryAmount.split('.')[0] ?? '0')
      const right = BigInt(b.salaryRecord?.totalSalaryAmount.split('.')[0] ?? '0')
      if (left === right) return a.employeeName.localeCompare(b.employeeName, 'vi')
      return left > right ? direction : -direction
    })
  }, [rows, statusFilter, sortKey, sortDescending])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDescending((current) => !current)
      return
    }
    setSortKey(key)
    setSortDescending(key !== 'name')
  }

  function clearFilters() {
    setDepartmentId('')
    setTeamId('')
    setSearchInput('')
    setStatusFilter(ALL)
  }

  function refreshAll() {
    void periodsQuery.refetch()
    void departmentsQuery.refetch()
    void teamsQuery.refetch()
    void salariesQuery.refetch()
  }

  const calculateDisabledReason = !periodCalculable
    ? 'Chỉ tính được lương khi kỳ đang mở hoặc đang duyệt'
    : rows.length === 0 ? 'Phạm vi hiện tại chưa có nhân sự nào' : undefined

  if (personalSalaryView) {
    const personalRecord = selfDetailQuery.data
    const viewingPastVersion = Boolean(selfVersion?.periodId === selectedPeriodId && selfVersion.id !== selfRow?.salaryRecord?.id)
    return <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Lương & thưởng cá nhân"
        title="Thu nhập của tôi"
        description="Xem thu nhập, các khoản thưởng và kết quả KPI/OKR của bạn theo từng kỳ lương."
      />

      <Card className="py-0"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{selectedPeriod?.name ?? 'Chưa có kỳ lương'}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Kỳ đang xem</p>
        </div>
        <Select value={selectedPeriodId || undefined} onValueChange={(value) => { setPeriodId(value); setSelfVersion(null); setGoalRecord(null) }}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Chọn kỳ lương của tôi">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
            <SelectValue placeholder="Chọn kỳ lương" />
          </SelectTrigger>
          <SelectContent>{periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.name} · {periodStatusLabel(period.status)}</SelectItem>)}</SelectContent>
        </Select>
      </CardContent></Card>

      {periodsQuery.isLoading || salariesQuery.isLoading || (selfRecordId && selfDetailQuery.isLoading) ? (
        <div className="space-y-3"><Skeleton className="h-36 w-full" /><Skeleton className="h-52 w-full" /></div>
      ) : periodsQuery.isError || salariesQuery.isError || (selfRecordId && selfDetailQuery.isError) ? (
        <ErrorState description="Không tải được chi tiết lương của bạn." onRetry={() => { void periodsQuery.refetch(); void salariesQuery.refetch(); if (selfRecordId) void selfDetailQuery.refetch() }} />
      ) : !selfRow ? (
        <EmptyState icon={WalletCards} title="Chưa có thông tin lương" description="Bạn chưa có hồ sơ trong kỳ lương này." />
      ) : !selfRow.salaryRecord ? (
        <EmptyState icon={Calculator} title="Lương kỳ này chưa được tính" description="Khi bảng lương được tính, chi tiết thu nhập của bạn sẽ hiển thị tại đây." />
      ) : personalRecord ? (
        <>
          <Card className="border-primary/20 bg-primary/5 py-0"><CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-muted-foreground">{viewingPastVersion ? 'Thu nhập phiên bản đang xem' : 'Tổng thu nhập kỳ này'}</span><SalaryStatus record={personalRecord} /></div>
              <strong className="mt-2 block text-3xl font-bold tracking-tight text-primary tabular-nums sm:text-4xl">{formatVnd(personalRecord.totalSalaryAmount)}</strong>
              <p className="mt-2 text-sm text-muted-foreground">{personalRecord.employeeName} · {personalRecord.employeeCode} · {personalRecord.jobTitle}</p>
            </div>
            {viewingPastVersion
              ? <Button variant="outline" onClick={() => setSelfVersion(null)}><RefreshCw className="size-4" aria-hidden="true" />Xem bản mới nhất</Button>
              : <Button onClick={() => setGoalRecord({ id: personalRecord.id, employeeName: personalRecord.employeeName })}><Target className="size-4" aria-hidden="true" />Đặt mục tiêu thu nhập</Button>}
          </CardContent></Card>
          <SalaryBreakdownContent record={personalRecord} onSelectVersion={(id) => setSelfVersion({ periodId: selectedPeriodId, id })} personal />
        </>
      ) : null}
      <SalaryGoalDialog key={goalRecord?.id ?? 'closed'} selected={goalRecord} onClose={() => setGoalRecord(null)} />
    </div>
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Tính lương & thưởng"
        title="Danh sách lương"
        description="Theo dõi, tính toán và đối soát thu nhập của nhân sự theo kỳ lương và đơn vị làm việc."
        action={canCalculate ? (
          <Button
            disabled={Boolean(calculateDisabledReason) || calculateAllMutation.isPending}
            title={calculateDisabledReason}
            onClick={() => calculateAllMutation.mutate()}
          >
            {calculateAllMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
            {calculateAllMutation.isPending ? 'Đang tính…' : 'Tính trong phạm vi'}
          </Button>
        ) : undefined}
      />

      {totals.warnings > 0 ? (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm leading-6 ${toneSurface.warning}`}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>{totals.warnings} hồ sơ có cảnh báo dữ liệu.</strong> Hồ sơ vẫn được lưu để đối soát, nhưng hãy bổ sung
            đủ lương cơ bản, KPI/OKR, doanh thu và traffic trước khi duyệt.
          </span>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số bảng lương">
        <MetricCard
          icon={WalletCards}
          tone="info"
          label="Quỹ lương đã tính"
          value={formatCompactMoney(Number(totals.payroll))}
          valueTitle={formatVnd(totals.payroll.toString())}
          note={`${records.length} / ${salariesQuery.data?.meta.total ?? 0} hồ sơ đã có bảng lương`}
          loading={salariesQuery.isLoading}
        />
        <MetricCard
          icon={LockKeyhole}
          tone={totals.locked > 0 && totals.locked === rows.length ? 'success' : 'info'}
          label="Đã khóa"
          value={`${totals.locked} / ${rows.length}`}
          progress={toPercent(totals.locked, rows.length)}
          note="Hồ sơ đã qua phê duyệt cuối"
          loading={salariesQuery.isLoading}
          onSelect={totals.locked > 0 ? () => setStatusFilter('LOCKED') : undefined}
        />
        <MetricCard
          icon={Calculator}
          tone={totals.pending + totals.uncalculated > 0 ? 'warning' : 'success'}
          label="Chờ xử lý"
          value={String(totals.pending + totals.uncalculated)}
          note={`${totals.pending} chờ duyệt · ${totals.uncalculated} chưa tính`}
          loading={salariesQuery.isLoading}
          onSelect={totals.pending > 0 ? () => setStatusFilter('PENDING') : totals.uncalculated > 0 ? () => setStatusFilter('UNCALCULATED') : undefined}
        />
        <MetricCard
          icon={FileWarning}
          tone={totals.warnings > 0 ? 'danger' : 'success'}
          label="Có cảnh báo"
          value={String(totals.warnings)}
          note={totals.warnings > 0 ? 'Bấm để lọc các hồ sơ cần đối soát' : 'Không có hồ sơ nào bị cảnh báo'}
          loading={salariesQuery.isLoading}
          onSelect={totals.warnings > 0 ? () => setStatusFilter('WARNING') : undefined}
        />
      </section>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-foreground">Bảng lương nhân sự</h2>
                <p className="mt-1 text-xs text-muted-foreground">{selectedPeriod?.name ?? 'Chưa chọn kỳ'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {salariesQuery.isFetching
                    ? 'Đang cập nhật…'
                    : hasFilters
                      ? `${visibleRows.length}/${salariesQuery.data?.meta.total ?? 0} nhân sự`
                      : `${salariesQuery.data?.meta.total ?? 0} nhân sự`}
                </span>
                {hasFilters ? (
                  <Button variant="ghost" size="sm" className="h-8" onClick={clearFilters}>
                    <FilterX className="size-3.5" aria-hidden="true" />Đặt lại
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Số cột phải khớp đúng số ô lọc đang render (5 ô khi lọc được theo phòng ban, 4 ô khi không). */}
            <div className={`grid gap-2 sm:grid-cols-2 lg:grid-cols-3 ${canFilterOrganization ? 'xl:grid-cols-[minmax(12rem,1fr)_14rem_12rem_11rem_11rem]' : 'xl:grid-cols-[minmax(12rem,1fr)_14rem_11rem_11rem]'}`}>
              <div className="relative sm:col-span-2 lg:col-span-2 xl:col-span-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="salary-employee-search"
                  className="w-full pr-9 pl-8"
                  aria-label="Tìm nhân sự"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Tìm theo tên hoặc mã nhân sự"
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    aria-label="Xoá từ khoá tìm kiếm"
                    className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>

              <Select value={selectedPeriodId || undefined} onValueChange={setPeriodId}>
                <SelectTrigger className="w-full" aria-label="Chọn kỳ lương">
                  <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <SelectValue placeholder="Chọn kỳ lương" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>{period.name} · {periodStatusLabel(period.status)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {canFilterOrganization ? (
                <Select value={departmentId || ALL} onValueChange={(value) => { setDepartmentId(value === ALL ? '' : value); setTeamId('') }}>
                  <SelectTrigger className="w-full" aria-label="Lọc theo phòng ban">
                    <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <SelectValue placeholder="Tất cả phòng ban" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Tất cả phòng ban</SelectItem>
                    {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : null}

              <Select value={teamId || ALL} onValueChange={(value) => setTeamId(value === ALL ? '' : value)}>
                <SelectTrigger className="w-full" aria-label="Lọc theo team">
                  <UsersRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <SelectValue placeholder="Tất cả team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả team</SelectItem>
                  {visibleTeams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RowStatusFilter)}>
                <SelectTrigger className="w-full" aria-label="Lọc theo trạng thái lương">
                  <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
                  {(Object.keys(ROW_STATUS_FILTERS) as Array<keyof typeof ROW_STATUS_FILTERS>).map((status) => (
                    <SelectItem key={status} value={status}>{ROW_STATUS_FILTERS[status]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!canViewSalary ? (
            <EmptyState
              icon={ShieldCheck}
              tone="warning"
              title="Không đủ quyền xem dữ liệu lương"
              description="Tài khoản của bạn chưa được cấp quyền xem bảng lương. Liên hệ quản trị hệ thống để được cấp quyền phù hợp."
            />
          ) : salariesQuery.isLoading || periodsQuery.isLoading || (canFilterOrganization && (departmentsQuery.isLoading || teamsQuery.isLoading)) ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
          ) : salariesQuery.isError || periodsQuery.isError || (canFilterOrganization && (departmentsQuery.isError || teamsQuery.isError)) ? (
            <div className="p-4">
              <ErrorState description="Không tải được dữ liệu lương của kỳ này." onRetry={refreshAll} retrying={salariesQuery.isFetching} />
            </div>
          ) : visibleRows.length === 0 ? (
            <EmptyState
              size="sm"
              icon={UsersRound}
              title={hasFilters ? 'Không có nhân sự phù hợp' : 'Kỳ lương chưa có snapshot nhân sự'}
              description={hasFilters
                ? 'Thử đổi từ khoá hoặc bỏ bớt bộ lọc để xem thêm hồ sơ.'
                : 'Mở kỳ lương để tạo snapshot nhân sự trước khi tính lương.'}
              action={hasFilters ? <Button variant="outline" onClick={clearFilters}><FilterX className="size-4" />Đặt lại bộ lọc</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-240">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">
                      <SortButton label="Nhân sự" active={sortKey === 'name'} descending={sortDescending} onClick={() => toggleSort('name')} />
                    </TableHead>
                    <TableHead className="min-w-40">Đơn vị</TableHead>
                    <TableHead className="min-w-32 text-right">Lương cơ bản</TableHead>
                    <TableHead className="min-w-36 text-right">Thưởng hiệu suất</TableHead>
                    <TableHead className="min-w-36 text-right">Doanh thu & traffic</TableHead>
                    <TableHead className="min-w-36 text-right">
                      <SortButton label="Tổng thu nhập" align="right" active={sortKey === 'total'} descending={sortDescending} onClick={() => toggleSort('total')} />
                    </TableHead>
                    <TableHead className="min-w-28">Trạng thái</TableHead>
                    <TableHead className="min-w-32 text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    const record = row.salaryRecord
                    const team = row.teamId ? teamById.get(row.teamId) : undefined
                    const performanceReward = record ? sumAmountStrings(record.kpiRewardAmount, record.okrRewardAmount) : null
                    const revenueReward = record ? sumAmountStrings(record.commissionAmount, record.rpmRewardAmount) : null

                    return (
                      <TableRow key={row.employeeId} className={record?.status === 'WARNING' ? 'bg-[var(--danger-500)]/4' : undefined}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${toneSurface.info}`}>
                              {initials(row.employeeName)}
                            </span>
                            <span className="min-w-0">
                              <strong className="block truncate">{row.employeeName}</strong>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.employeeCode} · {row.jobTitle}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <strong className="block text-sm">{row.teamName ?? 'Chưa xếp team'}</strong>
                          <span className="text-xs text-muted-foreground">{team?.department.name ?? 'Chưa xác định phòng ban'}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                          {record ? formatVnd(record.baseSalaryAmount) : '—'}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {record ? (
                            <>
                              <span className="block font-medium">{formatVnd(performanceReward)}</span>
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                KPI {formatVnd(record.kpiRewardAmount)} · OKR {formatVnd(record.okrRewardAmount)}
                              </span>
                            </>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {record ? (
                            <>
                              <span className="block font-medium">{formatVnd(revenueReward)}</span>
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                Hoa hồng {formatVnd(record.commissionAmount)} · RPM {formatVnd(record.rpmRewardAmount)}
                              </span>
                            </>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-bold whitespace-nowrap text-foreground tabular-nums">
                          {record ? formatVnd(record.totalSalaryAmount) : '—'}
                        </TableCell>
                        <TableCell>{record ? <SalaryStatus record={record} /> : <StatusBadge>Chưa tính</StatusBadge>}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {record ? (
                              <Button variant="outline" size="sm" onClick={() => setGoalRecord({ id: record.id, employeeName: row.employeeName })}>
                                <Target className="size-4" aria-hidden="true" />Mục tiêu
                              </Button>
                            ) : null}
                            {record ? (
                              <Button variant="ghost" size="sm" onClick={() => setDetailId(record.id)}>
                                <Eye className="size-4" aria-hidden="true" />Xem
                              </Button>
                            ) : null}
                            {canApprove && periodCalculable && record?.status === 'PENDING' ? (
                              <Button size="sm" onClick={() => setSalaryAction({ type: 'approve', record, employeeName: row.employeeName })}>
                                <CheckCircle2 className="size-4" aria-hidden="true" />Duyệt
                              </Button>
                            ) : null}
                            {canCreateRevision && periodCalculable && record?.status === 'LOCKED' ? (
                              <Button variant="outline" size="sm" onClick={() => setSalaryAction({ type: 'revision', record, employeeName: row.employeeName })}>
                                <RefreshCw className="size-4" aria-hidden="true" />Điều chỉnh
                              </Button>
                            ) : null}
                            {canCalculate && periodCalculable && (!record || record.status === 'PENDING' || record.status === 'WARNING') ? (
                              <Button variant="ghost" size="sm" disabled={calculateOneMutation.isPending} onClick={() => calculateOneMutation.mutate(row.employeeId)}>
                                <Calculator className="size-4" aria-hidden="true" />{record ? 'Tính lại' : 'Tính'}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SalaryDetailDialog
        id={detailId}
        canApprove={canApprove && periodCalculable}
        canCreateRevision={canCreateRevision && periodCalculable}
        onClose={() => setDetailId(null)}
        onSelectVersion={setDetailId}
        onAction={(type, record, employeeName) => setSalaryAction({ type, record, employeeName })}
      />
      <SalaryGoalDialog key={goalRecord?.id ?? 'closed'} selected={goalRecord} onClose={() => setGoalRecord(null)} />
      <SalaryActionDialog
        action={salaryAction}
        pending={approveMutation.isPending || revisionMutation.isPending}
        onClose={() => setSalaryAction(null)}
        onConfirm={() => {
          if (!salaryAction) return
          if (salaryAction.type === 'approve') approveMutation.mutate(salaryAction.record.id)
          else revisionMutation.mutate(salaryAction.record.id)
        }}
      />
    </div>
  )
}

function SalaryStatus({ record }: { record: SalaryRecord }) {
  const meta = STATUS_META[record.status]
  return <div><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>{record.warnings.length > 0 ? <span className="mt-1 block text-xs text-muted-foreground">{record.warnings.length} cảnh báo</span> : null}</div>
}

function SalaryGoalDialog({ selected, onClose }: { selected: { id: string; employeeName: string } | null; onClose: () => void }) {
  const [targetInput, setTargetInput] = useState('')
  const query = useQuery({
    queryKey: ['salary-record', selected?.id],
    queryFn: () => getSalaryBreakdown(selected!.id),
    enabled: Boolean(selected),
  })
  const record = query.data
  const target = targetInput ? BigInt(targetInput) : null
  const plan = useMemo(() => record && target && target > 0n ? calculateSalaryGoal(record, target) : null, [record, target])

  return <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && onClose()}><DialogContent className="sm:max-w-2xl">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2"><Target className="size-5 text-primary" aria-hidden="true" />Thu nhập mục tiêu</DialogTitle>
      <DialogDescription>{selected?.employeeName} · Ước tính theo bảng lương và quy tắc thưởng của kỳ đang chọn.</DialogDescription>
    </DialogHeader>
    {query.isLoading ? <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div>
      : query.isError || !record ? <ErrorCard onRetry={() => query.refetch()} />
        : <div className="space-y-5">
          {record.warnings.length > 0 ? <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-5 ${toneSurface.warning}`}><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>Bảng lương này có {record.warnings.length} cảnh báo dữ liệu. Các chỉ tiêu ước tính có thể thay đổi sau khi bổ sung và duyệt dữ liệu.</span></div> : null}
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr] sm:items-end">
            <div>
              <label htmlFor="salary-goal-input" className="mb-2 block text-sm font-semibold">Thu nhập mong muốn trong kỳ</label>
              <MoneyInput id="salary-goal-input" value={targetInput} onValueChange={setTargetInput} placeholder="Ví dụ: 20.000.000" aria-describedby="salary-goal-hint" />
            </div>
            <div className="rounded-xl bg-muted/40 px-4 py-3">
              <span className="block text-xs text-muted-foreground">Thu nhập đang tính</span>
              <strong className="mt-1 block text-lg tabular-nums">{formatVnd(record.totalSalaryAmount)}</strong>
            </div>
          </div>
          {!targetInput ? <p id="salary-goal-hint" className="text-sm text-muted-foreground">Nhập mục tiêu để xem KPI, OKR, doanh thu và lượt xem cần đạt.</p>
            : target === 0n ? <p id="salary-goal-hint" className="text-sm text-destructive">Vui lòng nhập số tiền lớn hơn 0.</p>
              : plan && plan.gap === 0n ? <div id="salary-goal-hint" className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${toneSurface.success}`}><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>Bạn đã đạt mục tiêu này theo bản lương đang tính.</span></div>
                : plan ? <div id="salary-goal-hint" className="space-y-4" aria-live="polite">
                  <div className={`rounded-xl px-4 py-3 ${toneSurface.info}`}>
                    <span className="block text-xs font-medium">Còn thiếu để đạt {formatVnd(targetInput)}</span>
                    <strong className="mt-1 block text-xl tabular-nums">{formatVnd(plan.gap.toString())}</strong>
                  </div>

                  <section aria-labelledby="goal-performance-heading">
                    <h3 id="goal-performance-heading" className="text-sm font-bold">1. Hoàn thành các chỉ tiêu thưởng</h3>
                    {plan.actions.length ? <div className="mt-2 divide-y rounded-xl border">
                      {plan.actions.map((action) => <div key={action.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
                        <span className="min-w-0 font-medium">{action.name}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">Hiện tại {formatPercent(action.progress)} · cần đạt {formatPercent(action.threshold)}</span></span>
                        <strong className="shrink-0 tabular-nums text-primary">+{formatVnd(action.amount.toString())}</strong>
                      </div>)}
                    </div> : <p className="mt-1 text-sm text-muted-foreground">Không có khoản KPI/OKR chưa đạt nào còn thưởng thêm.</p>}
                  </section>

                  {plan.remaining > 0n ? <section aria-labelledby="goal-growth-heading">
                    <h3 id="goal-growth-heading" className="text-sm font-bold">2. Bù thêm {formatVnd(plan.remaining.toString())} bằng một trong hai cách</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Sau khi hoàn thành các chỉ tiêu ở trên; giữ nguyên các khoản lương khác.</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border p-3">
                        <span className="block text-xs font-semibold text-muted-foreground">Doanh thu cần đạt</span>
                        <strong className="mt-1 block text-base tabular-nums">{plan.revenueGoal ? formatVnd(plan.revenueGoal.total.toString()) : 'Chưa tính được'}</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">{plan.revenueGoal ? `Tăng thêm ${formatVnd((plan.revenueGoal.total - plan.currentRevenue).toString())} · mốc ${plan.revenueGoal.bracket}` : 'Không có mốc thưởng đủ để đạt mục tiêu.'}</span>
                      </div>
                      <div className="rounded-xl border p-3">
                        <span className="block text-xs font-semibold text-muted-foreground">Views hợp lệ cần đạt</span>
                        <strong className="mt-1 block text-base tabular-nums">{plan.viewsGoal !== null ? formatNumber(plan.viewsGoal.toString()) : 'Chưa tính được'}</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">{plan.viewsGoal !== null ? `Tăng thêm ${formatNumber((plan.viewsGoal - plan.currentViews).toString())} views` : 'RPM hiện tại không đủ để tính phương án này.'}</span>
                      </div>
                    </div>
                  </section> : <p className={`rounded-xl px-4 py-3 text-sm ${toneSurface.success}`}>Hoàn thành các chỉ tiêu trên là đủ để đạt mục tiêu.</p>}

                  <p className="text-xs leading-5 text-muted-foreground">Ước tính theo dữ liệu lương và mốc thưởng của kỳ này. Doanh thu và views là hai phương án riêng; dữ liệu cần được xác nhận, duyệt và tính lương lại để ghi nhận. Khoản thực nhận có thể thay đổi.</p>
                </div> : null}
        </div>}
  </DialogContent></Dialog>
}

function SalaryDetailDialog({ id, canApprove, canCreateRevision, onClose, onSelectVersion, onAction }: { id: string | null; canApprove: boolean; canCreateRevision: boolean; onClose: () => void; onSelectVersion: (id: string) => void; onAction: (type: 'approve' | 'revision', record: SalaryRecord, employeeName: string) => void }) {
  const query = useQuery({ queryKey: ['salary-record', id], queryFn: () => getSalaryBreakdown(id!), enabled: Boolean(id) })
  const record = query.data
  return <Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><DialogTitle>Chi tiết lương & thưởng</DialogTitle><DialogDescription>{record ? `${record.employeeName} · ${record.employeeCode} · Ruleset v${record.rewardRuleSetVersion}` : 'Đang tải snapshot bản tính'}</DialogDescription></DialogHeader>
    {query.isLoading ? <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></div> : query.isError || !record ? <ErrorCard onRetry={() => query.refetch()} /> : <SalaryBreakdownContent record={record} onSelectVersion={onSelectVersion} />}
    {record && ((canApprove && record.status === 'PENDING') || (canCreateRevision && record.status === 'LOCKED')) ? <DialogFooter>
      {canCreateRevision && record.status === 'LOCKED' ? <Button variant="outline" onClick={() => onAction('revision', record, record.employeeName)}><RefreshCw className="size-4" />Tạo phiên bản điều chỉnh</Button> : null}
      {canApprove && record.status === 'PENDING' ? <Button onClick={() => onAction('approve', record, record.employeeName)}><ShieldCheck className="size-4" />Duyệt và khóa lương</Button> : null}
    </DialogFooter> : null}
  </DialogContent></Dialog>
}

function SalaryBreakdownContent({ record, onSelectVersion, personal = false }: { record: SalaryBreakdown; onSelectVersion: (id: string) => void; personal?: boolean }) {
  return <div className="space-y-4">
    {record.warnings.length > 0 ? <Alert className="border-[var(--danger-500)]/25 bg-[var(--danger-500)]/6 text-foreground"><AlertCircle className="text-[var(--danger-700)]" /><AlertTitle>{record.warnings.length} cảnh báo cần xử lý</AlertTitle><AlertDescription><ul className="mt-2 list-disc space-y-1 pl-4">{record.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul></AlertDescription></Alert> : null}
    <Card className={`py-0 ${record.status === 'LOCKED' ? 'border-[var(--success-500)]/30 bg-[var(--success-500)]/6' : ''}`}><CardContent className="grid gap-4 p-4 sm:grid-cols-3">
      <div><p className="text-xs text-muted-foreground">Trạng thái</p><div className="mt-1"><SalaryStatus record={record} /></div></div>
      <div><p className="text-xs text-muted-foreground">{personal ? 'Phiên bản đang xem' : 'Phiên bản hiện tại'}</p><strong className="mt-1 block">Phiên bản {record.versionNumber}</strong></div>
      <div><p className="text-xs text-muted-foreground">Người duyệt</p><strong className="mt-1 block">{record.approvedBy?.fullName ?? 'Chưa được duyệt'}</strong>{record.approvedAt ? <span className="text-xs text-muted-foreground">{formatDateTime(record.approvedAt)}</span> : null}</div>
    </CardContent></Card>
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="py-0"><CardContent className="p-4"><p className="text-sm font-semibold text-foreground">{personal ? 'Doanh thu & lượt xem' : 'Nguồn snapshot'}</p><dl className="mt-3 divide-y text-sm"><Amount label="Doanh thu" value={formatVnd(record.revenueAmount)} /><Amount label="Mốc doanh thu" value={record.revenueRewardBracketLabel ?? 'Không khớp'} /><Amount label="Hoa hồng" value={`${formatPercent(record.commissionRatePercent)} · ${formatVnd(record.commissionAmount)}`} /><Amount label="Views hợp lệ" value={formatNumber(record.totalViews)} /><Amount label="RPM / 1.000 views" value={formatVnd(record.rpmRatePer1000Views)} /></dl></CardContent></Card>
      <Card className="py-0"><CardContent className="p-4"><p className="text-sm font-semibold text-foreground">Cấu phần thu nhập</p><dl className="mt-3 divide-y text-sm"><Amount label="Lương cơ bản" value={formatVnd(record.baseSalaryAmount)} /><Amount label="Thưởng KPI" value={formatVnd(record.kpiRewardAmount)} /><Amount label="Thưởng OKR" value={formatVnd(record.okrRewardAmount)} /><Amount label="Hoa hồng" value={formatVnd(record.commissionAmount)} /><Amount label="Tiền RPM" value={formatVnd(record.rpmRewardAmount)} />{record.components.length > 0 ? <Amount label="Khoản bổ sung" value={formatVnd(record.additionalComponentAmount)} /> : null}<Amount label="Tổng lương" value={formatVnd(record.totalSalaryAmount)} strong /></dl></CardContent></Card>
    </div>
    <BreakdownTable title="KPI theo team" empty="Không có nhóm KPI được gán." rows={record.kpiItems.map((item) => ({ id: item.id, name: `${item.teamName} · ${item.kpiGroupName} · tỷ trọng ${item.salaryWeightPercent}%`, progress: item.progressPercent, threshold: item.thresholdPercent, configured: item.rewardAmount, earned: item.earnedAmount, achieved: item.isAchieved }))} />
    <BreakdownTable title="OKR" empty="Không có OKR trong kỳ." rows={record.okrItems.map((item) => ({ id: item.id, name: item.title, progress: item.progressPercent, threshold: item.thresholdPercent, configured: item.rewardAmount, earned: item.earnedAmount, achieved: item.isAchieved }))} />
    {record.versionHistory.length > 1 ? <Card className="overflow-hidden py-0"><CardContent className="p-0"><div className="flex items-center gap-2 border-b border-border p-4"><History className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold text-foreground">Lịch sử phiên bản</h3></div><div className="divide-y">{record.versionHistory.map((version) => <button type="button" key={version.id} className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/40" onClick={() => onSelectVersion(version.id)}><span><strong className="block">Phiên bản {version.versionNumber}{version.id === record.id ? ' · Đang xem' : ''}</strong><span className="mt-0.5 block text-xs text-muted-foreground">{version.approvedBy ? `Duyệt bởi ${version.approvedBy.fullName}` : `Tạo bởi ${version.calculatedBy.fullName}`} · {formatDateTime(version.lockedAt ?? version.calculatedAt)}</span></span><span className="flex items-center gap-3"><span className="font-semibold">{formatVnd(version.totalSalaryAmount)}</span><StatusBadge tone={STATUS_META[version.status].tone}>{STATUS_META[version.status].label}</StatusBadge></span></button>)}</div></CardContent></Card> : null}
  </div>
}

function SalaryActionDialog({ action, pending, onClose, onConfirm }: { action: { type: 'approve' | 'revision'; record: SalaryRecord; employeeName: string } | null; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const approving = action?.type === 'approve'
  return <Dialog open={Boolean(action)} onOpenChange={(open) => !open && !pending && onClose()}><DialogContent>
    <DialogHeader><DialogTitle>{approving ? 'Duyệt và khóa bảng lương?' : 'Tạo phiên bản điều chỉnh?'}</DialogTitle><DialogDescription>{action ? (approving ? `Bảng lương phiên bản ${action.record.versionNumber} của ${action.employeeName} sẽ được khóa ở mức ${formatVnd(action.record.totalSalaryAmount)}. Sau đó không thể sửa trực tiếp.` : `Hệ thống sẽ sao chép bảng lương phiên bản ${action.record.versionNumber} của ${action.employeeName} thành một bản nháp mới để tính lại. Bản đã khóa vẫn được giữ nguyên.`) : ''}</DialogDescription></DialogHeader>
    <div className="rounded-xl border border-border bg-muted/30 p-4"><div className="flex items-center gap-3"><span className={`grid size-10 place-items-center rounded-full ${approving ? toneSurface.success : toneSurface.info}`}>{approving ? <LockKeyhole className="size-5" /> : <RefreshCw className="size-5" />}</span><div><strong className="block">{action?.employeeName}</strong><span className="text-xs text-muted-foreground">Phiên bản {action?.record.versionNumber} · {action ? formatVnd(action.record.totalSalaryAmount) : ''}</span></div></div></div>
    <DialogFooter><DialogClose asChild><Button variant="outline" disabled={pending}>Hủy</Button></DialogClose><Button onClick={onConfirm} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : approving ? <ShieldCheck className="size-4" /> : <RefreshCw className="size-4" />}{approving ? 'Xác nhận duyệt' : 'Tạo bản điều chỉnh'}</Button></DialogFooter>
  </DialogContent></Dialog>
}

function BreakdownTable({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; name: string; progress: string; threshold: string; configured: string; earned: string; achieved: boolean }> }) {
  return <Card className="overflow-hidden py-0"><CardContent className="p-0"><div className="border-b border-border p-4"><h3 className="text-sm font-semibold text-foreground">{title}</h3></div>{rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{empty}</p> : <Table><TableHeader><TableRow><TableHead>Hạng mục</TableHead><TableHead>Tiến độ / ngưỡng</TableHead><TableHead>Mức cấu hình</TableHead><TableHead>Thực nhận</TableHead><TableHead>Kết quả</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell>{formatPercent(row.progress)} / {formatPercent(row.threshold)}</TableCell><TableCell>{formatVnd(row.configured)}</TableCell><TableCell className="font-semibold">{formatVnd(row.earned)}</TableCell><TableCell><StatusBadge tone={row.achieved ? 'success' : 'danger'}>{row.achieved ? 'Đạt' : 'Không đạt'}</StatusBadge></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
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

/** Cộng hai khoản tiền dạng chuỗi thập phân mà không mất chính xác. */
function sumAmountStrings(...values: Array<string | null>) {
  try {
    return values.reduce<bigint>((total, value) => total + BigInt((value ?? '0').split('.')[0] || '0'), 0n).toString()
  } catch {
    return null
  }
}

function ErrorCard({ onRetry }: { onRetry: () => unknown }) {
  return <div className="p-1"><ErrorState description="Không tải được dữ liệu lương." onRetry={() => onRetry()} /></div>
}

function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-3 py-2 ${strong ? 'pt-3 font-bold' : ''}`}><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value}</dd></div>
}

function formatVnd(value: string | null) {
  if (value === null) return '—'
  try { return `${BigInt(value.split('.')[0] || '0').toLocaleString('vi-VN')} ₫` } catch { return `${value} ₫` }
}

function formatNumber(value: string) {
  try { return BigInt(value).toLocaleString('vi-VN') } catch { return value }
}

function formatPercent(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%` : `${value}%`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function initials(fullName: string) {
  return fullName.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toLocaleUpperCase('vi-VN')
}

function periodStatusLabel(status: string) {
  const labels: Record<string, string> = { DRAFT: 'Bản nháp', OPEN: 'Đang mở', IN_REVIEW: 'Đang duyệt', CLOSED: 'Đã đóng' }
  return labels[status] ?? status
}
