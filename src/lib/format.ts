const numberFormatter = new Intl.NumberFormat('vi-VN')
const dateFormatter = new Intl.DateTimeFormat('vi-VN')
const shortDateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' })
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

/** 1234567 → "1.234.567" */
export function formatNumber(value: number | string | null | undefined, fallback = '—') {
  const number = toNumber(value)
  return number === null ? fallback : numberFormatter.format(number)
}

/** 1234567 → "1.234.567 ₫" */
export function formatMoney(value: number | string | null | undefined, fallback = '—') {
  const number = toNumber(value)
  return number === null ? fallback : `${numberFormatter.format(Math.round(number))} ₫`
}

/** 2450000000 → "2,45 tỷ ₫" — dùng cho thẻ KPI, luôn kèm title đầy đủ khi hiển thị. */
export function formatCompactMoney(value: number | string | null | undefined, fallback = '—') {
  const number = toNumber(value)
  if (number === null) return fallback
  const absolute = Math.abs(number)
  if (absolute >= 1_000_000_000) return `${(number / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ ₫`
  if (absolute >= 1_000_000) return `${(number / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu ₫`
  return formatMoney(number)
}

/** "2025-09-19" → "19/9/2025" */
export function formatDate(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : dateFormatter.format(date)
}

/** "2025-09-19" → "19/09" */
export function formatShortDate(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : shortDateFormatter.format(date)
}

/** "2026-09-19T10:41:00Z" → "19/09/2026 10:41" */
export function formatDateTime(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : dateTimeFormatter.format(date)
}

/** Khoảng cách tới hiện tại theo cách nói thường ngày; quá 7 ngày thì trả về ngày cụ thể. */
export function formatRelativeTime(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const diffSeconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (diffSeconds < 0) return formatDateTime(value)
  if (diffSeconds < 60) return 'vừa xong'
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} phút trước`
  if (diffSeconds < 86_400) return `${Math.floor(diffSeconds / 3600)} giờ trước`
  if (diffSeconds < 604_800) return `${Math.floor(diffSeconds / 86_400)} ngày trước`
  return formatDate(value)
}

/** Số ngày còn lại tới mốc thời gian (âm nếu đã quá hạn), null nếu không xác định. */
export function daysUntil(value: string | null | undefined) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  const startOfDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((startOfDay(target) - startOfDay(new Date())) / 86_400_000)
}

/** Tỉ lệ phần trăm an toàn (0–100), trả 0 khi mẫu số bằng 0. */
export function toPercent(value: number, total: number) {
  if (!total || total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)))
}

/** Cộng dồn các chuỗi số thập phân trả về từ API. */
export function sumAmounts(values: Array<string | number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (toNumber(value) ?? 0), 0)
}
