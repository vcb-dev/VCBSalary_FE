import { api } from '@/api/client'

export type TeamPerformanceGoalSummary = {
  totalCount: number
  achievedCount: number
  notAchievedCount: number
  pendingCount: number
  averageProgressPercent: number | null
}

export type TeamPerformanceMember = {
  employeeId: string
  employeeCode: string
  employeeName: string
  jobTitle: string
  teamId: string
  teamName: string
  teams: Array<{
    id: string
    code: string
    name: string
    isPrimary: boolean
  }>
  visibility: {
    kpi: boolean
    okr: boolean
    revenue: boolean
    traffic: boolean
    salary: boolean
  }
  revenueAmount: string | null
  traffic: null | {
    acceptedViews: string
    completedPlatforms: number
    approvedPlatforms: number
    pendingPlatforms: number
    rejectedPlatforms: number
    ready: boolean
  }
  salary: null | {
    id: string
    status: 'PENDING' | 'WARNING' | 'LOCKED' | 'SUPERSEDED'
  }
  kpi: TeamPerformanceGoalSummary | null
  okr: TeamPerformanceGoalSummary | null
  isComplete: boolean
}

export type TeamPerformanceResponse = {
  period: {
    id: string
    code: string
    name: string
    status: 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'CLOSED'
  }
  scope: 'TEAM' | 'ALL'
  selectedTeamId: string | null
  achievementThresholdPercent: string | null
  capabilities: {
    kpi: boolean
    okr: boolean
    revenue: boolean
    traffic: boolean
    salary: boolean
  }
  teams: Array<{
    id: string
    code: string
    name: string
    memberCount: number
  }>
  summary: {
    memberCount: number
    revenue: {
      eligibleMemberCount: number
      readyCount: number
      totalAmount: string
    }
    traffic: {
      eligibleMemberCount: number
      readyCount: number
      acceptedViews: string
    }
    salary: {
      eligibleMemberCount: number
      lockedCount: number
    }
    kpi: TeamPerformanceGoalSummary
    okr: TeamPerformanceGoalSummary
    achievementCount: number
    notAchievedCount: number
  }
  members: TeamPerformanceMember[]
}

export async function getMyTeamPerformance(periodId: string) {
  const { data } = await api.get<TeamPerformanceResponse>(
    `/payroll-periods/${periodId}/leaders/me/team-performance`,
  )
  return data
}

export async function getTeamPerformance(periodId: string, teamId: string) {
  const { data } = await api.get<TeamPerformanceResponse>(
    `/payroll-periods/${periodId}/teams/${teamId}/performance`,
  )
  return data
}
