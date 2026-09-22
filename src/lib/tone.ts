export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'muted'

/** Nền + chữ cho ô icon, chip. Dùng độ mờ nên hoạt động được trên cả nền sáng và nền tối. */
export const toneSurface: Record<Tone, string> = {
  info: 'bg-primary/10 text-primary',
  success: 'bg-[var(--success-500)]/14 text-[var(--success-600)]',
  warning: 'bg-[var(--warning-500)]/16 text-[var(--warning-600)]',
  danger: 'bg-[var(--danger-500)]/12 text-[var(--danger-600)]',
  muted: 'bg-muted text-muted-foreground',
}

/** Màu đặc cho thanh tiến trình, chấm trạng thái. */
export const toneSolid: Record<Tone, string> = {
  info: 'bg-primary',
  success: 'bg-[var(--success-500)]',
  warning: 'bg-[var(--warning-500)]',
  danger: 'bg-[var(--danger-500)]',
  muted: 'bg-muted-foreground/40',
}

/** Chỉ màu chữ, dùng cho icon nằm trong dòng văn bản. */
export const toneText: Record<Tone, string> = {
  info: 'text-primary',
  success: 'text-[var(--success-600)]',
  warning: 'text-[var(--warning-600)]',
  danger: 'text-[var(--danger-600)]',
  muted: 'text-muted-foreground',
}
