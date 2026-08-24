import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/auth/AuthContext'

export function HomePage() {
  const { user } = useAuth()

  return (
    <Card className="mx-auto max-w-xl bg-white/90">
      <CardHeader>
        <CardTitle>Phiên đăng nhập</CardTitle>
        <CardDescription>
          Module auth đã sẵn sàng. Các module khác sẽ thêm khi bạn yêu cầu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">Họ tên:</span> {user?.fullName}
        </p>
        <p>
          <span className="text-muted-foreground">Email:</span> {user?.email}
        </p>
        <p>
          <span className="text-muted-foreground">Vai trò:</span> {user?.role}
        </p>
      </CardContent>
    </Card>
  )
}
