import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { CalendarDays, RefreshCw, Target, TrendingUp, Wallet } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PayrollPeriod } from '@/api/payroll-periods'
import { listSalaryRecords, type SalaryListItem } from '@/api/salary'
import { SalaryGoalDialog, type SalaryGoalSelection } from '@/components/shared/SalaryGoalDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompactMoney, formatMoney } from '@/lib/format'

function amount(value: string | null | undefined) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function formatAxis(value: number) {
  return formatCompactMoney(value).replace(' ₫', '')
}

function salaryStatus(item: SalaryListItem | null) {
  const status = item?.salaryRecord?.status
  if (!status) return 'Chưa có lương'
  return { LOCKED: 'Đã nhận', PENDING: 'Đang tính', WARNING: 'Có cảnh báo', SUPERSEDED: 'Đã thay thế' }[status]
}

export function MemberDashboard({
  periods, currentPeriod, employeeId, fullName, role, year, availableYears, onYearChange, periodsLoading, periodsError,
}: {
  periods: PayrollPeriod[]
  currentPeriod?: PayrollPeriod
  employeeId: string
  fullName?: string
  role: string
  year: number
  availableYears: number[]
  onYearChange: (year: number) => void
  periodsLoading: boolean
  periodsError: boolean
}) {
  const [goalRecord, setGoalRecord] = useState<SalaryGoalSelection>(null)
  const chronological = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const salaryQueries = useQueries({
    queries: chronological.map((period) => ({
      queryKey: ['salary-records', period.id, 'member-dashboard'],
      queryFn: async () => {
        const response = await listSalaryRecords(period.id, { page: 1, pageSize: 10 })
        return response.data.find((item) => item.employeeId === employeeId) ?? null
      },
      enabled: Boolean(employeeId),
      staleTime: 30_000,
      retry: 1,
    })),
  })
  const loading = periodsLoading || salaryQueries.some((query) => query.isPending)
  const refreshing = salaryQueries.some((query) => query.isFetching)
  const hasError = periodsError || salaryQueries.some((query) => query.isError)
  const rows = chronological.map((period, index) => ({ period, item: salaryQueries[index]?.data ?? null, failed: salaryQueries[index]?.isError ?? false }))
  const lockedRows = rows.filter((row) => row.item?.salaryRecord?.status === 'LOCKED')
  const totalReceived = lockedRows.reduce((sum, row) => sum + amount(row.item?.salaryRecord?.totalSalaryAmount), 0)
  const latestRow = [...rows].reverse().find((row) => row.item?.salaryRecord)
  const currentRow = rows.find((row) => row.period.id === currentPeriod?.id)
  const goalSourceRow = currentRow?.item?.salaryRecord ? currentRow : latestRow
  const currentGoalRecord = goalSourceRow?.item?.salaryRecord
  const trend = rows.map((row) => ({
    id: row.period.id,
    name: row.period.name,
    label: row.period.code,
    value: row.item?.salaryRecord ? amount(row.item.salaryRecord.totalSalaryAmount) : null,
    status: row.failed ? 'Không tải được' : salaryStatus(row.item),
  }))
  const trendPoints = trend.filter((item) => item.value !== null)

  function refresh() {
    salaryQueries.forEach((query) => void query.refetch())
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Tổng quan thu nhập"
        title={`Xin chào, ${fullName ?? 'bạn'}`}
        description={`Theo dõi tổng thu nhập đã nhận và biến động lương theo từng tháng trong năm ${year}.`}
        meta={<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{role}</span>}
        action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={refresh} disabled={refreshing || periods.length === 0}><RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Đang tải…' : 'Làm mới'}</Button><Button disabled={!currentGoalRecord} title={!currentGoalRecord ? 'Chưa có bảng lương để tính mục tiêu' : `Ước tính theo ${goalSourceRow?.period.name}`} onClick={() => currentGoalRecord && setGoalRecord({ id: currentGoalRecord.id, employeeName: goalSourceRow?.item?.employeeName ?? fullName ?? 'Bạn' })}><Target className="size-4" />Mục tiêu thu nhập</Button></div>}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3" aria-label="Bộ lọc năm thu nhập">
        <span className="text-xs font-semibold text-muted-foreground">Năm thống kê</span>
        <Select value={String(year)} onValueChange={(value) => onYearChange(Number(value))}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Chọn năm thống kê thu nhập"><SelectValue /></SelectTrigger>
          <SelectContent>{availableYears.map((item) => <SelectItem key={item} value={String(item)}>Năm {item}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground sm:ml-auto">Tối đa 12 kỳ trong năm</span>
      </div>

      {hasError ? <ErrorState description="Một số kỳ chưa tải được dữ liệu lương. Biểu đồ có thể chưa đầy đủ." onRetry={refresh} retrying={refreshing} /> : null}

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Tổng quan thu nhập cá nhân">
        <MetricCard icon={Wallet} tone="success" label={`Tổng lương đã nhận năm ${year}`} value={formatCompactMoney(totalReceived)} valueTitle={formatMoney(totalReceived)} note={`${lockedRows.length.toLocaleString('vi-VN')} kỳ lương đã khóa`} loading={loading} href="/salary-records" />
        <MetricCard icon={TrendingUp} tone="info" label="Lương kỳ gần nhất" value={formatCompactMoney(latestRow?.item?.salaryRecord?.totalSalaryAmount)} valueTitle={formatMoney(latestRow?.item?.salaryRecord?.totalSalaryAmount)} note={latestRow ? `${latestRow.period.name} · ${salaryStatus(latestRow.item)}` : 'Chưa có bảng lương đã tính'} loading={loading} href="/salary-records" />
      </section>

      <Card className="py-0">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Lịch sử thu nhập năm {year}</p><h2 className="mt-1 text-lg font-bold tracking-tight">Xu hướng lương theo tháng</h2></div><span className="text-xs text-muted-foreground">Các tháng chưa tính lương được để trống</span></div>
          {periodsLoading || loading ? <Skeleton className="mt-5 h-72 w-full rounded-lg" />
            : periods.length === 0 ? <EmptyState size="sm" icon={CalendarDays} title="Chưa có kỳ lương" description="Biểu đồ sẽ xuất hiện khi hệ thống tạo kỳ lương đầu tiên." />
              : trendPoints.length < 2 ? <EmptyState size="sm" icon={TrendingUp} title="Chưa đủ dữ liệu xu hướng" description="Cần ít nhất hai kỳ có bảng lương đã tính để vẽ xu hướng." />
                : <div className="mt-5 w-full overflow-x-auto" role="img" aria-label="Biểu đồ đường xu hướng lương cá nhân qua các kỳ"><div className="h-72" style={{ minWidth: Math.max(560, trend.length * 64) }}><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}><CartesianGrid stroke="#e8edf4" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} width={60} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={formatAxis} /><Tooltip formatter={(value, _name, payload) => [formatMoney(Number(value)), payload.payload.status]} labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''} contentStyle={{ borderRadius: 12, borderColor: '#dde5ee' }} /><Line type="monotone" dataKey="value" stroke="#1769a6" strokeWidth={3} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} /></LineChart></ResponsiveContainer></div></div>}
          {!loading && trend.length > 0 ? <details className="mt-3 text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring">Xem lương từng kỳ</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="py-1 pr-3">Kỳ lương</th><th className="py-1 pr-3">Trạng thái</th><th className="py-1 text-right">Tổng lương</th></tr></thead><tbody>{trend.map((item) => <tr key={item.id} className="border-t"><td className="py-1.5 pr-3">{item.name}</td><td className="py-1.5 pr-3">{item.status}</td><td className="py-1.5 text-right tabular-nums">{item.value === null ? '—' : formatMoney(item.value)}</td></tr>)}</tbody></table></div></details> : null}
        </CardContent>
      </Card>

      <SalaryGoalDialog key={goalRecord?.id ?? 'closed'} selected={goalRecord} onClose={() => setGoalRecord(null)} />
    </div>
  )
}
