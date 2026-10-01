import { CalendarDays, ChevronDown, ChevronRight, LogOut, Menu, ShieldCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/auth/AuthContext'
import { PAGE_PERMISSIONS } from '@/auth/permission-config'
import { getUnreadNotificationCount } from '@/api/notifications'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { NotificationsPopover } from '@/components/layout/NotificationsPopover'
import {
  MANAGEMENT_NAVIGATION, WORKSPACE_NAVIGATION, canShowNavigationItem, findNavigationItem,
} from '@/components/layout/navigation'
import { PayrollPeriodProvider, usePayrollPeriodSelection } from '@/contexts/PayrollPeriodContext'

export function AppLayout() {
  return <PayrollPeriodProvider><AppLayoutContent /></PayrollPeriodProvider>
}

function AppLayoutContent() {
  const { user, logout } = useAuth()
  const { periods, selectedPeriod: currentPeriod, selectPeriod, isLoading: periodsLoading } = usePayrollPeriodSelection()
  const location = useLocation()
  // Drawer mobile gắn với đường dẫn đã mở nó: điều hướng (kể cả nút back) làm nó tự đóng mà
  // không cần effect đồng bộ thêm.
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null)
  const menuOpen = menuOpenedAt === location.pathname
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuWasOpen = useRef(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('vcb-sidebar-collapsed') === 'true')
  const initials = user?.fullName?.split(' ').slice(-2).map((item) => item[0]).join('').toUpperCase() || 'VC'
  const permissions = user?.permissions ?? []
  const personalSalaryView = permissions.includes('salary.view_self') &&
    !permissions.some((permission) => permission === 'salary.view_team' || permission === 'salary.view_all')
  const visibleNavigation = WORKSPACE_NAVIGATION.filter((item) => canShowNavigationItem(item, permissions)).map((item) =>
    personalSalaryView && item.to === '/salary-records' ? { ...item, label: 'Thu nhập của tôi', area: 'Lương cá nhân' } : item,
  )
  const visibleManagementNavigation = MANAGEMENT_NAVIGATION.filter((item) => canShowNavigationItem(item, permissions))
  const activeItem = findNavigationItem(location.pathname)
  const currentPage = location.pathname === '/salary-records' && personalSalaryView
    ? { title: 'Thu nhập của tôi', area: 'Lương cá nhân' }
    : activeItem
      ? { title: activeItem.label, area: activeItem.area }
      : { title: 'VCB Salary', area: 'Không gian làm việc' }
  const canViewNotifications = PAGE_PERMISSIONS.notifications.some((permission) => permissions.includes(permission))
  const unreadQuery = useQuery({
    queryKey: ['notification-unread-count'],
    queryFn: getUnreadNotificationCount,
    enabled: canViewNotifications,
    refetchInterval: 60_000,
  })
  const unreadCount = unreadQuery.data?.count ?? 0
  const periodLabel = currentPeriod?.name ?? 'Chưa có kỳ lương'
  const sidebarPeriod = {
    label: periodLabel,
    detail: currentPeriod
      ? `${periodStatusLabel(currentPeriod.status)}${currentPeriod.approvalDeadline ? ` · Hạn ${formatShortDate(currentPeriod.approvalDeadline)}` : ''}`
      : 'Tạo kỳ lương để bắt đầu',
    status: currentPeriod?.status ?? null,
  }

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      localStorage.setItem('vcb-sidebar-collapsed', String(!previous))
      return !previous
    })
  }, [])

  const closeMenu = useCallback(() => setMenuOpenedAt(null), [])

  // Drawer đóng lại thì focus phải quay về nút đã mở nó, không rơi về <body>.
  useEffect(() => {
    if (menuWasOpen.current && !menuOpen) menuButtonRef.current?.focus()
    menuWasOpen.current = menuOpen
  }, [menuOpen])

  return (
    <div className={`min-h-svh bg-background lg:grid ${collapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[272px_minmax(0,1fr)]'} transition-[grid-template-columns] duration-300`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Bỏ qua điều hướng
      </a>

      <AppSidebar
        workspaceItems={visibleNavigation}
        managementItems={visibleManagementNavigation}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={menuOpen}
        onCloseMobile={closeMenu}
        onNavigate={closeMenu}
        period={sidebarPeriod}
      />

      {/* Khi drawer mobile mở, phần còn lại của trang bị khoá tương tác để Tab không lọt ra sau lớp phủ. */}
      <div className="min-w-0" inert={menuOpen || undefined}>
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border bg-background/88 px-4 backdrop-blur-xl lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Button ref={menuButtonRef} variant="outline" size="icon" className="shrink-0 bg-white lg:hidden" onClick={() => setMenuOpenedAt(location.pathname)} aria-label="Mở menu" aria-expanded={menuOpen} aria-controls="app-sidebar"><Menu className="size-5" /></Button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><span className="hidden sm:inline">VCB Salary</span><ChevronRight className="hidden size-3 sm:block" /><span className="truncate text-primary">{currentPage.area}</span></div>
              <p className="truncate text-base font-bold tracking-tight text-foreground">{currentPage.title}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Select value={currentPeriod?.id} onValueChange={selectPeriod} disabled={periodsLoading || periods.length === 0}>
              <SelectTrigger className="hidden h-11 w-56 cursor-pointer rounded-xl bg-white md:flex" aria-label="Chọn kỳ lương đang xem">
                <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <SelectValue placeholder={periodsLoading ? 'Đang tải kỳ lương…' : 'Chưa có kỳ lương'}>{periodLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent position="popper" align="end" className="w-72" searchPlaceholder="Tìm kỳ lương…">
                {periods.map((period) => (
                  <SelectItem key={period.id} value={period.id} searchText={`${period.name} ${period.code}`}>
                    <span className="min-w-0 flex-1 truncate">{period.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{periodStatusLabel(period.status)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canViewNotifications ? <NotificationsPopover unreadCount={unreadCount} /> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 gap-2 rounded-xl px-1.5 sm:pr-2" aria-label="Mở menu tài khoản">
                  <span className="grid size-8.5 shrink-0 place-items-center rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm">{initials}</span>
                  <span className="hidden max-w-36 min-w-0 text-left sm:block"><strong className="block truncate text-sm leading-4 text-foreground">{user?.fullName}</strong><small className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{user?.roles[0]?.roleName || 'Người dùng'}</small></span>
                  <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                <DropdownMenuLabel className="px-2 py-2"><span className="block truncate text-sm font-semibold text-foreground">{user?.fullName}</span><span className="mt-0.5 block truncate text-xs font-normal">{user?.email}</span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 px-2 py-2" disabled><ShieldCheck className="size-4" />{user?.roles[0]?.roleName || 'Người dùng'}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" className="gap-2 px-2 py-2" onSelect={() => void logout()}><LogOut className="size-4" />Đăng xuất</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main-content" className="mx-auto max-w-[1536px] p-4 sm:p-5 lg:p-7"><Outlet /></main>
      </div>
    </div>
  )
}

function periodStatusLabel(status: 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'CLOSED') {
  return { DRAFT: 'Bản nháp', OPEN: 'Đang mở', IN_REVIEW: 'Đang duyệt', CLOSED: 'Đã đóng' }[status]
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(value))
}
