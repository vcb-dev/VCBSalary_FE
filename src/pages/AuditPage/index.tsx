import { type ReactNode, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  Download,
  Eye,
  FilterX,
  History,
  Loader2,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { exportAuditLogs, getAuditLog, listAuditLogs, type AuditFilters, type AuditLog } from '@/api/audit'
import { getApiErrorMessage } from '@/api/client'
import { listPayrollPeriods } from '@/api/payroll-periods'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState as SharedEmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatNumber, formatRelativeTime } from '@/lib/format'
import { toneSurface, type Tone } from '@/lib/tone'
import { useDebouncedValue } from '@/lib/use-debounced-value'

const PAGE_SIZE = 50
const ALL = '__all__'
const FILTER_LABEL_CLASS = 'text-xs font-medium text-muted-foreground'

type ActionMeta = {
  label: string
  description: string
  module: string
  tone: Tone
}

const ACTION_META: Record<string, ActionMeta> = {
  EMPLOYEE_CREATED: action('Thêm nhân sự', 'Một hồ sơ nhân sự mới đã được tạo.', 'Nhân sự', 'success'),
  EMPLOYEE_UPDATED: action('Cập nhật nhân sự', 'Thông tin hồ sơ nhân sự đã được thay đổi.', 'Nhân sự'),
  PAYROLL_PERIOD_CREATED: action('Tạo kỳ lương', 'Một kỳ lương mới đã được tạo.', 'Kỳ lương', 'success'),
  PAYROLL_PERIOD_UPDATED: action('Cập nhật kỳ lương', 'Thông tin kỳ lương đã được thay đổi.', 'Kỳ lương'),
  PAYROLL_PERIOD_OPENED: action('Mở kỳ lương', 'Kỳ lương đã được mở và chụp snapshot nhân sự.', 'Kỳ lương', 'success'),
  PAYROLL_PERIOD_SNAPSHOTS_SYNCED: action('Bổ sung snapshot nhân sự', 'Nhân sự mới đã được thêm vào kỳ đang mở.', 'Kỳ lương'),
  PAYROLL_PERIOD_START_REVIEW: action('Bắt đầu duyệt kỳ lương', 'Kỳ lương đã chuyển sang giai đoạn rà soát.', 'Kỳ lương', 'warning'),
  PAYROLL_PERIOD_CLOSED: action('Đóng kỳ lương', 'Kỳ lương đã được đóng.', 'Kỳ lương', 'success'),
  TRAFFIC_CREATED: action('Nhập traffic', 'Số lượt xem của một nền tảng đã được ghi nhận.', 'Traffic', 'success'),
  TRAFFIC_UPDATED: action('Cập nhật traffic', 'Số lượt xem hoặc minh chứng đã được thay đổi.', 'Traffic'),
  REVENUE_CREATED: action('Nhập doanh thu', 'Doanh thu chính thức của nhân sự đã được ghi nhận.', 'Doanh thu', 'success'),
  REVENUE_UPDATED: action('Cập nhật doanh thu', 'Doanh thu chính thức của nhân sự đã được thay đổi.', 'Doanh thu'),
  BASE_SALARY_HISTORY_CREATED: action('Thiết lập lương cơ bản', 'Một mức lương cơ bản mới đã được tạo.', 'Cấu hình lương', 'success'),
  BASE_SALARY_HISTORY_UPDATED: action('Cập nhật lương cơ bản', 'Mức lương cơ bản đã được thay đổi.', 'Cấu hình lương'),
  KPI_REWARD_RATE_CREATED: action('Thiết lập mức thưởng KPI', 'Mức thưởng KPI của nhân sự đã được tạo.', 'Cấu hình thưởng', 'success'),
  KPI_REWARD_RATE_UPDATED: action('Cập nhật mức thưởng KPI', 'Mức thưởng KPI của nhân sự đã được thay đổi.', 'Cấu hình thưởng'),
  KPI_REWARD_RATE_DELETED: action('Xóa mức thưởng KPI', 'Một mức thưởng KPI không còn áp dụng đã được xóa.', 'Cấu hình thưởng', 'warning'),
  REWARD_RULE_SET_CREATED: action('Tạo bộ quy tắc thưởng', 'Một phiên bản quy tắc thưởng mới đã được tạo.', 'Cấu hình thưởng', 'success'),
  REWARD_RULE_SET_ACTIVATED: action('Kích hoạt quy tắc thưởng', 'Một phiên bản quy tắc thưởng đã được áp dụng.', 'Cấu hình thưởng', 'success'),
  REWARD_RULE_SET_ARCHIVED: action('Lưu trữ quy tắc thưởng', 'Một phiên bản quy tắc thưởng đã ngừng áp dụng.', 'Cấu hình thưởng', 'warning'),
  REVENUE_REWARD_BRACKET_CREATED: action('Thêm bậc thưởng doanh thu', 'Một bậc thưởng doanh thu mới đã được tạo.', 'Cấu hình thưởng', 'success'),
  REVENUE_REWARD_BRACKET_UPDATED: action('Cập nhật bậc thưởng doanh thu', 'Điều kiện hoặc mức thưởng doanh thu đã được thay đổi.', 'Cấu hình thưởng'),
  REVENUE_REWARD_BRACKET_DELETED: action('Xóa bậc thưởng doanh thu', 'Một bậc thưởng doanh thu đã được xóa.', 'Cấu hình thưởng', 'warning'),
  SALARY_CALCULATED: action('Tính lương', 'Bản tính lương mới đã được tạo.', 'Lương', 'success'),
  SALARY_RECALCULATED: action('Tính lại lương', 'Bản lương nháp đã được tính lại theo dữ liệu mới.', 'Lương'),
  SALARY_APPROVED: action('Duyệt lương', 'Bản lương đã được phê duyệt.', 'Lương', 'success'),
  SALARY_LOCKED: action('Khóa lương', 'Bản lương đã được khóa và không thể sửa trực tiếp.', 'Lương', 'success'),
  SALARY_REVISION_CREATED: action('Tạo phiên bản lương mới', 'Một phiên bản điều chỉnh đã được tạo từ bản lương đã khóa.', 'Lương', 'warning'),
}

const ENTITY_LABELS: Record<string, string> = {
  Employee: 'Hồ sơ nhân sự',
  PayrollPeriod: 'Kỳ lương',
  EmployeeTrafficRecord: 'Số liệu traffic',
  EmployeeRevenueRecord: 'Doanh thu nhân sự',
  SalaryRecord: 'Bản lương',
  RewardRuleSet: 'Bộ quy tắc thưởng',
  BaseSalaryHistory: 'Lương cơ bản',
  EmployeeKpiRewardRate: 'Mức thưởng KPI',
  RevenueRewardBracket: 'Bậc thưởng doanh thu',
}

const FIELD_LABELS: Record<string, string> = {
  actualValue: 'Kết quả thực tế',
  targetValue: 'Mục tiêu',
  overrideValue: 'Giá trị điều chỉnh',
  source: 'Nguồn dữ liệu',
  status: 'Trạng thái',
  views: 'Lượt xem',
  attachmentIds: 'Tệp minh chứng',
  officialRevenueAmount: 'Doanh thu chính thức',
  monthlyBaseSalary: 'Lương cơ bản',
  rewardAmount: 'Mức thưởng',
  totalSalaryAmount: 'Tổng lương',
  versionNumber: 'Phiên bản',
  warningCount: 'Số cảnh báo',
  conflictRecords: 'Bản ghi xung đột',
  failedRecords: 'Bản ghi lỗi',
  successfulRecords: 'Bản ghi thành công',
  skippedRecords: 'Bản ghi bỏ qua',
  fullName: 'Họ và tên',
  jobTitle: 'Chức danh',
  teamId: 'Team',
  leaderEmployeeId: 'Leader',
  managerEmployeeId: 'Manager',
  employmentStatus: 'Trạng thái làm việc',
  joinedAt: 'Ngày vào làm',
  leftAt: 'Ngày nghỉ việc',
  employeeGroupIds: 'Nhóm nghiệp vụ',
  name: 'Tên',
  startDate: 'Ngày bắt đầu',
  endDate: 'Ngày kết thúc',
  approvalDeadline: 'Hạn phê duyệt',
  code: 'Mã',
  employeeCode: 'Mã nhân sự',
  effectiveFrom: 'Áp dụng từ ngày',
  effectiveTo: 'Áp dụng đến ngày',
  platform: 'Nền tảng',
  kpiGroupId: 'Nhóm KPI áp dụng',
  rewardRuleSetId: 'Bộ quy tắc thưởng',
  rewardRuleSetVersion: 'Phiên bản quy tắc thưởng',
  achievementThresholdPercent: 'Ngưỡng hoàn thành',
  minRevenueAmount: 'Doanh thu tối thiểu',
  maxRevenueAmount: 'Doanh thu tối đa',
  label: 'Tên bậc thưởng',
  version: 'Phiên bản',
  snapshotEmployeeCount: 'Số nhân sự trong kỳ',
  addedCount: 'Số nhân sự được bổ sung',
  addedEmployeeIds: 'Nhân sự được bổ sung',
  automaticKpiAssignmentCount: 'Số phân công KPI tự động',
  restoredPreviousRateId: 'Khôi phục mức thưởng trước',
  archivedRuleSetId: 'Bộ quy tắc được lưu trữ',
  clonedFrom: 'Sao chép từ phiên bản',
  clonedBracketCount: 'Số bậc thưởng được sao chép',
}

export function AuditPage() {
  const { user } = useAuth()
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 350)
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, pageSize: PAGE_SIZE })
  // Từ khoá đã chốt mới đi vào query key, nên gõ từng ký tự không bắn mỗi ký tự một request.
  const effectiveFilters = useMemo<AuditFilters>(
    () => ({ ...filters, search: debouncedSearch || undefined }),
    [debouncedSearch, filters],
  )
  const [detailId, setDetailId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const canExport = user?.permissions.includes('report.export') ?? false
  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', 'audit-filter'],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: 100 }),
  })
  const logsQuery = useQuery({
    queryKey: ['audit-logs', effectiveFilters],
    queryFn: () => listAuditLogs(effectiveFilters),
  })
  const detailQuery = useQuery({
    queryKey: ['audit-log', detailId],
    queryFn: () => getAuditLog(detailId!),
    enabled: Boolean(detailId),
  })
  const rows = useMemo(() => logsQuery.data?.data ?? [], [logsQuery.data])
  const employeeCount = rows.filter((row) => auditCategory(row.action) === 'employee').length
  const salaryCount = rows.filter((row) => auditCategory(row.action) === 'salary').length
  const metricsCount = rows.filter((row) => auditCategory(row.action) === 'metrics').length
  const totalLogs = logsQuery.data?.meta.total ?? 0
  const hasFilters = Boolean(debouncedSearch || filters.action || filters.payrollPeriodId || filters.dateFrom || filters.dateTo)

  function clearFilters() {
    setSearchInput('')
    setFilters({ page: 1, pageSize: PAGE_SIZE })
  }

  async function downloadCsv() {
    setExporting(true)
    try {
      const blob = await exportAuditLogs({
        search: debouncedSearch || undefined,
        action: filters.action,
        payrollPeriodId: filters.payrollPeriodId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `nhat-ky-hoat-dong-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Không thể xuất nhật ký'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Kiểm soát hệ thống"
        title="Nhật ký hoạt động"
        description="Theo dõi các thay đổi quan trọng về nhân sự, lương thưởng, doanh thu và traffic."
        action={canExport ? (
          <Button variant="outline" disabled={exporting} onClick={() => void downloadCsv()}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Xuất báo cáo
          </Button>
        ) : undefined}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Thống kê nhật ký">
        <MetricCard
          icon={History}
          tone="info"
          label="Sự kiện khớp bộ lọc"
          value={formatNumber(totalLogs)}
          note={hasFilters ? 'Theo bộ lọc đang áp dụng' : 'Toàn bộ nhật ký trong phạm vi của bạn'}
          loading={logsQuery.isLoading}
        />
        <MetricCard
          icon={UserRound}
          tone="info"
          label="Thay đổi nhân sự"
          value={formatNumber(employeeCount)}
          note="Trong trang đang hiển thị"
          loading={logsQuery.isLoading}
        />
        <MetricCard
          icon={ShieldCheck}
          tone="success"
          label="Lương và thưởng"
          value={formatNumber(salaryCount)}
          note="Trong trang đang hiển thị"
          loading={logsQuery.isLoading}
        />
        <MetricCard
          icon={Activity}
          tone="warning"
          label="Doanh thu và traffic"
          value={formatNumber(metricsCount)}
          note="Trong trang đang hiển thị"
          loading={logsQuery.isLoading}
        />
      </section>

      <Card className="py-0">
        <CardContent className="p-4">
          {/* Mọi ô lọc đều có nhãn riêng và cùng chiều cao để nằm trên một hàng thẳng. SelectTrigger
              mặc định w-fit + h-9, phải ép w-full và ghi đè đúng biến thể data-[size=default] mới
              thắng được specificity của class gốc để cao bằng Input (h-10). */}
          <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_13rem_13rem_10rem_10rem]">
            <div className="grid gap-1.5 sm:col-span-2 xl:col-span-1">
              <label htmlFor="audit-search" className={FILTER_LABEL_CLASS}>Tìm kiếm</label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="audit-search"
                  className="w-full pr-9 pl-8"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Tìm người thực hiện, nhân sự, hành động…"
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
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="audit-action" className={FILTER_LABEL_CLASS}>Loại hoạt động</label>
              <Select
                value={filters.action ?? ALL}
                onValueChange={(value) => setFilters((current) => ({ ...current, page: 1, action: value === ALL ? undefined : value }))}
              >
                <SelectTrigger id="audit-action" className="data-[size=default]:h-10 w-full">
                  <Activity className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <SelectValue placeholder="Loại hoạt động" />
                </SelectTrigger>
                <SelectContent searchPlaceholder="Tìm hoạt động...">
                  <SelectItem value={ALL}>Tất cả hoạt động</SelectItem>
                  {Object.entries(ACTION_META).map(([code, meta]) => <SelectItem key={code} value={code}>{meta.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="audit-period" className={FILTER_LABEL_CLASS}>Kỳ lương</label>
              <Select
                value={filters.payrollPeriodId ?? ALL}
                onValueChange={(value) => setFilters((current) => ({ ...current, page: 1, payrollPeriodId: value === ALL ? undefined : value }))}
              >
                <SelectTrigger id="audit-period" className="data-[size=default]:h-10 w-full">
                  <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <SelectValue placeholder="Kỳ lương" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả kỳ lương</SelectItem>
                  {periodsQuery.data?.data.map((period) => <SelectItem key={period.id} value={period.id}>{period.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Hai ô ngày trước đây chỉ có tooltip, nhìn vào không biết đâu là "từ", đâu là "đến". */}
            <div className="grid gap-1.5">
              <label htmlFor="audit-date-from" className={FILTER_LABEL_CLASS}>Từ ngày</label>
              <Input
                id="audit-date-from"
                type="date"
                value={filters.dateFrom ?? ''}
                onChange={(event) => setFilters((current) => ({ ...current, page: 1, dateFrom: event.target.value || undefined }))}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="audit-date-to" className={FILTER_LABEL_CLASS}>Đến ngày</label>
              <Input
                id="audit-date-to"
                type="date"
                value={filters.dateTo ?? ''}
                onChange={(event) => setFilters((current) => ({ ...current, page: 1, dateTo: event.target.value || undefined }))}
              />
            </div>
          </div>

          {hasFilters ? (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span>Đang lọc: <strong className="text-foreground">{formatNumber(totalLogs)}</strong> sự kiện khớp.</span>
              <Button variant="ghost" size="sm" className="h-7" onClick={clearFilters}>
                <FilterX className="size-3.5" aria-hidden="true" />Xóa bộ lọc
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Hoạt động gần đây</h2>
              <p className="mt-1 text-xs text-muted-foreground">Lịch sử thay đổi trong phạm vi được cấp</p>
            </div>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-[var(--success-700)]" aria-hidden="true" />
              Dữ liệu đã giới hạn theo quyền của bạn
            </span>
          </div>

          {logsQuery.isLoading ? (
            <LoadingRows />
          ) : logsQuery.isError ? (
            <div className="p-4">
              <ErrorState
                description={getApiErrorMessage(logsQuery.error, 'Không tải được nhật ký hoạt động.')}
                onRetry={() => void logsQuery.refetch()}
                retrying={logsQuery.isFetching}
              />
            </div>
          ) : rows.length === 0 ? (
            <SharedEmptyState
              size="sm"
              icon={History}
              title={hasFilters ? 'Không tìm thấy hoạt động phù hợp' : 'Chưa có hoạt động nào được ghi nhận'}
              description={hasFilters
                ? 'Thử đổi từ khoá, loại hoạt động hoặc khoảng thời gian để xem thêm sự kiện.'
                : 'Mọi thay đổi quan trọng về nhân sự, lương thưởng, doanh thu và traffic sẽ xuất hiện tại đây.'}
              action={hasFilters ? <Button variant="outline" onClick={clearFilters}><FilterX className="size-4" />Xóa bộ lọc</Button> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-220">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-36">Thời gian</TableHead>
                    <TableHead className="min-w-52">Hoạt động</TableHead>
                    <TableHead className="min-w-44">Người thực hiện</TableHead>
                    <TableHead className="min-w-52">Dữ liệu liên quan</TableHead>
                    <TableHead className="min-w-40">Phạm vi</TableHead>
                    <TableHead className="min-w-24 text-right">Chi tiết</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => {
                    const meta = actionMeta(item.action)
                    return (
                      <TableRow key={item.id} className="cursor-pointer" onClick={() => setDetailId(item.id)}>
                        <TableCell className="whitespace-nowrap">
                          <strong className="block text-sm font-medium">{formatRelativeTime(item.createdAt)}</strong>
                          <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)} · {formatTime(item.createdAt)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone={meta.tone}>{meta.module}</StatusBadge>
                            <strong className="text-sm">{meta.label}</strong>
                          </span>
                          <span className="mt-1 block max-w-80 text-xs text-muted-foreground">{meta.description}</span>
                        </TableCell>
                        <TableCell>
                          <strong className="block text-sm">{item.actor.fullName}</strong>
                          <span className="text-xs text-muted-foreground">{item.actor.email}</span>
                        </TableCell>
                        <TableCell>
                          <strong className="block text-sm">{item.targetEmployee?.fullName ?? entityLabel(item.entityType)}</strong>
                          <span className="text-xs text-muted-foreground">{entityLabel(item.entityType)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="block text-sm">{item.payrollPeriod?.name ?? 'Không theo kỳ'}</span>
                          <span className="text-xs text-muted-foreground">{item.targetEmployee ? 'Cá nhân' : 'Hệ thống'}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" aria-label={`Xem chi tiết ${meta.label}`}>
                            <Eye className="size-4" aria-hidden="true" />Xem
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {logsQuery.data && logsQuery.data.meta.totalPages > 1 ? (
            <Pagination
              current={logsQuery.data.meta.page}
              total={logsQuery.data.meta.totalPages}
              totalItems={totalLogs}
              onPage={(page) => setFilters((current) => ({ ...current, page }))}
            />
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailId)} onOpenChange={(open) => { if (!open) setDetailId(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-4xl">
          {detailQuery.isLoading ? <div className="space-y-4 p-6"><Skeleton className="h-16 w-full" /><Skeleton className="h-44 w-full" /><Skeleton className="h-52 w-full" /></div> : detailQuery.data ? <AuditDetail item={detailQuery.data} /> : <SharedEmptyState icon={History} title="Không thể tải chi tiết" description="Sự kiện có thể không còn nằm trong phạm vi dữ liệu được phép của tài khoản bạn." />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AuditDetail({ item }: { item: AuditLog }) {
  const meta = actionMeta(item.action)
  const changes = buildChanges(item.beforeData, item.afterData)
  const actorRoles = item.actor.userRoles.map(({ role }) => role.name).join(', ')
  const actorEmployee = item.actor.employee
  const employee = item.targetEmployee
  const period = item.payrollPeriod
  return (
    <div>
      <DialogHeader className="border-b bg-muted/30 px-6 py-5 text-left">
        <div className="flex items-start gap-3 pr-8">
          <span className={`mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl ${iconTone(meta.tone)}`}><Activity className="size-5" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><DialogTitle className="text-xl">{meta.label}</DialogTitle><StatusBadge tone={meta.tone}>{meta.module}</StatusBadge></div><DialogDescription className="mt-1.5 text-sm leading-6">{meta.description}</DialogDescription></div>
        </div>
      </DialogHeader>

      <div className="space-y-6 p-6">
        <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-4 text-sm leading-6">
          <strong>{item.actor.fullName}</strong> đã thực hiện <strong>{meta.label.toLocaleLowerCase('vi-VN')}</strong>
          {employee ? <> đối với <strong>{employee.fullName}</strong></> : null}
          {period ? <> trong <strong>{period.name}</strong></> : null} vào {formatFullDate(item.createdAt)}.
        </div>

        <section>
          <SectionTitle>Thông tin chung</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-3">
            <InformationCard icon={UserRound} title="Người thực hiện">
              <DetailLine label="Họ và tên" value={item.actor.fullName} />
              <DetailLine label="Email" value={item.actor.email} />
              <DetailLine label="Vai trò" value={actorRoles || 'Chưa gán vai trò'} />
              {actorEmployee ? <><DetailLine label="Mã nhân sự" value={actorEmployee.employeeCode} /><DetailLine label="Chức danh" value={actorEmployee.jobTitle} /><DetailLine label="Đơn vị" value={`${actorEmployee.team.department.name} · ${actorEmployee.team.name}`} /></> : null}
            </InformationCard>

            <InformationCard icon={BriefcaseBusiness} title="Dữ liệu chịu ảnh hưởng">
              {employee ? <>
                <DetailLine label="Nhân sự" value={employee.fullName} />
                <DetailLine label="Mã nhân sự" value={employee.employeeCode} />
                <DetailLine label="Chức danh" value={employee.jobTitle} />
                <DetailLine label="Trạng thái" value={VALUE_LABELS[employee.employmentStatus] ?? employee.employmentStatus} />
                <DetailLine label="Phòng ban / Team" value={`${employee.team.department.name} · ${employee.team.name}`} />
                <DetailLine label="Nhóm nghiệp vụ" value={employee.employeeGroups.map((group) => group.name).join(', ') || 'Chưa phân nhóm'} />
                <DetailLine label="Ngày vào làm" value={employee.joinedAt ? formatShortDate(employee.joinedAt) : 'Chưa cập nhật'} />
                {employee.leftAt ? <DetailLine label="Ngày nghỉ việc" value={formatShortDate(employee.leftAt)} /> : null}
                <DetailLine label="Leader" value={employee.leader?.fullName ?? 'Chưa thiết lập'} />
                <DetailLine label="Manager" value={employee.manager?.fullName ?? 'Chưa thiết lập'} />
              </> : <>
                <DetailLine label="Nội dung" value={entityLabel(item.entityType)} />
                <DetailLine label="Phân loại" value={meta.module} />
              </>}
            </InformationCard>

            <InformationCard icon={period ? CalendarClock : Building2} title={period ? 'Kỳ lương liên quan' : 'Phạm vi áp dụng'}>
              {period ? <>
                <DetailLine label="Tên kỳ" value={period.name} />
                <DetailLine label="Mã kỳ" value={period.code} />
                <DetailLine label="Trạng thái" value={VALUE_LABELS[period.status] ?? period.status} />
                <DetailLine label="Thời gian" value={`${formatShortDate(period.startDate)} – ${formatShortDate(period.endDate)}`} />
                <DetailLine label="Hạn phê duyệt" value={period.approvalDeadline ? formatFullDate(period.approvalDeadline) : 'Chưa thiết lập'} />
              </> : <>
                <DetailLine label="Phạm vi" value="Cấu hình dùng chung" />
                <DetailLine label="Thời điểm ghi nhận" value={formatFullDate(item.createdAt)} />
              </>}
            </InformationCard>
          </div>
        </section>

        {item.reason ? <section><SectionTitle>Lý do</SectionTitle><div className="rounded-xl border border-[var(--warning-500)]/25 bg-[var(--warning-50)] p-4 text-sm leading-6">{item.reason}</div></section> : null}

        <section>
          <SectionTitle>Thông tin thay đổi</SectionTitle>
          {changes.length > 0 ? <ChangeList changes={changes} references={item.references} /> : <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--success-700)]" /><div><strong className="text-sm">Không phát sinh thay đổi giá trị</strong><p className="mt-1 text-sm text-muted-foreground">Hoạt động đã được ghi nhận nhưng dữ liệu nghiệp vụ trước và sau không khác nhau.</p></div></div>}
        </section>
      </div>
    </div>
  )
}

type Change = { key: string; before: unknown; after: unknown }

function ChangeList({ changes, references }: { changes: Change[]; references?: AuditLog['references'] }) {
  return <div className="overflow-hidden rounded-xl border border-border"><div className="hidden grid-cols-[minmax(160px,0.8fr)_minmax(0,1fr)_28px_minmax(0,1fr)] gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground sm:grid"><span>Nội dung</span><span>Trước thay đổi</span><span /><span>Sau thay đổi</span></div>{changes.map((change) => <div key={change.key} className="grid gap-2 border-b border-border px-4 py-3 last:border-0 sm:grid-cols-[minmax(160px,0.8fr)_minmax(0,1fr)_28px_minmax(0,1fr)] sm:items-center sm:gap-3"><strong className="text-sm">{fieldLabel(change.key)}</strong><div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"><span className="mr-2 text-xs font-semibold sm:hidden">Trước</span>{formatValue(change.key, change.before, references)}</div><ArrowRight className="mx-auto hidden size-4 text-muted-foreground sm:block" /><div className={`rounded-lg px-3 py-2 text-sm font-medium ${toneSurface.success}`}><span className="mr-2 text-xs font-semibold sm:hidden">Sau</span>{formatValue(change.key, change.after, references)}</div></div>)}</div>
}

function InformationCard({ icon: Icon, title, children }: { icon: typeof Activity; title: string; children: ReactNode }) { return <div className="rounded-xl border border-border bg-card p-4"><div className="mb-4 flex items-center gap-2"><span className={`grid size-9 place-items-center rounded-lg ${toneSurface.info}`}><Icon className="size-4" aria-hidden="true" /></span><strong className="text-sm">{title}</strong></div><dl className="space-y-2.5">{children}</dl></div> }
function DetailLine({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[minmax(90px,0.8fr)_minmax(0,1.2fr)] gap-3 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="break-words text-right font-medium">{value}</dd></div> }
function SectionTitle({ children }: { children: string }) { return <h3 className="mb-2.5 text-sm font-semibold text-foreground">{children}</h3> }
function Pagination({ current, total, totalItems, onPage }: { current: number; total: number; totalItems: number; onPage: (page: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-sm">
      <span className="text-muted-foreground">
        Trang <strong className="text-foreground">{formatNumber(current)}</strong> / {formatNumber(total)} · {formatNumber(totalItems)} sự kiện
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={current === 1} onClick={() => onPage(current - 1)}>Trang trước</Button>
        <Button variant="outline" size="sm" disabled={current === total} onClick={() => onPage(current + 1)}>Trang sau</Button>
      </div>
    </div>
  )
}
function LoadingRows() { return <div className="space-y-3 p-4">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div> }
function action(label: string, description: string, module: string, tone: ActionMeta['tone'] = 'muted'): ActionMeta { return { label, description, module, tone } }
function actionMeta(code: string): ActionMeta { return ACTION_META[code] ?? action(humanizeCode(code), 'Một thay đổi đã được ghi nhận trong hệ thống.', 'Hệ thống') }
function entityLabel(type: string) { return ENTITY_LABELS[type] ?? humanizeCode(type) }
function fieldLabel(key: string) { return FIELD_LABELS[key] ?? humanizeCode(key) }
function humanizeCode(value: string) { return value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLocaleLowerCase('vi-VN').replace(/^./, (letter) => letter.toLocaleUpperCase('vi-VN')) }
function iconTone(tone: ActionMeta['tone']) { return toneSurface[tone] }
function auditCategory(actionCode: string): 'employee' | 'salary' | 'metrics' {
  if (actionCode.startsWith('EMPLOYEE_')) return 'employee'
  if ((actionCode.startsWith('REVENUE_') && !actionCode.startsWith('REVENUE_REWARD_')) || actionCode.startsWith('TRAFFIC_')) return 'metrics'
  return 'salary'
}

function buildChanges(before: unknown, after: unknown): Change[] {
  const beforeObject = isPlainObject(before) ? before : {}
  const afterObject = isPlainObject(after) ? after : {}
  const keys = [...new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])]
  return keys.filter((key) => !sameValue(beforeObject[key], afterObject[key])).map((key) => ({ key, before: beforeObject[key], after: afterObject[key] }))
}
function isPlainObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function sameValue(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right) }
function formatValue(key: string, value: unknown, references?: AuditLog['references']): string {
  if (value == null || value === '') return 'Chưa có'
  if (key === 'teamId') return referenceLabel(references?.teams, value, 'Team')
  if (key === 'leaderEmployeeId' || key === 'managerEmployeeId') return referenceLabel(references?.employees, value, 'Nhân sự')
  if (key === 'employeeGroupIds' && Array.isArray(value)) return referenceLabels(references?.employeeGroups, value, 'Nhóm nghiệp vụ')
  if (Array.isArray(value)) return value.length === 0 ? 'Không có' : key.toLowerCase().includes('attachment') ? `${value.length} tệp` : value.map(String).join(', ')
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (typeof value === 'object') return Object.entries(value).map(([childKey, childValue]) => `${fieldLabel(childKey)}: ${formatValue(childKey, childValue, references)}`).join(' · ')
  const text = String(value)
  const translated = VALUE_LABELS[text]
  if (translated) return translated
  if (/(amount|salary|revenue|reward)/i.test(key) && /^-?\d+$/.test(text)) { try { return `${new Intl.NumberFormat('vi-VN').format(BigInt(text))} ₫` } catch { return text } }
  if (/(At|Date|Deadline)$/.test(key) && !Number.isNaN(Date.parse(text))) return formatFullDate(text)
  return text
}

function referenceLabel(items: Array<{ id: string; name?: string; fullName?: string }> | undefined, value: unknown, fallback: string) {
  const match = items?.find((item) => String(item.id) === String(value))
  return match?.name ?? match?.fullName ?? `${fallback} ${String(value)}`
}
function referenceLabels(items: Array<{ id: string; name: string }> | undefined, values: unknown[], fallback: string) {
  if (values.length === 0) return 'Không có'
  return values.map((value) => referenceLabel(items, value, fallback)).join(', ')
}

const VALUE_LABELS: Record<string, string> = {
  AUTOMATION_GEN_VIDEO: 'AutomationGenVideo', MANUAL: 'Nhập thủ công', DRAFT: 'Bản nháp', OPEN: 'Đang mở', IN_REVIEW: 'Đang duyệt', CLOSED: 'Đã đóng', PENDING: 'Chờ xử lý', APPROVED: 'Đã duyệt', REJECTED: 'Bị từ chối', CONFIRMED: 'Đã xác nhận', ACTIVE: 'Đang hoạt động', INACTIVE: 'Ngừng hoạt động', LEFT: 'Đã nghỉ việc', LOCKED: 'Đã khóa', ARCHIVED: 'Đã lưu trữ', SUPERSEDED: 'Đã thay thế', WARNING: 'Có cảnh báo', SUCCESS: 'Thành công', FAILED: 'Thất bại', PARTIAL: 'Hoàn tất một phần', TIKTOK: 'TikTok', FACEBOOK: 'Facebook', YOUTUBE: 'YouTube', INSTAGRAM: 'Instagram',
}
function formatTime(value: string) { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatDate(value: string) { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) }
function formatFullDate(value: string) { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatShortDate(value: string) { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) }
