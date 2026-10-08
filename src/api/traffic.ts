import type { Paginated } from '@/api/access-control'
import { api } from '@/api/client'

// OTHER = nền tảng nhập tay ngoài danh sách cố định, tên nằm ở TrafficRecord.platformName.
export type TrafficPlatform = 'TIKTOK' | 'FACEBOOK' | 'YOUTUBE' | 'INSTAGRAM' | 'OTHER'
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
  /** Chỉ có với nền tảng OTHER; nền tảng cố định là null. */
  platformName: string | null
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

export type CustomTrafficInput = {
  platformName: string
  views: string
  attachmentIds?: string[]
}

export async function createCustomTraffic(
  periodId: string,
  employeeId: string,
  input: CustomTrafficInput,
) {
  const { data } = await api.post<TrafficRecord>(
    `/payroll-periods/${periodId}/employees/${employeeId}/traffic/custom`,
    input,
  )
  return data
}

export async function updateCustomTraffic(id: string, input: CustomTrafficInput) {
  const { data } = await api.put<TrafficRecord>(`/employee-traffic-records/${id}`, input)
  return data
}

export async function deleteCustomTraffic(id: string) {
  await api.delete(`/employee-traffic-records/${id}`)
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
