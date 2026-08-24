import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Banknote, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/auth/AuthContext'

export function LoginPage() {
  const { user, login } = useAuth()
  const [email, setEmail] = useState('admin@vcbsalary.vn')
  const [password, setPassword] = useState('Admin@123')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await login(email, password)
      toast.success('Đăng nhập thành công')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,oklch(0.45_0.12_157),oklch(0.22_0.05_157)_48%,oklch(0.16_0.03_157))] px-4">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-size-[48px_48px]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden flex-col justify-between bg-[linear-gradient(160deg,oklch(0.36_0.09_157),oklch(0.24_0.05_157))] p-10 text-white lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-white/15">
              <Banknote className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-100">Vietcombank</p>
              <p className="text-lg font-semibold">VCB Salary</p>
            </div>
          </div>
          <div>
            <h2 className="max-w-sm text-3xl font-semibold tracking-tight">
              Quản lý bảng lương hiện đại, minh bạch và đúng kỳ.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-emerald-50/80">
              Tính lương, duyệt chi và theo dõi chuyển khoản Vietcombank trên một giao diện thống nhất cho đội ngũ nhân sự.
            </p>
          </div>
          <p className="text-xs text-emerald-100/70">Chung niềm tin, vững tương lai</p>
        </div>
        <Card className="border-0 shadow-none ring-0">
          <CardHeader className="px-8 pt-10">
            <CardTitle className="text-2xl">Đăng nhập hệ thống</CardTitle>
            <CardDescription>
              Đăng nhập bằng tài khoản được cấp để vào hệ thống.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-10">
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                Đăng nhập
              </Button>
            </form>
            <div className="mt-6 rounded-xl bg-muted p-4 text-xs leading-5 text-muted-foreground">
              <p className="font-medium text-foreground">Tài khoản demo</p>
              <p>Admin: admin@vcbsalary.vn / Admin@123</p>
              <p>HR: hr@vcbsalary.vn / Admin@123</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
