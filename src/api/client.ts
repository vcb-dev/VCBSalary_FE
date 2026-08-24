import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'

export const CSRF_COOKIE = 'vcbsalary_csrf'
const CSRF_HEADER = 'X-CSRF-Token'

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')}=([^;]*)`),
  )
  return match ? decodeURIComponent(match[1]) : null
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const csrf = readCookie(CSRF_COOKIE)
  if (csrf) {
    config.headers[CSRF_HEADER] = csrf
  }
  return config
})

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  try {
    await api.post('/auth/refresh')
    return true
  } catch {
    return false
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined
    const status = error.response?.status
    const url = original?.url ?? ''

    if (
      status === 401 &&
      original &&
      !original._retry &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh')
    ) {
      original._retry = true
      refreshPromise ??= tryRefresh().finally(() => {
        refreshPromise = null
      })
      const ok = await refreshPromise
      if (ok) {
        return api(original)
      }
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    const message =
      (error.response?.data as { message?: string | string[] } | undefined)?.message ??
      error.message ??
      'Có lỗi xảy ra, vui lòng thử lại'
    const text = Array.isArray(message) ? message.join(', ') : message

    if (status === 401) {
      if (url.includes('/auth/login')) {
        toast.error(text)
      }
    } else {
      toast.error(text)
    }

    return Promise.reject(error)
  },
)
