import { Component, type ReactNode } from 'react'
import { ErrorState } from '@/components/shared/ErrorState'

/** Chunk của trang không còn trên máy chủ (thường do vừa deploy bản mới): chỉ tải lại trang mới hết. */
function isChunkLoadError(error: unknown) {
  return error instanceof Error
    && /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk/i.test(error.message)
}

/**
 * Lỗi render của một trang chỉ thay trang đó bằng thông báo lỗi, không làm trắng cả ứng dụng
 * (sidebar, thanh trên cùng vẫn dùng được để chuyển sang trang khác).
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    const chunkError = isChunkLoadError(error)
    return (
      <div className="p-4 sm:p-6">
        <ErrorState
          title={chunkError ? 'Hệ thống vừa được cập nhật' : 'Trang gặp lỗi khi hiển thị'}
          description={chunkError
            ? 'Tải lại trang để dùng phiên bản mới nhất.'
            : 'Bạn có thể thử lại, hoặc chuyển sang trang khác trên thanh điều hướng.'}
          onRetry={() => (chunkError ? window.location.reload() : this.setState({ error: null }))}
        />
      </div>
    )
  }
}
