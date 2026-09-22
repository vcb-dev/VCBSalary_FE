import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'
import { toneSurface, type Tone } from '@/lib/tone'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  /** Nút kêu gọi hành động chính, đặt ngay dưới mô tả. */
  action?: ReactNode
  className?: string
  size?: 'default' | 'sm'
  /** 'success' dùng cho trạng thái tích cực: không còn việc tồn đọng. */
  tone?: Tone
}

export function EmptyState({ icon: Icon, title, description, action, className, size = 'default', tone = 'muted' }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        size === 'sm' ? 'px-4 py-8' : 'px-6 py-12',
        className,
      )}
    >
      <span className={cn('grid size-14 place-items-center rounded-2xl', toneSurface[tone])}>
        <Icon className={size === 'sm' ? 'size-6' : 'size-7'} aria-hidden="true" />
      </span>
      <div className="space-y-1.5">
        <strong className={cn('block font-bold text-foreground', size === 'sm' ? 'text-base' : 'text-lg')}>{title}</strong>
        <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
