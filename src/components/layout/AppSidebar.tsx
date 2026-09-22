import { useEffect, useRef, type ReactNode } from 'react'
import { CalendarClock, ChevronRight, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import type { PayrollPeriodStatus } from '@/api/payroll-periods'
import type { NavigationItem } from '@/components/layout/navigation'
import { BrandMark } from '@/components/shared/BrandMark'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'

export type SidebarPeriod = {
  label: string
  detail: string
  status: PayrollPeriodStatus | null
}

type AppSidebarProps = {
  workspaceItems: NavigationItem[]
  managementItems: NavigationItem[]
  /** Chế độ rail (chỉ icon) — chỉ có hiệu lực từ breakpoint lg trở lên. */
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  /** Đóng drawer bằng nút X / lớp phủ / Esc — kèm trả focus về nút mở menu. */
  onCloseMobile: () => void
  /** Đóng drawer sau khi chọn một mục điều hướng. */
  onNavigate: () => void
  period: SidebarPeriod
}

const PERIOD_INDICATOR: Record<PayrollPeriodStatus, string> = {
  DRAFT: 'bg-sidebar-subtle',
  OPEN: 'bg-[var(--success-500)]',
  IN_REVIEW: 'bg-[var(--warning-500)]',
  CLOSED: 'bg-sidebar-subtle',
}

const COLLAPSE_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘B' : 'Ctrl B'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar'

/**
 * Bọc phần tử bằng tooltip khi sidebar ở chế độ rail — lúc đó nhãn bị ẩn nên icon cần được chú
 * thích, còn khi mở rộng thì tooltip chỉ gây nhiễu.
 */
function RailTooltip({ rail, content, children }: { rail: boolean; content: ReactNode; children: ReactNode }) {
  if (!rail) return children

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={12} className="max-w-56">{content}</TooltipContent>
    </Tooltip>
  )
}

function SidebarLink({ item, rail, onNavigate }: { item: NavigationItem; rail: boolean; onNavigate: () => void }) {
  const { label, icon: Icon, to } = item

  return (
    <RailTooltip rail={rail} content={label}>
      <NavLink
        to={to}
        end={to === '/'}
        onClick={onNavigate}
        className={({ isActive }) => cn(
          'group relative flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-[8px] border px-2.5 text-left text-[13px] font-medium leading-5 transition-[background-color,border-color,color,box-shadow] duration-200',
          FOCUS_RING,
          isActive
            ? 'border-sidebar-accent/15 bg-sidebar-accent/10 text-sidebar-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.65)]'
            : 'border-transparent text-sidebar-item hover:border-sidebar-border hover:bg-sidebar-hover hover:text-sidebar-foreground',
          rail && 'justify-center px-0.5',
        )}
      >
        {({ isActive }) => (
          <>
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-[7px] transition-[background-color,color,box-shadow] duration-200',
                isActive
                  ? 'text-sidebar-accent'
                  : 'text-sidebar-muted group-hover:bg-sidebar-surface group-hover:text-sidebar-accent',
              )}
            >
              <Icon className="size-[17px] stroke-[1.8]" />
            </span>
            {rail ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
            {!rail && isActive ? <ChevronRight className="size-3.5 shrink-0 text-sidebar-accent/60" aria-hidden="true" /> : null}
          </>
        )}
      </NavLink>
    </RailTooltip>
  )
}

function NavSection({ title, items, rail, divider, onNavigate }: {
  title: string
  items: NavigationItem[]
  rail: boolean
  divider: boolean
  onNavigate: () => void
}) {
  if (items.length === 0) return null

  return (
    <div role="group" aria-label={title} className="space-y-1">
      {/* Ở chế độ rail không còn chỗ cho nhãn nhóm, một đường kẻ mảnh giữ lại ranh giới giữa hai nhóm. */}
      {rail
        ? divider ? <div className="mx-auto mb-3 h-px w-7 bg-sidebar-border" aria-hidden="true" /> : null
        : <div className="flex items-center gap-2 px-2.5 pb-2">
            <p className="shrink-0 text-[9px] font-bold tracking-[0.17em] text-sidebar-subtle uppercase">{title}</p>
            <span className="h-px flex-1 bg-sidebar-border/70" aria-hidden="true" />
          </div>}
      {items.map((item) => <SidebarLink key={item.to} item={item} rail={rail} onNavigate={onNavigate} />)}
    </div>
  )
}

function PeriodCard({ period, rail }: { period: SidebarPeriod; rail: boolean }) {
  const indicator = PERIOD_INDICATOR[period.status ?? 'DRAFT']

  if (rail) {
    return (
      <RailTooltip
        rail
        content={
          <span className="block">
            <strong className="block font-semibold">{period.label}</strong>
            <span className="block opacity-80">{period.detail}</span>
          </span>
        }
      >
        <Link
          to="/payroll-periods"
          aria-label={`Kỳ lương hiện tại: ${period.label}`}
          className={cn(
            'relative mx-auto grid size-10 place-items-center rounded-xl border border-sidebar-border bg-sidebar-surface text-sidebar-muted transition-all hover:-translate-y-0.5 hover:border-sidebar-accent/25 hover:bg-sidebar-hover hover:text-sidebar-accent',
            FOCUS_RING,
          )}
        >
          <CalendarClock className="size-[18px] stroke-[1.8]" />
          <span className={cn('absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-sidebar', indicator)} aria-hidden="true" />
        </Link>
      </RailTooltip>
    )
  }

  return (
    <Link
      to="/payroll-periods"
      className={cn(
        'group/period relative block overflow-hidden rounded-2xl border border-sidebar-accent/15 bg-sidebar-accent/[0.055] p-3.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-sidebar-accent/25 hover:bg-sidebar-accent/[0.075]',
        FOCUS_RING,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-sidebar-accent/10 text-sidebar-accent"><CalendarClock className="size-3.5" /></span>
          <span className="text-[9px] font-bold tracking-[0.15em] text-sidebar-subtle uppercase">Kỳ hiện tại</span>
        </span>
        <span className={cn('size-2 rounded-full ring-4 ring-sidebar', indicator)} aria-hidden="true" />
      </div>
      <strong className="mt-3 block truncate text-[13px] font-semibold text-sidebar-foreground">{period.label}</strong>
      <p className="mt-1 truncate text-[11px] text-sidebar-muted">{period.detail}</p>
      <span className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-sidebar-accent/80 transition-colors group-hover/period:text-sidebar-accent">
        Xem chi tiết
        <ChevronRight className="size-3 transition-transform group-hover/period:translate-x-0.5" />
      </span>
    </Link>
  )
}

/**
 * Thanh điều hướng chính: drawer trượt trên mobile, cột cố định trên desktop với hai chế độ
 * mở rộng / rail. Trạng thái thu gọn do AppLayout giữ vì lưới layout cũng phải đổi theo.
 */
export function AppSidebar({
  workspaceItems, managementItems, collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, onNavigate, period,
}: AppSidebarProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const rail = collapsed && isDesktop
  const location = useLocation()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)

  // Drawer mobile là lớp phủ toàn màn hình nên phải khoá cuộn nền, nhận focus và đóng được bằng Esc.
  useEffect(() => {
    if (!mobileOpen) return
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseMobile()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen, onCloseMobile])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'b') return
      // Trong ô nhập liệu Ctrl/⌘+B là phím tắt in đậm của trình duyệt, không cướp phím ở đó.
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      onToggleCollapsed()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onToggleCollapsed])

  // Khi danh sách dài phải cuộn, giữ mục đang mở nằm trong tầm nhìn.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
  }, [location.pathname])

  return (
    <TooltipProvider delayDuration={200}>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          aria-label="Đóng menu"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        id="app-sidebar"
        aria-label="Thanh điều hướng"
        className={cn(
          'sidebar-shell fixed inset-y-0 left-0 z-[41] flex w-[280px] -translate-x-full flex-col border-r border-sidebar-border text-sidebar-foreground shadow-2xl transition-transform duration-300',
          'lg:sticky lg:top-0 lg:h-svh lg:w-auto lg:translate-x-0 lg:shadow-none',
          rail ? 'px-2.5 py-3' : 'px-3.5 py-3',
          mobileOpen && 'translate-x-0',
        )}
      >
        <div
          className={cn(
            'relative z-10 flex h-[64px] items-center gap-3 px-2 pb-2',
            rail && 'justify-center px-0',
          )}
        >
          <span
            className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--brand-navy)] shadow-[0_8px_20px_rgb(7_45_86/0.18)] ring-1 ring-[var(--brand-navy)]/10"
            aria-hidden="true"
          >
            <BrandMark className="size-[26px] text-[var(--brand-gold)]" />
          </span>
          {rail ? null : (
            <span className="min-w-0">
              <strong className="block text-[15px] font-bold tracking-[-0.015em] text-sidebar-foreground">VCB Salary</strong>
              <small className="mt-0.5 block text-[9px] font-bold tracking-[0.16em] text-sidebar-subtle uppercase">Viễn Chí Bảo</small>
            </span>
          )}
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0 text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground lg:hidden"
            onClick={onCloseMobile}
            aria-label="Đóng menu"
          >
            <X className="size-5" />
          </Button>
        </div>

        <nav
          ref={navRef}
          aria-label="Điều hướng chính"
          className={cn('sidebar-scroll relative z-10 mt-3 flex-1 overflow-x-hidden overflow-y-auto px-0.5 pr-1', rail ? 'space-y-3' : 'space-y-6')}
        >
          <NavSection title="Không gian làm việc" items={workspaceItems} rail={rail} divider={false} onNavigate={onNavigate} />
          <NavSection title="Quản trị hệ thống" items={managementItems} rail={rail} divider onNavigate={onNavigate} />
        </nav>

        <div className={cn('relative z-10 mt-3 space-y-2.5 border-t border-sidebar-border pt-3', rail && 'space-y-3')}>
          <PeriodCard period={period} rail={rail} />

          <RailTooltip rail={rail} content={`Mở rộng thanh bên (${COLLAPSE_SHORTCUT})`}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-expanded={!rail}
              aria-controls="app-sidebar"
              aria-label={rail ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              className={cn(
                'hidden h-9 items-center rounded-lg text-[11px] font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground lg:flex',
                FOCUS_RING,
                rail ? 'mx-auto w-10 justify-center' : 'w-full gap-2 px-2.5',
              )}
            >
              {rail ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <>
                  <PanelLeftClose className="size-4" />
                  <span>Thu gọn thanh bên</span>
                  <kbd className="ml-auto rounded border border-sidebar-border bg-sidebar-surface px-1.5 py-0.5 font-sans text-[10px] text-sidebar-subtle">
                    {COLLAPSE_SHORTCUT}
                  </kbd>
                </>
              )}
            </button>
          </RailTooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}
