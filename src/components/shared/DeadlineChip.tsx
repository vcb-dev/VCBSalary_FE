import { CalendarClock } from 'lucide-react'
import { daysUntil, formatDate } from '@/lib/format'
import { toneSurface, type Tone } from '@/lib/tone'
import { cn } from '@/lib/utils'

type DeadlineChipProps = {
  deadline: string | null | undefined
  /** Tên mốc thời gian, ví dụ "hạn duyệt". */
  label?: string
  className?: string
}

/** Chip đếm ngược tới hạn xử lý: đỏ khi đã quá hạn hoặc còn ≤ 3 ngày, vàng khi còn ≤ 7 ngày. */
export function DeadlineChip({ deadline, label = 'hạn duyệt', className }: DeadlineChipProps) {
  if (!deadline) return null

  const days = daysUntil(deadline)
  const tone: Tone = days === null ? 'muted' : days <= 3 ? 'danger' : days <= 7 ? 'warning' : 'muted'
  const text = days === null
    ? `Hạn ${label} ${formatDate(deadline)}`
    : days < 0
      ? `Quá ${label} ${Math.abs(days)} ngày (${formatDate(deadline)})`
      : days === 0
        ? `${label.charAt(0).toUpperCase()}${label.slice(1)} hôm nay (${formatDate(deadline)})`
        : `Còn ${days} ngày tới ${label} (${formatDate(deadline)})`

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', toneSurface[tone], className)}>
      <CalendarClock className="size-3.5" aria-hidden="true" />
      {text}
    </span>
  )
}
