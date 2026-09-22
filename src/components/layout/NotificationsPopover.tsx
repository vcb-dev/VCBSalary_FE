import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronRight,
  CircleCheckBig,
  Loader2,
  RefreshCw,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/api/client'
import { listNotifications, markAllNotificationsRead, markNotificationRead, type Notification } from '@/api/notifications'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/shared/StatusBadge'

type Filter = 'ALL' | 'UNREAD'
type NotificationTone = 'success' | 'warning' | 'danger' | 'muted'

// Panel neo dưới chuông nên chỉ cao bằng phần màn hình còn lại: 8 dòng vừa một lượt đọc, phần còn
// lại lật trang thay vì cuộn dài.
const PAGE_SIZE = 8

/**
 * Chuông thông báo ở header — mở hộp thư công việc thành panel neo ngay dưới chuông thay vì điều
 * hướng sang trang riêng, để người dùng xử lý thông báo mà không mất ngữ cảnh màn hình đang làm.
 */
export function NotificationsPopover({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-xl"
          aria-label={unreadCount > 0 ? `Mở ${unreadCount} thông báo chưa đọc` : 'Mở thông báo'}
        >
          <Bell className="size-5" />
          {unreadCount > 0 ? (
            <span className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-[var(--danger-500)] px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-background">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      {/* Nội dung nằm trong component con để Radix unmount khi đóng — mỗi lần mở lại là một lượt
          tải mới, danh sách không lệch với badge trên chuông.
          Chiều cao bám theo khoảng trống thật dưới chuông để panel không bao giờ tràn khỏi màn hình. */}
      <PopoverContent
        align="end"
        aria-label="Thông báo"
        className="flex max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:w-[26rem]"
      >
        <NotificationsPanel onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

function NotificationsPanel({ onNavigate }: { onNavigate: () => void }) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [page, setPage] = useState(1)
  const notificationsQuery = useQuery({
    queryKey: ['notifications', filter, page],
    queryFn: () => listNotifications({ page, pageSize: PAGE_SIZE, unread: filter === 'UNREAD' ? true : undefined }),
  })
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => invalidateNotifications(queryClient),
    onError: (error) => toast.error(getApiErrorMessage(error, 'Không thể cập nhật thông báo')),
  })
  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async (result) => {
      await invalidateNotifications(queryClient)
      toast.success(result.updatedCount > 0 ? `Đã đánh dấu ${result.updatedCount} thông báo là đã đọc` : 'Không có thông báo mới')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const rows = notificationsQuery.data?.data ?? []
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0
  const totalPages = notificationsQuery.data?.meta.totalPages ?? 1

  function changeFilter(next: Filter) {
    setFilter(next)
    setPage(1)
  }

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <strong className="font-heading text-sm font-semibold tracking-tight">Thông báo</strong>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          disabled={unreadCount === 0 || markAllMutation.isPending}
          onClick={() => markAllMutation.mutate()}
        >
          {markAllMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
          Đánh dấu đã đọc hết
        </Button>
      </div>

      <div className="shrink-0 border-b border-border/70 px-4 py-2.5">
        <div className="flex w-fit rounded-xl bg-muted p-1" role="group" aria-label="Lọc thông báo">
          <FilterButton active={filter === 'ALL'} onClick={() => changeFilter('ALL')}>Tất cả</FilterButton>
          <FilterButton active={filter === 'UNREAD'} onClick={() => changeFilter('UNREAD')}>
            Chưa đọc{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </FilterButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {notificationsQuery.isLoading ? (
          <div className="space-y-2.5 p-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
        ) : notificationsQuery.isError ? (
          <EmptyState icon={AlertTriangle} title="Không thể tải thông báo" description="Vui lòng thử tải lại sau ít phút." danger />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={filter === 'UNREAD' ? CircleCheckBig : Bell}
            title={filter === 'UNREAD' ? 'Bạn đã xem hết thông báo' : 'Chưa có thông báo'}
            description={filter === 'UNREAD' ? 'Hiện không còn công việc mới cần bạn kiểm tra.' : 'Các cập nhật và công việc cần xử lý sẽ xuất hiện tại đây.'}
          />
        ) : (
          <div>
            {rows.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onRead={(id) => markReadMutation.mutate(id)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/70 bg-slate-50 px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">Trang {page} / {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 bg-background px-2 text-xs" disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</Button>
            <Button variant="outline" size="sm" className="h-7 bg-background px-2 text-xs" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Sau</Button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function NotificationRow({
  item,
  onRead,
  onNavigate,
}: {
  item: Notification
  onRead: (id: string) => void
  onNavigate: () => void
}) {
  const meta = notificationMeta(item.notificationType)
  const Icon = meta.icon
  return (
    <article className={`relative border-b border-border/70 last:border-0 ${item.isRead ? 'bg-background' : 'bg-primary/[0.035]'}`}>
      {!item.isRead ? <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" /> : null}
      <div className="flex items-start gap-2.5 p-3 pl-4">
        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${iconTone(meta.tone)}`}><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <strong className="text-[13px] leading-5">{item.title}</strong>
            {!item.isRead ? <StatusBadge tone="success">Mới</StatusBadge> : null}
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="text-xs text-muted-foreground" title={formatFullDate(item.createdAt)}>{relativeTime(item.createdAt)}</span>
            <Button asChild variant="outline" size="sm" className="h-7 bg-background px-2 text-xs">
              <Link
                to={item.href}
                onClick={() => {
                  if (!item.isRead) onRead(item.id)
                  onNavigate()
                }}
              >
                {meta.actionLabel}<ChevronRight className="size-3.5" />
              </Link>
            </Button>
            {!item.isRead ? (
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => onRead(item.id)}>Đánh dấu đã đọc</button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCheck className="size-3" />Đã đọc</span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function notificationMeta(type: string): { label: string; actionLabel: string; tone: NotificationTone; icon: typeof Bell } {
  if (type === 'KPI_SYNC_FAILED') return { label: 'Đồng bộ thất bại', actionLabel: 'Kiểm tra đồng bộ', tone: 'danger', icon: RefreshCw }
  if (type === 'KPI_SYNC_WARNING') return { label: 'Có cảnh báo', actionLabel: 'Kiểm tra đồng bộ', tone: 'warning', icon: RefreshCw }
  if (type === 'SALARY_WAITING_APPROVAL') return { label: 'Chờ duyệt lương', actionLabel: 'Mở bản lương', tone: 'warning', icon: WalletCards }
  if (type.includes('WAITING')) return { label: 'Chờ bạn duyệt', actionLabel: 'Mở để duyệt', tone: 'warning', icon: UserRoundCheck }
  if (type.includes('REJECTED')) return { label: 'Cần chỉnh sửa', actionLabel: 'Xem và cập nhật', tone: 'danger', icon: AlertTriangle }
  if (type.includes('APPROVED') || type.includes('LOCKED')) return { label: 'Đã hoàn tất', actionLabel: 'Xem chi tiết', tone: 'success', icon: CircleCheckBig }
  return { label: 'Cập nhật hệ thống', actionLabel: 'Xem chi tiết', tone: 'muted', icon: Bell }
}

async function invalidateNotifications(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] }),
  ])
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{children}</button>
}

function EmptyState({ icon: Icon, title, description, danger = false }: { icon: typeof Bell; title: string; description: string; danger?: boolean }) {
  return <div className="grid place-items-center gap-1.5 px-6 py-10 text-center"><span className={`grid size-11 place-items-center rounded-full ${danger ? 'bg-[var(--danger-100)] text-[var(--danger-700)]' : 'bg-muted text-muted-foreground'}`}><Icon className="size-5" /></span><strong className="text-sm">{title}</strong><p className="text-xs leading-5 text-muted-foreground">{description}</p></div>
}

function iconTone(tone: NotificationTone) {
  if (tone === 'success') return 'bg-[var(--success-100)] text-[var(--success-700)]'
  if (tone === 'warning') return 'bg-[var(--warning-100)] text-[var(--warning-700)]'
  if (tone === 'danger') return 'bg-[var(--danger-100)] text-[var(--danger-700)]'
  return 'bg-muted text-muted-foreground'
}

function relativeTime(value: string) {
  const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })
  const delta = new Date(value).getTime() - Date.now()
  const minutes = Math.round(delta / 60_000)
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return formatter.format(days, 'day')
  return formatFullDate(value)
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
