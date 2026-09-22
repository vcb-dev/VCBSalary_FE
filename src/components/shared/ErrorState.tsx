import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ErrorStateProps = {
  title?: string
  description?: string
  /** Tải lại dữ liệu tại chỗ, không bắt người dùng tải lại cả trang. */
  onRetry?: () => void
  retrying?: boolean
}

export function ErrorState({
  title = 'Không tải được dữ liệu',
  description = 'Kết nối tới máy chủ đang gặp sự cố. Bạn có thể thử lại ngay mà không cần tải lại trang.',
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-[var(--danger-500)]/25 bg-[var(--danger-500)]/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--danger-700)]" aria-hidden="true" />
        <div className="min-w-0">
          <strong className="block text-sm font-semibold text-foreground">{title}</strong>
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="outline" className="shrink-0 bg-card" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={`size-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
          {retrying ? 'Đang tải lại…' : 'Thử lại'}
        </Button>
      ) : null}
    </div>
  )
}
