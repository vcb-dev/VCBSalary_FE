import { type FormEvent, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Filter,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { listPayrollPeriods, type PayrollPeriod } from '@/api/payroll-periods'
import {
  listRevenue,
  putEmployeeRevenue,
  type EmployeeRevenue,
} from '@/api/revenue'
import {
  getEmployeeTraffic,
  leaderApproveTraffic,
  leaderRejectTraffic,
  listTraffic,
  putEmployeeTraffic,
  selfConfirmTraffic,
  uploadTrafficEvidence,
  type TrafficListItem,
  type TrafficRecord,
} from '@/api/traffic'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { PageHeader } from '@/components/shared/PageHeader'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { usePayrollPeriodSelection } from '@/contexts/PayrollPeriodContext'
import { formatDateTime as formatDateTimeVn, formatNumber, toPercent } from '@/lib/format'
import { selectDefaultPayrollPeriod } from '@/lib/payroll-period'
import { PLATFORM_LABEL, PLATFORM_SURFACE } from '@/lib/platform'
import { toneSurface, toneText, type Tone } from '@/lib/tone'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { RunTrafficSyncDialog } from './RunTrafficSyncDialog'

const TRAFFIC_VIEW_PERMISSIONS = ['traffic.view_self', 'traffic.view_team', 'traffic.view_all']
const REVENUE_VIEW_PERMISSIONS = ['revenue.view_self', 'revenue.view_team', 'revenue.view_all']
const PAGE_SIZE = 100

function hasAnyPermission(permissions: string[] | undefined, expected: string[]) {
  return permissions?.some((code) => expected.includes(code)) ?? false
}

function formatVnd(value: string | null) {
  if (value === null || value === '') return '—'
  try {
    return `${BigInt(value).toLocaleString('vi-VN')} ₫`
  } catch {
    return `${value} ₫`
  }
}

function formatViews(value: string) {
  try {
    return BigInt(value).toLocaleString('vi-VN')
  } catch {
    return value
  }
}

const PERIOD_STATUS_LABEL: Record<PayrollPeriod['status'], string> = {
  DRAFT: 'Nháp',
  OPEN: 'Đang mở',
  IN_REVIEW: 'Đang duyệt',
  CLOSED: 'Đã khóa',
}

export function TrafficRevenuePage() {
  const { user } = useAuth()
  const { selectedPeriodId: globalPeriodId, selectPeriod } = usePayrollPeriodSelection()
  const canViewTraffic = hasAnyPermission(user?.permissions, TRAFFIC_VIEW_PERMISSIONS)
  const canViewRevenue = hasAnyPermission(user?.permissions, REVENUE_VIEW_PERMISSIONS)
  const canTriggerSync = user?.permissions.includes('sync.trigger') ?? false
  // Tab nằm trên URL để gửi link thẳng tới đúng tab và không mất khi tải lại trang.
  const [searchParams, setSearchParams] = useSearchParams()

  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', 'traffic-revenue-selector'],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: 100 }),
    enabled: canViewTraffic || canViewRevenue,
  })
  const periods = periodsQuery.data?.data ?? []
  const effectivePeriodId = periods.some((period) => period.id === globalPeriodId)
    ? globalPeriodId!
    : selectDefaultPayrollPeriod(periods)?.id || ''
  const selectedPeriod = periods.find((period) => period.id === effectivePeriodId) ?? null

  const defaultTab = canViewTraffic ? 'traffic' : 'revenue'
  const tabFromUrl = searchParams.get('tab')
  const activeTab = (tabFromUrl === 'traffic' && canViewTraffic) || (tabFromUrl === 'revenue' && canViewRevenue)
    ? tabFromUrl
    : defaultTab

  function changeTab(tab: string) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Dữ liệu đầu vào"
        title="Traffic & doanh thu"
        description="Nhập và duyệt traffic theo từng nền tảng; quản lý doanh thu chính thức dùng để tính hoa hồng và RPM."
        meta={selectedPeriod ? (
          <StatusBadge tone={selectedPeriod.status === 'CLOSED' ? 'info' : selectedPeriod.status === 'DRAFT' ? 'muted' : 'success'}>
            {PERIOD_STATUS_LABEL[selectedPeriod.status]}
          </StatusBadge>
        ) : null}
        action={periods.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Chỉ thuộc tab Traffic: doanh thu có nguồn khác, không kéo từ AutomationGenVideo. */}
            {activeTab === 'traffic' && canTriggerSync ? <RunTrafficSyncDialog period={selectedPeriod} /> : null}
            <Select value={effectivePeriodId} onValueChange={selectPeriod}>
              <SelectTrigger className="min-w-52 bg-card" aria-label="Chọn kỳ lương">
                <SelectValue placeholder="Chọn kỳ lương" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((period) => (
                  <SelectItem value={period.id} key={period.id}>
                    {period.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      />

      {!canViewTraffic && !canViewRevenue ? (
        <Card className="py-0">
          <EmptyState
            icon={ShieldCheck}
            tone="warning"
            title="Không có quyền truy cập"
            description="Tài khoản của bạn chưa được cấp quyền xem traffic hoặc doanh thu. Liên hệ quản trị hệ thống để được cấp quyền."
          />
        </Card>
      ) : periodsQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : periodsQuery.isError ? (
        <ErrorState description="Không tải được danh sách kỳ lương." onRetry={() => void periodsQuery.refetch()} />
      ) : periods.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={BarChart3}
            title="Chưa có kỳ lương nào"
            description="Traffic và doanh thu được nhập theo kỳ lương. Tạo kỳ lương ở màn Kỳ lương trước khi nhập dữ liệu đầu vào."
          />
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={changeTab}>
          <TabsList variant="line">
            {canViewTraffic ? <TabsTrigger value="traffic"><Eye className="size-4" />Traffic</TabsTrigger> : null}
            {canViewRevenue ? <TabsTrigger value="revenue"><Banknote className="size-4" />Doanh thu</TabsTrigger> : null}
          </TabsList>
          {canViewTraffic ? (
            <TabsContent value="traffic" className="mt-3">
              <TrafficSection period={selectedPeriod} userEmployeeId={user?.employeeId ?? null} permissions={user?.permissions ?? []} />
            </TabsContent>
          ) : null}
          {canViewRevenue ? (
            <TabsContent value="revenue" className="mt-3">
              <RevenueSection period={selectedPeriod} canWrite={user?.permissions.includes('revenue.write') ?? false} />
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  )
}

/** Dải cảnh báo trạng thái kỳ, dùng chung cho cả hai tab. */
function PeriodStateNotice({ period }: { period: PayrollPeriod | null }) {
  if (period?.status === 'DRAFT') {
    return (
      <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm leading-6 ${toneSurface.warning}`}>
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span><strong>Kỳ lương chưa mở.</strong> Hãy mở kỳ để tạo snapshot nhân sự trước khi nhập dữ liệu.</span>
      </div>
    )
  }
  if (period?.status === 'CLOSED') {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span><strong className="text-foreground">Kỳ lương đã đóng.</strong> Dữ liệu của kỳ này chỉ còn ở chế độ xem.</span>
      </div>
    )
  }
  return null
}

type TrafficFilter = 'ALL' | 'PENDING' | 'REJECTED' | 'MISSING'

const TRAFFIC_FILTER_LABEL: Record<TrafficFilter, string> = {
  ALL: 'Tất cả',
  PENDING: 'Chờ duyệt',
  REJECTED: 'Bị từ chối',
  MISSING: 'Chưa nhập',
}

function trafficRowState(employee: TrafficListItem): { label: string; tone: Tone } {
  if (employee.rejectedPlatforms > 0) return { label: `${employee.rejectedPlatforms} bị từ chối`, tone: 'danger' }
  if (employee.pendingPlatforms > 0) return { label: `${employee.pendingPlatforms} chờ duyệt`, tone: 'warning' }
  if (employee.completedPlatforms > 0) return { label: 'Hoàn tất', tone: 'success' }
  return { label: 'Chưa nhập', tone: 'muted' }
}

function matchesTrafficFilter(employee: TrafficListItem, filter: TrafficFilter) {
  if (filter === 'PENDING') return employee.pendingPlatforms > 0
  if (filter === 'REJECTED') return employee.rejectedPlatforms > 0
  if (filter === 'MISSING') return employee.completedPlatforms === 0 && employee.pendingPlatforms === 0
  return true
}

function TrafficSection({
  period,
  userEmployeeId,
  permissions,
}: {
  period: PayrollPeriod | null
  userEmployeeId: string | null
  permissions: string[]
}) {
  const queryClient = useQueryClient()
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim(), 350)
  const [filter, setFilter] = useState<TrafficFilter>('ALL')
  const [editing, setEditing] = useState<TrafficRecord | null>(null)
  const [rejecting, setRejecting] = useState<TrafficRecord | null>(null)
  const periodId = period?.id ?? ''

  const listQuery = useQuery({
    queryKey: ['traffic', 'list', periodId, search],
    queryFn: () => listTraffic(periodId, { page: 1, pageSize: PAGE_SIZE, search: search || undefined }),
    enabled: Boolean(periodId),
  })
  const employees = listQuery.data?.data ?? []
  const visibleEmployees = employees.filter((employee) => matchesTrafficFilter(employee, filter))
  const effectiveEmployeeId =
    visibleEmployees.some((employee) => employee.employeeId === selectedEmployeeId)
      ? selectedEmployeeId
      : visibleEmployees.find((employee) => employee.employeeId === userEmployeeId)?.employeeId
        ?? visibleEmployees[0]?.employeeId ?? ''
  const selectedEmployee = employees.find((employee) => employee.employeeId === effectiveEmployeeId) ?? null

  const profileQuery = useQuery({
    queryKey: ['traffic', 'profile', periodId, effectiveEmployeeId],
    queryFn: () => getEmployeeTraffic(periodId, effectiveEmployeeId),
    enabled: Boolean(periodId && effectiveEmployeeId),
  })
  const profile = profileQuery.data
  const totalEmployees = listQuery.data?.meta.total ?? 0
  const totalAcceptedViews = employees.reduce((total, employee) => total + BigInt(employee.acceptedViews), 0n)
  const pendingCount = employees.reduce((total, employee) => total + employee.pendingPlatforms, 0)
  const rejectedCount = employees.reduce((total, employee) => total + employee.rejectedPlatforms, 0)
  const doneCount = employees.filter((employee) => employee.pendingPlatforms === 0 && employee.rejectedPlatforms === 0 && employee.completedPlatforms > 0).length
  const partialScope = employees.length >= PAGE_SIZE
  const isOwnProfile = Boolean(userEmployeeId && effectiveEmployeeId === userEmployeeId)
  const canWrite = isOwnProfile
    ? permissions.includes('traffic.write_self') || permissions.includes('traffic.write_team')
    : permissions.includes('traffic.write_team')
  const canSelfConfirm = isOwnProfile && permissions.includes('traffic.write_self')
  const canReview = !isOwnProfile && permissions.includes('traffic.leader_approve')
  const periodEditable = Boolean(period && period.status !== 'CLOSED' && period.status !== 'DRAFT')

  const workflowMutation = useMutation({
    mutationFn: async (input: { action: 'confirm' | 'approve'; id: string }) =>
      input.action === 'confirm' ? selfConfirmTraffic(input.id) : leaderApproveTraffic(input.id),
    onSuccess: async (_, input) => {
      await invalidateTraffic(queryClient, periodId, effectiveEmployeeId)
      toast.success(input.action === 'confirm' ? 'Đã gửi traffic cho Leader duyệt' : 'Đã duyệt traffic')
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <PeriodStateNotice period={period} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tổng quan traffic">
        <MetricCard
          icon={UsersRound}
          tone="info"
          label="Hồ sơ đã hoàn tất"
          value={`${formatNumber(doneCount)} / ${formatNumber(employees.length)}`}
          progress={toPercent(doneCount, employees.length)}
          note={partialScope ? `Trong ${PAGE_SIZE} hồ sơ đang hiển thị` : `${formatNumber(totalEmployees)} nhân sự theo snapshot kỳ`}
          loading={listQuery.isLoading}
        />
        <MetricCard
          icon={Eye}
          tone="info"
          label="Traffic hợp lệ"
          value={formatViews(totalAcceptedViews.toString())}
          note={partialScope ? `Trong ${PAGE_SIZE} hồ sơ đang hiển thị` : 'Đã qua đủ 2 bước xác nhận'}
          loading={listQuery.isLoading}
        />
        <MetricCard
          icon={Send}
          tone={pendingCount > 0 ? 'warning' : 'success'}
          label="Chờ Leader duyệt"
          value={formatNumber(pendingCount)}
          note={pendingCount > 0 ? 'Bấm để lọc các hồ sơ đang chờ' : 'Không còn nền tảng nào chờ duyệt'}
          loading={listQuery.isLoading}
          onSelect={pendingCount > 0 ? () => setFilter('PENDING') : undefined}
        />
        <MetricCard
          icon={AlertTriangle}
          tone={rejectedCount > 0 ? 'danger' : 'success'}
          label="Bị từ chối"
          value={formatNumber(rejectedCount)}
          note={rejectedCount > 0 ? 'Bấm để lọc các hồ sơ cần sửa lại' : 'Không có nền tảng nào bị từ chối'}
          loading={listQuery.isLoading}
          onSelect={rejectedCount > 0 ? () => setFilter('REJECTED') : undefined}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start">
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="space-y-3 border-b border-border p-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-foreground">Hồ sơ traffic</h2>
                <p className="mt-1 text-xs text-muted-foreground">Chọn một nhân sự để xem chi tiết</p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  className="w-full pr-9 pl-8"
                  placeholder="Tìm theo tên nhân sự"
                  aria-label="Tìm nhân sự"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
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
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc hồ sơ traffic">
                {(Object.keys(TRAFFIC_FILTER_LABEL) as TrafficFilter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      filter === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {TRAFFIC_FILTER_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>

            {listQuery.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
            ) : listQuery.isError ? (
              <div className="p-4">
                <ErrorState description="Không tải được danh sách traffic." onRetry={() => void listQuery.refetch()} />
              </div>
            ) : visibleEmployees.length === 0 ? (
              <EmptyState
                size="sm"
                icon={UsersRound}
                title={search || filter !== 'ALL' ? 'Không có hồ sơ phù hợp' : 'Kỳ lương chưa có snapshot nhân sự'}
                description={search || filter !== 'ALL'
                  ? 'Thử từ khoá khác hoặc bỏ bộ lọc để xem toàn bộ hồ sơ.'
                  : 'Mở kỳ lương để tạo snapshot nhân sự trước khi nhập traffic.'}
                action={search || filter !== 'ALL'
                  ? <Button variant="outline" onClick={() => { setSearchInput(''); setFilter('ALL') }}><X className="size-4" />Xoá bộ lọc</Button>
                  : undefined}
              />
            ) : (
              <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto">
                {visibleEmployees.map((employee) => {
                  const state = trafficRowState(employee)
                  const isActive = employee.employeeId === effectiveEmployeeId

                  return (
                    <li key={employee.employeeId}>
                      <button
                        type="button"
                        onClick={() => setSelectedEmployeeId(employee.employeeId)}
                        aria-current={isActive ? 'true' : undefined}
                        className={`flex w-full items-center gap-3 p-3 text-left transition-colors focus-visible:outline-none ${
                          isActive ? 'bg-primary/5' : 'hover:bg-muted/40'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm font-semibold text-foreground">{employee.employeeName}</strong>
                          <span className="block truncate text-xs text-muted-foreground">{employee.jobTitle}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatViews(employee.acceptedViews)} views hợp lệ
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                          <ChevronRight className={`size-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {listQuery.isLoading || profileQuery.isLoading ? (
            <>
              <Skeleton className="h-28 w-full rounded-2xl" />
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 w-full rounded-2xl" />)}
              </div>
            </>
          ) : !effectiveEmployeeId ? (
            <Card className="py-0">
              <EmptyState
                icon={Eye}
                title="Chưa chọn hồ sơ traffic"
                description="Chọn một nhân sự ở danh sách bên cạnh để xem và xử lý traffic của từng nền tảng."
              />
            </Card>
          ) : profileQuery.isError || !profile ? (
            <ErrorState description="Không tải được hồ sơ traffic." onRetry={() => void profileQuery.refetch()} />
          ) : (
            <>
              <Card className="py-0">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold">{profile.employeeName}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{profile.jobTitle} · {profile.teamName ?? 'Chưa có team'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6 sm:text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Tổng đã nhập</p>
                      <strong className="text-xl tabular-nums">{formatViews(profile.totalViews)}</strong>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Hợp lệ tính RPM</p>
                      <strong className={`text-xl tabular-nums ${toneText.success}`}>{formatViews(profile.acceptedViews)}</strong>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Chỉ views đã được nhân sự tự xác nhận và Leader duyệt mới được cộng vào traffic hợp lệ. Mọi lần nhập, xác nhận và duyệt đều có audit log.
              </p>

              <section className="grid gap-3 sm:grid-cols-2">
                {profile.records.map((record) => (
                  <TrafficPlatformCard
                    key={record.platform}
                    record={record}
                    canWrite={canWrite && periodEditable}
                    canSelfConfirm={canSelfConfirm && periodEditable}
                    canReview={canReview && periodEditable}
                    workflowPending={workflowMutation.isPending}
                    onEdit={() => setEditing(record)}
                    onConfirm={() => record.id && workflowMutation.mutate({ action: 'confirm', id: record.id })}
                    onApprove={() => record.id && workflowMutation.mutate({ action: 'approve', id: record.id })}
                    onReject={() => setRejecting(record)}
                  />
                ))}
              </section>
            </>
          )}
        </div>
      </div>

      <TrafficEditDialog
        key={editing ? `${effectiveEmployeeId}-${editing.platform}` : 'closed'}
        record={editing}
        employee={selectedEmployee}
        period={period}
        onClose={() => setEditing(null)}
      />
      <TrafficRejectDialog
        key={rejecting?.id ?? 'closed'}
        record={rejecting}
        periodId={periodId}
        employeeId={effectiveEmployeeId}
        onClose={() => setRejecting(null)}
      />
    </div>
  )
}

function TrafficPlatformCard({
  record,
  canWrite,
  canSelfConfirm,
  canReview,
  workflowPending,
  onEdit,
  onConfirm,
  onApprove,
  onReject,
}: {
  record: TrafficRecord
  canWrite: boolean
  canSelfConfirm: boolean
  canReview: boolean
  workflowPending: boolean
  onEdit: () => void
  onConfirm: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const editable = record.selfConfirmationStatus === 'DRAFT' && record.leaderReviewStatus !== 'APPROVED'
  const awaitingReview = record.selfConfirmationStatus === 'CONFIRMED' && record.leaderReviewStatus === 'PENDING'
  const status = trafficStatus(record)
  const hasAction = (canWrite && editable) || (canSelfConfirm && editable && record.id) || (canReview && awaitingReview)

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${PLATFORM_SURFACE[record.platform]}`}>
            <PlatformIcon platform={record.platform} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground">{PLATFORM_LABEL[record.platform]}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{formatViews(record.views)} views</p>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {record.attachments.length ? (
            record.attachments.map((attachment) => (
              <a
                className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 transition-colors hover:text-primary"
                href={attachment.downloadUrl}
                target="_blank"
                rel="noreferrer"
                key={attachment.id}
                title={attachment.originalFileName}
              >
                <FileText className="size-3 shrink-0" aria-hidden="true" />
                <span className="max-w-32 truncate">{attachment.originalFileName}</span>
              </a>
            ))
          ) : (
            <span>Chưa có minh chứng</span>
          )}
        </div>

        {record.leaderReviewedAt || record.selfConfirmedAt ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            {record.leaderReviewedAt
              ? `Leader ${record.leaderReviewedBy?.fullName ?? ''} · ${formatDateTimeVn(record.leaderReviewedAt)}`
              : `Tự xác nhận · ${formatDateTimeVn(record.selfConfirmedAt)}`}
          </p>
        ) : null}

        {record.leaderRejectionReason ? (
          <p className={`rounded-md px-2 py-1.5 text-[11px] leading-4 ${toneSurface.danger}`}>
            Lý do từ chối: {record.leaderRejectionReason}
          </p>
        ) : null}

        {hasAction ? (
          <div className="mt-auto flex flex-wrap gap-1.5 border-t border-border pt-3">
            {canWrite && editable ? (
              <Button variant="outline" size="sm" className="h-8" onClick={onEdit}>
                <Pencil className="size-3.5" aria-hidden="true" />{record.id ? 'Sửa' : 'Nhập'}
              </Button>
            ) : null}
            {canSelfConfirm && editable && record.id ? (
              <Button size="sm" className="h-8" disabled={workflowPending} onClick={onConfirm}>
                <Send className="size-3.5" aria-hidden="true" />Tự xác nhận
              </Button>
            ) : null}
            {canReview && awaitingReview ? (
              <>
                <Button variant="outline" size="sm" className="h-8" disabled={workflowPending} onClick={onReject}>
                  <X className="size-3.5" aria-hidden="true" />Từ chối
                </Button>
                <Button size="sm" className="h-8" disabled={workflowPending} onClick={onApprove}>
                  <Check className="size-3.5" aria-hidden="true" />Duyệt
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function trafficStatus(record: TrafficRecord): { label: string; tone: Tone } {
  if (!record.id) return { label: 'Chưa nhập', tone: 'muted' }
  if (record.leaderReviewStatus === 'APPROVED') return { label: 'Đã duyệt', tone: 'success' }
  if (record.leaderReviewStatus === 'REJECTED') return { label: 'Bị từ chối', tone: 'danger' }
  if (record.selfConfirmationStatus === 'CONFIRMED') return { label: 'Chờ Leader', tone: 'warning' }
  return { label: 'Bản nháp', tone: 'muted' }
}

function TrafficEditDialog({
  record,
  employee,
  period,
  onClose,
}: {
  record: TrafficRecord | null
  employee: TrafficListItem | null
  period: PayrollPeriod | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [views, setViews] = useState(record?.views ?? '0')
  const [attachmentIds, setAttachmentIds] = useState(record?.attachments.map((item) => item.id) ?? [])
  const [file, setFile] = useState<File | null>(null)
  const valid = /^(0|[1-9]\d{0,17})$/.test(views)

  const mutation = useMutation({
    mutationFn: async () => {
      const nextAttachmentIds = [...attachmentIds]
      if (file) {
        const uploaded = await uploadTrafficEvidence(file)
        nextAttachmentIds.push(uploaded.id)
      }
      return putEmployeeTraffic(period!.id, employee!.employeeId, record!.platform, {
        views,
        attachmentIds: nextAttachmentIds,
      })
    },
    onSuccess: async () => {
      await invalidateTraffic(queryClient, period!.id, employee!.employeeId)
      toast.success('Đã lưu traffic bản nháp')
      onClose()
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (record && employee && period && valid) mutation.mutate()
  }

  return (
    <Dialog open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Cập nhật traffic {record ? PLATFORM_LABEL[record.platform] : ''}</DialogTitle>
            <DialogDescription>{employee?.employeeName} · {period?.name}. Hãy lưu nháp trước khi tự xác nhận.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="traffic-views">Lượt xem</Label>
            <Input id="traffic-views" inputMode="numeric" autoFocus value={views} onChange={(event) => setViews(event.target.value.replace(/\D/g, '').slice(0, 18))} aria-invalid={Boolean(views) && !valid} />
            <p className="text-xs text-muted-foreground">Giá trị: {valid ? formatViews(views) : 'Không hợp lệ'} views</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="traffic-evidence">Minh chứng mới (không bắt buộc)</Label>
            <Input id="traffic-evidence" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">Ảnh, PDF, Word, Excel hoặc CSV; tối đa 20MB.</p>
          </div>
          {record?.attachments.length ? (
            <div className="space-y-2">
              <Label>Minh chứng hiện có</Label>
              <div className="space-y-2">
                {record.attachments.map((attachment) => {
                  const kept = attachmentIds.includes(attachment.id)
                  return (
                    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm" key={attachment.id}>
                      <span className={kept ? 'truncate' : 'truncate text-muted-foreground line-through'}>{attachment.originalFileName}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setAttachmentIds((ids) => kept ? ids.filter((id) => id !== attachment.id) : [...ids, attachment.id])}>{kept ? 'Gỡ' : 'Giữ lại'}</Button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            <Button type="submit" disabled={!valid || mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Lưu bản nháp</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TrafficRejectDialog({
  record,
  periodId,
  employeeId,
  onClose,
}: {
  record: TrafficRecord | null
  periodId: string
  employeeId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => leaderRejectTraffic(record!.id!, reason.trim()),
    onSuccess: async () => {
      await invalidateTraffic(queryClient, periodId, employeeId)
      toast.success('Đã từ chối và mở lại traffic để nhân sự chỉnh sửa')
      onClose()
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (record?.id && reason.trim()) mutation.mutate()
  }

  return (
    <Dialog open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form className="contents" onSubmit={submit}>
          <DialogHeader><DialogTitle>Từ chối traffic {record ? PLATFORM_LABEL[record.platform] : ''}</DialogTitle><DialogDescription>Nhân sự sẽ được sửa bản ghi và tự xác nhận lại.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="traffic-reject-reason">Lý do từ chối</Label><Textarea id="traffic-reject-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Nêu rõ số liệu hoặc minh chứng cần bổ sung" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Hủy</Button><Button type="submit" disabled={!reason.trim() || mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Xác nhận từ chối</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

async function invalidateTraffic(queryClient: ReturnType<typeof useQueryClient>, periodId: string, employeeId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['traffic', 'list', periodId] }),
    queryClient.invalidateQueries({ queryKey: ['traffic', 'profile', periodId, employeeId] }),
  ])
}

function RevenueSection({ period, canWrite }: { period: PayrollPeriod | null; canWrite: boolean }) {
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim(), 350)
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [editing, setEditing] = useState<EmployeeRevenue | null>(null)
  const periodId = period?.id ?? ''
  const revenueQuery = useQuery({
    queryKey: ['revenue', periodId, search],
    queryFn: () => listRevenue(periodId, { page: 1, pageSize: PAGE_SIZE, search: search || undefined }),
    enabled: Boolean(periodId),
  })
  const rows = revenueQuery.data?.data ?? []
  const visibleRows = onlyMissing ? rows.filter((row) => row.officialRevenueAmount === null) : rows
  const totalRows = revenueQuery.data?.meta.total ?? 0
  const enteredCount = rows.filter((row) => row.officialRevenueAmount !== null).length
  const missingCount = rows.length - enteredCount
  const totalRevenue = rows.reduce((total, row) => total + BigInt(row.officialRevenueAmount ?? '0'), 0n)
  const partialScope = rows.length >= PAGE_SIZE
  const entryDisabled = !period || period.status === 'DRAFT' || period.status === 'CLOSED' || rows.length === 0 || revenueQuery.isLoading

  return (
    <div className="flex flex-col gap-4">
      <PeriodStateNotice period={period} />

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Tổng quan doanh thu">
        <MetricCard
          icon={CheckCircle2}
          tone={rows.length > 0 && missingCount === 0 ? 'success' : 'info'}
          label="Đã nhập doanh thu"
          value={`${formatNumber(enteredCount)} / ${formatNumber(rows.length)}`}
          progress={toPercent(enteredCount, rows.length)}
          note={partialScope ? `Trong ${PAGE_SIZE} hồ sơ đang hiển thị` : `${formatNumber(totalRows)} nhân sự trong phạm vi`}
          loading={revenueQuery.isLoading}
        />
        <MetricCard
          icon={UsersRound}
          tone={missingCount > 0 ? 'warning' : 'success'}
          label="Còn thiếu"
          value={formatNumber(missingCount)}
          note={missingCount > 0 ? 'Bấm để chỉ hiện nhân sự chưa có số liệu' : 'Mọi nhân sự đều đã có doanh thu'}
          loading={revenueQuery.isLoading}
          onSelect={missingCount > 0 ? () => setOnlyMissing(true) : undefined}
        />
        <MetricCard
          icon={Banknote}
          tone="info"
          label="Tổng doanh thu"
          value={formatVnd(totalRevenue.toString())}
          valueTitle={formatVnd(totalRevenue.toString())}
          note={partialScope ? `Trong ${PAGE_SIZE} hồ sơ đang hiển thị` : 'Trong phạm vi đang xem'}
          loading={revenueQuery.isLoading}
        />
      </section>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-foreground">Doanh thu theo nhân sự</h2>
                <p className="mt-1 text-xs text-muted-foreground">{period?.name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    className="w-full pr-9 pl-8 sm:w-64"
                    placeholder="Tìm theo tên nhân sự"
                    aria-label="Tìm nhân sự"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
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
                <Button
                  variant={onlyMissing ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOnlyMissing((current) => !current)}
                  aria-pressed={onlyMissing}
                >
                  <Filter className="size-4" aria-hidden="true" />
                  {onlyMissing ? 'Đang lọc: chưa nhập' : 'Chỉ hiện chưa nhập'}
                </Button>
                {canWrite ? (
                  <Button
                    size="sm"
                    disabled={entryDisabled}
                    title={entryDisabled ? getRevenueEntryDisabledReason(period, rows.length) : 'Mở form nhập cho nhân sự chưa có số liệu'}
                    onClick={() => setEditing(rows.find((row) => row.officialRevenueAmount === null) ?? rows[0])}
                  >
                    <Plus className="size-4" aria-hidden="true" />Nhập doanh thu
                  </Button>
                ) : null}
              </div>
            </div>

            {canWrite ? (
              <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Doanh thu chính thức là đầu vào tính hoa hồng và RPM. Mọi thay đổi đều được ghi vào audit log.
              </p>
            ) : (
              /* Không có quyền thì nút nhập bị ẩn — phải nói rõ lý do, tránh trông như thiếu chức năng. */
              <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.info}`}>
                <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Chế độ chỉ xem.</strong> Theo quy định nghiệp vụ, chỉ vai trò <strong>Kế toán</strong> mới
                  được nhập hoặc sửa doanh thu chính thức — kể cả tài khoản quản trị hệ thống. Liên hệ kế toán để
                  cập nhật số liệu cho kỳ này.
                </span>
              </p>
            )}
          </div>

          {revenueQuery.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
          ) : revenueQuery.isError ? (
            <div className="p-4">
              <ErrorState description="Không tải được dữ liệu doanh thu." onRetry={() => void revenueQuery.refetch()} />
            </div>
          ) : visibleRows.length === 0 ? (
            <EmptyState
              size="sm"
              icon={onlyMissing ? CheckCircle2 : Banknote}
              tone={onlyMissing && rows.length > 0 ? 'success' : 'muted'}
              title={onlyMissing
                ? 'Không còn nhân sự nào thiếu doanh thu'
                : search ? 'Không tìm thấy nhân sự phù hợp' : 'Kỳ lương chưa có snapshot nhân sự'}
              description={onlyMissing
                ? 'Toàn bộ nhân sự trong phạm vi đang xem đã có doanh thu chính thức.'
                : search ? 'Thử từ khoá khác hoặc xoá tìm kiếm để xem toàn bộ danh sách.'
                  : 'Mở kỳ lương để tạo snapshot nhân sự trước khi nhập doanh thu.'}
              action={onlyMissing || search
                ? <Button variant="outline" onClick={() => { setOnlyMissing(false); setSearchInput('') }}><X className="size-4" />Xoá bộ lọc</Button>
                : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-180">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân sự</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-right">Doanh thu chính thức</TableHead>
                    <TableHead>Cập nhật gần nhất</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    {canWrite ? <TableHead className="text-right">Hành động</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.employeeId}>
                      <TableCell>
                        <strong className="block font-semibold text-foreground">{row.employeeName}</strong>
                        <span className="text-xs text-muted-foreground">{row.jobTitle}</span>
                      </TableCell>
                      <TableCell>{row.teamName ?? '—'}</TableCell>
                      <TableCell className={`text-right font-semibold whitespace-nowrap tabular-nums ${row.officialRevenueAmount === null ? 'text-muted-foreground' : ''}`}>
                        {formatVnd(row.officialRevenueAmount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.lastUpdatedBy ? (
                          <>
                            <span className="block text-sm">{row.lastUpdatedBy.fullName}</span>
                            <span className="text-xs text-muted-foreground">{formatDateTimeVn(row.updatedAt)}</span>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={row.officialRevenueAmount === null ? 'warning' : 'success'}>
                          {row.officialRevenueAmount === null ? 'Chưa nhập' : 'Đã nhập'}
                        </StatusBadge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" disabled={period?.status === 'CLOSED'} onClick={() => setEditing(row)}>
                            <Pencil className="size-4" aria-hidden="true" />{row.id ? 'Sửa' : 'Nhập'}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RevenueDialog key={editing?.employeeId ?? 'closed'} row={editing} rows={rows} period={period} onClose={() => setEditing(null)} />
    </div>
  )
}

function RevenueDialog({ row, rows, period, onClose }: { row: EmployeeRevenue | null; rows: EmployeeRevenue[]; period: PayrollPeriod | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [employeeId, setEmployeeId] = useState(row?.employeeId ?? '')
  const [amount, setAmount] = useState(row?.officialRevenueAmount ?? '')
  const selectedRow = rows.find((item) => item.employeeId === employeeId) ?? row
  const valid = /^(0|[1-9]\d{0,17})$/.test(amount)
  const mutation = useMutation({
    mutationFn: () => putEmployeeRevenue(period!.id, selectedRow!.employeeId, amount),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['revenue', period!.id] })
      toast.success(selectedRow?.id ? 'Đã cập nhật doanh thu' : 'Đã nhập doanh thu')
      onClose()
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (valid) mutation.mutate()
  }

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form className="contents" onSubmit={submit}>
          <DialogHeader><DialogTitle>{selectedRow?.id ? 'Cập nhật doanh thu' : 'Nhập doanh thu'}</DialogTitle><DialogDescription>{selectedRow?.employeeName} · {period?.name}</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="revenue-employee">Nhân sự</Label><Select value={employeeId} onValueChange={(value) => { const nextRow = rows.find((item) => item.employeeId === value); setEmployeeId(value); setAmount(nextRow?.officialRevenueAmount ?? '') }}><SelectTrigger id="revenue-employee"><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent searchPlaceholder="Tìm nhân sự...">{rows.map((item) => <SelectItem value={item.employeeId} key={item.employeeId}>{item.employeeName}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="official-revenue">Doanh thu chính thức (VND)</Label><MoneyInput id="official-revenue" autoFocus value={amount} onValueChange={setAmount} maxDigits={18} aria-invalid={Boolean(amount) && !valid} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Hủy</Button><Button type="submit" disabled={!selectedRow || !valid || mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Lưu doanh thu</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getRevenueEntryDisabledReason(period: PayrollPeriod | null, rowCount: number) {
  if (!period) return 'Chưa chọn kỳ lương'
  if (period.status === 'DRAFT') return 'Cần mở kỳ lương để tạo snapshot nhân sự trước'
  if (period.status === 'CLOSED') return 'Kỳ lương đã đóng'
  if (rowCount === 0) return 'Kỳ lương chưa có nhân sự trong snapshot'
  return 'Đang tải dữ liệu doanh thu'
}
