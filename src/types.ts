export type ScopeType = 'SELF' | 'TEAM' | 'ALL'

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED'

export type UserRoleAssignment = {
  roleId: string
  roleCode: string
  roleName: string
  scopeType: ScopeType
  scopeTeamId: string | null
}

export type AuthUser = {
  id: string
  employeeId: string | null
  email: string
  fullName: string
  status: UserStatus
  lastLoginAt: string | null
  roles: UserRoleAssignment[]
  permissions: string[]
}
