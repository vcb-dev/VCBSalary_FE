import { cn } from '@/lib/utils'

export type WorkflowStepItem = {
  label: string
  /** Mô tả ngắn, hiện trên mobile cho bước đang chạy và luôn có cho trình đọc màn hình. */
  hint?: string
}

type WorkflowStepsProps = {
  steps: WorkflowStepItem[]
  /** Chỉ số bước hiện tại; các bước trước được coi là đã hoàn tất. */
  currentIndex: number
  className?: string
}

export function WorkflowSteps({ steps, currentIndex, className }: WorkflowStepsProps) {
  return (
    <ol className={cn('flex flex-col gap-4 sm:flex-row sm:gap-0', className)}>
      {steps.map((step, index) => (
        <WorkflowStep
          key={step.label}
          label={step.label}
          hint={step.hint}
          state={index < currentIndex ? 'done' : index === currentIndex ? 'current' : undefined}
        />
      ))}
    </ol>
  )
}

function WorkflowStep({ label, hint, state }: { label: string; hint?: string; state?: 'done' | 'current' }) {
  const marker = state === 'done' ? '✓' : state === 'current' ? '●' : '·'
  const color = state === 'done'
    ? 'bg-[var(--success-500)] text-white'
    : state === 'current'
      ? 'bg-primary text-primary-foreground ring-4 ring-primary/15'
      : 'bg-muted text-muted-foreground'

  return (
    <li
      aria-current={state === 'current' ? 'step' : undefined}
      className="relative flex flex-1 items-center gap-3 before:absolute before:top-0 before:left-[13px] before:h-4 before:w-0.5 before:-translate-y-full before:bg-border first:before:hidden sm:flex-col sm:items-center sm:gap-2 sm:text-center sm:before:top-3.5 sm:before:right-1/2 sm:before:left-auto sm:before:h-0.5 sm:before:w-full sm:before:translate-y-0"
    >
      <span className={cn('relative z-10 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold', color)}>
        {marker}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-xs font-semibold', state ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
        {hint ? (
          <span className={cn('block text-[11px] leading-4 text-muted-foreground sm:hidden', state === 'current' ? '' : 'sr-only')}>
            {hint}
          </span>
        ) : null}
      </span>
    </li>
  )
}
