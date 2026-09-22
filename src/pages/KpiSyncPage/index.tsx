import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, Clock3, Filter, Loader2, RefreshCw, ShieldCheck, TriangleAlert, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  getApiErrorMessage, getKpiSyncRun, listKpiSyncRuns, triggerKpiSync,
  type KpiSyncRun, type KpiSyncStatus,
} from '@/api/kpi-sync'
import { listTeams } from '@/api/organization'
import { listPayrollPeriods, type PayrollPeriodStatus } from '@/api/payroll-periods'
import { useAuth } from '@/auth/AuthContext'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDateTime, formatNumber, formatRelativeTime, toPercent } from '@/lib/format'
import { toneSurface, toneText, type Tone } from '@/lib/tone'

const RUNS_KEY = ['kpi-sync-runs'] as const
const ALL = '__all__'

const STATUS_LABEL: Record<KpiSyncStatus, string> = {
  RUNNING: 'Đang chạy',
  SUCCESS: 'Thành công',
  PARTIAL: 'Một phần',
  FAILED: 'Thất bại',
  SKIPPED: 'Đã bỏ qua',
}
const STATUS_ORDER: KpiSyncStatus[] = ['SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED', 'RUNNING']
const ITEM_STATUS_LABEL: Record<string, string> = {
  SUCCESS: 'Đã áp dụng',
  SKIPPED: 'Bỏ qua',
  FAILED: 'Lỗi',
  CONFLICT: 'Xung đột',
}
const RECORD_KIND_LABEL: Record<'TARGET' | 'ACTUAL', string> = {
  TARGET: 'Mục tiêu',
  ACTUAL: 'Thực đạt',
}
const PERIOD_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp',
  OPEN: 'Đang mở',
  IN_REVIEW: 'Đang duyệt',
  CLOSED: 'Đã khóa',
}

function statusTone(status: KpiSyncStatus): Tone {
  if (status === 'SUCCESS') return 'success'
  if (status === 'PARTIAL' || status === 'SKIPPED') return 'warning'
  if (status === 'FAILED') return 'danger'
  return 'info'
}

function needsAttention(run: KpiSyncRun) {
  return run.conflictRecords + run.manualEntryCount + run.failedRecords
}

export function KpiSyncPage() {
  const { user } = useAuth()
  const canView = user?.permissions.includes('sync.view') ?? false
  const canTrigger = user?.permissions.includes('sync.trigger') ?? false
  const [detailId, setDetailId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>(ALL)

  const runsQuery = useQuery({
    queryKey: RUNS_KEY,
    queryFn: () => listKpiSyncRuns({ page: 1, pageSize: 50 }),
    enabled: canView,
    // Lượt đang chạy tự cập nhật, không bắt người dùng F5 để biết đã xong chưa.
    refetchInterval: (query) =>
      (query.state.data?.data ?? []).some((run) => run.status === 'RUNNING') ? 5_000 : false,
  })
  const runs = useMemo(() => runsQuery.data?.data ?? [], [runsQuery.data])
  const latest = runs[0]
  const isFiltering = statusFilter !== ALL
  const filteredRuns = isFiltering ? runs.filter((run) => run.status === statusFilter) : runs

  if (!canView) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          eyebrow="Tích hợp dữ liệu"
          title="Đồng bộ KPI"
          description="Nhận target và actual KPI một chiều từ AutomationGenVideo theo team và kỳ lương."
        />
        <Card className="py-0">
          <EmptyState
            icon={ShieldCheck}
            tone="warning"
            title="Không đủ quyền xem lịch sử đồng bộ"
            description="Tài khoản của bạn cần quyền sync.view để xem các lượt đồng bộ KPI. Liên hệ quản trị hệ thống để được cấp quyền."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Tích hợp dữ liệu"
        title="Đồng bộ KPI"
        description="Nhận target và actual KPI một chiều từ AutomationGenVideo theo team và kỳ lương."
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => runsQuery.refetch()} disabled={runsQuery.isFetching}>
              <RefreshCw className={`size-4 ${runsQuery.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">{runsQuery.isFetching ? 'Đang tải…' : 'Làm mới'}</span>
            </Button>
            {canTrigger ? <RunSyncDialog /> : null}
          </div>
        )}
      />

      {runsQuery.isError ? (
        <ErrorState
          description={getApiErrorMessage(runsQuery.error)}
          onRetry={() => void runsQuery.refetch()}
          retrying={runsQuery.isFetching}
        />
      ) : null}

      {latest?.status === 'RUNNING' ? (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertTitle>Đang chạy một lượt đồng bộ</AlertTitle>
          <AlertDescription>Trang tự cập nhật sau mỗi 5 giây, bạn không cần tải lại.</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số đồng bộ KPI">
        <MetricCard
          icon={Clock3}
          tone="info"
          label="Lần chạy gần nhất"
          value={latest ? formatRelativeTime(latest.startedAt) : 'Chưa có'}
          valueTitle={latest ? formatDateTime(latest.startedAt) : undefined}
          note={latest ? `${latest.payrollPeriod.name} · ${formatDateTime(latest.startedAt)}` : 'Chưa từng đồng bộ KPI'}
          loading={runsQuery.isLoading}
        />
        <MetricCard
          icon={CheckCircle2}
          tone={latest && toPercent(latest.successfulRecords, latest.receivedRecords) === 100 ? 'success' : 'info'}
          label="Tỉ lệ áp dụng"
          value={latest ? `${toPercent(latest.successfulRecords, latest.receivedRecords)}%` : '—'}
          progress={latest ? toPercent(latest.successfulRecords, latest.receivedRecords) : undefined}
          note={latest
            ? `${formatNumber(latest.successfulRecords)}/${formatNumber(latest.receivedRecords)} dòng nhận từ nguồn`
            : 'Chưa có dữ liệu'}
          loading={runsQuery.isLoading}
        />
        <MetricCard
          icon={RefreshCw}
          tone="info"
          label="Dòng đã bỏ qua"
          value={latest ? formatNumber(latest.skippedRecords) : '0'}
          note="Nguồn trống hoặc dữ liệu đã được bảo vệ"
          loading={runsQuery.isLoading}
        />
        <MetricCard
          icon={TriangleAlert}
          tone={latest && needsAttention(latest) > 0 ? 'warning' : 'success'}
          label="Cần xử lý"
          value={latest ? formatNumber(needsAttention(latest)) : '0'}
          note={latest
            ? `${formatNumber(latest.conflictRecords)} xung đột · ${formatNumber(latest.manualEntryCount)} nhập tay · ${formatNumber(latest.failedRecords)} lỗi`
            : 'Chưa có dữ liệu'}
          loading={runsQuery.isLoading}
          onSelect={latest && needsAttention(latest) > 0 ? () => setDetailId(latest.id) : undefined}
        />
      </section>

      {runsQuery.isLoading ? (
        <Card className="py-0">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </CardContent>
        </Card>
      ) : latest ? (
        <LatestRun run={latest} onDetail={() => setDetailId(latest.id)} />
      ) : (
        <Card className="py-0">
          <EmptyState
            icon={RefreshCw}
            title="Chưa có lượt đồng bộ KPI nào"
            description="Chạy lượt đồng bộ đầu tiên để nhận mục tiêu và kết quả KPI từ AutomationGenVideo cho team và kỳ lương tương ứng."
            action={canTrigger ? <RunSyncDialog /> : undefined}
          />
        </Card>
      )}

      <HistoryTable
        runs={filteredRuns}
        totalCount={runs.length}
        loading={runsQuery.isLoading}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onDetail={setDetailId}
      />

      <RunDetailDialog id={detailId} onOpenChange={(open) => !open && setDetailId(null)} />
    </div>
  )
}

function LatestRun({ run, onDetail }: { run: KpiSyncRun; onDetail: () => void }) {
  const attention = needsAttention(run)

  return (
    <Card className="py-0">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Lượt chạy gần nhất · tháng {run.month}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{run.payrollPeriod.name}</h2>
              <StatusBadge tone={statusTone(run.status)}>{STATUS_LABEL[run.status]}</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateTime(run.startedAt)}
              {run.finishedAt ? ` — ${formatDateTime(run.finishedAt)}` : ' · chưa kết thúc'}
              {run.triggeredBy ? ` · do ${run.triggeredBy.fullName} kích hoạt` : ''}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onDetail}>Xem chi tiết</Button>
        </div>

        <div className="mt-5 grid grid-cols-2 divide-x divide-y rounded-lg border bg-muted/20 sm:grid-cols-5 sm:divide-y-0">
          <Stat label="Nhận từ nguồn" value={run.receivedRecords} />
          <Stat label="Áp dụng" value={run.successfulRecords} tone={run.successfulRecords > 0 ? 'success' : 'muted'} />
          <Stat label="Bỏ qua" value={run.skippedRecords} />
          <Stat label="Xung đột" value={run.conflictRecords} tone={run.conflictRecords > 0 ? 'danger' : 'muted'} />
          <Stat label="Cần nhập tay" value={run.manualEntryCount} tone={run.manualEntryCount > 0 ? 'warning' : 'muted'} />
        </div>

        {attention > 0 ? (
          <p className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.warning}`}>
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Còn {formatNumber(attention)} dòng cần xử lý tay. Mở chi tiết để xem từng dòng và lý do.
          </p>
        ) : null}
        {run.skippedRecords > 0 ? (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Dòng bị bỏ qua là các trường nguồn không có dữ liệu, hoặc kết quả đã được tự xác nhận/duyệt và kỳ đã khóa —
            hệ thống không ghi đè những dữ liệu này.
          </p>
        ) : null}
        {run.errorSummary ? (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${toneSurface.danger}`}>{run.errorSummary}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function HistoryTable({
  runs, totalCount, loading, statusFilter, onStatusFilterChange, onDetail,
}: {
  runs: KpiSyncRun[]
  totalCount: number
  loading: boolean
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  onDetail: (id: string) => void
}) {
  const isFiltering = statusFilter !== ALL

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Nhật ký tích hợp</p>
            <h2 className="mt-1 text-base font-bold">Lịch sử đồng bộ</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {isFiltering ? `${formatNumber(runs.length)}/${formatNumber(totalCount)} lượt` : `${formatNumber(totalCount)} lượt`}
            </span>
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger className="w-44" aria-label="Lọc theo kết quả đồng bộ">
                <Filter className="size-3.5 text-primary" aria-hidden="true" />
                <SelectValue placeholder="Kết quả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Mọi kết quả</SelectItem>
                {STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>{STATUS_LABEL[status]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-11 w-full" />)}</div>
        ) : runs.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Clock3}
            title={isFiltering ? 'Không có lượt nào khớp bộ lọc' : 'Chưa có lịch sử đồng bộ'}
            description={isFiltering
              ? 'Chọn kết quả khác để xem các lượt đồng bộ còn lại.'
              : 'Lịch sử sẽ xuất hiện sau lượt đồng bộ đầu tiên.'}
            action={isFiltering
              ? <Button variant="outline" onClick={() => onStatusFilterChange(ALL)}><X className="size-4" />Bỏ lọc</Button>
              : undefined}
          />
        ) : (
          <Table className="min-w-200">
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Kỳ lương</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead className="text-right">Áp dụng</TableHead>
                <TableHead className="text-right">Bỏ qua</TableHead>
                <TableHead className="text-right">Xung đột</TableHead>
                <TableHead className="text-right">Nhập tay</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id} className="cursor-pointer" onClick={() => onDetail(run.id)}>
                  <TableCell className="whitespace-nowrap">
                    <strong className="block font-medium text-foreground">{formatRelativeTime(run.startedAt)}</strong>
                    <span className="text-xs text-muted-foreground">{formatDateTime(run.startedAt)}</span>
                  </TableCell>
                  <TableCell>
                    <strong className="block font-semibold text-foreground">{run.payrollPeriod.name}</strong>
                    <span className="text-xs text-muted-foreground">Tháng {run.month}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={statusTone(run.status)}>{STATUS_LABEL[run.status]}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(run.successfulRecords)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(run.skippedRecords)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${run.conflictRecords > 0 ? `font-semibold ${toneText.danger}` : ''}`}>
                    {formatNumber(run.conflictRecords)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${run.manualEntryCount > 0 ? `font-semibold ${toneText.warning}` : ''}`}>
                    {formatNumber(run.manualEntryCount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" aria-label={`Xem chi tiết lượt đồng bộ ${formatDateTime(run.startedAt)}`}>
                      Chi tiết
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function RunSyncDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [teamId, setTeamId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const teamsQuery = useQuery({ queryKey: ['teams', 'kpi-sync'], queryFn: listTeams, enabled: open })
  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', 'kpi-sync'],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: 100 }),
    enabled: open,
  })
  const teams = useMemo(() => (teamsQuery.data ?? []).filter((team) => team.externalId && team.status === 'ACTIVE'), [teamsQuery.data])
  // Đồng bộ thuộc giai đoạn nhập liệu của kỳ. Từ "Đang duyệt" trở đi BE trả về lượt SKIPPED, nên
  // chỉ liệt kê kỳ đang mở thay vì để người dùng chạy một lượt chắc chắn không ghi được gì.
  const periods = useMemo(() => (periodsQuery.data?.data ?? []).filter((period) => period.status === 'OPEN'), [periodsQuery.data])
  const selectedTeamId = teamId || teams[0]?.externalId || ''
  const selectedPeriodId = periodId || periods[0]?.id || ''
  const mutation = useMutation({
    mutationFn: () => triggerKpiSync({ externalTeamId: selectedTeamId, payrollPeriodId: selectedPeriodId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RUNS_KEY })
      toast.success('Đã hoàn tất lượt đồng bộ KPI')
      setOpen(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><RefreshCw className="size-4" />Đồng bộ ngay</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo lượt đồng bộ KPI</DialogTitle>
          <DialogDescription>Chọn team nguồn và kỳ lương. Tháng được suy ra từ ngày bắt đầu kỳ.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Team AutomationGenVideo</Label>
            <Select value={selectedTeamId} onValueChange={setTeamId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn team" /></SelectTrigger>
              <SelectContent>
                {teams.map((team) => <SelectItem key={team.id} value={team.externalId!}>{team.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Kỳ lương</Label>
            <Select value={selectedPeriodId} onValueChange={setPeriodId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn kỳ lương" /></SelectTrigger>
              <SelectContent>
                {periods.map((period) => (
                  <SelectItem key={period.id} value={period.id}>
                    {period.name} · {PERIOD_STATUS_LABEL[period.status as PayrollPeriodStatus] ?? period.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quy tắc này chỉ cần biết ngay trước khi chạy, nên đặt tại đây thay vì chiếm chỗ cố định trên trang. */}
          <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.warning}`}>
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>Dữ liệu được bảo vệ:</strong> chỉ đồng bộ được vào kỳ đang mở. Trường nguồn trống sẽ bị bỏ
              qua và đánh dấu để nhập tay. Kết quả đã tự xác nhận hoặc đã duyệt không bị ghi đè.
            </span>
          </div>

          {teamsQuery.isError || periodsQuery.isError ? (
            <p className={`text-sm ${toneText.danger}`}>Không tải được danh sách team hoặc kỳ lương.</p>
          ) : null}
          {teams.length === 0 && !teamsQuery.isLoading ? (
            <p className={`text-sm ${toneText.warning}`}>Chưa có team AutomationGenVideo. Hãy đồng bộ cơ cấu tổ chức trước.</p>
          ) : null}
          {periods.length === 0 && !periodsQuery.isLoading ? (
            <p className={`text-sm ${toneText.warning}`}>Không có kỳ lương nào đang mở. Đồng bộ KPI chỉ chạy trong giai đoạn nhập liệu của kỳ.</p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose>
          <Button disabled={!selectedTeamId || !selectedPeriodId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {mutation.isPending ? 'Đang chạy…' : 'Chạy đồng bộ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RunDetailDialog({ id, onOpenChange }: { id: string | null; onOpenChange: (open: boolean) => void }) {
  const [onlyAttention, setOnlyAttention] = useState(false)
  const query = useQuery({ queryKey: ['kpi-sync-run', id], queryFn: () => getKpiSyncRun(id!), enabled: Boolean(id) })
  const items = query.data?.items ?? []
  const attentionItems = items.filter((item) => item.resultStatus !== 'SUCCESS' || item.manualEntryRequired)
  const visibleItems = onlyAttention ? attentionItems : items

  return (
    <Dialog open={Boolean(id)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Chi tiết đồng bộ KPI</DialogTitle>
          <DialogDescription>Mỗi record nguồn được xử lý riêng cho mục tiêu và thực đạt.</DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-52 w-full" />
          </div>
        ) : query.isError ? (
          <ErrorState description={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={statusTone(query.data.status)}>{STATUS_LABEL[query.data.status]}</StatusBadge>
              <span className="text-sm text-muted-foreground">
                {query.data.payrollPeriod.name} · {formatDateTime(query.data.startedAt)}
              </span>
            </div>

            {query.data.sourceWarnings?.length ? (
              <Alert>
                <AlertTriangle />
                <AlertTitle>Cảnh báo từ nguồn ({formatNumber(query.data.sourceWarnings.length)})</AlertTitle>
                <AlertDescription>
                  {query.data.sourceWarnings.slice(0, 5).map((warning) => warning.message).join(' · ')}
                </AlertDescription>
              </Alert>
            ) : null}

            {attentionItems.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">{formatNumber(attentionItems.length)}</strong>/{formatNumber(items.length)} dòng cần xem lại
                </span>
                <Button variant={onlyAttention ? 'default' : 'outline'} size="sm" className="h-7" onClick={() => setOnlyAttention((current) => !current)}>
                  <Filter className="size-3.5" aria-hidden="true" />
                  {onlyAttention ? 'Đang lọc dòng cần xử lý' : 'Chỉ hiện dòng cần xử lý'}
                </Button>
              </div>
            ) : null}

            {visibleItems.length === 0 ? (
              <EmptyState
                size="sm"
                icon={CheckCircle2}
                tone="success"
                title="Không có dòng nào cần xử lý"
                description="Toàn bộ dữ liệu nhận từ nguồn đã được áp dụng thành công."
              />
            ) : (
              <div className="max-h-[55vh] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nhân sự</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead className="text-right">Giá trị nhận</TableHead>
                      <TableHead>Kết quả</TableHead>
                      <TableHead>Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.employee?.fullName ?? item.externalEmployeeCode ?? 'Không mapping'}</TableCell>
                        <TableCell>
                          {item.kpiItem ? <strong className="block text-sm font-medium">{item.kpiItem.name}</strong> : null}
                          <code className="text-xs text-muted-foreground">{item.groupCode}/{item.metricCode}</code>
                        </TableCell>
                        <TableCell>{RECORD_KIND_LABEL[item.recordKind]}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.incomingValue ? formatNumber(item.incomingValue) : '—'}</TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={item.manualEntryRequired
                              ? 'warning'
                              : item.resultStatus === 'SUCCESS' ? 'success' : item.resultStatus === 'FAILED' ? 'danger' : 'warning'}
                          >
                            {item.manualEntryRequired ? 'Cần nhập tay' : ITEM_STATUS_LABEL[item.resultStatus] ?? item.resultStatus}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="max-w-72 text-xs text-muted-foreground">{item.message ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Đóng</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value, tone = 'muted' }: { label: string; value: number; tone?: Tone }) {
  return (
    <div className="p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong className={`mt-1 block text-sm font-bold tabular-nums ${toneText[tone]}`}>{formatNumber(value)}</strong>
    </div>
  )
}
