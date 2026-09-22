import { type ReactNode } from 'react'

type PageHeaderProps = {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
  /** Chip ngữ cảnh đặt dưới mô tả: trạng thái, hạn xử lý, phạm vi dữ liệu. */
  meta?: ReactNode
}

export function PageHeader({ eyebrow, title, description, action, meta }: PageHeaderProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  )
}
