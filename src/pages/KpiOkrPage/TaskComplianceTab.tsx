import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  ListChecks,
  Target,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { getApiErrorMessage } from '@/api/client'
import {
  getTaskCompliance,
  type TaskComplianceDay,
  type TaskComplianceRecord,
  type TaskComplianceSource,
  type TaskComplianceTask,
} from '@/api/task-compliance'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatNumber, toPercent } from '@/lib/format'
import { toneSurface, toneText, type Tone } from '@/lib/tone'

// Phân trang theo ngày: một kỳ lương tháng nằm gọn trong một trang.
const PAGE_SIZE = 31
const SOURCE_LABEL: Record<TaskComplianceSource, string> = {
  AUTO_A4: 'Task A4 tự động',
  DAILY_PLAN: 'Kế hoạch tuyến',
}

// work_date là ngày thuần nên đọc theo UTC để không lệch ngày; mốc giờ thì theo giờ Việt Nam như VCBI.
const dayHeadingFormatter = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC',
})
const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
})

function formatDayHeading(value: string) {
  const label = dayHeadingFormatter.format(new Date(`${value}T00:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** "2026-10-05T10:00:00Z" → "17:00 05/10". Tự ghép vì ICU vi-VN in ngày-tháng 2 chữ số thành "05-10". */
function formatTime(value: string | null) {
  if (!value) return '—'
  const parts = Object.fromEntries(timeFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]))
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}`
}

type Props = {
  periodId: string | null
  employeeId: string | null
  teamId: string | null
}

export function TaskComplianceTab({ periodId, employeeId, teamId }: Props) {
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- đổi hồ sơ phải quay về trang đầu
    setPage(1)
    setExpanded(new Set())
  }, [periodId, employeeId, teamId])

  const complianceQuery = useQuery({
    queryKey: ['task-compliance', periodId, employeeId, teamId ?? 'primary', page],
    queryFn: () => getTaskCompliance(periodId!, employeeId!, { teamId, page, pageSize: PAGE_SIZE }),
    enabled: Boolean(periodId && employeeId),
    staleTime: 60_000,
  })

  function changePage(next: number) {
    setPage(next)
    setExpanded(new Set())
  }
  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!periodId || !employeeId) {
    return (
      <Card className="py-0">
        <EmptyState
          icon={ListChecks}
          title="Chưa chọn hồ sơ để xem"
          description='Chọn kỳ lương và nhân sự ở phần "Hồ sơ đang xem" để kiểm tra lịch sử tuân thủ nhiệm vụ.'
        />
      </Card>
    )
  }
  if (complianceQuery.isLoading) return <ComplianceSkeleton />
  if (complianceQuery.isError) {
    return (
      <ErrorState
        title="Không tải được lịch sử nhiệm vụ"
        description={getApiErrorMessage(complianceQuery.error)}
        onRetry={() => complianceQuery.refetch()}
        retrying={complianceQuery.isFetching}
      />
    )
  }

  const data = complianceQuery.data!
  const { summary, shortfall_summary: shortfall, coverage, pagination, days } = data

  return (
    <div className="flex flex-col gap-4" aria-busy={complianceQuery.isFetching}>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tổng quan tuân thủ nhiệm vụ">
        <MetricCard
          icon={Target}
          tone="info"
          label="Nhiệm vụ phải làm"
          value={formatNumber(summary.expected)}
          note={`${formatNumber(coverage.snapshot_count)} bản chốt dữ liệu trong kỳ`}
        />
        <MetricCard
          icon={CheckCircle2}
          tone="success"
          label="Hoàn thành đúng hạn"
          value={formatNumber(summary.completed_on_time)}
          note={`${formatNumber(toPercent(summary.completed_on_time, summary.expected))}% trên tổng nhiệm vụ`}
          progress={toPercent(summary.completed_on_time, summary.expected)}
        />
        <MetricCard
          icon={AlertTriangle}
          tone={summary.missing > 0 ? 'danger' : 'success'}
          label="Nhiệm vụ còn thiếu"
          value={formatNumber(summary.missing)}
          note={summary.missing > 0 ? `${formatNumber(shortfall.lines)} tuyến bị thiếu` : 'Không có nhiệm vụ tồn đọng'}
        />
        <MetricCard
          icon={CalendarDays}
          tone={shortfall.person_days > 0 ? 'warning' : 'success'}
          label="Ngày bị thiếu"
          value={formatNumber(shortfall.person_days)}
          note={`Dữ liệu đến ${formatDate(coverage.evaluated_through)}`}
        />
      </section>

      {data.warnings.map((warning) => (
        <div key={`${warning.code}-${warning.message}`} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.warning}`}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {warning.message}
        </div>
      ))}

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Nhiệm vụ còn thiếu theo ngày</h2>
              <p className="mt-1 text-xs text-muted-foreground">Bấm vào một ngày để xem thiếu tuyến nào, task nào.</p>
            </div>
            <StatusBadge tone={summary.missing > 0 ? 'danger' : 'success'}>
              {formatNumber(pagination.total)} ngày bị thiếu
            </StatusBadge>
          </div>

          {coverage.snapshot_count === 0 ? (
            <EmptyState
              icon={Clock3}
              tone="warning"
              title="Chưa có dữ liệu đã chốt"
              description="VCBI chưa tạo snapshot đánh giá cho nhân sự này trong kỳ. Dữ liệu sẽ xuất hiện sau lần chốt tiếp theo."
            />
          ) : summary.missing === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              tone="success"
              title="Không ghi nhận nhiệm vụ thiếu"
              description={`Dữ liệu đã được đánh giá đến ${formatDate(coverage.evaluated_through)} và không có nhiệm vụ tồn đọng trong kỳ.`}
            />
          ) : days.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Trang này không còn ngày nào"
              description="Dữ liệu nguồn có thể vừa được cập nhật. Quay về trang đầu để xem danh sách mới nhất."
              action={<Button variant="outline" onClick={() => changePage(1)}>Về trang đầu</Button>}
            />
          ) : (
            <ul className="divide-y">
              {days.map((day) => (
                <DayItem key={day.key} day={day} open={expanded.has(day.key)} onToggle={() => toggle(day.key)} />
              ))}
            </ul>
          )}

          {pagination.total_pages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Trang {formatNumber(pagination.page)} / {formatNumber(pagination.total_pages)}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => changePage(Math.max(1, page - 1))} disabled={page <= 1 || complianceQuery.isFetching}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Trước
                </Button>
                <Button variant="outline" size="sm" onClick={() => changePage(page + 1)} disabled={page >= pagination.total_pages || complianceQuery.isFetching}>
                  Sau
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function DayItem({ day, open, onToggle }: { day: TaskComplianceDay; open: boolean; onToggle: () => void }) {
  const panelId = `compliance-day-${day.key}`
  const shortLines = day.lines.filter((line) => line.missing_count > 0)

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset ${open ? 'bg-muted/40' : ''}`}
      >
        <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
          <span className="block shrink-0 sm:w-44">
            <span className="block font-semibold text-foreground">{formatDayHeading(day.work_date)}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
              Đúng hạn {formatNumber(day.completed_count)}/{formatNumber(day.expected_count)}
            </span>
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5 sm:mt-0">
            {shortLines.map((line) => (
              <span key={line.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs whitespace-nowrap">
                <span className="font-semibold text-foreground">{line.content_line.name}</span>
                <span className={toneText.danger}>thiếu {formatNumber(line.missing_count)}</span>
              </span>
            ))}
          </span>
        </span>
        <StatusBadge tone="danger">Thiếu {formatNumber(day.missing_count)}</StatusBadge>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open ? <DayDetail id={panelId} day={day} /> : null}
    </li>
  )
}

/**
 * Một danh sách tuyến duy nhất thay vì mỗi tuyến một thẻ: thẻ hai cột lệch chiều cao để lại khoảng
 * trống, còn hạn nộp và nhãn đỏ lặp ở mọi thẻ làm khó nhìn ra tuyến nào thiếu gì.
 */
function DayDetail({ id, day }: { id: string; day: TaskComplianceDay }) {
  // Các tuyến trong ngày thường chung một hạn; khi đó chỉ ghi một lần ở đầu.
  const sharedDeadline = new Set(day.lines.map((line) => line.deadline)).size === 1 ? day.lines[0]?.deadline ?? null : null
  // Số trên dòng ngày chỉ cộng tuyến thiếu; chỉ nhắc "cả ngày" khi có thêm tuyến đã đủ.
  const hasFullLines = day.day_total.expected !== day.expected_count

  return (
    <div id={id} className="space-y-3 border-t bg-muted/30 px-5 py-4">
      <p className="text-xs text-muted-foreground">
        {sharedDeadline ? <>Hạn nộp <span className="font-medium text-foreground">{formatTime(sharedDeadline)}</span> · </> : null}
        {hasFullLines ? (
          <>Cả ngày, gồm tuyến đã đủ: đúng hạn <span className="font-medium text-foreground tabular-nums">{formatNumber(day.day_total.completed)}/{formatNumber(day.day_total.expected)}</span> · </>
        ) : null}
        Số thiếu chốt lúc hết hạn, trạng thái task tính đến hiện tại.
      </p>
      <ul className="divide-y rounded-lg border bg-card">
        {day.lines.map((line) => <LineRow key={line.id} line={line} showDeadline={!sharedDeadline} />)}
      </ul>
    </div>
  )
}

function LineRow({ line, showDeadline }: { line: TaskComplianceRecord; showDeadline: boolean }) {
  const isShort = line.missing_count > 0
  return (
    <li className="grid grid-cols-1 gap-x-6 gap-y-2.5 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{line.content_line.name}</span>
          {isShort
            ? <StatusBadge tone="danger">Thiếu {formatNumber(line.missing_count)}</StatusBadge>
            : <StatusBadge tone="success">Đủ</StatusBadge>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {SOURCE_LABEL[line.source]} · đúng hạn{' '}
          <span className="tabular-nums">{formatNumber(line.completed_count)}/{formatNumber(line.expected_count)}</span>
          {showDeadline ? <> · hạn {formatTime(line.deadline)}</> : null}
        </p>
      </div>

      {isShort ? (
        <ul className="space-y-2 sm:pt-0.5">
          {line.tasks.map((task) => <TaskItem key={task.id} task={task} />)}
          {line.untracked_missing > 0 ? (
            <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <CircleDashed className={`size-4 shrink-0 ${toneText.danger}`} aria-hidden="true" />
              {line.source === 'DAILY_PLAN'
                ? `Chưa tạo ${formatNumber(line.untracked_missing)} task cho tuyến này`
                : `${formatNumber(line.untracked_missing)} task đã bị huỷ hoặc xoá sau khi giao`}
            </li>
          ) : null}
          {!line.tasks.length && !line.untracked_missing ? (
            <li className="text-sm text-muted-foreground">Không còn task nào của tuyến này trong ngày.</li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}

function taskState(task: TaskComplianceTask): { label: string; tone: Tone; icon: LucideIcon } {
  if (task.on_time) return { label: 'Đúng hạn', tone: 'success', icon: CheckCircle2 }
  if ((task.status === 'SUBMITTED' || task.status === 'APPROVED') && task.submitted_at) {
    return { label: `Nộp trễ ${formatTime(task.submitted_at)}`, tone: 'warning', icon: Clock3 }
  }
  if (task.status === 'REJECTED') return { label: 'Bị từ chối', tone: 'danger', icon: XCircle }
  if (task.status === 'IN_PROGRESS') return { label: 'Đang làm, chưa nộp', tone: 'danger', icon: CircleDashed }
  return { label: 'Chưa nộp', tone: 'danger', icon: CircleDashed }
}

function TaskItem({ task }: { task: TaskComplianceTask }) {
  const state = taskState(task)
  const Icon = state.icon
  const primary = task.title ?? task.product_name ?? 'Task chưa gắn content'
  const secondary = task.title
    ? task.product_name && `SP: ${task.product_name}`
    : task.product_name && 'Chưa chọn content'
  return (
    <li className="flex items-start gap-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${toneText[state.tone]}`} aria-hidden="true" />
      <div className="min-w-0">
        {/* Nhãn đi liền sau tên task: đẩy sang mép phải thì ở màn rộng mắt phải lướt cả nghìn pixel. */}
        <p className="text-sm">
          <span className={task.on_time ? 'text-muted-foreground' : 'font-medium text-foreground'}>{primary}</span>
          <span className={`ml-2 text-xs font-medium whitespace-nowrap ${toneText[state.tone]}`}>{state.label}</span>
        </p>
        {secondary ? <p className="text-xs text-muted-foreground">{secondary}</p> : null}
      </div>
    </li>
  )
}

function ComplianceSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Đang tải lịch sử nhiệm vụ">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="py-0"><CardContent className="space-y-3 p-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-full" /></CardContent></Card>
        ))}
      </div>
      <Card className="py-0">
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-5 w-52" />
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    </div>
  )
}
