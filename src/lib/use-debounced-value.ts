import { useEffect, useState } from 'react'

/**
 * Giá trị chỉ "chốt" sau khi ngừng thay đổi một lúc — dùng cho ô tìm kiếm gọi API,
 * để gõ từng ký tự không bắn mỗi ký tự một request.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
