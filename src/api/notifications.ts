import type { Paginated } from '@/api/access-control'
import { api } from '@/api/client'

export type Notification = {
  id: string
  notificationType: string
  title: string
  message: string
  referenceEntityType: string | null
  referenceEntityId: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
  href: string
}

export type NotificationList = Paginated<Notification> & { unreadCount: number }

export async function listNotifications(params: { page?: number; pageSize?: number; unread?: boolean; type?: string } = {}) {
  const { data } = await api.get<NotificationList>('/notifications', { params })
  return data
}

export async function getUnreadNotificationCount() {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count')
  return data
}

export async function markNotificationRead(id: string) {
  const { data } = await api.post<Notification>(`/notifications/${id}/read`)
  return data
}

export async function markAllNotificationsRead() {
  const { data } = await api.post<{ updatedCount: number }>('/notifications/read-all')
  return data
}
