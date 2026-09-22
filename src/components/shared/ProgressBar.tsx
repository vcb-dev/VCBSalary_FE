import { cn } from '@/lib/utils'
import { toneSolid, type Tone } from '@/lib/tone'

type ProgressBarProps = {
  /** Giá trị 0–100 */
  value: number
  tone?: Tone
  label?: string
  className?: string
}

export function ProgressBar({ value, tone = 'info', label, className }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, Math.round(value)))

  return (
    <div
      role="progressbar"
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', toneSolid[tone])}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  )
}
