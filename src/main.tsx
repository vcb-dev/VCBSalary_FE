import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import App from './App.tsx'
import './index.css'

// Mỗi lần deploy, file JS của các trang đổi tên; tab đang mở bấm sang trang chưa tải sẽ không tìm thấy
// file cũ. Tải lại một lần để nhận index.html mới; nếu vừa tải lại mà vẫn lỗi thì để RouteErrorBoundary
// hiện thông báo thay vì tải lại vô hạn.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'vcb-chunk-reload-at'
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 10_000) return
    sessionStorage.setItem(key, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <App />
          <Toaster position="top-right" richColors />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
