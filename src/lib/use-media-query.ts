import { useCallback, useSyncExternalStore } from 'react'

/**
 * Theo dõi một media query để component biết đang ở nhánh layout nào — dùng cho các hành vi mà
 * class `lg:` không diễn tả được (ví dụ chỉ bật tooltip khi sidebar thật sự thu gọn thành rail).
 */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
