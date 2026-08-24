export type Role = 'ADMIN' | 'HR'

export type AuthUser = {
  id: string
  email: string
  fullName: string
  role: Role
}
