import { type FormEvent, type ReactNode, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  BarChart3,
  Check,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Upload,
  UsersRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { getApiErrorMessage } from '@/api/client'
import { listPayrollPeriods, type PayrollPeriod } from '@/api/payroll-periods'
import {
  listRevenue,
  putEmployeeRevenue,
  type EmployeeRevenue,
} from '@/api/revenue'
import {
  createCustomTraffic,
  deleteCustomTraffic,
  getEmployeeTraffic,
  leaderApproveTraffic,
  leaderRejectTraffic,
  listTraffic,
  putEmployeeTraffic,
  selfConfirmTraffic,
  updateCustomTraffic,
  uploadTrafficEvidence,
  type EmployeeTrafficProfile,
  type TrafficListItem,
  type TrafficRecord,
} from '@/api/traffic'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  TableFooter,
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
import { ProgressBar } from '@/components/shared/ProgressBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { usePayrollPeriodSelection } from '@/contexts/PayrollPeriodContext'
import {
  formatCompactMoney,
  formatDateTime as formatDateTimeVn,
  formatMoney,
  formatNumber,
  toPercent,
} from '@/lib/format'
import { selectDefaultPayrollPeriod } from '@/lib/payroll-period'
import { PLATFORM_LABEL, PLATFORM_SURFACE, platformDisplayName } from '@/lib/platform'
import { toneSurface, toneText, type Tone } from '@/lib/tone'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { cn } from '@/lib/utils'
import { RunTrafficSyncDialog } from './RunTrafficSyncDialog'

const TRAFFIC_VIEW_PERMISSIONS = ['traffic.view_self', 'traffic.view_team', 'traffic.view_all']
const REVENUE_VIEW_PERMISSIONS = ['revenue.view_self', 'revenue.view_team', 'revenue.view_all']
const PAGE_SIZE = 100
// BE so khớp không phân biệt hoa/thường với tên enum; nhãn chuẩn viết thường trùng đúng các tên đó.
const FIXED_PLATFORM_NAMES = new Set(
  (['TIKTOK', 'FACEBOOK', 'YOUTUBE', 'INSTAGRAM'] as const).map((platform) => PLATFORM_LABEL[platform].toLowerCase()),
)
const CUSTOM_PLATFORM_SUGGESTIONS = ['Threads', 'Zalo', 'Shopee Video', 'Lemon8', 'X (Twitter)', 'Pinterest', 'LinkedIn']
// Một khuôn cột cho cả dòng tiêu đề lẫn từng dòng nền tảng để các cột thẳng hàng. Đổi theo độ rộng
// của khung chi tiết (container query), không theo màn hình: ở laptop 1280px khung chỉ ~600px vì
// đứng cạnh danh sách, dàn 4 cột sẽ bóp nát tên nền tảng và dòng người duyệt.
const PLATFORM_ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 @2xl:grid-cols-[minmax(0,1.15fr)_7rem_minmax(0,1fr)_14rem] @2xl:items-center @2xl:gap-x-4'
const compactViewsFormatter = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 })

function hasAnyPermission(permissions: string[] | undefined, expected: string[]) {
  return permissions?.some((code) => expected.includes(code)) ?? false
}

function formatViews(value: string) {
  try {
    return BigInt(value).toLocaleString('vi-VN')
  } catch {
    return value
  }
}

/** 15200000 → "15,2 Tr" — cho danh sách hẹp, luôn kèm title số đầy đủ. */
function formatCompactViews(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? compactViewsFormatter.format(number) : value
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(-2)
  return parts.map((part) => part[0]?.toLocaleUpperCase('vi-VN') ?? '').join('') || '?'
}

const PERIOD_STATUS_LABEL: Record<PayrollPeriod['status'], string> = {
  DRAFT: 'Nháp',
  OPEN: 'Đang mở',
  IN_REVIEW: 'Đang duyệt',
  CLOSED: 'Đã khóa',
}

/**
 * Toàn bộ phạm vi của kỳ, không lọc theo ô tìm kiếm. Chỉ số đầu trang và số đếm trên tab đọc từ
 * đây để không nhảy theo từ khoá đang gõ; cùng queryKey nên trang và tab dùng chung một request.
 */
function useTrafficScope(periodId: string, enabled = true) {
  return useQuery({
    queryKey: ['traffic', 'list', periodId, ''],
    queryFn: () => listTraffic(periodId, { page: 1, pageSize: PAGE_SIZE }),
    enabled: enabled && Boolean(periodId),
  })
}

function useRevenueScope(periodId: string, enabled = true) {
  return useQuery({
    queryKey: ['revenue', periodId, ''],
    queryFn: () => listRevenue(periodId, { page: 1, pageSize: PAGE_SIZE }),
    enabled: enabled && Boolean(periodId),
  })
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

  const trafficScope = useTrafficScope(effectivePeriodId, canViewTraffic)
  const revenueScope = useRevenueScope(effectivePeriodId, canViewRevenue)
  const trafficAttention = (trafficScope.data?.data ?? []).reduce(
    (total, employee) => total + employee.pendingPlatforms + employee.rejectedPlatforms,
    0,
  )
  const revenueMissing = (revenueScope.data?.data ?? []).filter((row) => row.officialRevenueAmount === null).length

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

  const syncAction = activeTab === 'traffic' && canTriggerSync ? <RunTrafficSyncDialog period={selectedPeriod} /> : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Dữ liệu đầu vào"
        title="Traffic & doanh thu"
        description="Nhập và duyệt traffic theo từng nền tảng; quản lý doanh thu chính thức dùng để tính hoa hồng và RPM."
        meta={selectedPeriod ? (
          <StatusBadge tone={selectedPeriod.status === 'CLOSED' ? 'info' : selectedPeriod.status === 'DRAFT' ? 'muted' : 'success'}>
            Kỳ {PERIOD_STATUS_LABEL[selectedPeriod.status].toLowerCase()}
          </StatusBadge>
        ) : null}
        action={periods.length ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Chỉ thuộc tab Traffic: doanh thu có nguồn khác, không kéo từ AutomationGenVideo. */}
            {syncAction}
            {/* Topbar đã có ô chọn kỳ từ md trở lên; ở màn hẹp topbar ẩn ô đó nên giữ lại ở đây. */}
            <Select value={effectivePeriodId} onValueChange={selectPeriod}>
              <SelectTrigger className="min-w-52 bg-card md:hidden" aria-label="Chọn kỳ lương">
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[21rem_repeat(3,minmax(0,1fr))]">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-2xl" />)}
          </div>
          <Skeleton className="h-96 w-full rounded-2xl" />
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
            {canViewTraffic ? (
              <TabsTrigger value="traffic">
                <Eye className="size-4" />Traffic
                <TabCount value={trafficAttention} label="nền tảng chờ duyệt hoặc bị từ chối" />
              </TabsTrigger>
            ) : null}
            {canViewRevenue ? (
              <TabsTrigger value="revenue">
                <Banknote className="size-4" />Doanh thu
                <TabCount value={revenueMissing} label="nhân sự chưa có doanh thu" />
              </TabsTrigger>
            ) : null}
          </TabsList>
          {canViewTraffic ? (
            <TabsContent value="traffic" className="mt-4">
              <TrafficSection period={selectedPeriod} userEmployeeId={user?.employeeId ?? null} permissions={user?.permissions ?? []} />
            </TabsContent>
          ) : null}
          {canViewRevenue ? (
            <TabsContent value="revenue" className="mt-4">
              <RevenueSection period={selectedPeriod} canWrite={user?.permissions.includes('revenue.write') ?? false} />
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  )
}

/** Số việc còn tồn trên tab; ẩn khi bằng 0 để tab gọn khi đã xong. */
function TabCount({ value, label }: { value: number; label: string }) {
  if (value <= 0) return null
  return (
    <span
      className={`ml-0.5 rounded-full px-1.5 py-px text-[11px] leading-4 font-semibold tabular-nums ${toneSurface.warning}`}
      aria-label={`${value} ${label}`}
      title={`${value} ${label}`}
    >
      {value}
    </span>
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

function SearchField({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        className="w-full pr-9 pl-8"
        placeholder="Tìm theo tên hoặc mã nhân sự"
        aria-label="Tìm nhân sự"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Xoá từ khoá tìm kiếm"
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  )
}

/** Nhóm nút lọc dạng phân đoạn; số đếm giúp biết trước bộ lọc có gì. */
function SegmentedFilter<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string; count?: number }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
            {option.count === undefined ? null : (
              <span className={cn('tabular-nums', active ? 'text-muted-foreground' : 'opacity-70')}>{formatNumber(option.count)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Bản tự xuống dòng của bộ lọc, cho cột hẹp không đủ chỗ xếp một hàng phân đoạn. */
function FilterChips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string; count: number }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            {option.label}
            <span className="tabular-nums opacity-70">{formatNumber(option.count)}</span>
          </button>
        )
      })}
    </div>
  )
}

type TrafficFilter = 'ALL' | 'PENDING' | 'REJECTED' | 'MISSING'

const TRAFFIC_FILTER_LABEL: Record<TrafficFilter, string> = {
  ALL: 'Tất cả',
  PENDING: 'Chờ duyệt',
  REJECTED: 'Bị từ chối',
  MISSING: 'Chưa nhập',
}

/**
 * Bốn nhóm bản ghi không giao nhau: đã duyệt, chờ duyệt, bị từ chối, còn lại là bản nháp chưa gửi.
 * `completedPlatforms` chỉ là số nền tảng ĐÃ NHẬP, nên phải trừ ra mới biết còn bản nháp.
 */
function draftPlatformCount(employee: TrafficListItem) {
  return employee.completedPlatforms - employee.approvedPlatforms - employee.pendingPlatforms - employee.rejectedPlatforms
}

function isTrafficComplete(employee: TrafficListItem) {
  return employee.completedPlatforms > 0 && employee.approvedPlatforms === employee.completedPlatforms
}

function trafficRowState(employee: TrafficListItem): { label: string; tone: Tone } {
  if (employee.rejectedPlatforms > 0) return { label: `${employee.rejectedPlatforms} bị từ chối`, tone: 'danger' }
  if (employee.pendingPlatforms > 0) return { label: `${employee.pendingPlatforms} chờ duyệt`, tone: 'warning' }
  const drafts = draftPlatformCount(employee)
  if (drafts > 0) return { label: `${drafts} bản nháp`, tone: 'info' }
  if (isTrafficComplete(employee)) return { label: 'Hoàn tất', tone: 'success' }
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
  const [deleting, setDeleting] = useState<TrafficRecord | null>(null)
  const periodId = period?.id ?? ''

  const scopeQuery = useTrafficScope(periodId)
  const listQuery = useQuery({
    queryKey: ['traffic', 'list', periodId, search],
    queryFn: () => listTraffic(periodId, { page: 1, pageSize: PAGE_SIZE, search: search || undefined }),
    enabled: Boolean(periodId),
  })
  const scopeEmployees = scopeQuery.data?.data ?? []
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
  const totalEmployees = scopeQuery.data?.meta.total ?? 0
  const totalAcceptedViews = scopeEmployees.reduce((total, employee) => total + BigInt(employee.acceptedViews), 0n)
  const pendingCount = scopeEmployees.reduce((total, employee) => total + employee.pendingPlatforms, 0)
  const rejectedCount = scopeEmployees.reduce((total, employee) => total + employee.rejectedPlatforms, 0)
  const doneCount = scopeEmployees.filter(isTrafficComplete).length
  const partialScope = totalEmployees > scopeEmployees.length
  const filterOptions = (Object.keys(TRAFFIC_FILTER_LABEL) as TrafficFilter[]).map((value) => ({
    value,
    label: TRAFFIC_FILTER_LABEL[value],
    count: employees.filter((employee) => matchesTrafficFilter(employee, value)).length,
  }))
  const isOwnProfile = Boolean(userEmployeeId && effectiveEmployeeId === userEmployeeId)
  const canWrite = isOwnProfile
    ? permissions.includes('traffic.write_self') || permissions.includes('traffic.write_team')
    : permissions.includes('traffic.write_team')
  const canSelfConfirm = isOwnProfile && permissions.includes('traffic.write_self')
  const canReview = !isOwnProfile && permissions.includes('traffic.leader_approve')
  const periodEditable = Boolean(period && period.status !== 'CLOSED' && period.status !== 'DRAFT')
  const takenCustomNames = (profile?.records ?? [])
    .filter((record) => record.platform === 'OTHER' && record.id !== editing?.id)
    .map((record) => record.platformName ?? '')

  const workflowMutation = useMutation({
    mutationFn: async (input: { action: 'confirm' | 'approve'; id: string }) =>
      input.action === 'confirm' ? selfConfirmTraffic(input.id) : leaderApproveTraffic(input.id),
    onSuccess: async (_, input) => {
      await invalidateTraffic(queryClient, periodId, effectiveEmployeeId)
      toast.success(input.action === 'confirm' ? 'Đã gửi traffic cho Leader duyệt' : 'Đã duyệt traffic')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Không cập nhật được trạng thái traffic')),
  })

  const isFiltering = Boolean(search) || filter !== 'ALL'

  return (
    <div className="flex flex-col gap-4">
      <PeriodStateNotice period={period} />

      {/* Cột đầu rộng đúng 21rem như cột danh sách bên dưới để mép các khối thẳng hàng. */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[21rem_repeat(3,minmax(0,1fr))]" aria-label="Tổng quan traffic">
        <MetricCard
          icon={UsersRound}
          tone="info"
          label="Hồ sơ đã hoàn tất"
          value={`${formatNumber(doneCount)} / ${formatNumber(scopeEmployees.length)}`}
          progress={toPercent(doneCount, scopeEmployees.length)}
          note={partialScope ? `Trong ${PAGE_SIZE} hồ sơ đầu tiên` : 'Mọi nền tảng đã nhập đều được duyệt'}
          loading={scopeQuery.isLoading}
        />
        <MetricCard
          icon={Eye}
          tone="info"
          label="Traffic hợp lệ tính RPM"
          value={formatViews(totalAcceptedViews.toString())}
          note="Đã tự xác nhận và được Leader duyệt"
          loading={scopeQuery.isLoading}
        />
        <MetricCard
          icon={Send}
          tone={pendingCount > 0 ? 'warning' : 'success'}
          label="Chờ Leader duyệt"
          value={formatNumber(pendingCount)}
          note={pendingCount > 0 ? 'Nền tảng đã gửi · bấm để lọc' : 'Không còn nền tảng nào chờ duyệt'}
          loading={scopeQuery.isLoading}
          onSelect={pendingCount > 0 ? () => setFilter('PENDING') : undefined}
        />
        <MetricCard
          icon={AlertTriangle}
          tone={rejectedCount > 0 ? 'danger' : 'success'}
          label="Bị từ chối"
          value={formatNumber(rejectedCount)}
          note={rejectedCount > 0 ? 'Nền tảng cần sửa lại · bấm để lọc' : 'Không có nền tảng nào bị từ chối'}
          loading={scopeQuery.isLoading}
          onSelect={rejectedCount > 0 ? () => setFilter('REJECTED') : undefined}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[21rem_minmax(0,1fr)] xl:items-start">
        <Card className="gap-0 overflow-hidden py-0 xl:sticky xl:top-24">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Nhân sự</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(totalEmployees)} người trong kỳ</span>
            </div>
            <SearchField value={searchInput} onChange={setSearchInput} />
            <FilterChips value={filter} options={filterOptions} onChange={setFilter} label="Lọc hồ sơ traffic" />
          </div>

          {listQuery.isLoading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-2 py-2.5">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-36" /><Skeleton className="h-3 w-24" /></div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : listQuery.isError ? (
            <div className="p-4">
              <ErrorState description="Không tải được danh sách traffic." onRetry={() => void listQuery.refetch()} />
            </div>
          ) : visibleEmployees.length === 0 ? (
            <EmptyState
              size="sm"
              icon={UsersRound}
              title={isFiltering ? 'Không có hồ sơ phù hợp' : 'Kỳ lương chưa có snapshot nhân sự'}
              description={isFiltering
                ? 'Thử từ khoá khác hoặc bỏ bộ lọc để xem toàn bộ hồ sơ.'
                : 'Mở kỳ lương để tạo snapshot nhân sự trước khi nhập traffic.'}
              action={isFiltering
                ? <Button variant="outline" onClick={() => { setSearchInput(''); setFilter('ALL') }}><X className="size-4" />Xoá bộ lọc</Button>
                : undefined}
            />
          ) : (
            // Khi xếp chồng (dưới xl) danh sách thấp hơn để phần chi tiết không bị đẩy quá xa.
            <ul className="max-h-80 divide-y xl:max-h-144 divide-border overflow-y-auto" aria-label="Danh sách hồ sơ traffic">
              {visibleEmployees.map((employee) => {
                const state = trafficRowState(employee)
                const isActive = employee.employeeId === effectiveEmployeeId
                const subtitle = [employee.jobTitle, employee.teamName].filter(Boolean).join(' · ')

                return (
                  <li key={employee.employeeId}>
                    <button
                      type="button"
                      onClick={() => setSelectedEmployeeId(employee.employeeId)}
                      aria-current={isActive ? 'true' : undefined}
                      className={cn(
                        'relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:bg-muted/40 focus-visible:outline-none',
                        isActive ? 'bg-primary/5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary' : 'hover:bg-muted/40',
                      )}
                    >
                      <span className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}>
                        {initialsOf(employee.employeeName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-semibold text-foreground">{employee.employeeName}</strong>
                        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                        {/* Số đã nhập: views hợp lệ bằng 0 suốt lúc còn nháp nên không cho biết ai đã nhập. */}
                        <span
                          className="text-xs text-muted-foreground tabular-nums"
                          title={`Đã nhập ${formatViews(employee.totalViews)} views · hợp lệ ${formatViews(employee.acceptedViews)}`}
                        >
                          {formatCompactViews(employee.totalViews)} views
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <div className="min-w-0">
          {listQuery.isLoading || profileQuery.isLoading ? (
            <TrafficProfileSkeleton />
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
            <TrafficProfilePanel
              profile={profile}
              canWrite={canWrite && periodEditable}
              canSelfConfirm={canSelfConfirm && periodEditable}
              canReview={canReview && periodEditable}
              workflowPending={workflowMutation.isPending}
              onEdit={setEditing}
              onDelete={setDeleting}
              onReject={setRejecting}
              onAddCustom={() => setEditing(newCustomTrafficRecord())}
              onConfirm={(id) => workflowMutation.mutate({ action: 'confirm', id })}
              onApprove={(id) => workflowMutation.mutate({ action: 'approve', id })}
            />
          )}
        </div>
      </div>

      <TrafficEditDialog
        key={editing ? `edit-${effectiveEmployeeId}-${editing.id ?? editing.platform}` : 'edit-closed'}
        record={editing}
        employee={selectedEmployee}
        period={period}
        takenCustomNames={takenCustomNames}
        onClose={() => setEditing(null)}
      />
      <TrafficRejectDialog
        key={rejecting ? `reject-${rejecting.id}` : 'reject-closed'}
        record={rejecting}
        periodId={periodId}
        employeeId={effectiveEmployeeId}
        onClose={() => setRejecting(null)}
      />
      <TrafficDeleteDialog
        key={deleting ? `delete-${deleting.id}` : 'delete-closed'}
        record={deleting}
        periodId={periodId}
        employeeId={effectiveEmployeeId}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

function TrafficProfileSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center gap-3 border-b border-border p-5">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex-1 space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-3.5 w-32" /></div>
        <Skeleton className="hidden h-10 w-64 sm:block" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-5 py-4">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
    </Card>
  )
}

function TrafficProfilePanel({
  profile,
  canWrite,
  canSelfConfirm,
  canReview,
  workflowPending,
  onEdit,
  onDelete,
  onReject,
  onAddCustom,
  onConfirm,
  onApprove,
}: {
  profile: EmployeeTrafficProfile
  canWrite: boolean
  canSelfConfirm: boolean
  canReview: boolean
  workflowPending: boolean
  onEdit: (record: TrafficRecord) => void
  onDelete: (record: TrafficRecord) => void
  onReject: (record: TrafficRecord) => void
  onAddCustom: () => void
  onConfirm: (id: string) => void
  onApprove: (id: string) => void
}) {
  const entered = profile.records.filter((record) => record.id)
  const approved = entered.filter((record) => record.leaderReviewStatus === 'APPROVED').length
  const subtitle = [profile.employeeCode, profile.jobTitle, profile.teamName ?? 'Chưa có team'].filter(Boolean).join(' · ')

  return (
    <Card className="@container gap-0 overflow-hidden py-0">
      <div className="flex flex-col gap-4 border-b border-border p-5 @xl:flex-row @xl:items-center @xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {initialsOf(profile.employeeName)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-foreground">{profile.employeeName}</h2>
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-3 gap-4 @md:gap-6 @xl:text-right">
          <ProfileStat label="Đã nhập" value={formatViews(profile.totalViews)} />
          <ProfileStat label="Hợp lệ tính RPM" value={formatViews(profile.acceptedViews)} valueClassName={toneText.success} />
          <ProfileStat label="Nền tảng đã duyệt" value={`${approved} / ${entered.length}`} />
        </dl>
      </div>

      <div className={cn(PLATFORM_ROW_GRID, 'hidden bg-muted px-5 py-2 text-xs font-medium text-muted-foreground @2xl:grid')} aria-hidden="true">
        <span>Nền tảng</span>
        <span className="text-right">Lượt xem</span>
        <span>Trạng thái</span>
        <span className="text-right">Thao tác</span>
      </div>
      <ul className="divide-y divide-border" aria-label={`Traffic theo nền tảng của ${profile.employeeName}`}>
        {profile.records.map((record) => (
          <TrafficPlatformRow
            key={record.id ?? record.platform}
            record={record}
            canWrite={canWrite}
            canSelfConfirm={canSelfConfirm}
            canReview={canReview}
            workflowPending={workflowPending}
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record)}
            onConfirm={() => record.id && onConfirm(record.id)}
            onApprove={() => record.id && onApprove(record.id)}
            onReject={() => onReject(record)}
          />
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t border-border bg-muted/30 px-5 py-3 @xl:flex-row @xl:items-center @xl:justify-between">
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Chỉ views đã tự xác nhận và được Leader duyệt mới được tính RPM. Mọi thao tác đều ghi vào nhật ký.
        </p>
        {canWrite ? (
          <Button variant="outline" size="sm" className="shrink-0 bg-card" onClick={onAddCustom}>
            <Plus className="size-4" aria-hidden="true" />Thêm nền tảng khác
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

function ProfileStat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-lg font-bold text-foreground tabular-nums', valueClassName)}>{value}</dd>
    </div>
  )
}

/** Bản ghi rỗng để mở dialog thêm nền tảng khác, chưa có gì trên BE. */
function newCustomTrafficRecord(): TrafficRecord {
  return {
    id: null,
    platform: 'OTHER',
    platformName: '',
    views: '0',
    selfConfirmationStatus: 'DRAFT',
    selfConfirmedBy: null,
    selfConfirmedAt: null,
    leaderReviewStatus: 'PENDING',
    leaderReviewedBy: null,
    leaderReviewedAt: null,
    leaderRejectionReason: null,
    attachments: [],
    createdAt: null,
    updatedAt: null,
  }
}

function TrafficPlatformRow({
  record,
  canWrite,
  canSelfConfirm,
  canReview,
  workflowPending,
  onEdit,
  onDelete,
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
  onDelete: () => void
  onConfirm: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const editable = record.selfConfirmationStatus === 'DRAFT' && record.leaderReviewStatus !== 'APPROVED'
  const awaitingReview = record.selfConfirmationStatus === 'CONFIRMED' && record.leaderReviewStatus === 'PENDING'
  const status = trafficStatus(record)
  const name = platformDisplayName(record.platform, record.platformName)
  const actions: ReactNode[] = []
  if (canWrite && editable) {
    actions.push(
      <Button key="edit" variant="outline" size="sm" className="h-8" onClick={onEdit}>
        <Pencil className="size-3.5" aria-hidden="true" />{record.id ? 'Sửa' : 'Nhập'}
      </Button>,
    )
  }
  if (canWrite && editable && record.platform === 'OTHER' && record.id) {
    actions.push(
      <Button key="delete" variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={onDelete} title={`Xoá nền tảng ${name}`} aria-label={`Xoá nền tảng ${name}`}>
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>,
    )
  }
  if (canSelfConfirm && editable && record.id) {
    actions.push(
      <Button key="confirm" size="sm" className="h-8" disabled={workflowPending} onClick={onConfirm}>
        <Send className="size-3.5" aria-hidden="true" />Tự xác nhận
      </Button>,
    )
  }
  if (canReview && awaitingReview) {
    actions.push(
      <Button key="reject" variant="outline" size="sm" className="h-8" disabled={workflowPending} onClick={onReject}>
        <X className="size-3.5" aria-hidden="true" />Từ chối
      </Button>,
      <Button key="approve" size="sm" className="h-8" disabled={workflowPending} onClick={onApprove}>
        <Check className="size-3.5" aria-hidden="true" />Duyệt
      </Button>,
    )
  }

  return (
    <li className="px-5 py-3.5">
      <div className={PLATFORM_ROW_GRID}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', PLATFORM_SURFACE[record.platform])}>
            <PlatformIcon platform={record.platform} className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            {record.attachments.length ? (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {record.attachments.map((attachment) => (
                  <a
                    className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground transition-colors hover:text-primary"
                    href={attachment.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    key={attachment.id}
                    title={attachment.originalFileName}
                  >
                    <FileText className="size-3 shrink-0" aria-hidden="true" />
                    <span className="max-w-28 truncate">{attachment.originalFileName}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{record.id ? 'Chưa có minh chứng' : 'Chưa có số liệu'}</p>
            )}
          </div>
        </div>

        <p className={cn('text-right text-sm font-semibold tabular-nums', record.id ? 'text-foreground' : 'text-muted-foreground')}>
          {record.id ? formatViews(record.views) : '—'}
        </p>

        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 @md:col-span-1 @2xl:block">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {status.meta ? <p className="text-[11px] leading-4 text-muted-foreground sm:mt-1">{status.meta}</p> : null}
        </div>

        <div className="col-span-2 flex flex-wrap items-center gap-1.5 @md:col-span-1 @md:justify-end">
          {actions.length ? actions : <span className="hidden text-xs text-muted-foreground @2xl:inline">—</span>}
        </div>
      </div>

      {record.leaderRejectionReason ? (
        <p className={`mt-2.5 flex items-start gap-2 rounded-md px-3 py-2 text-xs leading-5 @md:ml-12 ${toneSurface.danger}`}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span><strong>Lý do từ chối:</strong> {record.leaderRejectionReason}</span>
        </p>
      ) : null}
    </li>
  )
}

function trafficStatus(record: TrafficRecord): { label: string; tone: Tone; meta: string | null } {
  if (!record.id) return { label: 'Chưa nhập', tone: 'muted', meta: null }
  const reviewer = `${record.leaderReviewedBy?.fullName ?? 'Leader'} · ${formatDateTimeVn(record.leaderReviewedAt)}`
  if (record.leaderReviewStatus === 'APPROVED') return { label: 'Đã duyệt', tone: 'success', meta: reviewer }
  if (record.leaderReviewStatus === 'REJECTED') return { label: 'Bị từ chối', tone: 'danger', meta: reviewer }
  if (record.selfConfirmationStatus === 'CONFIRMED') {
    return { label: 'Chờ Leader duyệt', tone: 'warning', meta: `Tự xác nhận · ${formatDateTimeVn(record.selfConfirmedAt)}` }
  }
  return { label: 'Bản nháp', tone: 'muted', meta: `Lưu lúc ${formatDateTimeVn(record.updatedAt)}` }
}

function TrafficEditDialog({
  record,
  employee,
  period,
  takenCustomNames,
  onClose,
}: {
  record: TrafficRecord | null
  employee: TrafficListItem | null
  period: PayrollPeriod | null
  /** Tên các nền tảng thêm tay khác của nhân sự trong kỳ, để báo trùng ngay khi gõ. */
  takenCustomNames: string[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [views, setViews] = useState(record?.views ?? '0')
  const [platformName, setPlatformName] = useState(record?.platformName ?? '')
  const [attachmentIds, setAttachmentIds] = useState(record?.attachments.map((item) => item.id) ?? [])
  const [file, setFile] = useState<File | null>(null)
  const valid = /^(0|[1-9]\d{0,17})$/.test(views)
  const isCustom = record?.platform === 'OTHER'
  const isNewCustom = isCustom && !record?.id
  // Cùng cách chuẩn hoá với BE để báo trùng đúng như lúc lưu.
  const normalizedName = platformName.trim().replace(/\s+/g, ' ')
  const takenNames = new Set(takenCustomNames.map((name) => name.toLowerCase()))
  const nameIssue = !isCustom || !normalizedName
    ? null
    : FIXED_PLATFORM_NAMES.has(normalizedName.toLowerCase())
      ? `${normalizedName} đã có ô nhập sẵn, hãy nhập ở dòng nền tảng đó.`
      : takenNames.has(normalizedName.toLowerCase())
        ? 'Nhân sự đã có nền tảng này trong kỳ.'
        : null
  const nameValid = !isCustom || (Boolean(normalizedName) && !nameIssue)

  const mutation = useMutation({
    mutationFn: async () => {
      const nextAttachmentIds = [...attachmentIds]
      if (file) {
        const uploaded = await uploadTrafficEvidence(file)
        nextAttachmentIds.push(uploaded.id)
      }
      const input = { views, attachmentIds: nextAttachmentIds }
      if (!isCustom) return putEmployeeTraffic(period!.id, employee!.employeeId, record!.platform, input)
      const customInput = { ...input, platformName: normalizedName }
      return record!.id
        ? updateCustomTraffic(record!.id, customInput)
        : createCustomTraffic(period!.id, employee!.employeeId, customInput)
    },
    onSuccess: async () => {
      await invalidateTraffic(queryClient, period!.id, employee!.employeeId)
      toast.success(isNewCustom ? `Đã thêm nền tảng ${normalizedName}` : 'Đã lưu traffic bản nháp')
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Không lưu được traffic')),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (record && employee && period && valid && nameValid) mutation.mutate()
  }

  const title = !record
    ? ''
    : isNewCustom
      ? 'Thêm traffic nền tảng khác'
      : `Cập nhật traffic ${platformDisplayName(record.platform, record.platformName)}`

  return (
    <Dialog open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{employee?.employeeName} · {period?.name}. Hãy lưu nháp trước khi tự xác nhận.</DialogDescription>
          </DialogHeader>
          {isCustom ? (
            <div className="space-y-2">
              <Label htmlFor="traffic-platform-name">Tên nền tảng</Label>
              <Input
                id="traffic-platform-name"
                autoFocus
                maxLength={100}
                list="traffic-platform-suggestions"
                placeholder="Ví dụ: Threads"
                value={platformName}
                onChange={(event) => setPlatformName(event.target.value)}
                aria-invalid={Boolean(nameIssue)}
              />
              <datalist id="traffic-platform-suggestions">
                {CUSTOM_PLATFORM_SUGGESTIONS.filter((name) => !takenNames.has(name.toLowerCase())).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {nameIssue ? <p className={`text-xs ${toneText.danger}`}>{nameIssue}</p> : null}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="traffic-views">Lượt xem</Label>
            <Input id="traffic-views" inputMode="numeric" autoFocus={!isCustom} value={views} onChange={(event) => setViews(event.target.value.replace(/\D/g, '').slice(0, 18))} aria-invalid={Boolean(views) && !valid} />
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
            <Button type="submit" disabled={!valid || !nameValid || mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Lưu bản nháp</Button>
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
    onError: (error) => toast.error(getApiErrorMessage(error, 'Không từ chối được traffic')),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (record?.id && reason.trim()) mutation.mutate()
  }

  return (
    <Dialog open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form className="contents" onSubmit={submit}>
          <DialogHeader><DialogTitle>Từ chối traffic {record ? platformDisplayName(record.platform, record.platformName) : ''}</DialogTitle><DialogDescription>Nhân sự sẽ được sửa bản ghi và tự xác nhận lại.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label htmlFor="traffic-reject-reason">Lý do từ chối</Label><Textarea id="traffic-reject-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Nêu rõ số liệu hoặc minh chứng cần bổ sung" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Hủy</Button><Button type="submit" disabled={!reason.trim() || mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Xác nhận từ chối</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TrafficDeleteDialog({
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
  const name = record ? platformDisplayName(record.platform, record.platformName) : ''
  const mutation = useMutation({
    mutationFn: () => deleteCustomTraffic(record!.id!),
    onSuccess: async () => {
      await invalidateTraffic(queryClient, periodId, employeeId)
      toast.success(`Đã xoá nền tảng ${name}`)
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Không xoá được nền tảng')),
  })

  return (
    <Dialog open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xoá nền tảng {name}?</DialogTitle>
          <DialogDescription>
            {record ? formatViews(record.views) : '0'} views và minh chứng đính kèm sẽ bị gỡ khỏi kỳ lương này. Thao tác được ghi vào nhật ký.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
          <Button type="button" variant="destructive" disabled={!record?.id || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Xoá nền tảng
          </Button>
        </DialogFooter>
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

type RevenueStatusFilter = 'ALL' | 'MISSING' | 'ENTERED'
type RevenueSort = 'name' | 'amount-desc' | 'amount-asc'
const ALL_TEAMS = '__all__'

function RevenueSection({ period, canWrite }: { period: PayrollPeriod | null; canWrite: boolean }) {
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim(), 350)
  const [statusFilter, setStatusFilter] = useState<RevenueStatusFilter>('ALL')
  const [teamFilter, setTeamFilter] = useState(ALL_TEAMS)
  const [sort, setSort] = useState<RevenueSort>('name')
  const [editing, setEditing] = useState<EmployeeRevenue | null>(null)
  const periodId = period?.id ?? ''

  const scopeQuery = useRevenueScope(periodId)
  const revenueQuery = useQuery({
    queryKey: ['revenue', periodId, search],
    queryFn: () => listRevenue(periodId, { page: 1, pageSize: PAGE_SIZE, search: search || undefined }),
    enabled: Boolean(periodId),
  })
  const scopeRows = scopeQuery.data?.data ?? []
  const rows = revenueQuery.data?.data ?? []
  const totalRows = scopeQuery.data?.meta.total ?? 0
  const partialScope = totalRows > scopeRows.length

  const enteredRows = scopeRows.filter((row) => row.officialRevenueAmount !== null)
  const missingCount = scopeRows.length - enteredRows.length
  const totalRevenue = enteredRows.reduce((total, row) => total + BigInt(row.officialRevenueAmount!), 0n)
  const averageRevenue = enteredRows.length ? totalRevenue / BigInt(enteredRows.length) : 0n
  const topRow = enteredRows.reduce<EmployeeRevenue | null>(
    (top, row) => (!top || BigInt(row.officialRevenueAmount!) > BigInt(top.officialRevenueAmount!) ? row : top),
    null,
  )
  const maxRevenue = topRow ? BigInt(topRow.officialRevenueAmount!) : 0n

  const teams = Array.from(new Set(scopeRows.map((row) => row.teamName).filter((name): name is string => Boolean(name))))
    .sort((a, b) => a.localeCompare(b, 'vi'))
  const teamRows = teamFilter === ALL_TEAMS ? rows : rows.filter((row) => row.teamName === teamFilter)
  const statusOptions: Array<{ value: RevenueStatusFilter; label: string; count: number }> = [
    { value: 'ALL', label: 'Tất cả', count: teamRows.length },
    { value: 'MISSING', label: 'Chưa nhập', count: teamRows.filter((row) => row.officialRevenueAmount === null).length },
    { value: 'ENTERED', label: 'Đã nhập', count: teamRows.filter((row) => row.officialRevenueAmount !== null).length },
  ]
  const visibleRows = sortRevenueRows(
    teamRows.filter((row) => statusFilter === 'ALL' || (statusFilter === 'MISSING') === (row.officialRevenueAmount === null)),
    sort,
  )
  const visibleTotal = visibleRows.reduce((total, row) => total + BigInt(row.officialRevenueAmount ?? '0'), 0n)
  const visibleEntered = visibleRows.filter((row) => row.officialRevenueAmount !== null).length
  const isFiltering = Boolean(search) || statusFilter !== 'ALL' || teamFilter !== ALL_TEAMS
  const entryDisabled = !period || period.status === 'DRAFT' || period.status === 'CLOSED' || scopeRows.length === 0 || scopeQuery.isLoading

  function clearFilters() {
    setSearchInput('')
    setStatusFilter('ALL')
    setTeamFilter(ALL_TEAMS)
  }

  function toggleAmountSort() {
    setSort((current) => (current === 'amount-desc' ? 'amount-asc' : current === 'amount-asc' ? 'name' : 'amount-desc'))
  }

  return (
    <div className="flex flex-col gap-4">
      <PeriodStateNotice period={period} />

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Tổng quan doanh thu">
        <MetricCard
          icon={CheckCircle2}
          tone="info"
          label="Tiến độ nhập doanh thu"
          value={`${formatNumber(enteredRows.length)} / ${formatNumber(scopeRows.length)}`}
          progress={toPercent(enteredRows.length, scopeRows.length)}
          note={missingCount > 0
            ? `Còn ${formatNumber(missingCount)} nhân sự chưa có số liệu · bấm để lọc`
            : scopeRows.length > 0 ? 'Mọi nhân sự đã có doanh thu chính thức' : 'Chưa có nhân sự trong kỳ'}
          loading={scopeQuery.isLoading}
          onSelect={missingCount > 0 ? () => setStatusFilter('MISSING') : undefined}
        />
        <MetricCard
          icon={Banknote}
          tone="info"
          label="Tổng doanh thu chính thức"
          value={formatCompactMoney(totalRevenue.toString())}
          valueTitle={formatMoney(totalRevenue.toString())}
          note={partialScope ? `Trong ${PAGE_SIZE} nhân sự đầu tiên` : `Từ ${formatNumber(enteredRows.length)} nhân sự đã nhập`}
          loading={scopeQuery.isLoading}
        />
        <MetricCard
          icon={TrendingUp}
          tone="info"
          label="Bình quân mỗi nhân sự"
          value={enteredRows.length ? formatCompactMoney(averageRevenue.toString()) : '—'}
          valueTitle={enteredRows.length ? formatMoney(averageRevenue.toString()) : undefined}
          note={topRow ? `Cao nhất: ${topRow.employeeName} · ${formatCompactMoney(topRow.officialRevenueAmount)}` : 'Chưa có số liệu để so sánh'}
          loading={scopeQuery.isLoading}
        />
      </section>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Doanh thu theo nhân sự</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isFiltering
                  ? `Đang hiển thị ${formatNumber(visibleRows.length)} / ${formatNumber(totalRows)} nhân sự`
                  : `${formatNumber(totalRows)} nhân sự trong phạm vi của bạn`}
              </p>
            </div>
            {canWrite ? (
              <Button
                className="self-start lg:self-auto"
                disabled={entryDisabled}
                title={entryDisabled ? getRevenueEntryDisabledReason(period, scopeRows.length) : 'Mở form nhập cho nhân sự chưa có số liệu'}
                onClick={() => setEditing(scopeRows.find((row) => row.officialRevenueAmount === null) ?? scopeRows[0])}
              >
                <Plus className="size-4" aria-hidden="true" />Nhập doanh thu
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchField value={searchInput} onChange={setSearchInput} className="sm:w-64" />
            {teams.length > 1 ? (
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="bg-card sm:w-48" aria-label="Lọc theo team">
                  <SelectValue placeholder="Tất cả team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TEAMS}>Tất cả team</SelectItem>
                  {teams.map((team) => <SelectItem key={team} value={team}>{team}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            <SegmentedFilter value={statusFilter} options={statusOptions} onChange={setStatusFilter} label="Lọc theo trạng thái nhập" />
          </div>

          {canWrite ? null : (
            /* Không có quyền thì nút nhập bị ẩn — phải nói rõ lý do, tránh trông như thiếu chức năng. */
            <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.info}`}>
              <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Chế độ chỉ xem.</strong> Tài khoản của bạn chưa được cấp quyền nhập doanh thu chính thức.
                Liên hệ quản trị hệ thống để được cấp quyền, hoặc nhờ kế toán cập nhật số liệu cho kỳ này.
              </span>
            </p>
          )}
        </div>

        {revenueQuery.isLoading ? (
          <div className="space-y-1 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 py-2">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        ) : revenueQuery.isError ? (
          <div className="p-4">
            <ErrorState description="Không tải được dữ liệu doanh thu." onRetry={() => void revenueQuery.refetch()} />
          </div>
        ) : visibleRows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={statusFilter === 'MISSING' && !search ? CheckCircle2 : Banknote}
            tone={statusFilter === 'MISSING' && !search && scopeRows.length > 0 ? 'success' : 'muted'}
            title={statusFilter === 'MISSING' && !search
              ? 'Không còn nhân sự nào thiếu doanh thu'
              : isFiltering ? 'Không tìm thấy nhân sự phù hợp' : 'Kỳ lương chưa có snapshot nhân sự'}
            description={statusFilter === 'MISSING' && !search
              ? 'Toàn bộ nhân sự trong bộ lọc đang xem đã có doanh thu chính thức.'
              : isFiltering ? 'Thử từ khoá khác hoặc bỏ bộ lọc để xem toàn bộ danh sách.'
                : 'Mở kỳ lương để tạo snapshot nhân sự trước khi nhập doanh thu.'}
            action={isFiltering
              ? <Button variant="outline" onClick={clearFilters}><X className="size-4" />Xoá bộ lọc</Button>
              : undefined}
          />
        ) : (
          // Không đặt min-width: màn hẹp ẩn cột phụ (team, cập nhật) để cột doanh thu luôn nằm trong khung nhìn.
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhân sự</TableHead>
                  <TableHead className="hidden xl:table-cell">Team</TableHead>
                  <TableHead
                    className="text-right"
                    aria-sort={sort === 'amount-desc' ? 'descending' : sort === 'amount-asc' ? 'ascending' : 'none'}
                  >
                    <button
                      type="button"
                      onClick={toggleAmountSort}
                      className="ml-auto inline-flex items-center gap-1 rounded-sm uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      title="Sắp xếp theo doanh thu"
                    >
                      Doanh thu chính thức
                      {sort === 'amount-desc'
                        ? <ArrowDown className="size-3.5" aria-hidden="true" />
                        : sort === 'amount-asc'
                          ? <ArrowUp className="size-3.5" aria-hidden="true" />
                          : <ArrowUpDown className="size-3.5 opacity-60" aria-hidden="true" />}
                    </button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Cập nhật gần nhất</TableHead>
                  {canWrite ? <TableHead className="w-12 text-right sm:w-24"><span className="sr-only">Thao tác</span></TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => {
                  const amount = row.officialRevenueAmount
                  const share = amount && maxRevenue > 0n ? Number((BigInt(amount) * 1000n) / maxRevenue) / 10 : 0
                  return (
                    <TableRow key={row.employeeId}>
                      <TableCell className="whitespace-normal">
                        <div className="flex items-center gap-3">
                          <span className="hidden size-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground sm:grid">
                            {initialsOf(row.employeeName)}
                          </span>
                          <div className="min-w-0">
                            <strong className="block font-semibold text-foreground">{row.employeeName}</strong>
                            <span className="block text-xs text-muted-foreground">
                              <span className="hidden sm:inline">{row.employeeCode} · </span>{row.jobTitle}
                              {/* Cột Team ẩn dưới xl nên đưa team về dòng phụ. */}
                              {row.teamName ? <span className="xl:hidden"> · {row.teamName}</span> : null}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">{row.teamName ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        {amount === null ? (
                          <StatusBadge tone="warning">Chưa nhập</StatusBadge>
                        ) : (
                          <div className="ml-auto flex w-28 flex-col items-end gap-1.5 sm:w-44">
                            <span className="font-semibold whitespace-nowrap text-foreground tabular-nums">{formatMoney(amount)}</span>
                            <ProgressBar value={share} tone="info" label={`Bằng ${Math.round(share)}% doanh thu cao nhất`} className="h-1" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {row.lastUpdatedBy ? (
                          <>
                            <span className="block text-sm text-foreground">{row.lastUpdatedBy.fullName}</span>
                            <span className="text-xs text-muted-foreground">{formatDateTimeVn(row.updatedAt)}</span>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          <Button
                            variant={amount === null ? 'outline' : 'ghost'}
                            size="sm"
                            disabled={period?.status === 'CLOSED'}
                            onClick={() => setEditing(row)}
                            aria-label={`${amount === null ? 'Nhập' : 'Sửa'} doanh thu của ${row.employeeName}`}
                          >
                            {amount === null ? <Plus className="size-4" aria-hidden="true" /> : <Pencil className="size-4" aria-hidden="true" />}
                            {/* Màn hẹp chỉ còn icon để nhường chỗ cho cột doanh thu. */}
                            <span className="hidden sm:inline">{amount === null ? 'Nhập' : 'Sửa'}</span>
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                {/* Từng ô mang đúng lớp ẩn/hiện như cột phía trên thay cho colSpan, để không lệch cột khi đổi màn. */}
                <TableRow>
                  <TableCell className="text-sm font-semibold whitespace-normal text-foreground">
                    Tổng {isFiltering ? 'đang hiển thị' : 'kỳ'}
                    <span className="block text-xs font-normal text-muted-foreground sm:ml-1.5 sm:inline">{formatNumber(visibleEntered)} nhân sự đã nhập</span>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell" />
                  <TableCell className="text-right font-bold whitespace-nowrap text-foreground tabular-nums">{formatMoney(visibleTotal.toString())}</TableCell>
                  <TableCell className="hidden md:table-cell" />
                  {canWrite ? <TableCell /> : null}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}

        {canWrite ? (
          <p className="flex items-start gap-2 border-t border-border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Doanh thu chính thức là đầu vào tính hoa hồng và RPM. Mọi thay đổi đều được ghi vào nhật ký.
          </p>
        ) : null}
      </Card>

      <RevenueDialog key={editing?.employeeId ?? 'revenue-closed'} row={editing} rows={scopeRows} period={period} onClose={() => setEditing(null)} />
    </div>
  )
}

function sortRevenueRows(rows: EmployeeRevenue[], sort: RevenueSort) {
  if (sort === 'name') return rows
  const direction = sort === 'amount-desc' ? -1 : 1
  // Nhân sự chưa nhập luôn nằm cuối dù sắp tăng hay giảm, để không lẫn với doanh thu bằng 0.
  return [...rows].sort((a, b) => {
    if (a.officialRevenueAmount === null || b.officialRevenueAmount === null) {
      return a.officialRevenueAmount === b.officialRevenueAmount ? 0 : a.officialRevenueAmount === null ? 1 : -1
    }
    const left = BigInt(a.officialRevenueAmount)
    const right = BigInt(b.officialRevenueAmount)
    return left === right ? 0 : left > right ? direction : -direction
  })
}

function RevenueDialog({ row, rows, period, onClose }: { row: EmployeeRevenue | null; rows: EmployeeRevenue[]; period: PayrollPeriod | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [employeeId, setEmployeeId] = useState(row?.employeeId ?? '')
  const [amount, setAmount] = useState(row?.officialRevenueAmount ?? '')
  const selectedRow = rows.find((item) => item.employeeId === employeeId) ?? row
  const valid = /^(0|[1-9]\d{0,17})$/.test(amount)
  const nextMissing = rows.find((item) => item.officialRevenueAmount === null && item.employeeId !== selectedRow?.employeeId) ?? null
  const remainingMissing = rows.filter((item) => item.officialRevenueAmount === null).length
  // nextEmployeeId chỉ dùng ở onSuccess: có giá trị thì chuyển sang người kế thay vì đóng dialog.
  const mutation = useMutation<EmployeeRevenue, unknown, { nextEmployeeId: string | null }>({
    mutationFn: () => putEmployeeRevenue(period!.id, selectedRow!.employeeId, amount),
    onSuccess: async (_, { nextEmployeeId }) => {
      await queryClient.invalidateQueries({ queryKey: ['revenue', period!.id] })
      toast.success(selectedRow?.id ? 'Đã cập nhật doanh thu' : `Đã nhập doanh thu cho ${selectedRow?.employeeName ?? 'nhân sự'}`)
      if (nextEmployeeId) {
        setEmployeeId(nextEmployeeId)
        setAmount('')
      } else {
        onClose()
      }
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Không lưu được doanh thu')),
  })

  function save(nextEmployeeId: string | null) {
    if (selectedRow && valid) mutation.mutate({ nextEmployeeId })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    save(null)
  }

  const context = [selectedRow?.teamName, period?.name].filter(Boolean).join(' · ')

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{selectedRow?.id ? 'Cập nhật doanh thu' : 'Nhập doanh thu'}</DialogTitle>
            <DialogDescription>
              {context}
              {remainingMissing > 0 ? ` · Còn ${formatNumber(remainingMissing)} nhân sự chưa nhập` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revenue-employee">Nhân sự</Label>
            <Select value={employeeId} onValueChange={(value) => { const nextRow = rows.find((item) => item.employeeId === value); setEmployeeId(value); setAmount(nextRow?.officialRevenueAmount ?? '') }}>
              <SelectTrigger id="revenue-employee" className="w-full"><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger>
              <SelectContent searchPlaceholder="Tìm nhân sự...">
                {rows.map((item) => (
                  <SelectItem value={item.employeeId} key={item.employeeId}>
                    {item.employeeName}{item.officialRevenueAmount === null ? ' · chưa nhập' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="official-revenue">Doanh thu chính thức (VND)</Label>
            {/* key theo nhân sự để ô tự focus lại sau khi "Lưu & nhập tiếp" chuyển sang người kế. */}
            <MoneyInput key={employeeId} id="official-revenue" autoFocus value={amount} onValueChange={setAmount} maxDigits={18} aria-invalid={Boolean(amount) && !valid} />
            {selectedRow?.lastUpdatedBy ? (
              <p className="text-xs text-muted-foreground">
                Đang là {formatMoney(selectedRow.officialRevenueAmount)} · {selectedRow.lastUpdatedBy.fullName} cập nhật {formatDateTimeVn(selectedRow.updatedAt)}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
            {nextMissing ? (
              <Button type="button" variant="outline" disabled={!selectedRow || !valid || mutation.isPending} onClick={() => save(nextMissing.employeeId)}>
                Lưu & nhập tiếp
              </Button>
            ) : null}
            <Button type="submit" disabled={!selectedRow || !valid || mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Lưu doanh thu</Button>
          </DialogFooter>
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
