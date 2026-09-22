import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Target } from 'lucide-react'
import { getSalaryBreakdown } from '@/api/salary'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney, formatNumber } from '@/lib/format'
import { calculateSalaryGoal } from '@/lib/salary-goal'
import { toneSurface } from '@/lib/tone'

export type SalaryGoalSelection = { id: string; employeeName: string } | null

export function SalaryGoalDialog({ selected, onClose }: { selected: SalaryGoalSelection; onClose: () => void }) {
  const [targetInput, setTargetInput] = useState('')
  const query = useQuery({
    queryKey: ['salary-record', selected?.id],
    queryFn: () => getSalaryBreakdown(selected!.id),
    enabled: Boolean(selected),
  })
  const record = query.data
  const target = targetInput ? BigInt(targetInput) : null
  const plan = useMemo(() => record && target && target > 0n ? calculateSalaryGoal(record, target) : null, [record, target])

  return (
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Target className="size-5 text-primary" aria-hidden="true" />Thu nhập mục tiêu</DialogTitle>
          <DialogDescription>{selected?.employeeName} · Ước tính theo bảng lương và quy tắc thưởng của kỳ được chọn.</DialogDescription>
        </DialogHeader>
        {query.isLoading ? <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div>
          : query.isError || !record ? <ErrorState description="Không tải được dữ liệu lương để tính mục tiêu." onRetry={() => void query.refetch()} />
            : <div className="space-y-5">
              {record.warnings.length > 0 ? <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-5 ${toneSurface.warning}`}><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>Bảng lương này có {record.warnings.length} cảnh báo dữ liệu. Kết quả ước tính có thể thay đổi.</span></div> : null}
              <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                <div>
                  <label htmlFor="dashboard-salary-goal" className="mb-2 block text-sm font-semibold">Thu nhập mong muốn trong kỳ</label>
                  <MoneyInput id="dashboard-salary-goal" value={targetInput} onValueChange={setTargetInput} placeholder="Ví dụ: 20.000.000" aria-describedby="dashboard-salary-goal-hint" />
                </div>
                <div className="rounded-xl bg-muted/50 px-4 py-3"><span className="block text-xs text-muted-foreground">Thu nhập đang tính</span><strong className="mt-1 block text-lg tabular-nums">{formatMoney(record.totalSalaryAmount)}</strong></div>
              </div>
              {!targetInput ? <p id="dashboard-salary-goal-hint" className="text-sm text-muted-foreground">Nhập mục tiêu để xem KPI, OKR, doanh thu và lượt xem cần đạt.</p>
                : target === 0n ? <p id="dashboard-salary-goal-hint" className="text-sm text-destructive">Vui lòng nhập số tiền lớn hơn 0.</p>
                  : plan && plan.gap === 0n ? <div id="dashboard-salary-goal-hint" className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${toneSurface.success}`}><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>Bạn đã đạt mục tiêu này theo bản lương đang tính.</span></div>
                    : plan ? <div id="dashboard-salary-goal-hint" className="space-y-4" aria-live="polite">
                      <div className={`rounded-xl px-4 py-3 ${toneSurface.info}`}><span className="block text-xs font-medium">Còn thiếu để đạt {formatMoney(targetInput)}</span><strong className="mt-1 block text-xl tabular-nums">{formatMoney(plan.gap.toString())}</strong></div>
                      <section><h3 className="text-sm font-bold">1. Hoàn thành các chỉ tiêu thưởng</h3>
                        {plan.actions.length ? <div className="mt-2 divide-y rounded-xl border">{plan.actions.map((action) => <div key={action.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"><span className="min-w-0 font-medium">{action.name}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">Hiện tại {formatPercent(action.progress)} · cần đạt {formatPercent(action.threshold)}</span></span><strong className="shrink-0 tabular-nums text-primary">+{formatMoney(action.amount.toString())}</strong></div>)}</div> : <p className="mt-1 text-sm text-muted-foreground">Không có khoản KPI/OKR chưa đạt nào còn thưởng thêm.</p>}
                      </section>
                      {plan.remaining > 0n ? <section><h3 className="text-sm font-bold">2. Bù thêm {formatMoney(plan.remaining.toString())}</h3><p className="mt-1 text-xs text-muted-foreground">Chọn một trong hai phương án sau khi hoàn thành các chỉ tiêu trên.</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border p-3"><span className="block text-xs font-semibold text-muted-foreground">Doanh thu cần đạt</span><strong className="mt-1 block tabular-nums">{plan.revenueGoal ? formatMoney(plan.revenueGoal.total.toString()) : 'Chưa tính được'}</strong><span className="mt-1 block text-xs text-muted-foreground">{plan.revenueGoal ? `Tăng thêm ${formatMoney((plan.revenueGoal.total - plan.currentRevenue).toString())}` : 'Không có mốc thưởng phù hợp.'}</span></div><div className="rounded-xl border p-3"><span className="block text-xs font-semibold text-muted-foreground">Views hợp lệ cần đạt</span><strong className="mt-1 block tabular-nums">{plan.viewsGoal !== null ? formatNumber(plan.viewsGoal.toString()) : 'Chưa tính được'}</strong><span className="mt-1 block text-xs text-muted-foreground">{plan.viewsGoal !== null ? `Tăng thêm ${formatNumber((plan.viewsGoal - plan.currentViews).toString())} views` : 'RPM hiện tại chưa đủ để tính.'}</span></div></div></section> : <p className={`rounded-xl px-4 py-3 text-sm ${toneSurface.success}`}>Hoàn thành các chỉ tiêu trên là đủ để đạt mục tiêu.</p>}
                      <p className="text-xs leading-5 text-muted-foreground">Đây là số liệu ước tính. Dữ liệu cần được xác nhận, duyệt và tính lương lại để ghi nhận.</p>
                    </div> : null}
            </div>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Đóng</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatPercent(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%` : `${value}%`
}
