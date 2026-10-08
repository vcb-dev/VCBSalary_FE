import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'

export const CSRF_COOKIE = 'vcbsalary_csrf'
const CSRF_HEADER = 'X-CSRF-Token'

/** Trích thông điệp lỗi dễ đọc từ response của backend (kể cả lỗi validate nhiều dòng). */
export function getApiErrorMessage(error: unknown, fallback = 'Có lỗi xảy ra, vui lòng thử lại') {
  const err = error as AxiosError<{
    message?: string | string[]
    details?: { errors?: string[] }
  }>
  const data = err?.response?.data
  if (data?.details?.errors?.length) return data.details.errors.join(', ')
  const message = data?.message
  if (Array.isArray(message)) return message.join(', ')
  return message ?? err?.message ?? fallback
}

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

// Các khóa nghiệp vụ trong database là số tự tăng, nhưng FE giữ chúng ở dạng chuỗi để tương thích
// tự nhiên với value của select/input và URL. Chuẩn hóa tại một chỗ giúp tránh so sánh `1 !== "1"`.
// Sửa thẳng trên object JSON vừa parse (không ai khác giữ nó) thay vì dựng lại cả cây: response lớn
// như bảng lương cả kỳ không còn bị nhân đôi bộ nhớ chỉ để đổi vài khóa id.
function normalizeIds(value: unknown, key = ''): unknown {
  // File export phải giữ nguyên binary response.
  if (value instanceof Blob || value instanceof ArrayBuffer) return value
  if (typeof value === 'number' && (key === 'id' || key.endsWith('Id'))) {
    return String(value)
  }
  if (Array.isArray(value)) {
    const itemKey = key.endsWith('Ids') ? 'id' : ''
    for (let index = 0; index < value.length; index += 1) value[index] = normalizeIds(value[index], itemKey)
    return value
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const childKey of Object.keys(record)) record[childKey] = normalizeIds(record[childKey], childKey)
    return record
  }
  return value
}

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
  (response) => {
    response.data = normalizeIds(response.data)
    return response
  },
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
