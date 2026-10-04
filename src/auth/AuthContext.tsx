/* oxlint-disable react/only-export-components -- provider và hook phải dùng chung đúng một context singleton */
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { hasSessionCookie, loginApi, logoutApi, meApi } from '@/api/auth'
import type { AuthUser } from '@/types'

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshUser: () => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const currentUserIdRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)

  const applyAuthenticatedUser = useCallback((nextUser: AuthUser | null) => {
    const identityChanged = currentUserIdRef.current !== null && currentUserIdRef.current !== nextUser?.id
    if (identityChanged) queryClient.clear()
    currentUserIdRef.current = nextUser?.id ?? null
    setUser(nextUser)
  }, [queryClient])

  const refreshUser = useCallback(async () => {
    if (!hasSessionCookie()) {
      if (currentUserIdRef.current !== null) queryClient.clear()
      currentUserIdRef.current = null
      setUser(null)
      return null
    }
    try {
      const me = await meApi()
      applyAuthenticatedUser(me)
      return me
    } catch {
      queryClient.clear()
      currentUserIdRef.current = null
      setUser(null)
      return null
    }
  }, [applyAuthenticatedUser, queryClient])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      if (!hasSessionCookie()) {
        if (!cancelled) {
          setUser(null)
          setLoading(false)
        }
        return
      }

      try {
        const me = await meApi()
        if (!cancelled) applyAuthenticatedUser(me)
      } catch {
        if (!cancelled) {
          queryClient.clear()
          currentUserIdRef.current = null
          setUser(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [applyAuthenticatedUser, queryClient])

  useEffect(() => {
    const refresh = () => void refreshUser()
    const intervalId = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refresh)
    }
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginApi(email, password)
    // Không tái sử dụng dữ liệu đã cache theo scope của tài khoản đăng nhập trước đó.
    queryClient.clear()
    currentUserIdRef.current = data.user.id
    setUser(data.user)
    setLoading(false)
    return data.user
  }, [queryClient])

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } finally {
      queryClient.clear()
      currentUserIdRef.current = null
      setUser(null)
    }
  }, [queryClient])

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser }),
    [user, loading, login, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
