import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  CircleCheck,
  Download,
  FileClock,
  FileText,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  closePayrollPeriod,
  createPayrollPeriod,
  getApiErrorMessage,
  getPayrollPeriodEmployeeReadiness,
  listPayrollPeriodEmployeeSnapshots,
  listPayrollPeriodYears,
  listPayrollPeriods,
  openPayrollPeriod,
  startReviewPayrollPeriod,
  syncPayrollPeriodEmployeeSnapshots,
  type PayrollPeriod,
  type PayrollPeriodEmployeeReadiness,
  type PayrollPeriodStatus,
} from '@/api/payroll-periods'
import { useAuth } from '@/auth/AuthContext'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DeadlineChip } from '@/components/shared/DeadlineChip'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState } from '@/components/shared/ErrorState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { WorkflowSteps } from '@/components/shared/WorkflowSteps'
import { usePayrollPeriodSelection } from '@/contexts/PayrollPeriodContext'
import { daysUntil, formatDate, formatNumber } from '@/lib/format'
import { selectDefaultPayrollPeriod } from '@/lib/payroll-period'
import { toneSurface, type Tone } from '@/lib/tone'

const ALL = '__all__'
const PERIOD_DETAIL_ID = 'period-detail'

const PERIOD_STEPS: PayrollPeriodStatus[] = ['DRAFT', 'OPEN', 'IN_REVIEW', 'CLOSED']
const STATUS_LABEL: Record<PayrollPeriodStatus, string> = {
  DRAFT: 'Nháp',
  OPEN: 'Đang mở',
  IN_REVIEW: 'Đang duyệt',
  CLOSED: 'Đã khóa',
}
// Đã khóa là trạng thái hoàn tất bình thường, không phải lỗi — nên không dùng tông đỏ.
const STATUS_TONE: Record<PayrollPeriodStatus, Tone> = {
  DRAFT: 'muted',
  OPEN: 'success',
  IN_REVIEW: 'warning',
  CLOSED: 'info',
}
const STATUS_ICON: Record<PayrollPeriodStatus, LucideIcon> = {
  DRAFT: FileText,
  OPEN: CalendarDays,
  IN_REVIEW: FileClock,
  CLOSED: Lock,
}
const STATUS_HINT: Record<PayrollPeriodStatus, string> = {
  DRAFT: 'Kỳ vừa tạo, chưa snapshot tổ chức',
  OPEN: 'Đang thu thập traffic, doanh thu, KPI',
  IN_REVIEW: 'Đang duyệt dữ liệu và bảng lương',
  CLOSED: 'Đã chốt, chỉ xem lại',
}
const PERIOD_KEYS = {
  periods: ['payroll-periods'] as const,
  snapshots: (id: string) => ['payroll-periods', id, 'snapshots'] as const,
  readiness: (id: string) => ['payroll-periods', id, 'employee-readiness'] as const,
}
const PERIODS_PAGE_SIZE = 12
// BE giới hạn pageSize tối đa 100 (PaginationQueryDto) — không thể vượt qua giá trị này.
const SNAPSHOTS_PAGE_SIZE = 100

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function PayrollStatusMetric({
  status,
  value,
  loading,
  selected,
  onSelect,
}: {
  status: PayrollPeriodStatus
  value: number
  loading: boolean
  selected: boolean
  onSelect?: () => void
}) {
  const Icon = STATUS_ICON[status]
  const content = (
    <div className={`flex min-h-22 items-center gap-3 rounded-2xl border px-5 py-4 text-left transition-colors sm:min-h-24 lg:px-6 ${selected ? 'border-primary/35 bg-primary/5' : 'border-border bg-card group-hover:bg-muted/40'}`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${toneSurface[STATUS_TONE[status]]}`}>
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Kỳ {STATUS_LABEL[status].toLowerCase()}</p>
        {loading ? <Skeleton className="mt-1.5 h-6 w-16" /> : <strong className="mt-0.5 block text-xl font-bold tracking-tight text-foreground tabular-nums">{formatNumber(value)}</strong>}
        <p className={`mt-1 truncate text-xs ${selected ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
          {selected ? 'Đang lọc theo trạng thái này' : STATUS_HINT[status]}
        </p>
      </div>
    </div>
  )

  return onSelect ? (
    <button type="button" className="group w-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onSelect} aria-pressed={selected}>
      {content}
    </button>
  ) : content
}

export function PayrollPeriodsPage() {
  const { user } = useAuth()
  const {
    periods: allPeriods,
    selectedPeriod,
    selectedPeriodId: selectedId,
    isPeriodSelectionExplicit,
    selectPeriod: selectGlobalPeriod,
    resetPeriodSelection,
  } = usePayrollPeriodSelection()
  const selectedYear = selectedPeriod?.payrollYear ?? new Date().getFullYear()
  const canManage = user?.permissions.includes('payroll_period.manage') ?? false
  const canExport = user?.permissions.includes('report.export') ?? false
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [search, setSearch] = useState('')

  const periodsQuery = useQuery({
    queryKey: [...PERIOD_KEYS.periods, { year: selectedYear, pageSize: PERIODS_PAGE_SIZE }],
    queryFn: () => listPayrollPeriods({ year: selectedYear, page: 1, pageSize: PERIODS_PAGE_SIZE }),
  })
  const yearsQuery = useQuery({
    queryKey: [...PERIOD_KEYS.periods, 'years'],
    queryFn: listPayrollPeriodYears,
    staleTime: 60_000,
  })
  const periodsData = periodsQuery.data?.data
  const periods = periodsData ?? []
  const availableYears = Array.from(new Set([new Date().getFullYear(), ...(yearsQuery.data ?? [])])).sort((a, b) => b - a)

  function changeYear(year: number) {
    setStatusFilter(ALL)
    setSearch('')
    const nextPeriod = selectDefaultPayrollPeriod(allPeriods.filter((item) => item.payrollYear === year))
    if (nextPeriod) selectGlobalPeriod(nextPeriod.id)
  }

  const highlighted = useMemo(() => {
    const list = periodsData ?? []
    if (selectedId) {
      const found = list.find((item) => item.id === selectedId)
      if (found) return found
    }
    return selectDefaultPayrollPeriod(list)
  }, [periodsData, selectedId])

  const countByStatus = useMemo(() => {
    const counts: Record<PayrollPeriodStatus, number> = { DRAFT: 0, OPEN: 0, IN_REVIEW: 0, CLOSED: 0 }
    for (const item of periodsData ?? []) counts[item.status] += 1
    return counts
  }, [periodsData])

  const isFiltering = statusFilter !== ALL || search.trim() !== ''
  const filteredPeriods = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (periodsData ?? [])
      .filter((item) => {
        if (statusFilter !== ALL && item.status !== statusFilter) return false
        if (!term) return true
        return item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term)
      })
      // Kỳ mới nhất lên đầu: người dùng gần như luôn làm việc với kỳ gần đây.
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
  }, [periodsData, search, statusFilter])

  const snapshotsQuery = useQuery({
    queryKey: highlighted ? PERIOD_KEYS.snapshots(highlighted.id) : ['payroll-periods', 'snapshots', 'none'],
    queryFn: () =>
      listPayrollPeriodEmployeeSnapshots(highlighted!.id, { page: 1, pageSize: SNAPSHOTS_PAGE_SIZE }),
    enabled: Boolean(highlighted && highlighted.status !== 'DRAFT' && canManage),
  })
  const snapshots = snapshotsQuery.data?.data ?? []
  const leaderCount = new Set(snapshots.map((item) => item.leaderEmployeeIdSnapshot).filter(Boolean)).size
  const managerCount = new Set(snapshots.map((item) => item.managerEmployeeIdSnapshot).filter(Boolean)).size

  // Tiền kiểm dữ liệu nhân sự: chỉ có ý nghĩa ở hai trạng thái còn tạo snapshot (Nháp sắp mở kỳ,
  // Đang mở sắp đồng bộ) — biết trước ai lệch để sửa thay vì bấm nút rồi nhận lỗi.
  const needsReadinessCheck =
    canManage && (highlighted?.status === 'DRAFT' || highlighted?.status === 'OPEN')
  const readinessQuery = useQuery({
    queryKey: highlighted
      ? PERIOD_KEYS.readiness(highlighted.id)
      : ['payroll-periods', 'employee-readiness', 'none'],
    queryFn: () => getPayrollPeriodEmployeeReadiness(highlighted!.id),
    enabled: Boolean(highlighted) && needsReadinessCheck,
  })
  const readiness = needsReadinessCheck ? readinessQuery.data : undefined

  function selectPeriod(id: string) {
    selectGlobalPeriod(id)
    document.getElementById(PERIOD_DETAIL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function filterByStatus(status: PayrollPeriodStatus) {
    setStatusFilter(status)
    setSearch('')
  }

  function clearFilters() {
    setStatusFilter(ALL)
    setSearch('')
  }

  function exportPeriodsCsv() {
    const rows = [
      ['Mã kỳ', 'Tên kỳ lương', 'Từ ngày', 'Đến ngày', 'Hạn duyệt', 'Trạng thái'],
      ...filteredPeriods.map((item) => [
        item.code,
        item.name,
        formatDate(item.startDate, ''),
        formatDate(item.endDate, ''),
        formatDate(item.approvalDeadline, ''),
        STATUS_LABEL[item.status],
      ]),
    ]
    downloadCsv(`ky-luong-${selectedYear}.csv`, rows)
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Vận hành lương"
        title="Kỳ lương"
        description={canManage
          ? `Hệ thống tự tạo và mở kỳ theo tháng; theo dõi vòng đời các kỳ năm ${selectedYear}.`
          : `Theo dõi các kỳ lương theo từng tháng của năm ${selectedYear}.`}
        meta={(
          <div className="flex flex-wrap items-center gap-2.5" aria-label="Bộ lọc năm kỳ lương">
            <Select value={String(selectedYear)} onValueChange={(value) => changeYear(Number(value))}>
              <SelectTrigger className="h-9 w-30" aria-label="Chọn năm quản lý kỳ lương"><SelectValue /></SelectTrigger>
              <SelectContent>{availableYears.map((year) => <SelectItem key={year} value={String(year)}>Năm {year}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground"><strong className="font-semibold text-foreground tabular-nums">{periods.length}/12</strong> tháng đã có kỳ lương</span>
          </div>
        )}
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => periodsQuery.refetch()} disabled={periodsQuery.isFetching} title="Làm mới danh sách kỳ lương" aria-label="Làm mới danh sách kỳ lương">
              <RefreshCw className={`size-4 ${periodsQuery.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
            {canExport && periods.length > 0 ? (
              <Button variant="outline" size="icon" onClick={exportPeriodsCsv} title="Xuất CSV danh sách kỳ lương" aria-label="Xuất CSV danh sách kỳ lương">
                <Download className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
            {canManage ? <CreatePeriodDialog /> : null}
          </div>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Thống kê kỳ lương">
        {PERIOD_STEPS.map((status) => (
          <PayrollStatusMetric
            key={status}
            status={status}
            value={countByStatus[status]}
            loading={periodsQuery.isLoading}
            selected={statusFilter === status}
            onSelect={countByStatus[status] > 0 ? () => filterByStatus(status) : undefined}
          />
        ))}
      </section>

      {periodsQuery.isError ? (
        <ErrorState description={getApiErrorMessage(periodsQuery.error)} onRetry={() => void periodsQuery.refetch()} retrying={periodsQuery.isFetching} />
      ) : null}

      {periodsQuery.isLoading ? (
        <section className="grid gap-4 xl:grid-cols-5">
          <Card className="py-0 xl:col-span-3"><CardContent className="space-y-4 p-5">
            <Skeleton className="h-5 w-24" /><Skeleton className="h-7 w-56" /><Skeleton className="h-16 w-full" />
          </CardContent></Card>
          <Card className="py-0 xl:col-span-2"><CardContent className="space-y-4 p-5">
            <Skeleton className="h-4 w-32" /><Skeleton className="h-20 w-full" />
          </CardContent></Card>
        </section>
      ) : !highlighted ? (
        <Card className="py-0">
          <EmptyState
            icon={CalendarPlus}
            title={`Chưa có kỳ lương năm ${selectedYear}`}
            description={canManage
              ? 'Hệ thống sẽ tự tạo kỳ khi bước sang tháng mới; bạn cũng có thể tạo thủ công để chuẩn bị trước.'
              : 'Chưa có kỳ lương nào trong năm được chọn.'}
            action={canManage ? <CreatePeriodDialog /> : undefined}
          />
        </Card>
      ) : (
        <>
          {readiness && !readiness.ready ? <EmployeeReadinessAlert readiness={readiness} /> : null}

          <section id={PERIOD_DETAIL_ID} className="grid scroll-mt-24 gap-4 xl:grid-cols-5">
            <Card className="py-0 xl:col-span-3">
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={STATUS_TONE[highlighted.status]}>{STATUS_LABEL[highlighted.status]}</StatusBadge>
                      <code className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{highlighted.code}</code>
                      {isPeriodSelectionExplicit && selectedId === highlighted.id ? (
                        <button
                          type="button"
                          onClick={resetPeriodSelection}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <X className="size-3" aria-hidden="true" />
                          Bỏ chọn, xem kỳ đang xử lý
                        </button>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-xl font-bold">{highlighted.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(highlighted.startDate)} — {formatDate(highlighted.endDate)}
                    </p>
                    {highlighted.approvalDeadline && highlighted.status !== 'CLOSED' ? (
                      <DeadlineChip className="mt-2" deadline={highlighted.approvalDeadline} />
                    ) : null}
                  </div>
                  <PeriodActions period={highlighted} canManage={canManage} readiness={readiness} />
                </div>

                <WorkflowSteps
                  className="mt-7"
                  steps={PERIOD_STEPS.map((step) => ({ label: STATUS_LABEL[step], hint: STATUS_HINT[step] }))}
                  currentIndex={PERIOD_STEPS.indexOf(highlighted.status)}
                />
              </CardContent>
            </Card>

            {canManage ? (
              <Card className="py-0 xl:col-span-2">
                <CardContent className="p-5">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">Snapshot tổ chức</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Dữ liệu nhân sự đã đóng băng theo kỳ</p>
                  {highlighted.status === 'DRAFT' ? (
                    <EmptyState
                      size="sm"
                      icon={UsersRound}
                      title="Chưa có snapshot"
                      description="Snapshot tổ chức được tạo ngay khi mở kỳ. Trước đó, mọi thay đổi nhân sự vẫn được áp dụng bình thường."
                    />
                  ) : (
                    <div className="mt-5 grid grid-cols-3 divide-x rounded-lg border bg-muted/30 text-center">
                      <SnapshotStat label="Nhân sự" value={snapshotsQuery.data?.meta.total ?? 0} loading={snapshotsQuery.isLoading} />
                      <SnapshotStat label="Leader" value={leaderCount} loading={snapshotsQuery.isLoading} />
                      <SnapshotStat label="Manager" value={managerCount} loading={snapshotsQuery.isLoading} />
                    </div>
                  )}
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    Thay đổi tổ chức sau khi mở kỳ không làm đổi phạm vi dữ liệu của kỳ hiện tại.
                  </p>
                </CardContent>
              </Card>
            ) : null}
          </section>
        </>
      )}

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="overflow-hidden py-0 xl:col-span-3">
          <CardContent className="p-0">
            <div className="flex flex-col gap-4 border-b border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-foreground">Các kỳ lương năm {selectedYear}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Chọn một kỳ để xem chi tiết phía trên</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {isFiltering
                    ? `${formatNumber(filteredPeriods.length)}/${formatNumber(periods.length)} kỳ`
                    : `${formatNumber(periods.length)} kỳ`}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_11rem]">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    className="w-full min-w-0 pr-9 pl-8"
                    placeholder="Tìm theo tên hoặc mã kỳ"
                    aria-label="Tìm kỳ lương"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Xoá từ khoá tìm kiếm"
                      className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full" aria-label="Lọc theo trạng thái kỳ">
                    <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
                    {PERIOD_STEPS.map((status) => (
                      <SelectItem key={status} value={status}>{STATUS_LABEL[status]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {periodsQuery.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
            ) : filteredPeriods.length === 0 ? (
              <EmptyState
                size="sm"
                icon={FileText}
                title={isFiltering ? 'Không có kỳ lương phù hợp' : 'Chưa có kỳ lương nào'}
                description={isFiltering
                  ? 'Không có kỳ nào khớp từ khoá và trạng thái đang chọn.'
                  : 'Tạo kỳ lương đầu tiên để bắt đầu vận hành.'}
                action={isFiltering
                  ? <Button variant="outline" onClick={clearFilters}><X className="size-4" />Xoá bộ lọc</Button>
                  : canManage ? <CreatePeriodDialog /> : undefined}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kỳ lương</TableHead>
                    <TableHead>Khoảng thời gian</TableHead>
                    <TableHead>Hạn duyệt</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPeriods.map((item) => {
                    const isActive = highlighted?.id === item.id
                    const remainingDays = item.status === 'CLOSED' ? null : daysUntil(item.approvalDeadline)

                    return (
                      <TableRow
                        key={item.id}
                        onClick={() => selectPeriod(item.id)}
                        className={`cursor-pointer ${isActive ? 'bg-primary/5 hover:bg-primary/5' : ''}`}
                      >
                        <TableCell>
                          <strong className="block font-semibold text-foreground">{item.name}</strong>
                          <code className="text-xs text-muted-foreground">{item.code}</code>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(item.startDate)} — {formatDate(item.endDate)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(item.approvalDeadline)}
                          {remainingDays !== null && remainingDays <= 7 ? (
                            <span className={`mt-0.5 block text-xs font-semibold ${remainingDays < 0 ? 'text-[var(--danger-700)]' : 'text-[var(--warning-700)]'}`}>
                              {remainingDays < 0 ? `Quá hạn ${Math.abs(remainingDays)} ngày` : remainingDays === 0 ? 'Hạn hôm nay' : `Còn ${remainingDays} ngày`}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                              <CircleCheck className="size-3.5" aria-hidden="true" />
                              Đang xem
                            </span>
                          ) : (
                            <Button variant="ghost" size="sm" aria-label={`Xem chi tiết kỳ ${item.name}`}>
                              Xem chi tiết
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {canManage ? (
          <Card className="py-0 xl:col-span-2">
            <CardContent className="p-5">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Vòng đời kỳ lương</h2>
              <p className="mt-1 text-xs text-muted-foreground">Ba nguyên tắc không thể đảo ngược</p>
              <div className="mt-5 space-y-4">
                <Rule
                  icon={CalendarDays}
                  title="Mở kỳ tạo snapshot"
                  detail="Nhân sự, nhóm nghiệp vụ và quan hệ Leader/Manager được snapshot; các nhóm KPI phù hợp được tự động gán ngay khi mở kỳ."
                />
                <Rule
                  icon={CircleCheck}
                  title="Không chuyển ngược trạng thái"
                  detail="Nháp → Đang mở → Đang duyệt → Đã khóa, mỗi bước chỉ đi tới, không quay lại được."
                />
                <Rule
                  icon={AlertTriangle}
                  title="Khóa kỳ là chốt cuối"
                  detail="Sau khi khóa, không thể mở lại hay sửa dữ liệu snapshot của kỳ đó."
                />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  )
}

function PeriodActions({
  period,
  canManage,
  readiness,
}: {
  period: PayrollPeriod
  canManage: boolean
  readiness?: PayrollPeriodEmployeeReadiness
}) {
  const queryClient = useQueryClient()
  const [confirmClose, setConfirmClose] = useState(false)
  // BE chặn cứng snapshot khi còn nhân sự lệch, nên khóa nút luôn cho khỏi bấm vào chỗ chắc chắn lỗi.
  const blockedByEmployeeData = Boolean(readiness && !readiness.ready)

  const openMutation = useMutation({
    mutationFn: () => openPayrollPeriod(period.id),
    onSuccess: ({ automaticKpiAssignmentCount }) => {
      void queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.periods })
      void queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.snapshots(period.id) })
      void queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.readiness(period.id) })
      toast.success(`Đã mở kỳ lương và tự gán ${automaticKpiAssignmentCount ?? 0} nhóm KPI`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const startReviewMutation = useMutation({
    mutationFn: () => startReviewPayrollPeriod(period.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.periods })
      toast.success('Đã chuyển kỳ sang duyệt dữ liệu')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const syncSnapshotsMutation = useMutation({
    mutationFn: () => syncPayrollPeriodEmployeeSnapshots(period.id),
    onSuccess: ({ addedCount, addedEmployeeNames, automaticKpiAssignmentCount }) => {
      void queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.snapshots(period.id) })
      void queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.readiness(period.id) })
      if (addedCount === 0) {
        toast.info('Không có nhân sự mới cần thêm — danh sách đã đầy đủ.')
      } else {
        toast.success(`Đã thêm ${addedCount} nhân sự và tự gán ${automaticKpiAssignmentCount} nhóm KPI: ${addedEmployeeNames.join(', ')}`)
      }
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const closeMutation = useMutation({
    mutationFn: () => closePayrollPeriod(period.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.periods })
      toast.success('Đã khóa kỳ lương')
      setConfirmClose(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  if (!canManage) return null

  if (period.status === 'DRAFT') {
    return (
      <Button
        onClick={() => openMutation.mutate()}
        disabled={openMutation.isPending || blockedByEmployeeData}
        title={blockedByEmployeeData ? 'Còn nhân sự chưa đủ điều kiện snapshot — xem cảnh báo phía trên' : undefined}
      >
        {openMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Mở kỳ
      </Button>
    )
  }

  if (period.status === 'OPEN') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => syncSnapshotsMutation.mutate()}
          disabled={syncSnapshotsMutation.isPending || blockedByEmployeeData}
          title={blockedByEmployeeData ? 'Còn nhân sự chưa đủ điều kiện snapshot — xem cảnh báo phía trên' : undefined}
        >
          {syncSnapshotsMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Đồng bộ nhân sự
        </Button>
        <Button onClick={() => startReviewMutation.mutate()} disabled={startReviewMutation.isPending}>
          {startReviewMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Chuyển sang duyệt
        </Button>
      </div>
    )
  }

  if (period.status === 'IN_REVIEW') {
    return (
      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogTrigger asChild>
          <Button variant="destructive">Khóa kỳ</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Khóa kỳ lương {period.name}?</DialogTitle>
            <DialogDescription>
              Không thể mở lại hay sửa dữ liệu sau khi khóa. Xác nhận toàn bộ dữ liệu đã sẵn sàng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
              {closeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Xác nhận khóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return null
}

function EmployeeReadinessAlert({ readiness }: { readiness: PayrollPeriodEmployeeReadiness }) {
  const scopeLabel =
    readiness.scope === 'MISSING'
      ? 'Nhân sự chưa có trong snapshot của kỳ này'
      : 'Nhân sự sẽ được đưa vào snapshot khi mở kỳ'
  // BE trả tối đa 50 dòng chi tiết — phần còn lại chỉ đếm số để Admin biết còn sót.
  const hiddenCount = readiness.invalidEmployeeCount - readiness.employees.length

  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>
        {formatNumber(readiness.invalidEmployeeCount)} nhân sự chưa đủ điều kiện snapshot
      </AlertTitle>
      <AlertDescription>
        <p>
          {scopeLabel} phải có đúng một team chính và tổng tỷ trọng KPI bằng 100%. Sửa ở trang Nhân
          sự — nút “Teams” của từng người — rồi quay lại. Trong lúc còn sai, nút mở kỳ và đồng bộ
          nhân sự bị khóa vì hệ thống sẽ từ chối tạo snapshot.
        </p>
        <ul className="mt-2 space-y-1">
          {readiness.employees.map((employee) => (
            <li key={employee.id}>
              <strong className="font-semibold text-foreground">{employee.fullName}</strong>
              {employee.employeeCode ? ` (${employee.employeeCode})` : ''} — {employee.reasons.join('; ')}
            </li>
          ))}
        </ul>
        {hiddenCount > 0 ? <p className="mt-2">…và {formatNumber(hiddenCount)} nhân sự khác.</p> : null}
        <Button asChild variant="outline" size="sm" className="mt-3 bg-card">
          <Link to="/employees">
            <UsersRound className="size-4" aria-hidden="true" />
            Mở trang Nhân sự để sửa
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function CreatePeriodDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [month, setMonth] = useState('')
  const [approvalDeadline, setApprovalDeadline] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName('')
      setMonth('')
      setApprovalDeadline('')
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const { startDate, endDate } = monthRange(month)
      return createPayrollPeriod({
        name: name.trim(),
        startDate,
        endDate,
        approvalDeadline: approvalDeadline || undefined,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PERIOD_KEYS.periods })
      toast.success('Đã tạo kỳ lương (Nháp)')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!name.trim() || !month) {
      setFormError('Nhập tên kỳ và chọn tháng lương.')
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Tạo kỳ mới
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo kỳ lương mới</DialogTitle>
        <DialogDescription>Mỗi tháng chỉ có một kỳ. Kỳ tạo thủ công ở trạng thái Nháp để kiểm tra trước khi mở.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="period-name">Tên kỳ</Label>
            <Input
              id="period-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Kỳ lương tháng 10/2026"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="period-month">Tháng lương</Label>
            <Input id="period-month" type="month" value={month} onChange={(event) => {
              const value = event.target.value
              setMonth(value)
              if (value && !name.trim()) {
                const [year, monthNumber] = value.split('-')
                setName(`Kỳ lương tháng ${monthNumber}/${year}`)
              }
            }} />
            <p className="text-xs text-muted-foreground">Khoảng kỳ được tự động tính từ ngày đầu đến ngày cuối tháng.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="period-deadline">Hạn duyệt dữ liệu (không bắt buộc)</Label>
            <Input
              id="period-deadline"
              type="date"
              value={approvalDeadline}
              onChange={(event) => setApprovalDeadline(event.target.value)}
            />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Tạo kỳ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function monthRange(value: string) {
  const [yearText, monthText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    startDate: `${yearText}-${monthText}-01`,
    endDate: `${yearText}-${monthText}-${String(lastDay).padStart(2, '0')}`,
  }
}

function SnapshotStat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="p-3">
      <UsersRound className="mx-auto size-4 text-muted-foreground" aria-hidden="true" />
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mx-auto mt-1.5 h-5 w-10" />
      ) : (
        <strong className="mt-1 block text-base tabular-nums">{formatNumber(value)}</strong>
      )}
    </div>
  )
}

function Rule({ icon: Icon, title, detail }: { icon: typeof CalendarDays; title: string; detail: string }) {
  return (
    <div className="flex gap-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-md ${toneSurface.info}`}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span>
        <strong className="block text-sm">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
    </div>
  )
}
