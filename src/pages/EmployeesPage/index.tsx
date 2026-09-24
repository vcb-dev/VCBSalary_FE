import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Building2, CheckCircle2, ChevronDown, FolderTree, KeyRound, Link2, ListX, Loader2, Network, Plus, RefreshCw, Search, SlidersHorizontal, Trash2, Unlink, UserCheck, UserX, UsersRound, X, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { createUser, listRoles, listUsers, updateUser, type UserSummary } from '@/api/access-control'
import {
  createEmployeeGroup,
  deleteEmployeeGroup,
  listEmployeeGroups,
  updateEmployeeGroup,
  type EmployeeGroup,
  type EmployeeGroupStatus,
} from '@/api/employee-groups'
import { triggerAllOrganizationSync, type OrganizationSyncBatchResult } from '@/api/organization-sync'
import {
  createDepartment,
  createEmployee,
  createTeam,
  deactivateEmployeeTeamMembership,
  deleteDepartment,
  deleteTeam,
  getApiErrorMessage,
  listDepartments,
  listEmployees,
  listTeams,
  updateDepartment,
  updateEmployee,
  updateTeam,
  upsertEmployeeTeamMembership,
  type Department,
  type DepartmentStatus,
  type Employee,
  type EmploymentStatus,
  type Team,
  type TeamStatus,
} from '@/api/organization'
import { useAuth } from '@/auth/AuthContext'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatNumber } from '@/lib/format'
import { toneSurface } from '@/lib/tone'

const ORG_KEYS = {
  employees: ['org', 'employees'] as const,
  departments: ['org', 'departments'] as const,
  teams: ['org', 'teams'] as const,
  employeeGroups: ['org', 'employee-groups'] as const,
}

const EMPLOYEES_PAGE_SIZE = 100
const USERS_PAGE_SIZE = 100
const NONE = '__none__'
const ALL = '__all__'
const ORG_STRUCTURE_ID = 'org-structure'

/** Bộ lọc theo tình trạng tài khoản đăng nhập của nhân sự. */
type AccountFilter = typeof ALL | 'MISSING' | 'LINKED'
type OrganizationView = 'structure' | 'groups'

const EMPLOYMENT_STATUSES: EmploymentStatus[] = ['ACTIVE', 'INACTIVE', 'LEFT']
const TEAM_STATUSES: TeamStatus[] = ['ACTIVE', 'INACTIVE']
const DEPARTMENT_STATUSES: DepartmentStatus[] = ['ACTIVE', 'INACTIVE']

const EMP_STATUS_LABEL: Record<EmploymentStatus, string> = {
  ACTIVE: 'Đang làm việc',
  INACTIVE: 'Tạm ngưng',
  LEFT: 'Đã nghỉ',
}
const EMP_STATUS_TONE: Record<EmploymentStatus, 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  LEFT: 'danger',
}
const TEAM_STATUS_LABEL: Record<TeamStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
}
const TEAM_STATUS_TONE: Record<TeamStatus, 'success' | 'muted'> = {
  ACTIVE: 'success',
  INACTIVE: 'muted',
}
const DEPARTMENT_STATUS_LABEL: Record<DepartmentStatus, string> = TEAM_STATUS_LABEL
const DEPARTMENT_STATUS_TONE: Record<DepartmentStatus, 'success' | 'muted'> = TEAM_STATUS_TONE

type QueryLike = {
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(-2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
}

function findTeamLeaderId(teamId: string, employees: Employee[]) {
  const leaderReferenceCounts = new Map<string, number>()

  for (const employee of employees) {
    if (employee.teamId !== teamId || !employee.leaderEmployeeId) continue
    leaderReferenceCounts.set(
      employee.leaderEmployeeId,
      (leaderReferenceCounts.get(employee.leaderEmployeeId) ?? 0) + 1,
    )
  }

  let leaderId: string | null = null
  let highestReferenceCount = 0
  for (const [candidateId, referenceCount] of leaderReferenceCounts) {
    if (referenceCount > highestReferenceCount) {
      leaderId = candidateId
      highestReferenceCount = referenceCount
    }
  }

  return leaderId
}

/**
 * Danh sách nhân sự cho các dropdown chọn người phụ trách (Leader/Manager). Trang Nhân sự vẫn phải
 * tải cả người đã nghỉ cho bộ lọc và thẻ thống kê, nên việc loại LEFT làm ngay tại chỗ đổ option.
 * `keepIds` giữ lại lựa chọn hiện có của hồ sơ đang mở — nếu người phụ trách cũ đã nghỉ mà bị loại
 * khỏi option thì Select sẽ hiện trống và lần lưu tiếp theo sẽ âm thầm xóa mất liên kết đó.
 */
/**
 * Danh sách nhân sự được lọc/tìm kiếm phía client, nên phải tải đủ mọi trang.
 * Nếu chỉ lấy trang đầu, người tìm kiếm sẽ nhận kết quả thiếu mà không hề biết.
 */
async function loadAllEmployees() {
  const first = await listEmployees({ page: 1, pageSize: EMPLOYEES_PAGE_SIZE })
  if (first.meta.totalPages <= 1) return first
  const rest = await Promise.all(
    Array.from({ length: first.meta.totalPages - 1 }, (_, index) =>
      listEmployees({ page: index + 2, pageSize: EMPLOYEES_PAGE_SIZE })),
  )
  return { ...first, data: [first, ...rest].flatMap((page) => page.data) }
}

function assignableEmployees(
  employees: Employee[],
  excludeId: string | undefined,
  keepIds: Array<string | null | undefined>,
) {
  const kept = new Set(keepIds.filter((id): id is string => Boolean(id) && id !== NONE))
  return employees.filter(
    (item) => item.id !== excludeId && (item.employmentStatus !== 'LEFT' || kept.has(item.id)),
  )
}

export function EmployeesPage() {
  const { user } = useAuth()
  const can = (permission: string) => user?.permissions.includes(permission) ?? false
  const canView = can('employee.view_all') || can('employee.view_team')
  const canManage = can('employee.manage')
  const canViewAllOrganization = can('employee.view_all') || canManage
  // Gắn tài khoản đăng nhập với nhân sự là hành động trên domain User — gate theo `user.manage`
  // (giống hệt quyền cần để tạo/sửa tài khoản ở trang Phân quyền & tài khoản), không phải
  // `employee.manage`.
  const canManageUsers = can('user.manage')
  const [accountFilter, setAccountFilter] = useState<AccountFilter>(ALL)
  const [activeView, setActiveView] = useState<OrganizationView>('structure')

  function focusEmployeesWithoutAccount() {
    setActiveView('structure')
    setAccountFilter('MISSING')
    requestAnimationFrame(() => {
      document.getElementById(ORG_STRUCTURE_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const employeesQuery = useQuery({
    queryKey: [...ORG_KEYS.employees, { pageSize: EMPLOYEES_PAGE_SIZE }],
    queryFn: loadAllEmployees,
    enabled: canView,
  })
  const teamsQuery = useQuery({ queryKey: ORG_KEYS.teams, queryFn: listTeams })
  const departmentsQuery = useQuery({ queryKey: ORG_KEYS.departments, queryFn: listDepartments })
  // Dùng chung query key với trang Phân quyền & tài khoản — react-query dedupe.
  const usersQuery = useQuery({
    queryKey: ['ac', 'users', { pageSize: USERS_PAGE_SIZE }],
    queryFn: () => listUsers({ page: 1, pageSize: USERS_PAGE_SIZE }),
    enabled: canManageUsers,
  })

  const employees = employeesQuery.data?.data ?? []
  const totalEmployees = employeesQuery.data?.meta.total ?? 0
  const allTeams = teamsQuery.data ?? []
  const allDepartments = departmentsQuery.data ?? []
  const scopedTeamIds = new Set(
    employees.flatMap((employee) =>
      employee.teamMemberships?.length
        ? employee.teamMemberships.map((membership) => membership.teamId)
        : [employee.teamId],
    ),
  )
  const teams = canViewAllOrganization
    ? allTeams
    : allTeams.filter((team) => scopedTeamIds.has(team.id))
  const scopedDepartmentIds = new Set(teams.map((team) => team.departmentId))
  const departments = canViewAllOrganization
    ? allDepartments
    : allDepartments.filter((department) => scopedDepartmentIds.has(department.id))
  // Tài khoản chưa gắn nhân sự nào — dùng cho nhánh "gắn tài khoản có sẵn" trong LinkAccountDialog.
  const orphanUsers = (usersQuery.data?.data ?? []).filter((account) => !account.employeeId)
  // Nhân sự chưa có tài khoản đăng nhập — họ chưa tự xác nhận được KPI/OKR hay xem lương của mình.
  const employeesWithoutAccount = employees.filter((item) => !item.user)

  const activeEmployees = employees.filter((item) => item.employmentStatus === 'ACTIVE').length
  const leftEmployees = employees.filter((item) => item.employmentStatus === 'LEFT').length
  const activeTeams = teams.filter((team) => team.status === 'ACTIVE').length
  const activeDepartments = departments.filter((department) => department.status === 'ACTIVE').length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Tổ chức"
        title="Nhân sự & team"
        description="Quản lý hồ sơ, cơ cấu team và phạm vi tính lương tại một nơi."
        action={
          canManage ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <SyncOrganizationDialog />
              <CreateEmployeeDialog teams={teams} employees={employees} canManageUsers={canManageUsers} />
            </div>
          ) : undefined
        }
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="Tổng quan tổ chức">
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <OrganizationMetric
            icon={UserCheck}
            label="Đang làm việc"
            value={canView ? formatNumber(activeEmployees) : '—'}
            detail={canView ? `Trên tổng ${formatNumber(totalEmployees)} hồ sơ` : 'Cần quyền xem nhân sự'}
            loading={canView && employeesQuery.isLoading}
          />
          <OrganizationMetric
            icon={Building2}
            label="Phòng ban"
            value={formatNumber(activeDepartments)}
            detail={`Trên tổng ${formatNumber(departments.length)}`}
            loading={departmentsQuery.isLoading}
          />
          <OrganizationMetric
            icon={Network}
            label="Team"
            value={formatNumber(activeTeams)}
            detail={`Trên tổng ${formatNumber(teams.length)}`}
            loading={teamsQuery.isLoading}
          />
          {canManageUsers ? (
            <OrganizationMetric
              icon={employeesWithoutAccount.length > 0 ? UserX : CheckCircle2}
              label="Chưa có tài khoản"
              value={formatNumber(employeesWithoutAccount.length)}
              detail={employeesWithoutAccount.length > 0 ? 'Cần xử lý để nhân sự xem lương' : 'Tất cả đã sẵn sàng'}
              loading={canView && employeesQuery.isLoading}
              onSelect={employeesWithoutAccount.length > 0 ? focusEmployeesWithoutAccount : undefined}
              attention={employeesWithoutAccount.length > 0}
            />
          ) : (
            <OrganizationMetric
              icon={UserX}
              label="Đã nghỉ việc"
              value={canView ? formatNumber(leftEmployees) : '—'}
              detail="Hồ sơ không còn hoạt động"
              loading={canView && employeesQuery.isLoading}
            />
          )}
        </div>
      </section>

      {!canView ? (
        <PermissionNotice permission="employee.view_team | employee.view_all" />
      ) : null}

      {canManage ? (
        <nav className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1" aria-label="Nội dung quản lý nhân sự">
          <button
            type="button"
            onClick={() => setActiveView('structure')}
            aria-current={activeView === 'structure' ? 'page' : undefined}
            className={`flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors ${activeView === 'structure' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Network className="size-4" /> Cơ cấu tổ chức
          </button>
          <button
            type="button"
            onClick={() => setActiveView('groups')}
            aria-current={activeView === 'groups' ? 'page' : undefined}
            className={`flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors ${activeView === 'groups' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <UsersRound className="size-4" /> Nhóm nghiệp vụ
          </button>
        </nav>
      ) : null}

      {activeView === 'structure' || !canManage ? (
        <OrganizationTab
          query={teamsQuery}
          departmentsQuery={departmentsQuery}
          employeesQuery={employeesQuery}
          departments={departments}
          teams={teams}
          employees={employees}
          totalEmployees={totalEmployees}
          canViewEmployees={canView}
          employeesLoading={canView && employeesQuery.isLoading}
          canManage={canManage}
          canManageUsers={canManageUsers}
          orphanUsers={orphanUsers}
          accountFilter={accountFilter}
          onAccountFilterChange={setAccountFilter}
        />
      ) : (
        <EmployeeGroupsCard departments={departments} canManage />
      )}
    </div>
  )
}

function OrganizationMetric({
  icon: Icon,
  label,
  value,
  detail,
  loading,
  onSelect,
  attention = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  loading?: boolean
  onSelect?: () => void
  attention?: boolean
}) {
  const content = (
    <div className="flex min-h-22 items-center gap-3 bg-card px-5 py-4 text-left transition-colors group-hover:bg-muted/40 sm:min-h-24 lg:px-6">
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${attention ? toneSurface.warning : toneSurface.info}`}>
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <strong className="mt-0.5 block text-xl font-bold tracking-tight text-foreground tabular-nums">{value}</strong>}
        <p className={`mt-1 truncate text-xs ${attention ? 'font-medium text-[var(--warning-700)]' : 'text-muted-foreground'}`}>{detail}</p>
      </div>
    </div>
  )

  return onSelect ? (
    <button type="button" className="group w-full bg-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" onClick={onSelect}>
      {content}
    </button>
  ) : content
}

function syncResultMessage(result: OrganizationSyncBatchResult) {
  if (result.totalTeams === 0) return 'VCBI hiện không có team nào để đồng bộ.'
  return `Đã xử lý ${result.totalTeams} team: ${result.successfulTeams} thành công, ${result.partialTeams} một phần, ${result.failedTeams} thất bại.`
}

function SyncOrganizationDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: triggerAllOrganizationSync,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employees })
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.teams })
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.departments })
      void queryClient.invalidateQueries({ queryKey: ['ac', 'users'] })

      const message = syncResultMessage(result)
      if (result.failedTeams > 0 || result.partialTeams > 0) toast.warning(message)
      else toast.success(message)

      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function handleOpenChange(next: boolean) {
    if (next) {
      setFormError(null)
      mutation.reset()
    }
    setOpen(next)
  }

  function submit() {
    setFormError(null)
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RefreshCw className="size-4" />
          Đồng bộ tất cả team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đồng bộ nhân sự từ VCBI</DialogTitle>
          <DialogDescription>
            Hệ thống sẽ lấy toàn bộ team từ VCBI và cập nhật nhân sự cùng quan hệ Leader/Manager theo dữ liệu mới nhất.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="font-semibold text-foreground">Phạm vi đồng bộ</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Tất cả team, kể cả team chưa từng xuất hiện trong hệ thống lương. Một team gặp lỗi sẽ không làm dừng các team còn lại.
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Team và nhân sự lấy về được tự động xếp vào phòng Marketing. Thay đổi áp dụng ngay cho phạm vi dữ liệu SELF/TEAM/ALL.
            </p>
          </div>

          {formError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Không thể đồng bộ</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button type="button" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {mutation.isPending ? 'Đang đồng bộ...' : 'Bắt đầu đồng bộ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Một khung duy nhất cho cả tổ chức: cây Phòng ban → Team → Nhân sự, kèm tìm kiếm nhân sự và
 * các thao tác trên từng người (sửa hồ sơ, gắn tài khoản) vốn nằm ở tab "Danh sách nhân sự" cũ.
 * Khi đang lọc, cây tự bung ra để thấy ngay kết quả và chỉ giữ lại phòng ban/team có người khớp.
 */
function OrganizationTab({
  query,
  departmentsQuery,
  employeesQuery,
  departments,
  teams,
  employees,
  totalEmployees,
  canViewEmployees,
  employeesLoading,
  canManage,
  canManageUsers,
  orphanUsers,
  accountFilter,
  onAccountFilterChange,
}: {
  query: QueryLike
  departmentsQuery: QueryLike
  employeesQuery: QueryLike
  departments: Department[]
  teams: Team[]
  employees: Employee[]
  totalEmployees: number
  canViewEmployees: boolean
  employeesLoading: boolean
  canManage: boolean
  canManageUsers: boolean
  orphanUsers: UserSummary[]
  accountFilter: AccountFilter
  onAccountFilterChange: (value: AccountFilter) => void
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [departmentFilter, setDepartmentFilter] = useState<string>(ALL)
  const [expandedDepartmentId, setExpandedDepartmentId] = useState<string | null>(null)
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)

  // Chọn một phòng ban cụ thể thì mở sẵn phòng ban đó, người dùng vẫn thu gọn lại được.
  function changeDepartmentFilter(value: string) {
    setDepartmentFilter(value)
    if (value !== ALL) setExpandedDepartmentId(value)
  }

  const departmentIdByTeamId = useMemo(
    () => new Map(teams.map((team) => [team.id, team.departmentId])),
    [teams],
  )

  // Lọc theo người (tên/trạng thái/tài khoản) thì kết quả nằm rải rác khắp cây — lúc đó hiển thị
  // danh sách phẳng để tìm được ngay. Lọc theo phòng ban chỉ thu hẹp cây nên vẫn giữ dạng cây.
  const showFlatResults = search.trim() !== '' || statusFilter !== ALL || accountFilter !== ALL
  const isFiltering = showFlatResults || departmentFilter !== ALL
  const activeFilterCount = [search.trim() !== '', statusFilter !== ALL, departmentFilter !== ALL, accountFilter !== ALL]
    .filter(Boolean).length

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase()
    return employees.filter((item) => {
      if (statusFilter !== ALL && item.employmentStatus !== statusFilter) return false
      if (accountFilter === 'MISSING' && item.user) return false
      if (accountFilter === 'LINKED' && !item.user) return false
      if (departmentFilter !== ALL) {
        const teamIds = item.teamMemberships?.length
          ? item.teamMemberships.map((membership) => membership.teamId)
          : [item.teamId]
        if (!teamIds.some((teamId) => departmentIdByTeamId.get(teamId) === departmentFilter)) return false
      }
      if (!term) return true
      return (
        item.fullName.toLowerCase().includes(term) ||
        item.jobTitle.toLowerCase().includes(term) ||
        item.employeeCode.toLowerCase().includes(term)
      )
    })
  }, [accountFilter, departmentFilter, departmentIdByTeamId, employees, search, statusFilter])

  // membersByTeam: người khớp bộ lọc (để hiển thị). totalByTeam: tổng thật, dùng cho số đếm khi
  // không lọc và cho rào chặn xoá team — nếu lấy số đã lọc, nút xoá sẽ mở nhầm.
  const membersByTeam = useMemo(() => groupEmployeesByTeam(filteredEmployees), [filteredEmployees])
  const totalByTeam = useMemo(() => groupEmployeesByTeam(employees), [employees])

  const visibleDepartments = useMemo(
    () =>
      departments
        .filter((department) => departmentFilter === ALL || department.id === departmentFilter)
        .map((department) => {
          const departmentTeams = teams.filter((team) => team.departmentId === department.id)
          return {
            department,
            visibleTeams: showFlatResults
              ? departmentTeams.filter((team) => (membersByTeam.get(team.id) ?? []).length > 0)
              : departmentTeams,
          }
        })
        .filter((row) => !showFlatResults || row.visibleTeams.length > 0),
    [departmentFilter, departments, membersByTeam, showFlatResults, teams],
  )

  function clearFilters() {
    setSearch('')
    setStatusFilter(ALL)
    setDepartmentFilter(ALL)
    onAccountFilterChange(ALL)
  }

  const summary = canViewEmployees
    ? isFiltering
      ? `${formatNumber(filteredEmployees.length)}/${formatNumber(employees.length)} nhân sự khớp bộ lọc`
      : `${formatNumber(totalEmployees)} nhân sự`
    : 'Cần quyền xem nhân sự'

  return (
    <Card id={ORG_STRUCTURE_ID} className="scroll-mt-24 overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-5 border-b border-border p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight">Cơ cấu tổ chức</h2>
              <p className="mt-1 text-sm text-muted-foreground">Mở phòng ban để xem team và thành viên · {summary}</p>
            </div>
            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <CreateDepartmentDialog />
                <CreateTeamDialog departments={departments} />
              </div>
            ) : null}
          </div>

          {canViewEmployees ? (
            <div className="flex flex-col gap-3">
              <div className={`grid gap-2 sm:grid-cols-2 ${canManageUsers ? 'xl:grid-cols-[minmax(17rem,1.5fr)_11rem_13rem_13rem]' : 'xl:grid-cols-[minmax(17rem,1.5fr)_11rem_13rem]'}`}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    className="w-full min-w-0 bg-card pr-9 pl-9 shadow-none"
                    placeholder="Tìm tên, mã nhân viên hoặc chức danh…"
                    aria-label="Tìm nhân sự"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Xoá từ khoá tìm kiếm"
                      className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full bg-card shadow-none" aria-label="Lọc theo trạng thái làm việc">
                    <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <SelectValue placeholder="Trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
                    {EMPLOYMENT_STATUSES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {EMP_STATUS_LABEL[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={departmentFilter} onValueChange={changeDepartmentFilter}>
                  <SelectTrigger className="w-full bg-card shadow-none" aria-label="Lọc theo phòng ban">
                    <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <SelectValue placeholder="Phòng ban" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Mọi phòng ban</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {canManageUsers ? (
                  <Select value={accountFilter} onValueChange={(value) => onAccountFilterChange(value as AccountFilter)}>
                    <SelectTrigger className="w-full bg-card shadow-none" aria-label="Lọc theo tài khoản đăng nhập">
                      <KeyRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      <SelectValue placeholder="Tài khoản" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Mọi tài khoản</SelectItem>
                      <SelectItem value="MISSING">Chưa có tài khoản</SelectItem>
                      <SelectItem value="LINKED">Đã có tài khoản</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              {isFiltering ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="grid size-5 place-items-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">{activeFilterCount}</span>
                    <span><strong className="text-foreground">{formatNumber(filteredEmployees.length)}</strong> nhân sự phù hợp{showFlatResults ? ' · hiển thị dạng danh sách' : ''}</span>
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters}>
                    <X className="size-3.5" aria-hidden="true" />
                    Đặt lại bộ lọc
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {query.isError || departmentsQuery.isError || employeesQuery.isError ? (
          <QueryError
            error={query.error ?? departmentsQuery.error ?? employeesQuery.error}
            onRetry={() => {
              void query.refetch()
              void departmentsQuery.refetch()
              void employeesQuery.refetch()
            }}
          />
        ) : query.isLoading || departmentsQuery.isLoading || employeesLoading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-22 w-full" />)}</div>
        ) : departments.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Chưa có phòng ban nào"
            description="Tạo phòng ban trước, sau đó thêm team và xếp nhân sự vào team để hệ thống tính được phạm vi dữ liệu."
            action={canManage ? <CreateDepartmentDialog /> : undefined}
          />
        ) : showFlatResults ? (
          filteredEmployees.length === 0 ? (
            <EmptyState
              icon={ListX}
              title="Không có nhân sự phù hợp"
              description="Không tìm thấy nhân sự nào khớp với từ khoá và bộ lọc hiện tại. Hãy nới bộ lọc hoặc kiểm tra lại từ khoá."
              action={<Button variant="outline" onClick={clearFilters}><X className="size-4" />Xoá bộ lọc</Button>}
            />
          ) : (
            <div className="p-3 sm:p-5">
              <TeamMemberList
                members={filteredEmployees}
                canManage={canManage}
                canManageUsers={canManageUsers}
                orphanUsers={orphanUsers}
                teamOptions={teams}
                employees={employees}
                heading="Kết quả tìm kiếm"
                subheading={`${formatNumber(filteredEmployees.length)} nhân sự khớp bộ lọc, gộp từ mọi phòng ban và team`}
              />
            </div>
          )
        ) : visibleDepartments.length === 0 ? (
          <EmptyState
            icon={ListX}
            title="Không có phòng ban phù hợp"
            description="Bộ lọc phòng ban hiện tại không khớp dữ liệu nào."
            action={<Button variant="outline" onClick={clearFilters}><X className="size-4" />Xoá bộ lọc</Button>}
          />
        ) : (
          <div className="space-y-3 bg-muted/30 p-3 sm:p-4">
            {visibleDepartments.map(({ department, visibleTeams }) => (
              <DepartmentSection
                key={department.id}
                department={department}
                teams={visibleTeams}
                membersByTeam={membersByTeam}
                totalByTeam={totalByTeam}
                canViewEmployees={canViewEmployees}
                employeesLoading={employeesLoading}
                expandedTeamId={expandedTeamId}
                setExpandedTeamId={setExpandedTeamId}
                canManage={canManage}
                canManageUsers={canManageUsers}
                orphanUsers={orphanUsers}
                teamOptions={teams}
                employees={employees}
                departments={departments}
                isFiltering={false}
                expanded={expandedDepartmentId === department.id}
                onToggle={() =>
                  setExpandedDepartmentId((current) => (current === department.id ? null : department.id))
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function groupEmployeesByTeam(list: Employee[]) {
  const grouped = new Map<string, Employee[]>()
  for (const item of list) {
    const teamIds = item.teamMemberships?.length
      ? item.teamMemberships.map((membership) => membership.teamId)
      : [item.teamId]
    for (const teamId of new Set(teamIds)) {
      const members = grouped.get(teamId) ?? []
      members.push(item)
      grouped.set(teamId, members)
    }
  }
  return grouped
}

function EmployeeGroupsCard({
  departments,
  canManage,
}: {
  departments: Department[]
  canManage: boolean
}) {
  const groupsQuery = useQuery({
    queryKey: ORG_KEYS.employeeGroups,
    queryFn: () => listEmployeeGroups(),
  })
  const groups = groupsQuery.data ?? []

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 lg:p-6">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight">Nhóm nghiệp vụ</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Quy định cách tự động gán KPI khi mở kỳ lương theo phòng ban và chức danh.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">{formatNumber(groups.length)} nhóm</span>
            {canManage && <CreateEmployeeGroupDialog departments={departments} />}
          </div>
        </div>

        {groupsQuery.isError ? (
          <QueryError error={groupsQuery.error} onRetry={() => void groupsQuery.refetch()} />
        ) : groupsQuery.isLoading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={ListX}
            title="Chưa có nhóm nghiệp vụ nào"
            description="Tạo nhóm cho từng phòng ban để dùng được cơ chế tự gán KPI khi mở kỳ lương."
            action={canManage ? <CreateEmployeeGroupDialog departments={departments} /> : undefined}
          />
        ) : (
          <ul className="divide-y divide-border">
            {groups.map((group) => (
              <li key={group.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{group.name}</span>
                    <StatusBadge tone={group.status === 'ACTIVE' ? 'success' : 'muted'}>
                      {group.status === 'ACTIVE' ? 'Đang dùng' : 'Ngừng dùng'}
                    </StatusBadge>
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      {group.department ? group.department.name : 'Dùng chung mọi phòng ban'}
                    </span>
                  </div>
                  {group.description ? <p className="mt-1 text-sm text-muted-foreground">{group.description}</p> : null}
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    <code className="mr-1 font-semibold text-muted-foreground">{group.code}</code> · {formatNumber(group._count.employees)} nhân sự · {formatNumber(group._count.kpiGroups)} nhóm KPI
                    {group.defaultRole ? ` · Vai trò mặc định: ${group.defaultRole.name}` : ' · Không gán vai trò mặc định'}
                    {group.jobTitleKeywords.length > 0 ? ` · Từ khóa chức danh: ${group.jobTitleKeywords.join(', ')}` : ''}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <EditEmployeeGroupDialog group={group} departments={departments} />
                    <DeleteEmployeeGroupButton group={group} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function EmployeeGroupFormFields({
  value,
  onChange,
  departments,
}: {
  value: EmployeeGroupFormValue
  onChange: (patch: Partial<EmployeeGroupFormValue>) => void
  departments: Department[]
}) {
  const rolesQuery = useQuery({ queryKey: ['access-control', 'roles'], queryFn: listRoles })
  const roles = rolesQuery.data ?? []

  return (
    <div className="grid gap-3">
      <LabeledInput id="eg-name" label="Tên nhóm" value={value.name} onChange={(v) => onChange({ name: v })} />
      <LabeledInput
        id="eg-description"
        label="Mô tả (không bắt buộc)"
        value={value.description}
        onChange={(v) => onChange({ description: v })}
      />
      <div className="grid gap-1.5">
        <Label>Phòng ban</Label>
        <Select value={value.departmentId} onValueChange={(v) => onChange({ departmentId: v })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Dùng chung mọi phòng ban</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Nhóm gắn phòng ban chỉ gán được cho nhân sự và nhóm KPI thuộc chính phòng ban đó.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label>Vai trò mặc định cho tài khoản</Label>
        <Select value={value.defaultRoleId} onValueChange={(v) => onChange({ defaultRoleId: v })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Không gán vai trò</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Khi tạo tài khoản cho nhân sự thuộc nhóm này, hệ thống gợi ý sẵn vai trò trên với phạm vi SELF.
        </p>
      </div>
      <LabeledInput
        id="eg-keywords"
        label="Từ khóa chức danh (cách nhau bởi dấu phẩy)"
        value={value.jobTitleKeywords}
        onChange={(v) => onChange({ jobTitleKeywords: v })}
      />
      <p className="-mt-1 text-xs text-muted-foreground">
        Tạo nhân sự mà không chọn nhóm thì hệ thống đoán theo các từ khóa này (không phân biệt hoa thường và dấu).
        Để trống nếu không muốn tự đoán.
      </p>
      <div className="grid gap-1.5">
        <Label>Trạng thái</Label>
        <Select value={value.status} onValueChange={(v) => onChange({ status: v as EmployeeGroupStatus })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Đang dùng</SelectItem>
            <SelectItem value="INACTIVE">Ngừng dùng</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

type EmployeeGroupFormValue = {
  name: string
  description: string
  departmentId: string
  defaultRoleId: string
  jobTitleKeywords: string
  status: EmployeeGroupStatus
}

function emptyEmployeeGroupForm(): EmployeeGroupFormValue {
  return {
    name: '',
    description: '',
    departmentId: NONE,
    defaultRoleId: NONE,
    jobTitleKeywords: '',
    status: 'ACTIVE',
  }
}

function toEmployeeGroupInput(form: EmployeeGroupFormValue) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    departmentId: form.departmentId === NONE ? null : form.departmentId,
    defaultRoleId: form.defaultRoleId === NONE ? null : form.defaultRoleId,
    jobTitleKeywords: form.jobTitleKeywords
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    status: form.status,
  }
}

function CreateEmployeeGroupDialog({ departments }: { departments: Department[] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<EmployeeGroupFormValue>(emptyEmployeeGroupForm)
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => createEmployeeGroup(toEmployeeGroupInput(form)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employeeGroups })
      toast.success('Đã tạo nhóm nghiệp vụ')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function handleOpenChange(next: boolean) {
    if (next) {
      setForm(emptyEmployeeGroupForm())
      setFormError(null)
      mutation.reset()
    }
    setOpen(next)
  }

  function submit() {
    setFormError(null)
    if (!form.name.trim()) {
      setFormError('Nhập tên nhóm nghiệp vụ.')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="size-4" />
          Tạo nhóm nghiệp vụ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo nhóm nghiệp vụ</DialogTitle>
          <DialogDescription>Mã nhóm do hệ thống tự sinh.</DialogDescription>
        </DialogHeader>
        <EmployeeGroupFormFields
          value={form}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          departments={departments}
        />
        {formError ? <FormError title="Không tạo được" message={formError} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Tạo nhóm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditEmployeeGroupDialog({
  group,
  departments,
}: {
  group: EmployeeGroup
  departments: Department[]
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<EmployeeGroupFormValue>(emptyEmployeeGroupForm)
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => updateEmployeeGroup(group.id, toEmployeeGroupInput(form)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employeeGroups })
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employees })
      toast.success('Đã cập nhật nhóm nghiệp vụ')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function handleOpenChange(next: boolean) {
    if (next) {
      setForm({
        name: group.name,
        description: group.description ?? '',
        departmentId: group.departmentId ?? NONE,
        defaultRoleId: group.defaultRoleId ?? NONE,
        jobTitleKeywords: group.jobTitleKeywords.join(', '),
        status: group.status,
      })
      setFormError(null)
      mutation.reset()
    }
    setOpen(next)
  }

  function submit() {
    setFormError(null)
    if (!form.name.trim()) {
      setFormError('Nhập tên nhóm nghiệp vụ.')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Sửa</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa nhóm · {group.name}</DialogTitle>
          <DialogDescription>
            Chuyển sang "Ngừng dùng" để giữ nguyên dữ liệu đã gán mà không cho chọn mới.
          </DialogDescription>
        </DialogHeader>
        <EmployeeGroupFormFields
          value={form}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          departments={departments}
        />
        {formError ? <FormError title="Không lưu được" message={formError} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// BE trả 409 nếu nhóm đang được nhân sự/nhóm KPI dùng — hiện luôn thông báo đó thay vì chặn ở FE,
// để người dùng biết chính xác còn bao nhiêu nơi đang dùng.
function DeleteEmployeeGroupButton({ group }: { group: EmployeeGroup }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => deleteEmployeeGroup(group.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employeeGroups })
      toast.success('Đã xóa nhóm nghiệp vụ')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-[var(--danger-700)] hover:text-[var(--danger-700)]"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      Xóa
    </Button>
  )
}

/**
 * Chọn nhóm nghiệp vụ cho một nhân sự — lọc theo phòng ban của team đang chọn trong form, cộng
 * các nhóm dùng chung. Chưa chọn team thì chưa biết phòng ban nên chưa hiện nhóm nào.
 */
function EmployeeGroupsField({
  value,
  onChange,
  departmentId,
}: {
  value: string[]
  onChange: (value: string[]) => void
  departmentId: string | null
}) {
  const groupsQuery = useQuery({
    queryKey: ORG_KEYS.employeeGroups,
    queryFn: () => listEmployeeGroups(),
  })
  const groups = groupsQuery.data ?? []
  const availableGroups = groups.filter(
    (group) =>
      (group.status === 'ACTIVE' || value.includes(group.id)) &&
      (group.departmentId === null || group.departmentId === departmentId),
  )

  function toggle(groupId: string) {
    onChange(value.includes(groupId) ? value.filter((item) => item !== groupId) : [...value, groupId])
  }

  return (
    <fieldset className="grid gap-2 rounded-xl border bg-muted/40 p-3">
      <legend className="px-1 text-sm font-semibold">Nhóm nghiệp vụ để tự gán KPI</legend>
      <p className="text-xs text-muted-foreground">
        Một nhân sự có thể thuộc nhiều nhóm. Để trống khi tạo mới thì hệ thống tự đoán theo chức danh.
      </p>
      {groupsQuery.isLoading ? <p className="text-sm text-muted-foreground">Đang tải nhóm nghiệp vụ…</p> : null}
      {!groupsQuery.isLoading && !departmentId ? (
        <p className="text-sm text-muted-foreground">Chọn team trước để biết nhóm nghiệp vụ nào dùng được.</p>
      ) : null}
      {!groupsQuery.isLoading && departmentId && availableGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Phòng ban của team này chưa có nhóm nghiệp vụ nào.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {availableGroups.map((group) => (
          <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={value.includes(group.id)}
              onChange={() => toggle(group.id)}
            />
            {group.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function DepartmentSection({
  department,
  teams,
  membersByTeam,
  totalByTeam,
  canViewEmployees,
  employeesLoading,
  expandedTeamId,
  setExpandedTeamId,
  canManage,
  canManageUsers,
  orphanUsers,
  teamOptions,
  employees,
  departments,
  isFiltering,
  expanded,
  onToggle,
}: {
  department: Department
  teams: Team[]
  membersByTeam: Map<string, Employee[]>
  totalByTeam: Map<string, Employee[]>
  canViewEmployees: boolean
  employeesLoading: boolean
  expandedTeamId: string | null
  setExpandedTeamId: (value: string | null | ((current: string | null) => string | null)) => void
  canManage: boolean
  canManageUsers: boolean
  orphanUsers: UserSummary[]
  teamOptions: Team[]
  employees: Employee[]
  departments: Department[]
  isFiltering: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const panelId = `department-teams-${department.id}`
  const matchedCount = teams.reduce((total, team) => total + (membersByTeam.get(team.id) ?? []).length, 0)

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={`flex items-stretch gap-2 p-2 sm:items-center sm:gap-3 sm:p-3 ${expanded ? 'border-b border-border bg-muted/40' : ''}`}>
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-3"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Building2 className="size-[18px]" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[15px] font-bold text-foreground">{department.name}</span>
                <StatusBadge tone={DEPARTMENT_STATUS_TONE[department.status]}>{DEPARTMENT_STATUS_LABEL[department.status]}</StatusBadge>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground"><code>{department.code}</code> · {formatNumber(teams.length)} team{isFiltering ? ` · ${formatNumber(matchedCount)} nhân sự phù hợp` : ''}</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="hidden sm:inline">{expanded ? 'Thu gọn' : 'Xem team'}</span>
            <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </button>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <EditDepartmentDialog department={department} />
            <DeleteDepartmentDialog department={department} teamCount={teams.length} />
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div id={panelId}>
          {teams.length === 0 ? (
            <EmptyState
              size="sm"
              icon={FolderTree}
              title="Phòng ban này chưa có team"
              description="Tạo team để xếp nhân sự vào và bắt đầu theo dõi dữ liệu theo phạm vi team."
              action={canManage ? <CreateTeamDialog departments={departments} /> : undefined}
            />
          ) : (
            <div className="divide-y divide-border px-2 pb-2 sm:px-3 sm:pb-3">
              {teams.map((team) => (
                <TeamListItem
                  key={team.id}
                  team={team}
                  departments={departments}
                  members={membersByTeam.get(team.id) ?? []}
                  totalMemberCount={(totalByTeam.get(team.id) ?? []).length}
                  canViewEmployees={canViewEmployees}
                  employeesLoading={employeesLoading}
                  expanded={expandedTeamId === team.id}
                  onToggle={() => setExpandedTeamId((current) => current === team.id ? null : team.id)}
                  canManage={canManage}
                  canManageUsers={canManageUsers}
                  orphanUsers={orphanUsers}
                  teamOptions={teamOptions}
                  employees={employees}
                  isFiltering={isFiltering}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

function TeamListItem({
  team,
  departments,
  members,
  totalMemberCount,
  canViewEmployees,
  employeesLoading,
  expanded,
  onToggle,
  canManage,
  canManageUsers,
  orphanUsers,
  teamOptions,
  employees,
  isFiltering,
}: {
  team: Team
  departments: Department[]
  members: Employee[]
  totalMemberCount: number
  canViewEmployees: boolean
  employeesLoading: boolean
  expanded: boolean
  onToggle: () => void
  canManage: boolean
  canManageUsers: boolean
  orphanUsers: UserSummary[]
  teamOptions: Team[]
  employees: Employee[]
  isFiltering: boolean
}) {
  const activeMembers = members.filter((member) => member.employmentStatus === 'ACTIVE').length
  const panelId = `team-members-${team.id}`

  return (
    <article className="overflow-hidden">
      <div className="flex items-stretch gap-2 py-2 sm:items-center sm:gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground"><FolderTree className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate font-semibold text-foreground">{team.name}</span>
                <StatusBadge tone={TEAM_STATUS_TONE[team.status]}>{TEAM_STATUS_LABEL[team.status]}</StatusBadge>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground"><code>{team.code}</code>{isFiltering ? ' · Kết quả đang lọc' : ''}</span>
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-3 sm:justify-end">
            <span className="text-xs text-muted-foreground"><strong className="font-semibold text-foreground">{canViewEmployees && !employeesLoading ? (isFiltering ? `${formatNumber(members.length)}/${formatNumber(totalMemberCount)}` : formatNumber(totalMemberCount)) : '—'}</strong> thành viên</span>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="text-xs text-muted-foreground"><strong className="font-semibold text-[var(--success-700)]">{canViewEmployees && !employeesLoading ? formatNumber(activeMembers) : '—'}</strong> đang làm việc</span>
            <ChevronDown className={`size-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </button>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <EditTeamDialog team={team} departments={departments} />
            {/* Số thành viên THẬT, không phải số đã lọc — nếu không nút xoá sẽ mở nhầm khi đang tìm kiếm. */}
            <DeleteTeamDialog team={team} memberCount={totalMemberCount} />
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div id={panelId} className="border-t border-border bg-muted/30 px-3 py-4 sm:px-5">
          {!canViewEmployees ? (
            <EmptyState
              size="sm"
              icon={ListX}
              title="Không đủ quyền xem thành viên"
              description="Tài khoản của bạn chưa được cấp quyền xem danh sách nhân sự của team này."
            />
          ) : employeesLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
          ) : members.length === 0 ? (
            <EmptyState
              size="sm"
              icon={UsersRound}
              title={isFiltering ? 'Không có nhân sự khớp trong team này' : 'Team này chưa có thành viên'}
              description={isFiltering
                ? 'Hãy nới bộ lọc để xem toàn bộ thành viên của team.'
                : 'Thêm nhân sự vào team để tính được lương và phạm vi dữ liệu theo team.'}
            />
          ) : (
            <TeamMemberList
              members={members}
              canManage={canManage}
              canManageUsers={canManageUsers}
              orphanUsers={orphanUsers}
              teamOptions={teamOptions}
              employees={employees}
            />
          )}
        </div>
      ) : null}
    </article>
  )
}

function TeamMemberList({
  members,
  canManage,
  canManageUsers,
  orphanUsers,
  teamOptions,
  employees,
  heading,
  subheading,
}: {
  members: Employee[]
  canManage: boolean
  canManageUsers: boolean
  orphanUsers: UserSummary[]
  teamOptions: Team[]
  employees: Employee[]
  heading?: string
  subheading?: string
}) {
  // Leader/manager có thể nằm ngoài team nên tra tên trên toàn bộ danh sách, không chỉ trong team.
  const nameById = useMemo(() => new Map(employees.map((item) => [item.id, item.fullName])), [employees])
  // Danh sách có thể gộp nhiều team (chế độ tìm kiếm), nên tính leader cho từng team xuất hiện.
  const teamLeaderIds = useMemo(() => {
    const teamIds = new Set(members.map((member) => member.teamId).filter(Boolean))
    const leaders = new Set<string>()
    for (const teamId of teamIds) {
      const leaderId = findTeamLeaderId(teamId, employees)
      if (leaderId) leaders.add(leaderId)
    }
    return leaders
  }, [employees, members])

  function relatedName(id: string | null) {
    if (!id) return '—'
    return nameById.get(id) ?? '(ngoài danh sách)'
  }

  return (
    <div>
      {heading ? (
        <div className="mb-3 px-0.5">
          <p className="text-sm font-semibold text-foreground">{heading}</p>
          {subheading ? <p className="mt-1 text-sm text-muted-foreground">{subheading}</p> : null}
        </div>
      ) : null}
      <div className={`hidden rounded-t-xl border border-border bg-muted px-4 py-2.5 text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase lg:grid ${canManageUsers ? 'lg:grid-cols-[minmax(15rem,1.35fr)_minmax(12rem,.8fr)_minmax(12rem,.9fr)_auto]' : 'lg:grid-cols-[minmax(15rem,1.35fr)_minmax(12rem,.8fr)_auto]'}`}>
        <span>Nhân sự & phân bổ</span>
        <span>Quản lý trực tiếp</span>
        {canManageUsers ? <span>Tài khoản</span> : null}
        <span className="text-right">Thao tác</span>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card lg:rounded-t-none lg:border-t-0">
        {members.map((member) => (
          <li key={member.id} className={`grid gap-4 p-4 transition-colors hover:bg-muted/40 lg:items-center ${canManageUsers ? 'lg:grid-cols-[minmax(15rem,1.35fr)_minmax(12rem,.8fr)_minmax(12rem,.9fr)_auto]' : 'lg:grid-cols-[minmax(15rem,1.35fr)_minmax(12rem,.8fr)_auto]'}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary">{initialsOf(member.fullName)}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-foreground">{member.fullName}</p>
                  {teamLeaderIds.has(member.id) ? <StatusBadge>Team Leader</StatusBadge> : null}
                  <StatusBadge tone={EMP_STATUS_TONE[member.employmentStatus]}>{EMP_STATUS_LABEL[member.employmentStatus]}</StatusBadge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground"><code className="font-semibold text-muted-foreground">{member.employeeCode}</code> · {member.jobTitle}</p>
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Team và tỷ trọng phân bổ">
                  {(member.teamMemberships ?? []).map((membership) => (
                    <span
                      key={`team-${membership.teamId}`}
                      className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {membership.team.name}
                      {' · '}{membership.defaultSalaryWeightPercent}%{membership.isPrimary ? ' · chính' : ''}
                    </span>
                  ))}
                  {member.employeeGroups.map((group) => (
                    <span key={group.id} className="rounded-md bg-[var(--success-500)]/14 px-2 py-1 text-[11px] font-medium text-[var(--success-700)]">
                      {group.name}
                    </span>
                  ))}
                  {member.employeeGroups.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Chưa phân nhóm nghiệp vụ</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 lg:gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground">Leader</p>
                <p className="mt-0.5 truncate text-sm font-medium">{relatedName(member.leaderEmployeeId)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Manager</p>
                <p className="mt-0.5 truncate text-sm font-medium">{relatedName(member.managerEmployeeId)}</p>
              </div>
            </div>
            {canManageUsers ? (
              <div className="min-w-0">
                {member.user ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--success-700)]"><Link2 className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{member.user.email}</span></span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--warning-700)]"><Unlink className="size-3.5" aria-hidden="true" />Chưa có tài khoản</span>
                )}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1.5 lg:justify-end">
              {canManageUsers && <LinkAccountDialog employee={member} orphanUsers={orphanUsers} />}
              {canManage && <TeamMembershipsDialog employee={member} teams={teamOptions} employees={employees} />}
              {canManage && <EditEmployeeDialog employee={member} teams={teamOptions} employees={employees} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

type EmployeeFormValue = {
  fullName: string
  jobTitle: string
  employeeGroupIds: string[]
  teamId: string
  leaderEmployeeId: string
  managerEmployeeId: string
  employmentStatus: EmploymentStatus
  joinedAt: string
  leftAt: string
}

function emptyEmployeeForm(): EmployeeFormValue {
  return {
    fullName: '',
    jobTitle: '',
    employeeGroupIds: [],
    teamId: '',
    leaderEmployeeId: NONE,
    managerEmployeeId: NONE,
    employmentStatus: 'ACTIVE',
    joinedAt: '',
    leftAt: '',
  }
}

function EmployeeFormFields({
  value,
  onChange,
  teams,
  employees,
  excludeId,
}: {
  value: EmployeeFormValue
  onChange: (patch: Partial<EmployeeFormValue>) => void
  teams: Team[]
  employees: Employee[]
  excludeId?: string
}) {
  const peopleOptions = assignableEmployees(employees, excludeId, [
    value.leaderEmployeeId,
    value.managerEmployeeId,
  ])

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledInput id="emp-fullname" label="Họ và tên" value={value.fullName} onChange={(v) => onChange({ fullName: v })} />
        <LabeledInput id="emp-jobtitle" label="Chức danh" value={value.jobTitle} onChange={(v) => onChange({ jobTitle: v })} />
      </div>
      <EmployeeGroupsField
        value={value.employeeGroupIds}
        onChange={(employeeGroupIds) => onChange({ employeeGroupIds })}
        departmentId={teams.find((team) => team.id === value.teamId)?.departmentId ?? null}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Team</Label>
          <Select value={value.teamId} onValueChange={(v) => onChange({ teamId: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Chọn team" />
            </SelectTrigger>
            <SelectContent searchPlaceholder="Tìm team...">
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Trạng thái</Label>
          <Select
            value={value.employmentStatus}
            onValueChange={(v) => onChange({ employmentStatus: v as EmploymentStatus })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_STATUSES.map((option) => (
                <SelectItem key={option} value={option}>
                  {EMP_STATUS_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Leader phụ trách</Label>
          <Select value={value.leaderEmployeeId} onValueChange={(v) => onChange({ leaderEmployeeId: v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent searchPlaceholder="Tìm nhân sự...">
              <SelectItem value={NONE}>— Không gán —</SelectItem>
              {peopleOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Manager phụ trách</Label>
          <Select value={value.managerEmployeeId} onValueChange={(v) => onChange({ managerEmployeeId: v })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent searchPlaceholder="Tìm nhân sự...">
              <SelectItem value={NONE}>— Không gán —</SelectItem>
              {peopleOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <LabeledInput
        id="emp-joinedat"
        label="Ngày vào làm"
        type="date"
        value={value.joinedAt}
        onChange={(v) => onChange({ joinedAt: v })}
      />
      {value.employmentStatus === 'LEFT' && (
        <LabeledInput
          id="emp-leftat"
          label="Ngày nghỉ việc"
          type="date"
          value={value.leftAt}
          onChange={(v) => onChange({ leftAt: v })}
        />
      )}
    </>
  )
}

function CreateEmployeeDialog({
  teams,
  employees,
  canManageUsers,
}: {
  teams: Team[]
  employees: Employee[]
  canManageUsers: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<EmployeeFormValue>(emptyEmployeeForm)
  const [createAccount, setCreateAccount] = useState(false)
  const [accountEmail, setAccountEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setForm(emptyEmployeeForm())
      setCreateAccount(false)
      setAccountEmail('')
      setAccountPassword('')
      setFormError(null)
    }
    setOpen(next)
  }

  function updateForm(patch: Partial<EmployeeFormValue>) {
    setForm((current) => {
      if (patch.teamId === undefined || patch.teamId === current.teamId) {
        return { ...current, ...patch }
      }

      return {
        ...current,
        ...patch,
        leaderEmployeeId: findTeamLeaderId(patch.teamId, employees) ?? NONE,
      }
    })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const employee = await createEmployee({
        fullName: form.fullName.trim(),
        jobTitle: form.jobTitle.trim(),
        employeeGroupIds: form.employeeGroupIds,
        teamId: form.teamId,
        leaderEmployeeId: form.leaderEmployeeId === NONE ? undefined : form.leaderEmployeeId,
        managerEmployeeId: form.managerEmployeeId === NONE ? undefined : form.managerEmployeeId,
        employmentStatus: form.employmentStatus,
        joinedAt: form.joinedAt || undefined,
      })

      // Nhân sự đã tạo thành công ở bước trên — nếu bước tạo tài khoản (tuỳ chọn) thất bại, không
      // coi cả thao tác là lỗi (nhân sự vẫn tồn tại), chỉ báo riêng để Admin dùng nút "Tài khoản"
      // trên dòng nhân sự thử lại, tránh hiểu nhầm "chưa tạo được gì" rồi bấm submit lần 2 gây trùng
      // mã nhân sự.
      let accountError: string | null = null
      let accountWithoutRole = false
      if (createAccount) {
        try {
          // Không truyền `roles` → BE tự gán vai trò theo nhóm nghiệp vụ của nhân sự (scope SELF).
          const account = await createUser({
            email: accountEmail,
            password: accountPassword,
            employeeId: employee.id,
          })
          accountWithoutRole = account.roles.length === 0
        } catch (error) {
          accountError = getApiErrorMessage(error)
        }
      }
      return { accountError, accountWithoutRole }
    },
    onSuccess: ({ accountError, accountWithoutRole }) => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employees })
      if (createAccount) void queryClient.invalidateQueries({ queryKey: ['ac', 'users'] })
      if (accountError) {
        toast.warning(`Đã tạo nhân sự, nhưng tạo tài khoản thất bại: ${accountError}`, {
          description: 'Dùng nút "Tài khoản" trên dòng nhân sự vừa tạo để thử lại.',
        })
      } else if (accountWithoutRole) {
        toast.warning('Đã tạo nhân sự và tài khoản, nhưng tài khoản chưa có vai trò.', {
          description: 'Nhân sự chưa có nhóm nghiệp vụ — vào Phân quyền & tài khoản để gán vai trò.',
        })
      } else {
        toast.success(createAccount ? 'Đã tạo nhân sự và tài khoản đăng nhập' : 'Đã tạo hồ sơ nhân sự')
      }
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!form.fullName.trim() || !form.jobTitle.trim()) {
      setFormError('Nhập đủ họ tên và chức danh.')
      return
    }
    if (!form.teamId) {
      setFormError('Chọn team cho nhân sự.')
      return
    }
    if (createAccount) {
      if (!accountEmail) {
        setFormError('Nhập email cho tài khoản.')
        return
      }
      if (accountPassword.length < 8) {
        setFormError('Mật khẩu tài khoản tối thiểu 8 ký tự.')
        return
      }
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Thêm nhân sự
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-14">
          <DialogTitle>Tạo hồ sơ nhân sự</DialogTitle>
          <DialogDescription>Hồ sơ mới được ghi vào cơ sở dữ liệu tổ chức của hệ thống.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4">
            <EmployeeFormFields
              value={form}
              onChange={updateForm}
              teams={teams}
              employees={employees}
            />

            {canManageUsers && (
              <div className="rounded-xl border bg-muted/40 p-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={createAccount}
                    onChange={(event) => setCreateAccount(event.target.checked)}
                  />
                  Tạo luôn tài khoản đăng nhập cho nhân sự này
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Không bắt buộc — có thể tạo/gắn sau bằng nút "Tài khoản" trên dòng nhân sự. Nhưng nhân sự sẽ
                  không tự xác nhận được KPI/OKR hay xem lương cho tới khi có tài khoản.
                </p>
                {createAccount && (
                  <div className="mt-3 grid gap-3">
                    <LabeledInput id="emp-acct-email" label="Email" type="email" value={accountEmail} onChange={setAccountEmail} />
                    <LabeledInput
                      id="emp-acct-password"
                      label="Mật khẩu (tối thiểu 8 ký tự)"
                      type="password"
                      value={accountPassword}
                      onChange={setAccountPassword}
                    />
                    <p className="text-xs text-muted-foreground">
                      Tài khoản tự nhận vai trò theo nhóm nghiệp vụ đã chọn ở trên (EDITOR/CONTENT_CREATOR · phạm vi
                      "Chỉ mình"). Cần vai trò khác (Leader, HR…) thì gán trong "Phân quyền & tài khoản".
                    </p>
                  </div>
                )}
              </div>
            )}

            {formError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Không tạo được</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 flex-row flex-wrap justify-end gap-2 bg-muted px-5 py-4">
          <Button variant="outline" className="min-w-28" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button className="min-w-28" onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Tạo nhân sự
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TeamMembershipsDialog({
  employee,
  teams,
  employees,
}: {
  employee: Employee
  teams: Team[]
  employees: Employee[]
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [teamId, setTeamId] = useState('')
  const [weight, setWeight] = useState('0')
  const [isPrimary, setIsPrimary] = useState(false)
  const [leaderId, setLeaderId] = useState(NONE)
  const [managerId, setManagerId] = useState(NONE)
  const [error, setError] = useState<string | null>(null)
  const memberships = employee.teamMemberships ?? []
  const peopleOptions = assignableEmployees(employees, employee.id, [leaderId, managerId])
  const totalWeight = memberships.reduce(
    (sum, membership) => sum + Number(membership.defaultSalaryWeightPercent),
    0,
  )

  function resetForm() {
    setTeamId('')
    setWeight('0')
    setIsPrimary(false)
    setLeaderId(NONE)
    setManagerId(NONE)
    setError(null)
  }

  function editMembership(membership: Employee['teamMemberships'][number]) {
    setTeamId(membership.teamId)
    setWeight(membership.defaultSalaryWeightPercent)
    setIsPrimary(membership.isPrimary)
    setLeaderId(membership.leaderEmployeeId ?? NONE)
    setManagerId(membership.managerEmployeeId ?? NONE)
    setError(null)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertEmployeeTeamMembership(employee.id, {
        teamId,
        isPrimary,
        salaryWeightPercent: Number(weight),
        leaderEmployeeId: leaderId === NONE ? null : leaderId,
        managerEmployeeId: managerId === NONE ? null : managerId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employees })
      toast.success('Đã cập nhật team và tỷ trọng KPI')
      resetForm()
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  })

  const removeMutation = useMutation({
    mutationFn: (removeTeamId: string) =>
      deactivateEmployeeTeamMembership(employee.id, removeTeamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employees })
      toast.success('Đã kết thúc membership')
      resetForm()
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  })

  function submit() {
    setError(null)
    const numericWeight = Number(weight)
    if (!teamId) return setError('Chọn team cần thêm hoặc cập nhật.')
    if (!Number.isFinite(numericWeight) || numericWeight < 0 || numericWeight > 100) {
      return setError('Tỷ trọng phải nằm trong khoảng 0–100%.')
    }
    saveMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Teams</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Team và tỷ trọng KPI</DialogTitle>
          <DialogDescription>
            {employee.fullName} có thể tham gia nhiều team; tổng tỷ trọng cần bằng 100% trước khi mở kỳ lương.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-xl border p-3">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-semibold">Membership đang hoạt động</span>
              <StatusBadge tone={totalWeight === 100 ? 'success' : 'warning'}>
                Tổng {totalWeight}%
              </StatusBadge>
            </div>
            <div className="grid gap-2">
              {memberships.map((membership) => (
                <div key={membership.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <button type="button" className="min-w-0 text-left" onClick={() => editMembership(membership)}>
                    <span className="block truncate text-sm font-semibold">
                      {membership.team.name}{membership.isPrimary ? ' · Team chính' : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Tỷ trọng {membership.defaultSalaryWeightPercent}% · Leader {membership.leader?.fullName ?? '—'}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={memberships.length <= 1 || removeMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Kết thúc membership tại ${membership.team.name}?`)) {
                        removeMutation.mutate(membership.teamId)
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger><SelectValue placeholder="Chọn team" /></SelectTrigger>
                <SelectContent searchPlaceholder="Tìm team...">
                  {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <LabeledInput id="membership-weight" label="Tỷ trọng KPI (%)" type="number" value={weight} onChange={setWeight} />
            <div className="grid gap-1.5">
              <Label>Leader trong team</Label>
              <Select value={leaderId} onValueChange={setLeaderId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent searchPlaceholder="Tìm nhân sự...">
                  <SelectItem value={NONE}>— Không gán —</SelectItem>
                  {peopleOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Manager trong team</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent searchPlaceholder="Tìm nhân sự...">
                  <SelectItem value={NONE}>— Không gán —</SelectItem>
                  {peopleOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
            Đặt làm team chính
          </label>
          {error ? <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Đóng</Button>
          <Button onClick={submit} disabled={saveMutation.isPending || !teamId}>
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lưu membership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditEmployeeDialog({
  employee,
  teams,
  employees,
}: {
  employee: Employee
  teams: Team[]
  employees: Employee[]
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<EmployeeFormValue>(emptyEmployeeForm)
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setForm({
        fullName: employee.fullName,
        jobTitle: employee.jobTitle,
        employeeGroupIds: employee.employeeGroups.map((group) => group.id),
        teamId: employee.teamId,
        leaderEmployeeId: employee.leaderEmployeeId ?? NONE,
        managerEmployeeId: employee.managerEmployeeId ?? NONE,
        employmentStatus: employee.employmentStatus,
        joinedAt: employee.joinedAt ? employee.joinedAt.slice(0, 10) : '',
        leftAt: employee.leftAt ? employee.leftAt.slice(0, 10) : '',
      })
      setFormError(null)
    }
    setOpen(next)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateEmployee(employee.id, {
        fullName: form.fullName.trim(),
        jobTitle: form.jobTitle.trim(),
        employeeGroupIds: form.employeeGroupIds,
        teamId: form.teamId,
        leaderEmployeeId: form.leaderEmployeeId === NONE ? null : form.leaderEmployeeId,
        managerEmployeeId: form.managerEmployeeId === NONE ? null : form.managerEmployeeId,
        employmentStatus: form.employmentStatus,
        joinedAt: form.joinedAt || null,
        ...(form.employmentStatus === 'LEFT' && form.leftAt ? { leftAt: form.leftAt } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employees })
      toast.success('Đã cập nhật hồ sơ nhân sự')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!form.fullName.trim() || !form.jobTitle.trim()) {
      setFormError('Họ tên và chức danh không được để trống.')
      return
    }
    if (!form.teamId) {
      setFormError('Chọn team cho nhân sự.')
      return
    }
    saveMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Sửa
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-14">
          <DialogTitle>Sửa hồ sơ nhân sự</DialogTitle>
          <DialogDescription>Cập nhật thông tin của {employee.fullName}.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4">
            <EmployeeFormFields
              value={form}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
              teams={teams}
              employees={employees}
              excludeId={employee.id}
            />
            {formError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Không lưu được</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 flex-row flex-wrap justify-end gap-2 bg-muted px-5 py-4">
          <Button variant="outline" className="min-w-28" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button className="min-w-28" onClick={submit} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LinkAccountDialog({ employee, orphanUsers }: { employee: Employee; orphanUsers: UserSummary[] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'existing'>('create')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [existingUserId, setExistingUserId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setMode('create')
      setEmail('')
      setPassword('')
      setExistingUserId('')
      setFormError(null)
    }
    setOpen(next)
  }

  function invalidateAfterLinkChange() {
    void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employees })
    void queryClient.invalidateQueries({ queryKey: ['ac', 'users'] })
  }

  const createMutation = useMutation({
    // Không truyền `roles` → BE tự gán vai trò theo nhóm nghiệp vụ của nhân sự (scope SELF).
    mutationFn: () =>
      createUser({
        email,
        password,
        employeeId: employee.id,
      }),
    onSuccess: (account) => {
      invalidateAfterLinkChange()
      if (account.roles.length === 0) {
        toast.warning('Đã tạo & gắn tài khoản, nhưng tài khoản chưa có vai trò.', {
          description: 'Nhân sự chưa có nhóm nghiệp vụ — vào Phân quyền & tài khoản để gán vai trò.',
        })
      } else {
        toast.success('Đã tạo tài khoản và gắn với nhân sự')
      }
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  const linkExistingMutation = useMutation({
    mutationFn: () => updateUser(existingUserId, { employeeId: employee.id }),
    onSuccess: () => {
      invalidateAfterLinkChange()
      toast.success('Đã gắn tài khoản với nhân sự')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  const unlinkMutation = useMutation({
    mutationFn: () => updateUser(employee.user!.id, { employeeId: null }),
    onSuccess: () => {
      invalidateAfterLinkChange()
      toast.success('Đã gỡ liên kết tài khoản')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (mode === 'create') {
      if (!email) {
        setFormError('Nhập email.')
        return
      }
      if (password.length < 8) {
        setFormError('Mật khẩu tối thiểu 8 ký tự.')
        return
      }
      createMutation.mutate()
    } else {
      if (!existingUserId) {
        setFormError('Chọn 1 tài khoản có sẵn.')
        return
      }
      linkExistingMutation.mutate()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="size-4" />
          Tài khoản
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tài khoản đăng nhập · {employee.fullName}</DialogTitle>
          <DialogDescription>
            Quyết định "xem của tôi" (KPI/OKR/dữ liệu cá nhân) — nhân sự chỉ dùng được tính năng này khi có tài
            khoản gắn đúng.
          </DialogDescription>
        </DialogHeader>

        {employee.user ? (
          <div className="grid gap-4">
            <div className="rounded-xl border bg-muted/40 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-[var(--success-700)]">
                <Link2 className="size-4" />
                Đang gắn với tài khoản
              </p>
              <p className="mt-1 text-muted-foreground">{employee.user.email}</p>
            </div>
            {formError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Không thực hiện được</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={mode === 'create' ? 'default' : 'outline'} size="sm" onClick={() => setMode('create')}>
                Tạo tài khoản mới
              </Button>
              <Button
                type="button"
                variant={mode === 'existing' ? 'default' : 'outline'}
                size="sm"
                disabled={orphanUsers.length === 0}
                onClick={() => setMode('existing')}
              >
                Gắn tài khoản có sẵn
              </Button>
            </div>

            {mode === 'create' ? (
              <div className="grid gap-3">
                <LabeledInput id="link-email" label="Email" type="email" value={email} onChange={setEmail} />
                <LabeledInput
                  id="link-password"
                  label="Mật khẩu (tối thiểu 8 ký tự)"
                  type="password"
                  value={password}
                  onChange={setPassword}
                />
                <p className="text-xs text-muted-foreground">
                  Họ tên tài khoản lấy theo tên nhân sự: {employee.fullName}. Vai trò tự gán theo nhóm nghiệp vụ
                  của nhân sự (phạm vi "Chỉ mình"); cần vai trò khác thì chỉnh trong "Phân quyền & tài khoản".
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label>Tài khoản có sẵn (chưa gắn nhân sự nào)</Label>
                <Select value={existingUserId} onValueChange={setExistingUserId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chọn tài khoản" />
                  </SelectTrigger>
                  <SelectContent>
                    {orphanUsers.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.email} ({account.fullName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Không thực hiện được</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Đóng
          </Button>
          {employee.user ? (
            <Button variant="destructive" onClick={() => unlinkMutation.mutate()} disabled={unlinkMutation.isPending}>
              {unlinkMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              <Unlink className="size-4" />
              Gỡ liên kết
            </Button>
          ) : (
            <Button onClick={submit} disabled={createMutation.isPending || linkExistingMutation.isPending}>
              {(createMutation.isPending || linkExistingMutation.isPending) && <Loader2 className="size-4 animate-spin" />}
              {mode === 'create' ? 'Tạo & gắn' : 'Gắn tài khoản'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateDepartmentDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<DepartmentStatus>('ACTIVE')
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => createDepartment({ name: name.trim(), status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.departments })
      toast.success('Đã tạo phòng ban')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function handleOpenChange(next: boolean) {
    if (next) {
      setName('')
      setStatus('ACTIVE')
      setFormError(null)
      mutation.reset()
    }
    setOpen(next)
  }

  function submit() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Nhập tên phòng ban.')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Building2 className="size-4" />
          Tạo phòng ban
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo phòng ban</DialogTitle>
          <DialogDescription>Phòng ban là cấp tổ chức chứa các team.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <LabeledInput id="department-name" label="Tên phòng ban" value={name} onChange={setName} />
          <DepartmentStatusSelect value={status} onChange={setStatus} />
          {formError ? <FormError title="Không tạo được" message={formError} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Tạo phòng ban
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditDepartmentDialog({ department }: { department: Department }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(department.name)
  const [status, setStatus] = useState<DepartmentStatus>(department.status)
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => updateDepartment(department.id, { name: name.trim(), status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.departments })
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.teams })
      toast.success('Đã cập nhật phòng ban')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(department.name)
      setStatus(department.status)
      setFormError(null)
      mutation.reset()
    }
    setOpen(next)
  }

  function submit() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Nhập tên phòng ban.')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild><Button variant="ghost" size="sm">Sửa</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa phòng ban</DialogTitle>
          <DialogDescription><code className="text-xs">{department.code}</code> · mã phòng ban không đổi được</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <LabeledInput id={`department-name-${department.id}`} label="Tên phòng ban" value={name} onChange={setName} />
          <DepartmentStatusSelect value={status} onChange={setStatus} />
          {formError ? <FormError title="Không lưu được" message={formError} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDepartmentDialog({ department, teamCount }: { department: Department; teamCount: number }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () => deleteDepartment(department.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.departments })
      toast.success('Đã xóa phòng ban')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { setFormError(null); mutation.reset() } }}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="icon-sm" aria-label={`Xóa phòng ban ${department.name}`}>
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa phòng ban “{department.name}”?</DialogTitle>
          <DialogDescription>
            {teamCount > 0
              ? `Phòng ban còn ${teamCount} team. Bạn cần chuyển các team sang phòng ban khác trước khi xóa.`
              : 'Thao tác này sẽ xóa phòng ban và không thể hoàn tác.'}
          </DialogDescription>
        </DialogHeader>
        {formError ? <FormError title="Không xóa được" message={formError} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={teamCount > 0 || mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Xóa phòng ban
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DepartmentStatusSelect({ value, onChange }: { value: DepartmentStatus; onChange: (value: DepartmentStatus) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label>Trạng thái</Label>
      <Select value={value} onValueChange={(next) => onChange(next as DepartmentStatus)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {DEPARTMENT_STATUSES.map((option) => <SelectItem key={option} value={option}>{DEPARTMENT_STATUS_LABEL[option]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function FormError({ title, message }: { title: string; message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function CreateTeamDialog({ departments }: { departments: Department[] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState<TeamStatus>('ACTIVE')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName('')
      setDepartmentId(departments.find((department) => department.status === 'ACTIVE')?.id ?? '')
      setStatus('ACTIVE')
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () => createTeam({ name: name.trim(), departmentId, status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.teams })
      toast.success('Đã tạo team')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Nhập tên team.')
      return
    }
    if (!departmentId) {
      setFormError('Chọn phòng ban cho team.')
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Building2 className="size-4" />
          Tạo team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo team</DialogTitle>
          <DialogDescription>Team dùng để phân phạm vi dữ liệu TEAM cho Leader.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <LabeledInput id="team-name" label="Tên team" value={name} onChange={setName} />
          <div className="grid gap-1.5">
            <Label>Phòng ban</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Chọn phòng ban" /></SelectTrigger>
              <SelectContent>
                {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Trạng thái</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as TeamStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TEAM_STATUS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Không tạo được</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={createMutation.isPending || departments.length === 0}>
            {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Tạo team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Xóa team. FE chỉ biết trước số thành viên nên chặn sẵn trường hợp đó; hai rào còn lại (phân
 * quyền lấy team làm phạm vi, nhóm KPI áp dụng cho team) do BE trả về kèm số lượng cụ thể ở 409.
 */
function DeleteTeamDialog({ team, memberCount }: { team: Team; memberCount: number }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const isSynced = team.sourceSystem === 'AUTOMATION_GEN_VIDEO'

  const mutation = useMutation({
    mutationFn: () => deleteTeam(team.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.teams })
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.employees })
      toast.success('Đã xóa team')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { setFormError(null); mutation.reset() } }}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="icon-sm" aria-label={`Xóa team ${team.name}`}>
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa team “{team.name}”?</DialogTitle>
          <DialogDescription>
            {isSynced
              ? 'Team này được đồng bộ từ VCBI nên lần đồng bộ sau sẽ tạo lại. Hãy dùng "Sửa team" để chuyển trạng thái sang "Ngừng hoạt động".'
              : memberCount > 0
                ? `Team còn ${memberCount} nhân sự (kể cả người đã nghỉ). Hãy chuyển họ sang team khác trước, hoặc chuyển team sang "Ngừng hoạt động" để giữ nguyên lịch sử.`
                : 'Thao tác này không thể hoàn tác. Hệ thống sẽ chặn nếu team còn phân quyền lấy team này làm phạm vi hoặc còn nhóm KPI đang áp dụng.'}
          </DialogDescription>
        </DialogHeader>
        {formError ? <FormError title="Không xóa được" message={formError} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={isSynced || memberCount > 0 || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Xóa team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditTeamDialog({ team, departments }: { team: Team; departments: Department[] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(team.name)
  const [departmentId, setDepartmentId] = useState(team.departmentId)
  const [status, setStatus] = useState<TeamStatus>(team.status)
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(team.name)
      setDepartmentId(team.departmentId)
      setStatus(team.status)
      setFormError(null)
    }
    setOpen(next)
  }

  const saveMutation = useMutation({
    mutationFn: () => updateTeam(team.id, { name: name.trim(), departmentId, status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORG_KEYS.teams })
      toast.success('Đã cập nhật team')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Nhập tên team.')
      return
    }
    saveMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Sửa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa team</DialogTitle>
          <DialogDescription>
            <code className="text-xs">{team.code}</code> · mã team không đổi được
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <LabeledInput id={`team-name-${team.id}`} label="Tên team" value={name} onChange={setName} />
          <div className="grid gap-1.5">
            <Label>Phòng ban</Label>
            <Select value={departmentId} onValueChange={setDepartmentId} disabled={team.sourceSystem === 'AUTOMATION_GEN_VIDEO'}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {team.sourceSystem === 'AUTOMATION_GEN_VIDEO' ? <p className="text-xs text-muted-foreground">Team đồng bộ từ VCBI luôn thuộc phòng Marketing.</p> : null}
          </div>
          <div className="grid gap-1.5">
            <Label>Trạng thái</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as TeamStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TEAM_STATUS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Không lưu được</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LabeledInput({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function PermissionNotice({ permission }: { permission: string }) {
  return (
    <Alert>
      <AlertCircle />
      <AlertTitle>Không đủ quyền</AlertTitle>
      <AlertDescription>
        Tài khoản của bạn cần permission <code className="text-xs">{permission}</code> để xem mục này.
      </AlertDescription>
    </Alert>
  )
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => unknown }) {
  return (
    <div className="p-5">
      <ErrorState description={getApiErrorMessage(error)} onRetry={() => onRetry()} />
    </div>
  )
}
