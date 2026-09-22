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
    <section className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card px-5 py-5 shadow-[0_8px_30px_rgb(15_23_42/0.035)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <span className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-sky-400 via-primary to-blue-700" aria-hidden="true" />
      <span className="pointer-events-none absolute -right-12 -top-20 size-48 rounded-full bg-primary/6" aria-hidden="true" />
      <div className="relative min-w-0">
        <p className="text-[10px] font-bold tracking-[0.16em] text-primary uppercase">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-[1.85rem]">{title}</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {action ? <div className="relative shrink-0">{action}</div> : null}
    </section>
  )
}
