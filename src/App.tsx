import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PermissionRoute, ProtectedRoute } from '@/auth/ProtectedRoute'
import { AuthProvider } from '@/auth/AuthContext'
import { PAGE_PERMISSIONS } from '@/auth/permission-config'
import { Skeleton } from '@/components/ui/skeleton'

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const PayrollPeriodsPage = lazy(() => import('@/pages/PayrollPeriodsPage').then((module) => ({ default: module.PayrollPeriodsPage })))
const KpiOkrPage = lazy(() => import('@/pages/KpiOkrPage').then((module) => ({ default: module.KpiOkrPage })))
const EmployeesPage = lazy(() => import('@/pages/EmployeesPage').then((module) => ({ default: module.EmployeesPage })))
const SalarySettingsPage = lazy(() => import('@/pages/SalarySettingsPage').then((module) => ({ default: module.SalarySettingsPage })))
const TrafficRevenuePage = lazy(() => import('@/pages/TrafficRevenuePage').then((module) => ({ default: module.TrafficRevenuePage })))
const SalaryRecordsPage = lazy(() => import('@/pages/SalaryRecordsPage').then((module) => ({ default: module.SalaryRecordsPage })))
const AuditPage = lazy(() => import('@/pages/AuditPage').then((module) => ({ default: module.AuditPage })))
const AccessControlPage = lazy(() => import('@/pages/AccessControlPage').then((module) => ({ default: module.AccessControlPage })))
const TeamPerformancePage = lazy(() => import('@/pages/TeamPerformancePage').then((module) => ({ default: module.TeamPerformancePage })))
const PayrollClosingPage = lazy(() => import('@/pages/PayrollClosingPage').then((module) => ({ default: module.PayrollClosingPage })))

function PageLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6" role="status" aria-label="Đang tải trang">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<HomePage />} />
                <Route path="payroll-periods" element={<PayrollPeriodsPage />} />
                <Route element={<PermissionRoute anyOf={PAGE_PERMISSIONS.kpiOkr} />}>
                  <Route path="kpi-okr" element={<KpiOkrPage />} />
                </Route>
                <Route element={<PermissionRoute anyOf={PAGE_PERMISSIONS.employees} />}>
                  <Route path="employees" element={<EmployeesPage />} />
                </Route>
                <Route element={<PermissionRoute anyOf={PAGE_PERMISSIONS.salarySettings} />}>
                  <Route path="salary-settings" element={<SalarySettingsPage />} />
                </Route>
                <Route element={<PermissionRoute anyOf={PAGE_PERMISSIONS.trafficRevenue} />}>
                  <Route path="traffic-revenue" element={<TrafficRevenuePage />} />
                </Route>
                <Route element={<PermissionRoute anyOf={PAGE_PERMISSIONS.salaryRecords} />}>
                  <Route path="salary-records" element={<SalaryRecordsPage />} />
                </Route>
                <Route element={<PermissionRoute anyOf={PAGE_PERMISSIONS.payrollClosing} />}>
                  <Route path="payroll-closing" element={<PayrollClosingPage />} />
                </Route>
                {/* Đồng bộ KPI/OKR đã gộp thành nút trên trang KPI & OKR; giữ đường dẫn cũ cho link đã lưu. */}
                <Route path="kpi-sync" element={<Navigate to="/kpi-okr" replace />} />
                <Route element={<PermissionRoute anyOf={PAGE_PERMISSIONS.audit} />}>
                  <Route path="audit" element={<AuditPage />} />
                </Route>
                <Route element={<PermissionRoute anyOf={PAGE_PERMISSIONS.accessControl} />}>
                  <Route path="access-control" element={<AccessControlPage />} />
                </Route>
                <Route element={<PermissionRoute anyOf={PAGE_PERMISSIONS.teamPerformance} />}>
                  <Route path="team-performance" element={<TeamPerformancePage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
