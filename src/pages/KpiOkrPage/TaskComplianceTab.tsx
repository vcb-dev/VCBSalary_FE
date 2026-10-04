import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  Target,
} from 'lucide-react'
import { getApiErrorMessage } from '@/api/client'
import {
  getTaskCompliance,
  type TaskComplianceRecord,
  type TaskComplianceSource,
} from '@/api/task-compliance'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatDateTime, formatNumber, toPercent } from '@/lib/format'
import { toneSurface } from '@/lib/tone'

const PAGE_SIZE = 20
const SOURCE_LABEL: Record<TaskComplianceSource, string> = {
  AUTO_A4: 'Task A4 tự động',
  DAILY_PLAN: 'Kế hoạch tuyến',
}

type Props = {
  periodId: string | null
  employeeId: string | null
  teamId: string | null
}

export function TaskComplianceTab({ periodId, employeeId, teamId }: Props) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- đổi hồ sơ phải quay về trang đầu
    setPage(1)
  }, [periodId, employeeId, teamId])

  const complianceQuery = useQuery({
    queryKey: ['task-compliance', periodId, employeeId, teamId ?? 'primary', page],
    queryFn: () => getTaskCompliance(periodId!, employeeId!, { teamId, page, pageSize: PAGE_SIZE }),
    enabled: Boolean(periodId && employeeId),
    staleTime: 60_000,
  })

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
  const { summary, coverage, pagination, records } = data

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
          note={summary.missing > 0 ? `${formatNumber(summary.affected_records)} dòng bị ảnh hưởng` : 'Không có nhiệm vụ tồn đọng'}
        />
        <MetricCard
          icon={CalendarDays}
          tone={summary.affected_days > 0 ? 'warning' : 'success'}
          label="Ngày bị thiếu"
          value={formatNumber(summary.affected_days)}
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
              <h2 className="text-base font-semibold tracking-tight text-foreground">Chi tiết nhiệm vụ chưa đạt</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.local_context.team_name} · {formatDate(data.range.from)}–{formatDate(data.range.to)} · chốt gần nhất {formatDateTime(data.generated_at)}
              </p>
            </div>
            <StatusBadge tone={summary.missing > 0 ? 'danger' : 'success'}>
              {formatNumber(pagination.total)} bản ghi
            </StatusBadge>
          </div>

          {coverage.snapshot_count === 0 ? (
            <EmptyState
              icon={Clock3}
              tone="warning"
              title="Chưa có dữ liệu đã chốt"
              description="AutomationGenVideo chưa tạo snapshot đánh giá cho nhân sự này trong kỳ. Dữ liệu sẽ xuất hiện sau lần chốt tiếp theo."
            />
          ) : summary.missing === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              tone="success"
              title="Không ghi nhận nhiệm vụ thiếu"
              description={`Dữ liệu đã được đánh giá đến ${formatDate(coverage.evaluated_through)} và không có nhiệm vụ tồn đọng trong kỳ.`}
            />
          ) : records.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Trang này không còn bản ghi"
              description="Dữ liệu nguồn có thể vừa được cập nhật. Quay về trang đầu để xem danh sách mới nhất."
              action={<Button variant="outline" onClick={() => setPage(1)}>Về trang đầu</Button>}
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày làm việc</TableHead>
                      <TableHead>Tuyến nội dung</TableHead>
                      <TableHead>Nguồn</TableHead>
                      <TableHead className="text-right">Đúng hạn / Phải làm</TableHead>
                      <TableHead className="text-right">Còn thiếu</TableHead>
                      <TableHead>Hạn hoàn thành</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => <ComplianceRow key={record.id} record={record} />)}
                  </TableBody>
                </Table>
              </div>
              <div className="divide-y md:hidden">
                {records.map((record) => <ComplianceMobileCard key={record.id} record={record} />)}
              </div>
            </>
          )}

          {pagination.total_pages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Trang {formatNumber(pagination.page)} / {formatNumber(pagination.total_pages)}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || complianceQuery.isFetching}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Trước
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((current) => current + 1)} disabled={page >= pagination.total_pages || complianceQuery.isFetching}>
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

function ComplianceRow({ record }: { record: TaskComplianceRecord }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{formatDate(record.work_date)}</TableCell>
      <TableCell>{record.content_line.name}</TableCell>
      <TableCell><StatusBadge tone="info">{SOURCE_LABEL[record.source]}</StatusBadge></TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(record.completed_count)} / {formatNumber(record.expected_count)}</TableCell>
      <TableCell className="text-right"><StatusBadge tone="danger">Thiếu {formatNumber(record.missing_count)}</StatusBadge></TableCell>
      <TableCell className="text-muted-foreground">{formatDateTime(record.deadline)}</TableCell>
    </TableRow>
  )
}

function ComplianceMobileCard({ record }: { record: TaskComplianceRecord }) {
  return (
    <article className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{record.content_line.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatDate(record.work_date)} · {SOURCE_LABEL[record.source]}</p>
        </div>
        <StatusBadge tone="danger">Thiếu {formatNumber(record.missing_count)}</StatusBadge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Đúng hạn / Phải làm</dt>
          <dd className="mt-1 font-semibold tabular-nums">{formatNumber(record.completed_count)} / {formatNumber(record.expected_count)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hạn hoàn thành</dt>
          <dd className="mt-1 font-semibold">{formatDateTime(record.deadline)}</dd>
        </div>
      </dl>
    </article>
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
      <Card className="py-0"><CardContent className="space-y-3 p-5"><Skeleton className="h-5 w-52" /><Skeleton className="h-40 w-full" /></CardContent></Card>
    </div>
  )
}
