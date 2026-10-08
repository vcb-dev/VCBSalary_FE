import { Globe } from 'lucide-react'
import { PLATFORM_PATH, type PlatformKey } from '@/lib/platform'
import { cn } from '@/lib/utils'

export function PlatformIcon({ platform, className }: { platform: PlatformKey; className?: string }) {
  // Nền tảng thêm tay không có logo riêng.
  if (platform === 'OTHER') return <Globe aria-hidden="true" className={cn('size-4', className)} />

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn('size-4', className)}
    >
      <path d={PLATFORM_PATH[platform]} />
    </svg>
  )
}
