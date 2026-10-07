import {
  BarChart3,
  CalendarRange,
  ClipboardCheck,
  LayoutDashboard,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { PAGE_PERMISSIONS } from '@/auth/permission-config'

export type NavigationItem = {
  label: string
  /** Nhóm nghiệp vụ, dùng làm cấp breadcrumb trên header. */
  area: string
  icon: LucideIcon
  to: string
  anyOf?: readonly string[]
}

// Sidebar và tiêu đề header đọc chung một danh sách để tên trang không bị lệch nhau khi đổi nhãn.
export const WORKSPACE_NAVIGATION: NavigationItem[] = [
  { label: 'Tổng quan', area: 'Trung tâm điều hành', icon: LayoutDashboard, to: '/' },
  { label: 'Nhân sự & team', area: 'Tổ chức', icon: Users, to: '/employees', anyOf: PAGE_PERMISSIONS.employees },
  { label: 'Kỳ lương', area: 'Vận hành lương', icon: CalendarRange, to: '/payroll-periods' },
  { label: 'KPI & OKR', area: 'Hiệu suất', icon: Target, to: '/kpi-okr', anyOf: PAGE_PERMISSIONS.kpiOkr },
  {
    label: 'Traffic & doanh thu', area: 'Dữ liệu đầu vào', icon: BarChart3, to: '/traffic-revenue',
    anyOf: PAGE_PERMISSIONS.trafficRevenue,
  },
  {
    label: 'Hiệu suất team', area: 'Báo cáo', icon: TrendingUp, to: '/team-performance',
    anyOf: PAGE_PERMISSIONS.teamPerformance,
  },
  {
    label: 'Danh sách lương', area: 'Vận hành lương', icon: ReceiptText, to: '/salary-records',
    anyOf: PAGE_PERMISSIONS.salaryRecords,
  },
  {
    label: 'Chốt kỳ lương', area: 'Vận hành lương', icon: ClipboardCheck, to: '/payroll-closing',
    anyOf: PAGE_PERMISSIONS.payrollClosing,
  },
]

export const MANAGEMENT_NAVIGATION: NavigationItem[] = [
  {
    label: 'Cấu hình lương & thưởng', area: 'Quản trị hệ thống', icon: SlidersHorizontal, to: '/salary-settings',
    anyOf: PAGE_PERMISSIONS.salarySettings,
  },
  {
    label: 'Phân quyền & tài khoản', area: 'Quản trị hệ thống', icon: ShieldCheck, to: '/access-control',
    anyOf: PAGE_PERMISSIONS.accessControl,
  },
  { label: 'Nhật ký hoạt động', area: 'Kiểm soát', icon: ScrollText, to: '/audit', anyOf: PAGE_PERMISSIONS.audit },
]

const NAVIGATION_BY_PATH = new Map(
  [...WORKSPACE_NAVIGATION, ...MANAGEMENT_NAVIGATION].map((item) => [item.to, item]),
)

export function findNavigationItem(pathname: string) {
  return NAVIGATION_BY_PATH.get(pathname)
}

export function canShowNavigationItem(item: NavigationItem, permissions: readonly string[]) {
  return !item.anyOf || item.anyOf.some((permission) => permissions.includes(permission))
}
