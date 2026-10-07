import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  AlertTriangle,
  Calculator,
  CheckCheck,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Search,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  closePayrollPeriod,
  getApiErrorMessage,
  startReviewPayrollPeriod,
} from '@/api/payroll-periods'
import {
  approveReadySalaries,
  calculatePeriodSalary,
  getPayrollClosingReadiness,
  type PayrollClosingBlocker,
  type PayrollClosingEmployee,
  type PayrollClosingReadiness,
  type SalaryRecordStatus,
} from '@/api/salary'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { WorkflowSteps } from '@/components/shared/WorkflowSteps'
import { usePayrollPeriodSelection } from '@/contexts/PayrollPeriodContext'
import { formatCompactMoney, formatDate, formatDateTime, toPercent } from '@/lib/format'
import { type Tone } from '@/lib/tone'

type Filter = 'ALL' | 'BLOCKED' | 'UNCALCULATED' | 'WARNING' | 'PENDING_APPROVAL' | 'LOCKED'
type Confirmation = 'calculate' | 'start-review' | 'approve-ready' | 'close' | null

const STATUS_META: Record<SalaryRecordStatus | 'UNCALCULATED', { label: string; tone: Tone }> = {
  UNCALCULATED: { label: 'Chưa tính', tone: 'danger' },
  WARNING: { label: 'Có cảnh báo', tone: 'danger' },
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  LOCKED: { label: 'Đã khóa', tone: 'success' },
  SUPERSEDED: { label: 'Đã thay thế', tone: 'muted' },
}

const BLOCKER_LABEL: Record<PayrollClosingBlocker, string> = {
  UNCALCULATED: 'Cần tính lương',
  WARNING: 'Cần xử lý cảnh báo',
  PENDING_APPROVAL: 'Chờ Manager duyệt',
  NEEDS_REVISION: 'Cần tạo bản điều chỉnh',
}

const WORKFLOW_STEPS = [
  { label: 'Nhập dữ liệu', hint: 'Hoàn thiện KPI, traffic và doanh thu.' },
  { label: 'Tính lương', hint: 'Tính và xử lý toàn bộ cảnh báo.' },
  { label: 'Duyệt & khóa', hint: 'Manager duyệt các hồ sơ sẵn sàng.' },
  { label: 'Đóng kỳ', hint: 'Đóng kỳ khi không còn blocker.' },
]

export function PayrollClosingPage() {
  const queryClient = useQueryClient()
  const { selectedPeriodId, selectedPeriod, isLoading: periodsLoading } = usePayrollPeriodSelection()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [search, setSearch] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation>(null)

  const readinessQuery = useQuery({
    queryKey: ['payroll-closing-readiness', selectedPeriodId],
    queryFn: () => getPayrollClosingReadiness(selectedPeriodId!),
    enabled: Boolean(selectedPeriodId),
  })
  const readiness = readinessQuery.data
  const period = readiness?.period ?? selectedPeriod
  const summary = readiness?.summary
  const closingSummary = readiness?.closingSummary
  const canManagePeriod = readiness?.capabilities.canManagePeriod ?? false
  const canCalculate = readiness?.capabilities.canCalculate ?? false
  const canApprove = readiness?.capabilities.canApprove ?? false

  function invalidateClosingData() {
    void queryClient.invalidateQueries({ queryKey: ['payroll-closing-readiness', selectedPeriodId] })
    void queryClient.invalidateQueries({ queryKey: ['salary-records', selectedPeriodId] })
    void queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
  }

  const calculateMutation = useMutation({
    mutationFn: () => calculatePeriodSalary(selectedPeriodId!, 'PERSIST'),
    onSuccess: (result) => {
      invalidateClosingData()
      setConfirmation(null)
      toast.success(`Đã tính ${result.processedCount} hồ sơ; ${result.warningCount} hồ sơ có cảnh báo`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const startReviewMutation = useMutation({
    mutationFn: () => startReviewPayrollPeriod(selectedPeriodId!),
    onSuccess: () => {
      invalidateClosingData()
      setConfirmation(null)
      toast.success('Kỳ lương đã chuyển sang giai đoạn duyệt')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const approveReadyMutation = useMutation({
    mutationFn: () => approveReadySalaries(selectedPeriodId!),
    onSuccess: (result) => {
      invalidateClosingData()
      setConfirmation(null)
      if (result.failedCount > 0) {
        toast.warning(`Đã duyệt ${result.approvedCount} hồ sơ; ${result.failedCount} hồ sơ cần tải lại và kiểm tra`)
      } else if (result.approvedCount === 0) {
        toast.info('Không có hồ sơ sẵn sàng để duyệt')
      } else {
        toast.success(`Đã duyệt và khóa ${result.approvedCount} hồ sơ`)
      }
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const closeMutation = useMutation({
    mutationFn: () => closePayrollPeriod(selectedPeriodId!),
    onSuccess: () => {
      invalidateClosingData()
      setConfirmation(null)
      toast.success('Đã đóng kỳ lương')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  const visibleEmployees = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi')
    return (readiness?.employees ?? []).filter((employee) => {
      const matchesSearch = !keyword || [employee.employeeName, employee.employeeCode, employee.jobTitle, employee.teamName ?? '']
        .some((value) => value.toLocaleLowerCase('vi').includes(keyword))
      if (!matchesSearch) return false
      if (filter === 'ALL') return true
      if (filter === 'BLOCKED') return employee.blocker !== null
      if (filter === 'LOCKED') return employee.salaryRecord?.status === 'LOCKED'
      return employee.blocker === filter
    }).sort((left, right) => {
      const priority = (employee: PayrollClosingEmployee) => {
        if (employee.blocker === 'UNCALCULATED') return 0
        if (employee.blocker === 'WARNING' || employee.blocker === 'NEEDS_REVISION') return 1
        if (employee.blocker === 'PENDING_APPROVAL') return 2
        return 3
      }
      return priority(left) - priority(right) || left.employeeName.localeCompare(right.employeeName, 'vi')
    })
  }, [filter, readiness?.employees, search])

  const currentWorkflowIndex = period?.status === 'CLOSED'
    ? 4
    : period?.status === 'DRAFT'
      ? 0
    : period?.status === 'IN_REVIEW'
      ? (summary?.blockerCount === 0 ? 3 : 2)
      : summary && summary.uncalculatedCount === 0 && summary.warningCount === 0
        ? 2
        : 1
  const isMutating = calculateMutation.isPending || startReviewMutation.isPending
    || approveReadyMutation.isPending || closeMutation.isPending

  if (!periodsLoading && !selectedPeriodId) {
    return <EmptyState icon={ClipboardCheck} title="Chưa có kỳ lương" description="Tạo và mở một kỳ lương trước khi bắt đầu quy trình chốt kỳ." />
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Vận hành lương"
        title="Trung tâm chốt kỳ lương"
        description="Theo dõi blocker, tính lại, duyệt và đóng kỳ trên cùng một luồng kiểm soát. Hệ thống chỉ cho đóng khi mọi bản lương mới nhất đã được duyệt và khóa."
        meta={period ? (
          <>
            <StatusBadge tone={periodTone(period.status)}>{periodLabel(period.status)}</StatusBadge>
            <span className="text-xs text-muted-foreground">{period.code}</span>
            {period.approvalDeadline ? <span className="text-xs text-muted-foreground">Hạn duyệt {formatDate(period.approvalDeadline)}</span> : null}
          </>
        ) : null}
        action={(
          <Button variant="outline" size="icon" onClick={() => void readinessQuery.refetch()} disabled={readinessQuery.isFetching} aria-label="Làm mới trạng thái chốt kỳ" title="Làm mới">
            <RefreshCw className={readinessQuery.isFetching ? 'animate-spin' : ''} />
          </Button>
        )}
      />

      <Card>
        <CardContent className="p-4 sm:p-5">
          <WorkflowSteps steps={WORKFLOW_STEPS} currentIndex={currentWorkflowIndex} />
        </CardContent>
      </Card>

      {readinessQuery.isError ? (
        <ErrorState title="Không tải được trạng thái chốt kỳ" description={getApiErrorMessage(readinessQuery.error)} onRetry={() => void readinessQuery.refetch()} />
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tổng quan trạng thái chốt kỳ">
        <MetricCard icon={UsersRound} label="Nhân sự trong phạm vi" value={String(summary?.employeeCount ?? 0)} note={scopeLabel(readiness?.scope)} loading={readinessQuery.isLoading} />
        <MetricCard icon={LockKeyhole} label="Đã duyệt & khóa" value={String(summary?.lockedCount ?? 0)} note={summary ? `${toPercent(summary.lockedCount, summary.employeeCount)}% hồ sơ` : undefined} progress={summary ? toPercent(summary.lockedCount, summary.employeeCount) : undefined} tone="success" loading={readinessQuery.isLoading} />
        <MetricCard icon={CheckCheck} label="Chờ duyệt" value={String(summary?.pendingApprovalCount ?? 0)} note="Đủ điều kiện để Manager duyệt" tone="warning" loading={readinessQuery.isLoading} onSelect={() => setFilter('PENDING_APPROVAL')} />
        <MetricCard icon={AlertTriangle} label={readiness?.scope === 'ALL' ? 'Blocker toàn kỳ' : 'Blocker trong phạm vi'} value={String(summary?.blockerCount ?? 0)} note={summary ? `${summary.uncalculatedCount} chưa tính · ${summary.warningCount} cảnh báo` : undefined} tone={summary?.blockerCount ? 'danger' : 'success'} loading={readinessQuery.isLoading} onSelect={() => setFilter('BLOCKED')} />
      </section>

      {readiness && period?.status === 'IN_REVIEW' && readiness.readyToClose ? (
        <Alert className="border-[var(--success-500)]/30 bg-[var(--success-500)]/8">
          <CheckCircle2 className="text-[var(--success-700)]" aria-hidden="true" />
          <AlertTitle>Kỳ lương đã sẵn sàng để đóng</AlertTitle>
          <AlertDescription>
            Tất cả {closingSummary?.employeeCount ?? 0} bản lương toàn kỳ đã được duyệt và khóa.
            {canManagePeriod ? ' Bạn có thể thực hiện bước đóng kỳ.' : ' Đang chờ người quản lý kỳ lương thực hiện bước đóng kỳ.'}
          </AlertDescription>
        </Alert>
      ) : readiness && period?.status === 'IN_REVIEW' && readiness.scopeReady ? (
        <Alert className="border-[var(--warning-500)]/30 bg-[var(--warning-500)]/8">
          <CheckCircle2 className="text-[var(--warning-700)]" aria-hidden="true" />
          <AlertTitle>Phạm vi của bạn đã hoàn tất</AlertTitle>
          <AlertDescription>
            Các hồ sơ bạn phụ trách đã được duyệt và khóa; toàn kỳ vẫn còn {closingSummary?.blockerCount ?? 0} hồ sơ cần xử lý ở phạm vi khác.
          </AlertDescription>
        </Alert>
      ) : readiness && summary && summary.blockerCount > 0 ? (
        <Alert className="border-[var(--warning-500)]/30 bg-[var(--warning-500)]/8">
          <AlertCircle className="text-[var(--warning-700)]" aria-hidden="true" />
          <AlertTitle>Còn {summary.blockerCount} hồ sơ chặn đóng kỳ</AlertTitle>
          <AlertDescription>Ưu tiên tính các hồ sơ chưa có bản lương, xử lý cảnh báo, sau đó duyệt những hồ sơ đang chờ.</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="gap-3 border-b">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Thao tác chốt kỳ</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Các nút chỉ mở khi đúng trạng thái kỳ và đúng quyền nghiệp vụ.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canCalculate ? (
                <Button variant="outline" onClick={() => setConfirmation('calculate')} disabled={isMutating || !['OPEN', 'IN_REVIEW'].includes(period?.status ?? '')}>
                  <Calculator aria-hidden="true" /> Tính lại trong phạm vi
                </Button>
              ) : null}
              {canManagePeriod && period?.status === 'OPEN' ? (
                <Button variant="outline" onClick={() => setConfirmation('start-review')} disabled={isMutating}>
                  <ClipboardCheck aria-hidden="true" /> Chuyển sang duyệt
                </Button>
              ) : null}
              {canApprove && period?.status === 'IN_REVIEW' ? (
                <Button onClick={() => setConfirmation('approve-ready')} disabled={isMutating || !summary?.pendingApprovalCount}>
                  <CheckCheck aria-hidden="true" /> Duyệt hồ sơ sẵn sàng
                </Button>
              ) : null}
              {canManagePeriod && period?.status === 'IN_REVIEW' ? (
                <Button onClick={() => setConfirmation('close')} disabled={isMutating || !readiness?.readyToClose}>
                  <LockKeyhole aria-hidden="true" /> Đóng kỳ lương
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          <ActionNote icon={Calculator} title="1. Tính lương" description="Tạo hoặc cập nhật bản lương mới nhất; hồ sơ đã khóa được giữ nguyên." />
          <ActionNote icon={CheckCheck} title="2. Duyệt & khóa" description="Chỉ duyệt hồ sơ PENDING không còn cảnh báo trong giai đoạn duyệt." />
          <ActionNote icon={LockKeyhole} title="3. Đóng kỳ" description="Backend kiểm tra lại toàn bộ bản lương ngay trong giao dịch đóng kỳ." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 border-b">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Hồ sơ nhân sự</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Hiển thị {visibleEmployees.length}/{readiness?.employees.length ?? 0} hồ sơ.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, mã, chức danh, team" className="pl-9" aria-label="Tìm hồ sơ nhân sự" />
              </div>
              <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Lọc trạng thái hồ sơ"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                  <SelectItem value="BLOCKED">Tất cả blocker</SelectItem>
                  <SelectItem value="UNCALCULATED">Chưa tính</SelectItem>
                  <SelectItem value="WARNING">Có cảnh báo</SelectItem>
                  <SelectItem value="PENDING_APPROVAL">Chờ duyệt</SelectItem>
                  <SelectItem value="LOCKED">Đã khóa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {readinessQuery.isLoading ? <ClosingTableSkeleton /> : visibleEmployees.length === 0 ? (
            <div className="p-8"><EmptyState icon={Search} title="Không có hồ sơ phù hợp" description="Thử đổi từ khóa hoặc bộ lọc trạng thái." /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân sự</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Vướng mắc / cập nhật</TableHead>
                    <TableHead className="text-right">Tổng lương</TableHead>
                    <TableHead className="w-24 text-right">Xử lý</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEmployees.map((employee) => <ClosingRow key={employee.employeeId} employee={employee} />)}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmationDialog
        action={confirmation}
        pending={isMutating}
        pendingCount={summary?.pendingApprovalCount ?? 0}
        blockerCount={closingSummary?.blockerCount ?? 0}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation === 'calculate') calculateMutation.mutate()
          if (confirmation === 'start-review') startReviewMutation.mutate()
          if (confirmation === 'approve-ready') approveReadyMutation.mutate()
          if (confirmation === 'close') closeMutation.mutate()
        }}
      />
    </div>
  )
}

function ClosingRow({ employee }: { employee: PayrollClosingEmployee }) {
  const status = employee.salaryRecord?.status ?? 'UNCALCULATED'
  const meta = STATUS_META[status]
  const detail = employee.salaryRecord?.warnings[0]?.message
    ?? (employee.blocker ? BLOCKER_LABEL[employee.blocker] : `Khóa lúc ${formatDateTime(employee.salaryRecord?.lockedAt)}`)
  return (
    <TableRow>
      <TableCell>
        <div className="min-w-48">
          <p className="font-medium text-foreground">{employee.employeeName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{employee.employeeCode} · {employee.jobTitle}</p>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{employee.teamName ?? '—'}</TableCell>
      <TableCell><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></TableCell>
      <TableCell>
        <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>
        {employee.salaryRecord && employee.salaryRecord.versionNumber > 1 ? <p className="mt-0.5 text-xs text-muted-foreground">Phiên bản v{employee.salaryRecord.versionNumber}</p> : null}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{employee.salaryRecord ? formatCompactMoney(employee.salaryRecord.totalSalaryAmount) : '—'}</TableCell>
      <TableCell className="text-right">
        <Button asChild variant="ghost" size="sm"><Link to="/salary-records">Mở</Link></Button>
      </TableCell>
    </TableRow>
  )
}

function ActionNote({ icon: Icon, title, description }: { icon: typeof Calculator; title: string; description: string }) {
  return (
    <div className="flex gap-3 rounded-xl border bg-muted/35 p-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background text-primary"><Icon className="size-4" aria-hidden="true" /></span>
      <div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p></div>
    </div>
  )
}

function ClosingTableSkeleton() {
  return <div className="space-y-3 p-5" role="status" aria-label="Đang tải danh sách chốt kỳ">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
}

function ConfirmationDialog({ action, pending, pendingCount, blockerCount, onCancel, onConfirm }: {
  action: Confirmation
  pending: boolean
  pendingCount: number
  blockerCount: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const copy = action ? {
    calculate: { title: 'Tính lại các hồ sơ trong phạm vi?', description: 'Hệ thống tính lại các hồ sơ chưa khóa mà bạn được phép xử lý. Bản lương đã duyệt và khóa sẽ không bị thay đổi.', confirm: 'Tính lại hồ sơ', icon: Calculator },
    'start-review': { title: 'Chuyển kỳ sang giai đoạn duyệt?', description: 'Sau bước này, luồng tự xác nhận và duyệt sẽ được mở; các thao tác nhập liệu thuần sẽ dừng.', confirm: 'Chuyển sang duyệt', icon: ClipboardCheck },
    'approve-ready': { title: `Duyệt và khóa ${pendingCount} hồ sơ?`, description: 'Chỉ các bản lương mới nhất đang PENDING và không còn cảnh báo được duyệt. Thao tác được ghi đầy đủ vào audit log.', confirm: 'Duyệt hồ sơ sẵn sàng', icon: CheckCheck },
    close: { title: 'Đóng kỳ lương?', description: blockerCount === 0 ? 'Sau khi đóng, dữ liệu kỳ trở thành bất biến. Backend sẽ kiểm tra lại điều kiện khóa ngay trước khi đóng.' : `Vẫn còn ${blockerCount} blocker nên chưa thể đóng kỳ.`, confirm: 'Đóng kỳ lương', icon: LockKeyhole },
  }[action] : null
  const Icon = copy?.icon ?? CircleDollarSign
  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open && !pending) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden="true" /></div>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={pending}>Hủy</Button></DialogClose>
          <Button onClick={onConfirm} disabled={pending || (action === 'close' && blockerCount > 0)}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}{copy?.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function periodLabel(status: string) {
  return { DRAFT: 'Nháp', OPEN: 'Đang mở', IN_REVIEW: 'Đang duyệt', CLOSED: 'Đã đóng' }[status] ?? status
}

function periodTone(status: string): Tone {
  if (status === 'CLOSED') return 'muted'
  if (status === 'IN_REVIEW') return 'warning'
  if (status === 'OPEN') return 'success'
  return 'muted'
}

function scopeLabel(scope: PayrollClosingReadiness['scope'] | undefined) {
  if (scope === 'ALL') return 'Toàn công ty'
  if (scope === 'TEAM') return 'Theo team được phân quyền'
  if (scope === 'SELF') return 'Hồ sơ của bạn'
  return 'Theo phạm vi quyền hiện tại'
}
