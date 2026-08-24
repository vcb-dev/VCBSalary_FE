import { Banknote, LogOut } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthContext'

export function AppLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_right,oklch(0.94_0.04_155),transparent_28%),linear-gradient(180deg,oklch(0.975_0.012_155),oklch(0.96_0.02_155))]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Banknote className="size-4" />
          </div>
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
              Vietcombank
            </p>
            <h1 className="text-lg font-semibold">VCB Salary</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{user?.fullName}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {user?.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân sự'}
          </span>
          <Button variant="outline" onClick={() => void logout()}>
            <LogOut className="size-4" />
            Đăng xuất
          </Button>
        </div>
      </header>
      <main className="px-4 py-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
