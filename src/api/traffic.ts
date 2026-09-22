import type { Paginated } from '@/api/access-control'
import { api } from '@/api/client'

export type TrafficPlatform = 'TIKTOK' | 'FACEBOOK' | 'YOUTUBE' | 'INSTAGRAM'
export type SelfConfirmationStatus = 'DRAFT' | 'CONFIRMED'
export type LeaderReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type TrafficActor = {
  id: string
  fullName: string
}

export type TrafficAttachment = {
  id: string
  uploadedByUserId: string
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  createdAt: string
  downloadUrl: string
}

export type TrafficRecord = {
  id: string | null
  platform: TrafficPlatform
  views: string
  selfConfirmationStatus: SelfConfirmationStatus
  selfConfirmedBy: TrafficActor | null
  selfConfirmedAt: string | null
  leaderReviewStatus: LeaderReviewStatus
  leaderReviewedBy: TrafficActor | null
  leaderReviewedAt: string | null
  leaderRejectionReason: string | null
  attachments: TrafficAttachment[]
  createdAt: string | null
  updatedAt: string | null
}

export type TrafficListItem = {
  employeeId: string
  payrollPeriodId: string
  employeeCode: string
  employeeName: string
  jobTitle: string
  teamId: string | null
  teamName: string | null
  totalViews: string
  acceptedViews: string
  completedPlatforms: number
  approvedPlatforms: number
  pendingPlatforms: number
  rejectedPlatforms: number
}

export type EmployeeTrafficProfile = {
  employeeId: string
  payrollPeriodId: string
  employeeCode: string
  employeeName: string
  jobTitle: string
  teamId: string | null
  teamName: string | null
  totalViews: string
  acceptedViews: string
  records: TrafficRecord[]
}

export async function listTraffic(
  periodId: string,
  params: { page?: number; pageSize?: number; search?: string; teamId?: string } = {},
) {
  const { data } = await api.get<Paginated<TrafficListItem>>(
    `/payroll-periods/${periodId}/traffic`,
    { params },
  )
  return data
}

export async function getEmployeeTraffic(periodId: string, employeeId: string) {
  const { data } = await api.get<EmployeeTrafficProfile>(
    `/payroll-periods/${periodId}/employees/${employeeId}/traffic`,
  )
  return data
}

export async function putEmployeeTraffic(
  periodId: string,
  employeeId: string,
  platform: TrafficPlatform,
  input: { views: string; attachmentIds?: string[] },
) {
  const { data } = await api.put<TrafficRecord>(
    `/payroll-periods/${periodId}/employees/${employeeId}/traffic/${platform}`,
    input,
  )
  return data
}

export async function selfConfirmTraffic(id: string) {
  const { data } = await api.post<TrafficRecord>(
    `/employee-traffic-records/${id}/self-confirm`,
  )
  return data
}

export async function leaderApproveTraffic(id: string) {
  const { data } = await api.post<TrafficRecord>(
    `/employee-traffic-records/${id}/leader-approve`,
  )
  return data
}

export async function leaderRejectTraffic(id: string, reason: string) {
  const { data } = await api.post<TrafficRecord>(
    `/employee-traffic-records/${id}/leader-reject`,
    { reason },
  )
  return data
}

export async function uploadTrafficEvidence(file: File) {
  const body = new FormData()
  body.append('file', file)
  const { data } = await api.post<TrafficAttachment>('/files', body)
  return data
}
