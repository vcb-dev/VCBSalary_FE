import { Fragment, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { AlertCircle, Check, Filter, KeyRound, Loader2, Plus, Search, Settings2, ShieldCheck, Trash2, UserPlus, UsersRound, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  createRole,
  createUser,
  getApiErrorMessage,
  listPermissions,
  listRoles,
  listTeams,
  listUsers,
  setRolePermissions,
  setUserRoles,
  updateRole,
  updateUser,
  type Permission,
  type Role,
  type RoleAssignmentInput,
  type Team,
  type UserSummary,
} from '@/api/access-control'
import { listEmployees, type Employee } from '@/api/organization'
import { useAuth } from '@/auth/AuthContext'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { formatNumber, toPercent } from '@/lib/format'
import { toneSurface, type Tone } from '@/lib/tone'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { ScopeType, UserStatus } from '@/types'

const AC_KEYS = {
  users: ['ac', 'users'] as const,
  roles: ['ac', 'roles'] as const,
  permissions: ['ac', 'permissions'] as const,
  teams: ['ac', 'teams'] as const,
}

const USERS_PAGE_SIZE = 100
const EMPLOYEES_PAGE_SIZE = 100
const NONE = '__none__'
const SCOPE_TYPES: ScopeType[] = ['SELF', 'TEAM', 'ALL']
const USER_STATUSES: UserStatus[] = ['ACTIVE', 'LOCKED', 'DISABLED']
const SYSTEM_ROLE_SCOPES: Record<string, ScopeType> = {
  ADMIN: 'ALL',
  HR: 'ALL',
  ACCOUNTANT: 'ALL',
  MANAGER_APPROVER: 'ALL',
  LEADER: 'TEAM',
  EDITOR: 'SELF',
  CONTENT_CREATOR: 'SELF',
}

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Hoạt động',
  LOCKED: 'Đã khóa',
  DISABLED: 'Vô hiệu hóa',
}

const STATUS_TONE: Record<UserStatus, Tone> = {
  ACTIVE: 'success',
  LOCKED: 'warning',
  DISABLED: 'danger',
}

type QueryLike = {
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

function categoryOf(code: string) {
  return code.split('.')[0]
}

/** Nhãn tiếng Việt cho nhóm permission (thay cho slug thô như `audit`, `kpi_reward_rate`). */
const CATEGORY_LABELS: Record<string, string> = {
  user: 'Người dùng',
  role: 'Vai trò',
  permission: 'Phân quyền',
  employee: 'Nhân sự',
  kpi: 'KPI',
  kpi_reward_rate: 'Mức thưởng KPI',
  okr: 'OKR',
  traffic: 'Traffic',
  revenue: 'Doanh thu',
  salary: 'Lương',
  reward_rules: 'Cấu hình mốc thưởng',
  base_salary: 'Lương cơ bản',
  audit: 'Nhật ký hoạt động',
  notification: 'Thông báo',
  sync: 'Đồng bộ KPI',
  report: 'Báo cáo',
}

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category
}

/**
 * Nhãn hiển thị cho từng permission. Nhóm `audit.*` trong seed backend vẫn ghi là
 * "nhật ký kiểm toán"; map lại sang "nhật ký hoạt động" cho khớp với trang Nhật ký
 * hoạt động. Bỏ override này khi seed backend được đổi tên tương ứng.
 */
const PERMISSION_LABEL_OVERRIDES: Record<string, string> = {
  'audit.view_self': 'Xem nhật ký hoạt động của chính mình',
  'audit.view_team': 'Xem nhật ký hoạt động của team',
  'audit.view_all': 'Xem nhật ký hoạt động toàn hệ thống',
}

function permissionLabel(permission: Permission) {
  return PERMISSION_LABEL_OVERRIDES[permission.code] ?? permission.name
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'dd/MM/yyyy HH:mm')
}

function scopeText(scopeType: ScopeType, teamName?: string) {
  if (scopeType === 'TEAM') return `TEAM · ${teamName ?? 'chưa gán team'}`
  return scopeType
}

function groupByCategory(permissions: Permission[]) {
  const map = new Map<string, Permission[]>()
  for (const permission of [...permissions].sort((a, b) => a.code.localeCompare(b.code))) {
    const key = categoryOf(permission.code)
    const list = map.get(key) ?? []
    list.push(permission)
    map.set(key, list)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export function AccessControlPage() {
  const { user } = useAuth()
  const can = (permission: string) => user?.permissions.includes(permission) ?? false

  const canManageUsers = can('user.manage')
  const canViewRoles = can('role.view')
  const canManageRoles = can('role.manage')
  const canViewPermissions = can('permission.view')
  const visibleTabs = [
    canManageUsers ? 'accounts' : null,
    canViewRoles ? 'roles' : null,
    canViewRoles && canViewPermissions ? 'matrix' : null,
    canViewPermissions ? 'permissions' : null,
  ].filter((tab): tab is 'accounts' | 'roles' | 'matrix' | 'permissions' => Boolean(tab))
  const defaultTab = visibleTabs[0]
  // Tab nằm trên URL để gửi link thẳng tới ma trận quyền hay danh mục quyền.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const activeTab = visibleTabs.find((tab) => tab === tabFromUrl) ?? defaultTab

  function changeTab(tab: string) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  const usersQuery = useQuery({
    queryKey: [...AC_KEYS.users, { pageSize: USERS_PAGE_SIZE }],
    queryFn: () => listUsers({ page: 1, pageSize: USERS_PAGE_SIZE }),
    enabled: canManageUsers,
  })
  const rolesQuery = useQuery({ queryKey: AC_KEYS.roles, queryFn: listRoles, enabled: canViewRoles })
  const permissionsQuery = useQuery({ queryKey: AC_KEYS.permissions, queryFn: listPermissions, enabled: canViewPermissions })
  const teamsQuery = useQuery({ queryKey: AC_KEYS.teams, queryFn: listTeams, enabled: canManageUsers })
  // Chỉ để đổ dropdown "gắn nhân sự" nên lọc sẵn nhân sự đã nghỉ ở BE — danh sách này khác
  // với query đầy đủ của trang Nhân sự, nên query key phải mang theo cờ excludeLeft.
  const employeesQuery = useQuery({
    queryKey: ['org', 'employees', { pageSize: EMPLOYEES_PAGE_SIZE, excludeLeft: true }],
    queryFn: () => listEmployees({ page: 1, pageSize: EMPLOYEES_PAGE_SIZE, excludeLeft: true }),
    enabled: canManageUsers,
  })

  const roles = rolesQuery.data ?? []
  const permissions = permissionsQuery.data ?? []
  const teams = teamsQuery.data ?? []
  const users = usersQuery.data?.data ?? []
  const totalUsers = usersQuery.data?.meta.total ?? 0
  const employees = employeesQuery.data?.data ?? []
  // employeeId đã gắn với 1 tài khoản nào đó (dùng để loại khỏi danh sách chọn "gắn nhân sự").
  const linkedEmployeeIds = new Set(users.map((account) => account.employeeId).filter((id): id is string => Boolean(id)))

  const activeUsers = users.filter((item) => item.status === 'ACTIVE').length
  const lockedUsers = users.filter((item) => item.status !== 'ACTIVE').length
  const systemRoles = roles.filter((role) => role.isSystemRole).length
  const customRoles = roles.filter((role) => !role.isSystemRole).length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Quản trị truy cập"
        title="Phân quyền & tài khoản"
        description="Quản lý vai trò, permission và phạm vi dữ liệu. Backend là nguồn kiểm tra quyền chính thức."
        action={
          <div className="flex gap-2">
            {canManageRoles && <CreateRoleDialog />}
            {canManageUsers && (
              <CreateUserDialog
                employees={employees}
                linkedEmployeeIds={linkedEmployeeIds}
                roles={roles}
                teams={teams}
              />
            )}
          </div>
        }
      />

      {canManageUsers || canViewRoles ? (
        <section className="grid gap-4 sm:grid-cols-3" aria-label="Chỉ số phân quyền">
          {canManageUsers ? (
            <MetricCard
              icon={UsersRound}
              tone="info"
              label="Tài khoản"
              value={formatNumber(totalUsers)}
              progress={toPercent(activeUsers, users.length)}
              note={`${formatNumber(activeUsers)} hoạt động · ${formatNumber(lockedUsers)} khóa hoặc vô hiệu`}
              loading={usersQuery.isLoading}
            />
          ) : null}
          {canViewRoles ? (
            <MetricCard
              icon={ShieldCheck}
              tone="success"
              label="Vai trò hệ thống"
              value={formatNumber(systemRoles)}
              note="Theo RBAC chuẩn, không xoá được"
              loading={rolesQuery.isLoading}
            />
          ) : null}
          {canViewRoles ? (
            <MetricCard
              icon={Settings2}
              tone="info"
              label="Vai trò tùy chỉnh"
              value={formatNumber(customRoles)}
              note="Được tạo thêm theo nhu cầu vận hành"
              loading={rolesQuery.isLoading}
            />
          ) : null}
        </section>
      ) : null}

      {activeTab ? <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList variant="line">
          {canManageUsers ? <TabsTrigger value="accounts">Tài khoản</TabsTrigger> : null}
          {canViewRoles ? <TabsTrigger value="roles">Vai trò hệ thống</TabsTrigger> : null}
          {canViewRoles && canViewPermissions ? <TabsTrigger value="matrix">Ma trận quyền</TabsTrigger> : null}
          {canViewPermissions ? <TabsTrigger value="permissions">Danh mục quyền</TabsTrigger> : null}
        </TabsList>

        {canManageUsers ? <TabsContent value="accounts" className="mt-3">
          <AccountsTab
              query={usersQuery}
              users={users}
              totalUsers={totalUsers}
              roles={roles}
              teams={teams}
              employees={employees}
              linkedEmployeeIds={linkedEmployeeIds}
          />
        </TabsContent> : null}

        {canViewRoles ? <TabsContent value="roles" className="mt-3">
          <RolesTab query={rolesQuery} roles={roles} permissions={permissions} canManageRoles={canManageRoles} />
        </TabsContent> : null}

        {canViewRoles && canViewPermissions ? <TabsContent value="matrix" className="mt-3">
          <MatrixTab roles={roles} permissions={permissions} loading={rolesQuery.isLoading || permissionsQuery.isLoading} />
        </TabsContent> : null}
        {canViewPermissions ? <TabsContent value="permissions" className="mt-3">
          <PermissionCatalogTab permissions={permissions} loading={permissionsQuery.isLoading} />
        </TabsContent> : null}
      </Tabs> : <PermissionNotice permission="user.manage, role.view hoặc permission.view" />}
    </div>
  )
}
function AccountsTab({
  query,
  users,
  totalUsers,
  roles,
  teams,
  employees,
  linkedEmployeeIds,
}: {
  query: QueryLike
  users: UserSummary[]
  totalUsers: number
  roles: Role[]
  teams: Team[]
  employees: Employee[]
  linkedEmployeeIds: Set<string>
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [gapFilter, setGapFilter] = useState(false)

  const teamName = useMemo(() => {
    const map = new Map<string, string>()
    for (const team of teams) map.set(team.id, team.name)
    return map
  }, [teams])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false
      // "Cần xử lý" = tài khoản chưa dùng được đúng nghĩa: chưa gán vai trò hoặc chưa gắn nhân sự.
      if (gapFilter && item.roles.length > 0 && item.employeeId) return false
      if (!term) return true
      return item.email.toLowerCase().includes(term) || item.fullName.toLowerCase().includes(term)
    })
  }, [gapFilter, search, statusFilter, users])

  const isFiltering = search.trim() !== '' || statusFilter !== 'ALL' || gapFilter

  function clearFilters() {
    setSearch('')
    setStatusFilter('ALL')
    setGapFilter(false)
  }

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-foreground">Tài khoản người dùng</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isFiltering
                    ? `${formatNumber(filtered.length)}/${formatNumber(users.length)} tài khoản khớp bộ lọc`
                    : `${formatNumber(users.length)} tài khoản`}
                  {totalUsers > users.length ? ` · ${formatNumber(totalUsers)} tài khoản tổng` : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_12rem_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="w-full pr-9 pl-8"
                placeholder="Tìm email hoặc họ tên"
                aria-label="Tìm tài khoản"
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
              <SelectTrigger className="w-full" aria-label="Lọc theo trạng thái tài khoản">
                <KeyRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Mọi trạng thái</SelectItem>
                {USER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>{STATUS_LABEL[status]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={gapFilter ? 'default' : 'outline'}
              onClick={() => setGapFilter((current) => !current)}
              aria-pressed={gapFilter}
            >
              <Filter className="size-4" aria-hidden="true" />
              {gapFilter ? 'Đang lọc: cần xử lý' : 'Chưa gán vai trò / nhân sự'}
            </Button>
          </div>
        </div>

        {query.isError ? (
          <QueryError error={query.error} onRetry={query.refetch} />
        ) : query.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            size="sm"
            icon={UsersRound}
            title={isFiltering ? 'Không có tài khoản phù hợp' : 'Chưa có tài khoản nào'}
            description={isFiltering
              ? 'Thử đổi từ khoá hoặc bỏ bớt bộ lọc để xem thêm tài khoản.'
              : 'Tạo tài khoản đầu tiên để cấp quyền truy cập hệ thống.'}
            action={isFiltering ? <Button variant="outline" onClick={clearFilters}><X className="size-4" />Xoá bộ lọc</Button> : undefined}
          />
        ) : (
          <Table className="min-w-200">
            <TableHeader>
              <TableRow>
                <TableHead>Người dùng</TableHead>
                <TableHead>Vai trò &amp; phạm vi</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Đăng nhập gần nhất</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <strong className="block font-semibold text-foreground">{account.fullName}</strong>
                    <span className="block text-xs text-muted-foreground">{account.email}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {account.employee ? `Nhân sự: ${account.employee.fullName}` : (
                        <span className="text-[var(--warning-700)]">Chưa gắn nhân sự</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-1.5">
                      {account.roles.length === 0 ? (
                        <span className="text-xs font-medium text-[var(--warning-700)]">Chưa gán vai trò</span>
                      ) : null}
                      {account.roles.map((assignment, index) => (
                        <Badge key={`${assignment.roleId}-${index}`} variant="secondary" className="gap-1">
                          {assignment.roleName}
                          <span className="font-normal text-muted-foreground">
                            ·{' '}
                            {scopeText(
                              assignment.scopeType,
                              assignment.scopeTeamId ? teamName.get(assignment.scopeTeamId) : undefined,
                            )}
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[account.status]}>{STATUS_LABEL[account.status]}</StatusBadge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(account.lastLoginAt)}</TableCell>
                  <TableCell className="text-right">
                    <ManageUserDialog
                      account={account}
                      roles={roles}
                      teams={teams}
                      employees={employees}
                      linkedEmployeeIds={linkedEmployeeIds}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

type RoleDraft = {
  roleId: string
  scopeType: ScopeType
  scopeTeamId: string
}

function emptyRoleDraft(): RoleDraft {
  return { roleId: '', scopeType: 'SELF', scopeTeamId: '' }
}

function normalizeSystemRoleDraft(draft: RoleDraft, roles: Role[]): RoleDraft {
  const role = roles.find((item) => item.id === draft.roleId)
  const fixedScope = role ? SYSTEM_ROLE_SCOPES[role.code] : undefined
  if (!fixedScope) return draft
  return {
    ...draft,
    scopeType: fixedScope,
    scopeTeamId: fixedScope === 'TEAM' ? draft.scopeTeamId : '',
  }
}

/** Suy các dòng vai trò mặc định từ nhóm nghiệp vụ của nhân sự (vai trò mặc định khai trong danh
 * mục nhóm, scope SELF) — khớp logic BE tự gán, để dialog hiển thị sẵn thay vì bắt Admin tự thêm. */
function defaultRoleDraftsForEmployee(employee: Employee | undefined, roles: Role[]): RoleDraft[] {
  if (!employee) return []
  const roleIds = Array.from(
    new Set(
      employee.employeeGroups
        .map((group) => group.defaultRoleId)
        .filter((roleId): roleId is string => Boolean(roleId)),
    ),
  )
  return roleIds
    .map((roleId) => roles.find((role) => role.id === roleId))
    .filter((role): role is Role => Boolean(role))
    .map((role) => ({ roleId: role.id, scopeType: 'SELF' as ScopeType, scopeTeamId: '' }))
}

/** Kiểm tra danh sách dòng phân quyền; trả về thông báo lỗi (tiếng Việt) hoặc null nếu hợp lệ. */
function validateRoleDrafts(drafts: RoleDraft[]): string | null {
  if (drafts.some((draft) => !draft.roleId)) {
    return 'Vui lòng chọn vai trò cho tất cả dòng phân quyền.'
  }
  if (drafts.some((draft) => draft.scopeType === 'TEAM' && !draft.scopeTeamId)) {
    return 'Scope TEAM bắt buộc phải chọn team.'
  }
  const seen = new Set<string>()
  for (const draft of drafts) {
    const key = `${draft.roleId}|${draft.scopeType}|${draft.scopeTeamId}`
    if (seen.has(key)) return 'Có dòng phân quyền bị trùng (cùng vai trò và phạm vi).'
    seen.add(key)
  }
  return null
}

function roleDraftsToPayload(drafts: RoleDraft[]): RoleAssignmentInput[] {
  return drafts.map((draft) =>
    draft.scopeType === 'TEAM'
      ? { roleId: draft.roleId, scopeType: draft.scopeType, scopeTeamId: draft.scopeTeamId }
      : { roleId: draft.roleId, scopeType: draft.scopeType },
  )
}

/** Khối "Vai trò & phạm vi dữ liệu" dùng chung cho dialog tạo mới và dialog quản lý tài khoản. */
function RoleScopeEditor({
  drafts,
  onChange,
  roles,
  teams,
}: {
  drafts: RoleDraft[]
  onChange: (next: RoleDraft[]) => void
  roles: Role[]
  teams: Team[]
}) {
  function updateDraft(index: number, patch: Partial<RoleDraft>) {
    onChange(drafts.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <strong className="text-sm">Vai trò & phạm vi dữ liệu</strong>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...drafts, emptyRoleDraft()])}
        >
          <Plus className="size-4" />
          Thêm vai trò
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {roles.length === 0 && (
          <p className="text-xs text-muted-foreground">Không tải được danh sách vai trò (cần quyền role.view).</p>
        )}
        {roles.length > 0 && drafts.length === 0 && (
          <p className="text-xs text-muted-foreground">Chưa có vai trò nào — bấm "Thêm vai trò" để gán.</p>
        )}
        {drafts.map((draft, index) => (
          (() => {
            const selectedRole = roles.find((role) => role.id === draft.roleId)
            const fixedScope = selectedRole ? SYSTEM_ROLE_SCOPES[selectedRole.code] : undefined
            return (
          <div key={index} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <Select value={draft.roleId} onValueChange={(value) => {
                  const role = roles.find((item) => item.id === value)
                  const nextScope = role ? SYSTEM_ROLE_SCOPES[role.code] : undefined
                  updateDraft(index, {
                    roleId: value,
                    scopeType: nextScope ?? draft.scopeType,
                    scopeTeamId: nextScope === 'TEAM' ? draft.scopeTeamId : '',
                  })
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Chọn vai trò" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={draft.scopeType}
                  disabled={Boolean(fixedScope)}
                  onValueChange={(value) =>
                    updateDraft(index, {
                      scopeType: value as ScopeType,
                      scopeTeamId: value === 'TEAM' ? draft.scopeTeamId : '',
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(drafts.filter((_, i) => i !== index))}
                aria-label="Xóa vai trò"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {draft.scopeType === 'TEAM' && (
              <Select value={draft.scopeTeamId} onValueChange={(value) => updateDraft(index, { scopeTeamId: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Chọn team cho scope TEAM" />
                </SelectTrigger>
                <SelectContent searchPlaceholder="Tìm team...">
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {fixedScope ? <p className="text-xs text-muted-foreground">
              Vai trò hệ thống {selectedRole?.name} sử dụng phạm vi {fixedScope} cố định.
            </p> : null}
          </div>
            )
          })()
        ))}
      </div>
    </div>
  )
}

function ManageUserDialog({
  account,
  roles,
  teams,
  employees,
  linkedEmployeeIds,
}: {
  account: UserSummary
  roles: Role[]
  teams: Team[]
  employees: Employee[]
  linkedEmployeeIds: Set<string>
}) {
  const queryClient = useQueryClient()
  const { user: currentUser, refreshUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState(account.fullName)
  const [email, setEmail] = useState(account.email)
  const [status, setStatus] = useState<UserStatus>(account.status)
  const [employeeId, setEmployeeId] = useState(account.employeeId ?? NONE)
  const [drafts, setDrafts] = useState<RoleDraft[]>([])
  const [formError, setFormError] = useState<string | null>(null)

  // Nhân sự chưa gắn tài khoản nào khác, cộng với nhân sự đang gắn với chính account này (nếu có)
  // để không bị biến mất khỏi danh sách chọn khi mở dialog.
  const availableEmployees = employees.filter((e) => !linkedEmployeeIds.has(e.id) || e.id === account.employeeId)
  // `employees` đã loại nhân sự đã nghỉ, nên tài khoản đang gắn với một người đã nghỉ phải được bù
  // lại từ chính account — nếu không, Select hiện trống và Admin không thấy tài khoản đang gắn ai.
  const employeeOptions: Array<{ id: string; fullName: string }> =
    account.employee && !availableEmployees.some((e) => e.id === account.employee?.id)
      ? [...availableEmployees, account.employee]
      : availableEmployees

  function handleOpenChange(next: boolean) {
    if (next) {
      setFullName(account.fullName)
      setEmail(account.email)
      setStatus(account.status)
      setEmployeeId(account.employeeId ?? NONE)
      setDrafts(
        account.roles.map((assignment) => ({
          roleId: assignment.roleId,
          scopeType: assignment.scopeType,
          scopeTeamId: assignment.scopeTeamId ?? '',
        })).map((draft) => normalizeSystemRoleDraft(draft, roles)),
      )
      setFormError(null)
    }
    setOpen(next)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updateUser(account.id, {
        fullName,
        email,
        status,
        employeeId: employeeId === NONE ? null : employeeId,
      })
      await setUserRoles(account.id, roleDraftsToPayload(drafts))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AC_KEYS.users })
      if (currentUser?.id === account.id) void refreshUser()
      toast.success('Đã cập nhật tài khoản')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    const draftError = validateRoleDrafts(drafts)
    if (draftError) {
      setFormError(draftError)
      return
    }
    saveMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Quản lý
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Quản lý tài khoản</DialogTitle>
          <DialogDescription>{account.email}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput id="user-fullname" label="Họ và tên" value={fullName} onChange={setFullName} />
            <LabeledInput id="user-email" label="Email" type="email" value={email} onChange={setEmail} />
            <div className="grid gap-1.5">
              <Label>Trạng thái</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as UserStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {STATUS_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Nhân sự liên kết</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent searchPlaceholder="Tìm nhân sự...">
                <SelectItem value={NONE}>Không gắn (tài khoản thuần hệ thống)</SelectItem>
                {employeeOptions.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Quyết định "xem của tôi" (KPI/OKR/dữ liệu cá nhân) — tài khoản chỉ dùng được tính năng này khi gắn đúng nhân sự.
            </p>
          </div>

          <RoleScopeEditor drafts={drafts} onChange={setDrafts} roles={roles} teams={teams} />

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

function CreateUserDialog({
  employees,
  linkedEmployeeIds,
  roles,
  teams,
}: {
  employees: Employee[]
  linkedEmployeeIds: Set<string>
  roles: Role[]
  teams: Team[]
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<UserStatus>('ACTIVE')
  const [employeeId, setEmployeeId] = useState(NONE)
  const [drafts, setDrafts] = useState<RoleDraft[]>([])
  // Admin đã tự sửa dòng vai trò chưa — nếu rồi thì đổi nhân sự KHÔNG ghi đè lựa chọn của họ.
  const [draftsTouched, setDraftsTouched] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const availableEmployees = employees.filter((e) => !linkedEmployeeIds.has(e.id))
  const selectedEmployee = employees.find((e) => e.id === employeeId)

  function handleOpenChange(next: boolean) {
    if (next) {
      setEmail('')
      setPassword('')
      setStatus('ACTIVE')
      setEmployeeId(NONE)
      setDrafts([])
      setDraftsTouched(false)
      setFormError(null)
    }
    setOpen(next)
  }

  // Chọn/đổi nhân sự → gợi ý sẵn vai trò theo nhóm nghiệp vụ (trừ khi Admin đã tự chỉnh).
  function handleEmployeeChange(next: string) {
    setEmployeeId(next)
    if (!draftsTouched) {
      const employee = next === NONE ? undefined : employees.find((e) => e.id === next)
      setDrafts(defaultRoleDraftsForEmployee(employee, roles))
    }
  }

  function handleDraftsChange(next: RoleDraft[]) {
    setDraftsTouched(true)
    setDrafts(next)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createUser({
        email,
        password,
        status,
        employeeId: employeeId === NONE ? undefined : employeeId,
        roles: roleDraftsToPayload(drafts),
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: AC_KEYS.users })
      if (created.roles.length === 0) {
        toast.warning('Đã tạo tài khoản nhưng chưa có vai trò — bấm "Quản lý" để gán vai trò & phạm vi.')
      } else {
        toast.success('Đã tạo tài khoản mới')
      }
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!email) {
      setFormError('Nhập email.')
      return
    }
    if (password.length < 8) {
      setFormError('Mật khẩu tối thiểu 8 ký tự.')
      return
    }
    const draftError = validateRoleDrafts(drafts)
    if (draftError) {
      setFormError(draftError)
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          Tạo tài khoản
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo tài khoản</DialogTitle>
          <DialogDescription>Tài khoản mới đăng nhập bằng email và mật khẩu được cấp.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <LabeledInput id="new-email" label="Email" type="email" value={email} onChange={setEmail} />
          <LabeledInput
            id="new-password"
            label="Mật khẩu (tối thiểu 8 ký tự)"
            type="password"
            value={password}
            onChange={setPassword}
          />
          <div className="grid gap-1.5">
            <Label>Trạng thái</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as UserStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_STATUSES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {STATUS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Gắn với nhân sự (không bắt buộc)</Label>
            <Select value={employeeId} onValueChange={handleEmployeeChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent searchPlaceholder="Tìm nhân sự...">
                <SelectItem value={NONE}>Không gắn (tài khoản thuần hệ thống)</SelectItem>
                {availableEmployees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedEmployee && (
              <p className="text-xs text-muted-foreground">
                {selectedEmployee.employeeGroups.length > 0
                  ? 'Đã gợi ý sẵn vai trò theo nhóm nghiệp vụ của nhân sự (phạm vi SELF). Chỉnh bên dưới nếu cần vai trò khác.'
                  : 'Nhân sự này chưa có nhóm nghiệp vụ nên chưa gợi ý được vai trò — hãy tự thêm bên dưới, nếu không tài khoản sẽ không có quyền.'}
              </p>
            )}
          </div>

          <RoleScopeEditor drafts={drafts} onChange={handleDraftsChange} roles={roles} teams={teams} />

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
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Tạo tài khoản
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RolesTab({
  query,
  roles,
  permissions,
  canManageRoles,
}: {
  query: QueryLike
  roles: Role[]
  permissions: Permission[]
  canManageRoles: boolean
}) {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const visibleRoles = term
    ? roles.filter((role) =>
        role.name.toLowerCase().includes(term) ||
        role.code.toLowerCase().includes(term) ||
        (role.description ?? '').toLowerCase().includes(term))
    : roles

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Danh sách vai trò</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {term ? `${formatNumber(visibleRoles.length)}/${formatNumber(roles.length)} vai trò khớp` : `${formatNumber(roles.length)} vai trò`}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="w-full pr-9 pl-8"
              placeholder="Tìm vai trò"
              aria-label="Tìm vai trò"
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
        </div>

        {query.isError ? (
          <QueryError error={query.error} onRetry={query.refetch} />
        ) : query.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
        ) : visibleRoles.length === 0 ? (
          <EmptyState
            size="sm"
            icon={ShieldCheck}
            title={term ? 'Không có vai trò phù hợp' : 'Chưa có vai trò nào'}
            description={term ? 'Thử từ khoá khác hoặc xoá tìm kiếm.' : 'Tạo vai trò để bắt đầu phân quyền cho tài khoản.'}
            action={term ? <Button variant="outline" onClick={() => setSearch('')}><X className="size-4" />Xoá tìm kiếm</Button> : undefined}
          />
        ) : (
          <ul className="divide-y">
            {visibleRoles.map((role) => (
              <li className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-muted/30" key={role.id}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${toneSurface.info}`}>
                  <UsersRound className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="flex flex-wrap items-center gap-2 text-sm">
                    {role.name}
                    <code className="text-xs font-normal text-muted-foreground">{role.code}</code>
                  </strong>
                  <span className="block text-xs text-muted-foreground">{role.description || 'Không có mô tả'}</span>
                </span>
                <Badge variant={role.isSystemRole ? 'outline' : 'secondary'}>
                  {role.isSystemRole ? 'Hệ thống' : 'Tùy chỉnh'}
                </Badge>
                <Badge variant="secondary">{formatNumber(role.rolePermissions.length)} quyền</Badge>
                <RolePermissionsDialog role={role} permissions={permissions} canManageRoles={canManageRoles} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RolePermissionsDialog({
  role,
  permissions,
  canManageRoles,
}: {
  role: Role
  permissions: Permission[]
  canManageRoles: boolean
}) {
  const queryClient = useQueryClient()
  const { refreshUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description ?? '')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [formError, setFormError] = useState<string | null>(null)

  const visiblePermissions = useMemo(
    () => permissions.length > 0
      ? permissions
      : role.rolePermissions.map((link) => link.permission),
    [permissions, role.rolePermissions],
  )
  const grouped = useMemo(() => groupByCategory(visiblePermissions), [visiblePermissions])

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(role.name)
      setDescription(role.description ?? '')
      setChecked(new Set(role.rolePermissions.map((link) => link.permission.code)))
      setFormError(null)
    }
    setOpen(next)
  }

  function toggle(code: string) {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const editable = canManageRoles
  const permissionsEditable = editable && role.code !== 'ADMIN'
  const metaChanged = !role.isSystemRole && (name !== role.name || description !== (role.description ?? ''))

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (metaChanged) {
        await updateRole(role.id, { name, description: description || undefined })
      }
      if (permissionsEditable) await setRolePermissions(role.id, [...checked])
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AC_KEYS.roles })
      void refreshUser()
      toast.success('Đã cập nhật vai trò')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {editable ? 'Sửa quyền' : 'Xem quyền'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role.name}</DialogTitle>
          <DialogDescription>
            <code className="text-xs">{role.code}</code> · {checked.size} / {visiblePermissions.length} quyền được chọn
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
          {!role.isSystemRole && (
            <div className="grid gap-3">
              <LabeledInput id={`role-name-${role.id}`} label="Tên vai trò" value={name} onChange={setName} disabled={!editable} />
              <div className="grid gap-1.5">
                <Label htmlFor={`role-desc-${role.id}`}>Mô tả</Label>
                <Textarea
                  id={`role-desc-${role.id}`}
                  value={description}
                  disabled={!editable}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
          )}

          {role.isSystemRole && editable && (
            <Alert>
              <AlertCircle />
              <AlertDescription>
                {role.code === 'ADMIN'
                  ? 'Vai trò ADMIN được khóa permission để tránh tự tước quyền quản trị hệ thống.'
                  : 'Đây là vai trò hệ thống. Thay đổi permission sẽ ảnh hưởng tới toàn bộ tài khoản mang vai trò này.'}
              </AlertDescription>
            </Alert>
          )}

          {editable && (
            <p className="text-xs text-muted-foreground">
              Quyền “Nhập doanh thu chính thức” được hệ thống khóa và chỉ cấp cho vai trò Kế toán.
            </p>
          )}

          <div className="space-y-4">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <p className="text-sm font-semibold text-foreground">{categoryLabel(category)}</p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {list.map((permission) => (
                    <label key={permission.code} className="flex items-start gap-2 rounded-lg border border-transparent p-2 text-sm hover:border-border hover:bg-muted/40">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-primary"
                        checked={checked.has(permission.code)}
                        disabled={
                          !permissionsEditable ||
                          permission.code === 'revenue.write'
                        }
                        onChange={() => toggle(permission.code)}
                      />
                      <span>{permissionLabel(permission)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
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
            Đóng
          </Button>
          {(metaChanged || permissionsEditable) && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Lưu thay đổi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateRoleDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName('')
      setDescription('')
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () => createRole({ name, description: description || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AC_KEYS.roles })
      toast.success('Đã tạo vai trò tùy chỉnh')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Nhập tên vai trò.')
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="size-4" />
          Tạo vai trò tùy chỉnh
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo vai trò tùy chỉnh</DialogTitle>
          <DialogDescription>
            Sau khi tạo, mở “Sửa quyền” để gán permission. Backend vẫn enforce quyền khi gọi API.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <LabeledInput id="role-name" label="Tên vai trò" value={name} onChange={setName} />
          <div className="grid gap-1.5">
            <Label htmlFor="role-description">Mô tả</Label>
            <Textarea id="role-description" value={description} onChange={(event) => setDescription(event.target.value)} />
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
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Tạo vai trò
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PermissionCatalogTab({ permissions, loading }: { permissions: Permission[]; loading: boolean }) {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const matched = term
    ? permissions.filter((permission) =>
        permission.code.toLowerCase().includes(term) || permissionLabel(permission).toLowerCase().includes(term))
    : permissions
  const grouped = useMemo(() => groupByCategory(matched), [matched])

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Toàn bộ permission của hệ thống</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {term ? `${formatNumber(matched.length)}/${formatNumber(permissions.length)} quyền khớp` : `${formatNumber(permissions.length)} quyền`}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="w-full pr-9 pl-8"
              placeholder="Tìm theo mã hoặc tên quyền"
              aria-label="Tìm quyền"
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
        </div>

        {loading ? (
          <div className="space-y-2 p-5">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div>
        ) : grouped.length === 0 ? (
          <EmptyState
            size="sm"
            icon={KeyRound}
            title="Không có quyền phù hợp"
            description="Không tìm thấy permission nào khớp từ khoá hiện tại."
            action={<Button variant="outline" onClick={() => setSearch('')}><X className="size-4" />Xoá tìm kiếm</Button>}
          />
        ) : (
          <div className="grid gap-5 p-5 md:grid-cols-2">
            {grouped.map(([category, list]) => (
              <section key={category}>
                <h3 className="text-sm font-semibold text-foreground">{categoryLabel(category)}</h3>
                <div className="mt-2 divide-y rounded-xl border">
                  {list.map((permission) => (
                    <div key={permission.code} className="p-3">
                      <span className="block text-sm font-medium">{permissionLabel(permission)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MatrixTab({ roles, permissions, loading }: { roles: Role[]; permissions: Permission[]; loading: boolean }) {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const roleColumns = useMemo(
    () => roles.map((role) => ({ role, codes: new Set(role.rolePermissions.map((link) => link.permission.code)) })),
    [roles],
  )
  const matched = term
    ? permissions.filter((permission) =>
        permission.code.toLowerCase().includes(term) || permissionLabel(permission).toLowerCase().includes(term))
    : permissions
  const grouped = useMemo(() => groupByCategory(matched), [matched])

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Ma trận vai trò × permission</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {term ? `${formatNumber(matched.length)}/${formatNumber(permissions.length)} quyền khớp` : 'Dấu ✓ là vai trò đang có quyền đó'}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="w-full pr-9 pl-8"
              placeholder="Lọc theo quyền"
              aria-label="Lọc quyền trong ma trận"
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
        </div>

        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-6 w-full" />)}</div>
        ) : grouped.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Settings2}
            title="Không có quyền phù hợp"
            description="Không tìm thấy permission nào khớp từ khoá hiện tại."
            action={<Button variant="outline" onClick={() => setSearch('')}><X className="size-4" />Xoá tìm kiếm</Button>}
          />
        ) : (
          <Table className="min-w-180">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 min-w-60 bg-card whitespace-normal">Quyền</TableHead>
                {roles.map((role) => (
                  <TableHead key={role.id} className="text-center">{role.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([category, list]) => (
                <Fragment key={category}>
                  <TableRow className="bg-muted/40">
                    <TableCell
                      colSpan={roles.length + 1}
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      {categoryLabel(category)}
                    </TableCell>
                  </TableRow>
                  {list.map((permission) => (
                    <TableRow key={permission.code}>
                      <TableCell className="sticky left-0 z-10 min-w-60 bg-card whitespace-normal">
                        <span className="block text-sm">{permissionLabel(permission)}</span>
                      </TableCell>
                      {roleColumns.map(({ role, codes }) => (
                        <TableCell key={role.id} className="text-center">
                          {codes.has(permission.code) ? (
                            <Check className="mx-auto size-4 text-[var(--success-700)]" aria-label="Có quyền" />
                          ) : (
                            <span className="text-muted-foreground" aria-label="Không có quyền">·</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function LabeledInput({
  id,
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  disabled?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function PermissionNotice({ permission }: { permission: string }) {
  return (
    <Card className="py-0">
      <EmptyState
        icon={ShieldCheck}
        tone="warning"
        title="Không đủ quyền truy cập"
        description={`Tài khoản của bạn cần permission ${permission} để xem nội dung này. Liên hệ quản trị hệ thống để được cấp quyền.`}
      />
    </Card>
  )
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => unknown }) {
  return (
    <div className="p-4">
      <ErrorState description={getApiErrorMessage(error)} onRetry={() => onRetry()} />
    </div>
  )
}
