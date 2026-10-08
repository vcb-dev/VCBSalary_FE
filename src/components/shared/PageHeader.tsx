import { type ReactNode } from 'react'

type PageHeaderProps = {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
  /** Chip ngữ cảnh đặt dưới mô tả: trạng thái, hạn xử lý, phạm vi dữ liệu. */
  meta?: ReactNode
  /** Bộ lọc của trang, nằm bên phải cùng hàng với `meta`. Trang tự quyết độ rộng từng ô. */
  filters?: ReactNode
  filtersLabel?: string
}

export function PageHeader({ eyebrow, title, description, action, meta, filters, filtersLabel = 'Bộ lọc' }: PageHeaderProps) {
  const heading = (
    <>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
      <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </>
  )

  if (!filters) {
    return (
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6">
        <div className="min-w-0">
          {heading}
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </section>
    )
  }

  // Một hàng bộ lọc rộng tới ~46rem, nên vị trí đổi theo độ rộng của chính header (container query),
  // không theo màn hình, vì sidebar ăn mất một phần chiều ngang:
  // - từ `@5xl`: bộ lọc nằm bên phải, cùng hàng và căn giữa với `meta`; nút ở góc trên.
  // - `@3xl`–`@5xl` (vd 1280px còn sidebar): bộ lọc thành một hàng riêng căn phải dưới `meta`.
  // - hẹp hơn: bộ lọc trải hết chiều ngang, trang tự chia lưới.
  return (
    <section className="@container rounded-2xl border border-border bg-card px-5 py-5 sm:px-6">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0 sm:col-start-1 sm:row-start-1">{heading}</div>
        {meta ? <div className="flex flex-wrap items-center gap-2 sm:col-start-1 sm:row-start-2 @5xl:self-center">{meta}</div> : null}
        {action ? <div className="sm:col-start-2 sm:row-start-1 sm:justify-self-end">{action}</div> : null}
        <div
          role="group"
          aria-label={filtersLabel}
          className="flex flex-wrap items-center gap-2 sm:col-span-full @3xl:justify-self-end @5xl:col-span-1 @5xl:col-start-2 @5xl:row-start-2 @5xl:self-center"
        >
          {filters}
        </div>
      </div>
    </section>
  )
}
