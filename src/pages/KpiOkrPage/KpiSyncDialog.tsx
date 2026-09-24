import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Clock3, Filter, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  getApiErrorMessage, getKpiSyncRun, listKpiSyncRuns, listKpiSyncTeams, triggerKpiSync,
  type KpiSyncRun, type KpiSyncStatus,
} from '@/api/kpi-sync'
import { listPayrollPeriods } from '@/api/payroll-periods'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDateTime, formatNumber, formatRelativeTime } from '@/lib/format'
import { toneSurface, toneText, type Tone } from '@/lib/tone'

const RUNS_KEY = ['kpi-sync-runs'] as const
const RECENT_RUNS = 10

const STATUS_LABEL: Record<KpiSyncStatus, string> = {
  RUNNING: 'Đang chạy',
  SUCCESS: 'Thành công',
  PARTIAL: 'Một phần',
  FAILED: 'Thất bại',
  SKIPPED: 'Đã bỏ qua',
}
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

function statusTone(status: KpiSyncStatus): Tone {
  if (status === 'SUCCESS') return 'success'
  if (status === 'PARTIAL' || status === 'SKIPPED') return 'warning'
  if (status === 'FAILED') return 'danger'
  return 'info'
}

function needsAttention(run: KpiSyncRun) {
  return run.conflictRecords + run.manualEntryCount + run.failedRecords
}

/**
 * Đồng bộ KPI/OKR từ AutomationGenVideo gói gọn trong một nút của trang KPI & OKR: chạy lượt mới,
 * xem các lượt gần đây và từng dòng cần xử lý tay mà không phải rời trang.
 */
export function KpiSyncDialog({ canTrigger, canView }: { canTrigger: boolean; canView: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [teamId, setTeamId] = useState('')
  const [periodId, setPeriodId] = useState('')

  const runsQuery = useQuery({
    queryKey: [...RUNS_KEY, { pageSize: RECENT_RUNS }],
    queryFn: () => listKpiSyncRuns({ page: 1, pageSize: RECENT_RUNS }),
    enabled: open && canView,
    // Lượt đang chạy tự cập nhật, không bắt người dùng mở lại hộp thoại để biết đã xong chưa.
    refetchInterval: (query) =>
      (query.state.data?.data ?? []).some((run) => run.status === 'RUNNING') ? 5_000 : false,
  })
  // Leader chỉ nhận team mình quản lý; Admin/HR (scope ALL) nhận mọi team đã liên kết nguồn.
  const teamsQuery = useQuery({ queryKey: ['kpi-sync-teams'], queryFn: listKpiSyncTeams, enabled: open && canTrigger })
  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', 'kpi-sync'],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: 100 }),
    enabled: open && canTrigger,
  })
  const runs = useMemo(() => runsQuery.data?.data ?? [], [runsQuery.data])
  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data])
  // Đồng bộ thuộc giai đoạn nhập liệu của kỳ. Từ "Đang duyệt" trở đi BE trả về lượt SKIPPED, nên
  // chỉ liệt kê kỳ đang mở thay vì để người dùng chạy một lượt chắc chắn không ghi được gì.
  const periods = useMemo(() => (periodsQuery.data?.data ?? []).filter((period) => period.status === 'OPEN'), [periodsQuery.data])
  const selectedTeamId = teamId || teams[0]?.externalId || ''
  const selectedPeriodId = periodId || periods[0]?.id || ''

  const mutation = useMutation({
    mutationFn: () => triggerKpiSync({ externalTeamId: selectedTeamId, payrollPeriodId: selectedPeriodId }),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: RUNS_KEY })
      // Dữ liệu vừa đồng bộ phải hiện ngay trên các tab KPI/OKR đang mở phía sau hộp thoại.
      void queryClient.invalidateQueries({ queryKey: ['kpi'] })
      void queryClient.invalidateQueries({ queryKey: ['okr'] })
      const attention = needsAttention(run)
      if (attention > 0) {
        toast.warning(`Đồng bộ xong, còn ${formatNumber(attention)} dòng cần xử lý tay`)
        if (canView) setDetailId(run.id)
      } else {
        toast.success('Đã hoàn tất lượt đồng bộ KPI/OKR')
      }
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setDetailId(null)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline"><RefreshCw className="size-4" />Đồng bộ KPI/OKR</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Đồng bộ KPI & OKR</DialogTitle>
          <DialogDescription>
            Nhận KPI cố định, KPI linh hoạt theo nhóm và OKR từ VCBI theo team và kỳ lương.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid content-start gap-5">
          {detailId ? (
            <RunDetail id={detailId} onBack={() => setDetailId(null)} />
          ) : (
            <>
              {canTrigger ? (
                <section className="grid gap-3" aria-label="Tạo lượt đồng bộ">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label>Team VCBI</Label>
                      <Select value={selectedTeamId} onValueChange={setTeamId} disabled={teamsQuery.isLoading}>
                        <SelectTrigger className="w-full"><SelectValue placeholder={teamsQuery.isLoading ? 'Đang tải…' : 'Chọn team'} /></SelectTrigger>
                        <SelectContent>
                          {teams.map((team) => <SelectItem key={team.id} value={team.externalId}>{team.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Kỳ lương đang mở</Label>
                      <Select value={selectedPeriodId} onValueChange={setPeriodId} disabled={periodsQuery.isLoading}>
                        <SelectTrigger className="w-full"><SelectValue placeholder={periodsQuery.isLoading ? 'Đang tải…' : 'Chọn kỳ lương'} /></SelectTrigger>
                        <SelectContent>
                          {periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {teamsQuery.isError || periodsQuery.isError ? (
                    <p className={`text-sm ${toneText.danger}`}>Không tải được danh sách team hoặc kỳ lương.</p>
                  ) : null}
                  {teams.length === 0 && teamsQuery.isSuccess ? (
                    <p className={`text-sm ${toneText.warning}`}>
                      Không có team VCBI nào trong phạm vi bạn được đồng bộ. Hãy đồng bộ cơ cấu tổ chức hoặc kiểm tra team được gán cho tài khoản.
                    </p>
                  ) : null}
                  {periods.length === 0 && periodsQuery.isSuccess ? (
                    <p className={`text-sm ${toneText.warning}`}>Không có kỳ lương nào đang mở. Đồng bộ KPI/OKR chỉ chạy trong giai đoạn nhập liệu của kỳ.</p>
                  ) : null}

                  {/* Quy tắc này chỉ cần biết ngay trước khi chạy, nên đặt tại đây thay vì chiếm chỗ cố định trên trang. */}
                  <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.warning}`}>
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      <strong>Dữ liệu được bảo vệ:</strong> trường nguồn trống sẽ bị bỏ qua và đánh dấu để nhập tay; kết quả
                      đã tự xác nhận hoặc đã duyệt không bị ghi đè.
                    </span>
                  </p>
                </section>
              ) : null}

              {canView ? (
                <RecentRuns
                  runs={runs}
                  loading={runsQuery.isLoading}
                  error={runsQuery.isError ? runsQuery.error : null}
                  refreshing={runsQuery.isFetching}
                  onRetry={() => void runsQuery.refetch()}
                  onSelect={setDetailId}
                />
              ) : null}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Đóng</Button></DialogClose>
          {canTrigger && !detailId ? (
            <Button disabled={!selectedTeamId || !selectedPeriodId || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {mutation.isPending ? 'Đang đồng bộ…' : 'Chạy đồng bộ'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecentRuns({
  runs, loading, error, refreshing, onRetry, onSelect,
}: {
  runs: KpiSyncRun[]
  loading: boolean
  error: unknown
  refreshing: boolean
  onRetry: () => void
  onSelect: (id: string) => void
}) {
  return (
    <section className="grid gap-2" aria-label="Lượt đồng bộ gần đây">
      <h3 className="text-sm font-semibold text-foreground">Lượt đồng bộ gần đây</h3>

      {runs[0]?.status === 'RUNNING' ? (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertTitle>Đang chạy một lượt đồng bộ</AlertTitle>
          <AlertDescription>Danh sách tự cập nhật sau mỗi 5 giây.</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="grid gap-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full rounded-lg" />)}</div>
      ) : error ? (
        <ErrorState description={getApiErrorMessage(error)} onRetry={onRetry} retrying={refreshing} />
      ) : runs.length === 0 ? (
        <EmptyState
          size="sm"
          icon={Clock3}
          title="Chưa có lượt đồng bộ nào"
          description="Lượt đồng bộ đầu tiên sẽ xuất hiện tại đây, kèm các dòng cần xử lý tay nếu có."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {runs.map((run) => {
            const attention = needsAttention(run)
            return (
              <li key={run.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  onClick={() => onSelect(run.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{run.payrollPeriod.name}</span>
                      <StatusBadge tone={statusTone(run.status)}>{STATUS_LABEL[run.status]}</StatusBadge>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground" title={formatDateTime(run.startedAt)}>
                      {formatRelativeTime(run.startedAt)}
                      {run.triggeredBy ? ` · ${run.triggeredBy.fullName}` : ''}
                      {` · Áp dụng ${formatNumber(run.successfulRecords)} · Bỏ qua ${formatNumber(run.skippedRecords)}`}
                      {attention > 0 ? <span className={`font-semibold ${toneText.warning}`}>{` · Cần xử lý ${formatNumber(attention)}`}</span> : null}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function RunDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [onlyAttention, setOnlyAttention] = useState(false)
  const query = useQuery({ queryKey: ['kpi-sync-run', id], queryFn: () => getKpiSyncRun(id) })
  const run = query.data
  const items = run?.items ?? []
  const attentionItems = items.filter((item) => item.resultStatus !== 'SUCCESS' || item.manualEntryRequired)
  const visibleItems = onlyAttention ? attentionItems : items

  return (
    <div className="grid gap-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="size-4" />Lượt đồng bộ gần đây
        </Button>
      </div>

      {query.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-52 w-full rounded-lg" />
        </div>
      ) : query.isError ? (
        <ErrorState description={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : run ? (
        <>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{run.payrollPeriod.name}</h3>
              <StatusBadge tone={statusTone(run.status)}>{STATUS_LABEL[run.status]}</StatusBadge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(run.startedAt)}
              {run.finishedAt ? ` — ${formatDateTime(run.finishedAt)}` : ' · chưa kết thúc'}
              {run.triggeredBy ? ` · do ${run.triggeredBy.fullName} kích hoạt` : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-border rounded-lg border border-border bg-muted/30 sm:grid-cols-5 sm:divide-y-0">
            <Stat label="Nhận từ nguồn" value={run.receivedRecords} />
            <Stat label="Đã áp dụng" value={run.successfulRecords} tone={run.successfulRecords > 0 ? 'success' : 'muted'} />
            <Stat label="Bỏ qua" value={run.skippedRecords} />
            <Stat label="Xung đột" value={run.conflictRecords} tone={run.conflictRecords > 0 ? 'danger' : 'muted'} />
            <Stat label="Cần nhập tay" value={run.manualEntryCount} tone={run.manualEntryCount > 0 ? 'warning' : 'muted'} />
          </div>

          {run.errorSummary ? (
            <p className={`rounded-lg px-3 py-2 text-sm ${toneSurface.danger}`}>{run.errorSummary}</p>
          ) : null}
          {run.sourceWarnings?.length ? (
            <Alert>
              <AlertTriangle />
              <AlertTitle>Cảnh báo từ nguồn ({formatNumber(run.sourceWarnings.length)})</AlertTitle>
              <AlertDescription>
                {run.sourceWarnings.slice(0, 5).map((warning) => warning.message).join(' · ')}
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
            <div className="overflow-hidden rounded-lg border border-border">
              <Table className="min-w-180">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân sự</TableHead>
                    <TableHead>Đầu mục</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead className="text-right">Giá trị nhận</TableHead>
                    <TableHead>Kết quả</TableHead>
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.employee?.fullName ?? item.externalEmployeeCode ?? 'Chưa khớp nhân sự'}</TableCell>
                      <TableCell className="whitespace-normal">
                        {/* min-width trên <td> bị trình duyệt bỏ qua, nên giữ độ rộng cột bằng phần tử bên trong. */}
                        <span className="block min-w-48 text-sm font-medium text-foreground">
                          {item.kpiItem?.name ?? item.employeeOkr?.title ?? item.metricCode}
                        </span>
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
                      <TableCell className="max-w-72 text-xs whitespace-normal text-muted-foreground">{item.message ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      ) : null}
    </div>
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
