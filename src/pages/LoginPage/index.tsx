import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { BrandMark } from '@/components/shared/BrandMark'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/auth/AuthContext'

const DEMO_ACCOUNTS = [
  { label: 'Quản trị viên', email: 'admin@vcbsalary.vn' },
  { label: 'Nhân sự', email: 'hr@vcbsalary.vn' },
  { label: 'Kế toán', email: 'accountant@vcbsalary.vn' },
  { label: 'Quản lý duyệt', email: 'manager@vcbsalary.vn' },
  { label: 'Leader', email: 'leader@vcbsalary.vn' },
  { label: 'Editor', email: 'editor@vcbsalary.vn' },
  { label: 'Content Creator', email: 'creator@vcbsalary.vn' },
] as const
import { getApiErrorMessage } from '@/api/client'

export function LoginPage() {
  const { user, login } = useAuth()
  const [email, setEmail] = useState('admin@vcbsalary.vn')
  const [password, setPassword] = useState('Admin@123')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  if (user) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      toast.success('Đăng nhập thành công')
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#f1f6fc] p-4 sm:p-6">
      <div className="absolute -left-32 -top-36 size-[34rem] rounded-full bg-blue-200/40 blur-3xl" />
      <div className="absolute -bottom-44 -right-32 size-[36rem] rounded-full bg-sky-200/45 blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/80 bg-card shadow-[0_30px_90px_rgb(15_42_77/0.16)] lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[var(--brand-navy)] p-12 text-primary-foreground lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_5%,rgb(44_145_225/0.28),transparent_38%),radial-gradient(circle_at_0%_100%,rgb(35_180_150/0.14),transparent_38%)]" />
          <div className="absolute -right-20 -top-16 size-72 rounded-full border-[36px] border-white/[0.05]" />
          <div className="flex items-center gap-3">
            <BrandMark className="size-12 text-[var(--brand-gold)]" />
            <div>
              <p className="text-[10px] font-bold tracking-[0.15em] text-primary-foreground/70 uppercase">Viễn Chí Bảo</p>
              <p className="text-lg font-bold">VCB Salary</p>
            </div>
          </div>
          <div className="relative">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-sky-100"><Sparkles className="size-3.5" />Một nền tảng, trọn quy trình lương</span>
            <h2 className="max-w-md text-[2.35rem] font-bold leading-[1.15] tracking-[-0.035em]">
              Minh bạch hiệu suất.<br />Chính xác từng kỳ lương.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-primary-foreground/75">
              Theo dõi kỳ lương, KPI/OKR, doanh thu và quy trình phê duyệt trên một giao diện thống nhất cho đội ngũ nhân sự.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-sky-50 sm:grid-cols-2">
              <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-300" />Dữ liệu tập trung</span>
              <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-300" />Phân quyền rõ ràng</span>
            </div>
          </div>
          <p className="relative text-xs text-primary-foreground/60">© 2026 Viễn Chí Bảo · Payroll & Reward</p>
        </div>
        <Card className="rounded-none border-0 py-0 shadow-none ring-0">
          <CardHeader className="px-6 pt-7 sm:px-10 sm:pt-11">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-navy)]"><BrandMark className="size-[26px] text-[var(--brand-gold)]" /></span>
              <span><strong className="block text-base">VCB Salary</strong><small className="text-xs text-muted-foreground">Viễn Chí Bảo</small></span>
            </div>
            <p className="text-[10px] font-bold tracking-[0.14em] text-primary uppercase">Chào mừng trở lại</p>
            <CardTitle className="mt-2 text-2xl font-bold tracking-tight">Đăng nhập hệ thống</CardTitle>
            <CardDescription>
              Sử dụng tài khoản được cấp để tiếp tục công việc.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-7 sm:px-10 sm:pb-11">
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setError('') }}
                  placeholder="ten@vcbsalary.vn"
                  aria-invalid={Boolean(error)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} className="pr-11" aria-invalid={Boolean(error)} required />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground transition-colors hover:text-foreground" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {error ? <p className="rounded-lg bg-[var(--danger-50)] px-3 py-2 text-xs font-medium text-[var(--danger-700)]" role="alert" aria-live="polite">{error}</p> : null}
              <Button type="submit" className="mt-2 h-11 w-full" size="lg" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
              </Button>
            </form>
            <div className="mt-6 border-t border-border pt-5">
              <p className="mb-3 text-center text-xs font-medium text-muted-foreground">Đăng nhập nhanh bằng tài khoản demo</p>
              <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {DEMO_ACCOUNTS.map((account) => (
                  <button key={account.email} type="button" onClick={() => { setEmail(account.email); setPassword('Admin@123'); setError('') }} className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-secondary">
                    <strong className="block text-xs">{account.label}</strong><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{account.email}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
