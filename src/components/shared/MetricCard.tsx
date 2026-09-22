import { type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { toneSurface, type Tone } from '@/lib/tone'
import { cn } from '@/lib/utils'

type MetricCardProps = {
  icon: LucideIcon
  label: string
  value: string
  /** Dòng ngữ cảnh dưới giá trị: so sánh, chi tiết cấu thành. */
  note?: string
  tone?: Tone
  /** Hiện thanh tiến trình 0–100 khi chỉ số là một phần của tổng thể. */
  progress?: number
  /** Giá trị đầy đủ hiển thị khi hover (dùng cho số tiền đã rút gọn). */
  valueTitle?: string
  loading?: boolean
  /** Biến thẻ thành liên kết tới màn xử lý tương ứng. */
  href?: string
  /** Biến thẻ thành nút lọc nhanh ngay trong trang (loại trừ với href). */
  onSelect?: () => void
}

export function MetricCard({
  icon: Icon, label, value, note, tone = 'info', progress, valueTitle, loading, href, onSelect,
}: MetricCardProps) {
  const content = (
    <CardContent className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', toneSurface[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1.5 h-6 w-24" />
          ) : (
            <strong
              className="mt-0.5 block truncate text-xl font-extrabold tracking-tight text-foreground tabular-nums"
              title={valueTitle}
            >
              {value}
            </strong>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-3 w-32" />
      ) : (
        <div className="space-y-2">
          {progress === undefined ? null : <ProgressBar value={progress} tone={tone} label={label} />}
          {note ? <p className="text-xs leading-4 text-muted-foreground">{note}</p> : null}
        </div>
      )}
    </CardContent>
  )

  if (onSelect && !loading) {
    return (
      <Card className="py-0 transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
        <button type="button" onClick={onSelect} className="w-full text-left outline-none" aria-label={`Lọc theo ${label}`}>
          {content}
        </button>
      </Card>
    )
  }

  if (href && !loading) {
    return (
      <Card className="py-0 transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring">
        <Link to={href} className="outline-none" aria-label={`${label}: ${value}`}>
          {content}
        </Link>
      </Card>
    )
  }

  return <Card className="py-0">{content}</Card>
}
