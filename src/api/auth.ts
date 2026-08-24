import type { AuthUser } from '@/types'
import { api, CSRF_COOKIE } from '@/api/client'

export type LoginResponse = {
  user: AuthUser
}

export function hasSessionCookie() {
  return document.cookie.includes(`${CSRF_COOKIE}=`)
}

export async function loginApi(email: string, password: string) {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
  return data
}

export async function logoutApi() {
  try {
    await api.post('/auth/logout')
  } catch {
    /* ignore */
  }
}

export async function meApi() {
  const { data } = await api.get<AuthUser>('/auth/me')
  return data
}
