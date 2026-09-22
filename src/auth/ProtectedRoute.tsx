import { Navigate, Outlet } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/auth/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function PermissionRoute({ anyOf }: { anyOf: readonly string[] }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user || !anyOf.some((permission) => user.permissions.includes(permission))) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
