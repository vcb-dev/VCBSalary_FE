import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Building2, CalendarDays, ChevronDown, ClipboardCheck, Filter, ListX, Loader2, Pencil, Plus, Search, Settings2, Target, UserRound, UserRoundCheck, UsersRound, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  cancelKpiAssignment,
  clearEmployeeKpiTargetOverride,
  createKpiAssignment,
  createKpiGroup,
  createKpiItem,
  deleteKpiGroup,
  getApiErrorMessage,
  getKpiGroup,
  getKpiProfile,
  leaderApproveKpiGroup,
  leaderRejectKpiGroup,
  listKpiAssignments,
  listKpiGroups,
  listKpiTargetsForPeriod,
  manualEnterKpiActual,
  overrideKpiActual,
  overrideEmployeeKpiTarget,
  selfConfirmKpiActual,
  setEmployeeKpiTarget,
  setKpiPeriodTarget,
  updateKpiActual,
  updateKpiGroup,
  updateKpiItem,
  type KpiGroup,
  type KpiGroupDetail,
  type KpiItem,
  type KpiPeriodTarget,
  type KpiProfileGroup,
  type KpiProfileItem,
} from '@/api/kpi'
import {
  approveProposal,
  createEmployeeOkr,
  createProposal,
  deleteEmployeeOkr,
  leaderApproveOkr,
  leaderRejectOkr,
  listEmployeeOkrs,
  listProposals,
  overrideOkrActual,
  rejectProposal,
  selfConfirmOkr,
  updateEmployeeOkr,
  updateEmployeeOkrReward,
  type EmployeeOkr,
  type KpiOkrProposal,
  type ProposalType,
} from '@/api/okr'
import { listEmployeeGroups, type EmployeeGroup } from '@/api/employee-groups'
import { listEmployees, listTeams, type Employee, type Team } from '@/api/organization'
import { listPayrollPeriods, type PayrollPeriod } from '@/api/payroll-periods'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { PageHeader } from '@/components/shared/PageHeader'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatMoney, formatNumber, toPercent } from '@/lib/format'
import { isRecordEditable, periodStageHint, resolvePeriodStage, type PeriodStage } from '@/lib/period-stage'
import { toneSurface, type Tone } from '@/lib/tone'
import { KpiSyncDialog } from './KpiSyncDialog'

const KPI_KEYS = {
  groups: ['kpi', 'groups'] as const,
  group: (id: string) => ['kpi', 'groups', id] as const,
  targets: (periodId: string) => ['kpi', 'period-targets', periodId] as const,
  assignments: (periodId: string, employeeId?: string, teamId?: string | null) =>
    ['kpi', 'assignments', periodId, employeeId ?? 'all', teamId ?? 'all-teams'] as const,
  profile: (periodId: string, employeeId: string) => ['kpi', 'profile', periodId, employeeId] as const,
}
const EMPLOYEE_GROUPS_KEY = ['org', 'employee-groups'] as const
const OKR_KEYS = {
  okrs: (periodId: string, employeeId: string) => ['okr', 'list', periodId, employeeId] as const,
  proposals: ['okr', 'proposals'] as const,
}
const PERIODS_PAGE_SIZE = 100
const EMPLOYEES_PAGE_SIZE = 100
const EMPTY_EMPLOYEES: Employee[] = []
const EMPTY_TEAMS: Team[] = []
const EMPTY_EMPLOYEE_GROUPS: EmployeeGroup[] = []
const PROPOSAL_TYPE_LABEL: Record<ProposalType, string> = {
  KPI_ITEM: 'Đầu mục KPI',
  OKR: 'OKR',
}

function findCurrentPayrollPeriodId(periods: PayrollPeriod[]) {
  const today = new Date()
  const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return periods.find((period) => {
    const start = new Date(`${period.startDate.slice(0, 10)}T00:00:00`).getTime()
    const end = new Date(`${period.endDate.slice(0, 10)}T23:59:59`).getTime()
    return start <= todayAtMidnight && todayAtMidnight <= end
  })?.id ?? null
}

export function KpiOkrPage() {
  const { user } = useAuth()
  const can = (permission: string) => user?.permissions.includes(permission) ?? false
  const canViewKpi = can('kpi.view_self') || can('kpi.view_team') || can('kpi.view_all')
  const canViewOkr = can('okr.view_self') || can('okr.view_team') || can('okr.view_all')
  const canReviewProposals = can('kpi.leader_approve') || can('okr.leader_approve')
  const canViewProposals = can('okr.propose') || canReviewProposals
  const canConfigureKpi = can('kpi.configure')
  const canViewKpiConfig = canConfigureKpi || can('kpi.delete_group')
  const canSyncView = can('sync.view')
  const canSyncTrigger = can('sync.trigger')
  const canChooseScopedProfile = can('kpi.view_team') || can('kpi.view_all') || can('okr.view_team') || can('okr.view_all')
  const canViewAllProfiles = can('kpi.view_all') || can('okr.view_all')
  const canViewOwnProfile = can('kpi.view_self') || can('okr.view_self')
  const selectionMode = canChooseScopedProfile ? 'scoped' : 'self'
  const shouldShowProfileContext = canViewKpi || canViewOkr
  const visibleTabs = [
    canViewKpi ? 'kpi' : null,
    canViewOkr ? 'okr' : null,
    canViewProposals ? 'proposals' : null,
    canViewKpiConfig ? 'config' : null,
  ].filter((tab): tab is 'kpi' | 'okr' | 'proposals' | 'config' => Boolean(tab))
  const defaultTab = visibleTabs[0]
  const accessLabel = can('kpi.view_all') || can('okr.view_all') ? 'Toàn hệ thống' : canChooseScopedProfile ? 'Phạm vi team' : 'Hồ sơ cá nhân'
  // Tab nằm trên URL để chia sẻ được link tới đúng tab (ví dụ hàng chờ duyệt) và không mất khi F5.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const activeTab = visibleTabs.find((tab) => tab === tabFromUrl) ?? defaultTab

  function changeTab(tab: string) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [selectedProfileTeamId, setSelectedProfileTeamId] = useState<string | null>(null)
  // Scope TEAM do Access Control gán là nguồn chính xác để xác định team Leader quản lý.
  // Tài khoản có quyền ALL không cần ưu tiên scope nào, ProfileContext sẽ chọn team đầu tiên.
  const preferredTeamIds = useMemo(
    () =>
      canViewAllProfiles
        ? []
        : (user?.roles ?? [])
            .filter((role) => role.scopeType === 'TEAM' && role.scopeTeamId)
            .map((role) => role.scopeTeamId!),
    [canViewAllProfiles, user?.roles],
  )
  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', { pageSize: PERIODS_PAGE_SIZE }],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: PERIODS_PAGE_SIZE }),
  })
  const activePeriodId = selectedPeriodId ?? findCurrentPayrollPeriodId(periodsQuery.data?.data ?? [])
  // Trạng thái kỳ quyết định nhóm nút nào được mở: OPEN cho nhập liệu, IN_REVIEW cho xác nhận/duyệt.
  const activePeriod = (periodsQuery.data?.data ?? []).find((period) => period.id === activePeriodId)
  const periodStage = resolvePeriodStage(activePeriod?.status)
  const activeEmployeeId = selectedEmployeeId ?? (selectionMode === 'self' && canViewOwnProfile ? user?.employeeId ?? null : null)

  // Dùng chung query key với ProposalTab — react-query dedupe, không tốn thêm request khi mở tab.
  const proposalsQuery = useQuery({ queryKey: OKR_KEYS.proposals, queryFn: listProposals, enabled: canViewProposals })
  const pendingProposalsCount = (proposalsQuery.data ?? []).filter((p) => p.status === 'PENDING').length

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={`Theo dõi hiệu suất · ${accessLabel}`}
        title="KPI & OKR"
        description={canChooseScopedProfile ? 'Theo dõi KPI và OKR trong phạm vi được phân quyền; mỗi đầu mục được xét và duyệt độc lập.' : 'Theo dõi, cập nhật và xác nhận KPI/OKR của hồ sơ cá nhân theo kỳ lương.'}
        action={
          <div className="flex flex-wrap gap-2">
            {canSyncView || canSyncTrigger ? <KpiSyncDialog canTrigger={canSyncTrigger} canView={canSyncView} /> : null}
            {canViewKpi && periodStage.isDataEntry ? <AssignKpiDialog periodId={activePeriodId} employeeId={activeEmployeeId} teamId={selectedProfileTeamId} /> : null}
            {canViewOkr && periodStage.isDataEntry ? <CreateOkrDialog periodId={activePeriodId} employeeId={activeEmployeeId} /> : null}
          </div>
        }
      />
      {shouldShowProfileContext ? <ProfileContext
        selectedPeriodId={activePeriodId}
        onSelectPeriod={setSelectedPeriodId}
        selectedEmployeeId={activeEmployeeId}
        onSelectEmployee={setSelectedEmployeeId}
        selectionMode={selectionMode}
        canListEmployees={can('employee.view_self') || can('employee.view_team') || can('employee.view_all')}
        preferredTeamIds={preferredTeamIds}
        ownEmployeeId={user?.employeeId ?? null}
        onTeamChanged={setSelectedProfileTeamId}
      /> : null}
      {activeTab ? <Tabs value={activeTab} onValueChange={changeTab} className="gap-0">
        <TabsList variant="line" className="w-full max-w-full justify-start overflow-x-auto">
          {canViewKpi ? <TabsTrigger value="kpi">
            <Target className="size-4" />
            Nhóm KPI
          </TabsTrigger> : null}
          {canViewOkr ? <TabsTrigger value="okr">
            <ClipboardCheck className="size-4" />
            OKR
          </TabsTrigger> : null}
          {canViewProposals ? <TabsTrigger value="proposals">
            <UserRoundCheck className="size-4" />
            Đề xuất chờ duyệt
            {pendingProposalsCount > 0 ? (
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-bold ${toneSurface.warning}`}>
                {formatNumber(pendingProposalsCount)}
              </span>
            ) : null}
          </TabsTrigger> : null}
          {canViewKpiConfig ? <TabsTrigger value="config">
            <Settings2 className="size-4" />
            Cấu hình KPI
          </TabsTrigger> : null}
        </TabsList>
        {canViewKpi ? <TabsContent value="kpi" className="mt-3"><KpiTab periodId={activePeriodId} employeeId={activeEmployeeId} stage={periodStage} /></TabsContent> : null}
        {canViewOkr ? <TabsContent value="okr" className="mt-3"><OkrTab periodId={activePeriodId} employeeId={activeEmployeeId} stage={periodStage} /></TabsContent> : null}
        {canViewProposals ? <TabsContent value="proposals" className="mt-3"><ProposalTab periodId={activePeriodId} /></TabsContent> : null}
        {canViewKpiConfig ? <TabsContent value="config" className="mt-3"><KpiConfigTab /></TabsContent> : null}
      </Tabs> : <PermissionNotice message="Tài khoản của bạn chưa được cấp quyền xem KPI, OKR hoặc cấu hình KPI." />}
    </div>
  )
}
function ProfileContext({
  selectedPeriodId,
  onSelectPeriod,
  selectedEmployeeId,
  onSelectEmployee,
  selectionMode,
  canListEmployees,
  preferredTeamIds,
  ownEmployeeId,
  onTeamChanged,
}: {
  selectedPeriodId: string | null
  onSelectPeriod: (id: string) => void
  selectedEmployeeId: string | null
  onSelectEmployee: (id: string | null) => void
  selectionMode: 'self' | 'scoped'
  canListEmployees: boolean
  preferredTeamIds: string[]
  ownEmployeeId: string | null
  onTeamChanged: (teamId: string | null) => void
}) {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const employeesQuery = useQuery({
    queryKey: ['org', 'employees', { pageSize: EMPLOYEES_PAGE_SIZE, excludeLeft: true }],
    queryFn: () => listEmployees({ page: 1, pageSize: EMPLOYEES_PAGE_SIZE, excludeLeft: true }),
    enabled: canListEmployees,
  })
  const employees = employeesQuery.data?.data ?? EMPTY_EMPLOYEES
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId)
  const effectiveTeamId = selectedTeamId ?? selectedEmployee?.teamId ?? null
  const employeeBelongsToTeam = (employee: Employee, teamId: string | null) =>
    Boolean(teamId) &&
    (employee.teamId === teamId ||
      (employee.teamMemberships ?? []).some((membership) => membership.teamId === teamId))
  const teams = useMemo(
    () => Array.from(new Map(
      employees.flatMap((employee) =>
        (employee.teamMemberships?.length
          ? employee.teamMemberships.map((membership) => membership.team)
          : [employee.team]
        ).map((team) => [team.id, team] as const),
      ),
    ).values())
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [employees],
  )
  // Phòng ban suy ra từ chính các team đang có nhân sự. KPI/OKR chưa được BE scope theo phòng ban,
  // nên đây là bộ lọc cấp trên của team: chọn phòng ban chỉ thu hẹp danh sách team bên dưới.
  const departments = useMemo(
    () => Array.from(new Map(teams.map((team) => [team.department.id, team.department])).values())
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [teams],
  )
  const effectiveDepartmentId =
    selectedDepartmentId ?? teams.find((team) => team.id === effectiveTeamId)?.departmentId ?? null
  const departmentTeams = effectiveDepartmentId
    ? teams.filter((team) => team.departmentId === effectiveDepartmentId)
    : teams
  const teamEmployees = effectiveTeamId
    ? employees.filter((employee) => employeeBelongsToTeam(employee, effectiveTeamId))
    : []

  // Khi vừa vào trang, luôn có một ngữ cảnh để hiển thị thay vì bắt người dùng chọn 3 dropdown.
  // Leader ưu tiên team trong role scope; quyền ALL chọn team đầu tiên đang có dữ liệu. Sau đó chọn
  // nhân sự đầu tiên của team đó. Effect chỉ bù lựa chọn trống/không hợp lệ nên không ghi đè lựa
  // chọn chủ động của người dùng.
  useEffect(() => {
    if (selectionMode !== 'scoped' || employeesQuery.isLoading || teams.length === 0) return

    const currentTeamIsValid = selectedTeamId != null && teams.some((team) => team.id === selectedTeamId)
    const scopedTeamId = preferredTeamIds.find((teamId) => teams.some((team) => team.id === teamId))
    const ownTeamId = employees.find((employee) => employee.id === ownEmployeeId)?.teamId
    const defaultTeamId = scopedTeamId ?? ownTeamId ?? teams[0].id
    const teamId = currentTeamIsValid ? selectedTeamId : defaultTeamId
    const firstEmployeeId = employees.find((employee) => employeeBelongsToTeam(employee, teamId))?.id ?? null
    const currentEmployeeIsInTeam = employees.some(
      (employee) => employee.id === selectedEmployeeId && employeeBelongsToTeam(employee, teamId),
    )
    // Phòng ban luôn bám theo team đang chọn để 3 dropdown không lệch nhau.
    const departmentId = teams.find((team) => team.id === teamId)?.departmentId ?? null

    // oxlint-disable-next-line react/set-state-in-effect -- dữ liệu query quyết định lựa chọn mặc định
    if (!currentTeamIsValid) setSelectedTeamId(teamId)
    // oxlint-disable-next-line react/set-state-in-effect -- department phải bám theo team vừa suy ra
    if (selectedDepartmentId !== departmentId) setSelectedDepartmentId(departmentId)
    onTeamChanged(teamId)
    if (!currentEmployeeIsInTeam) onSelectEmployee(firstEmployeeId)
  }, [
    employees,
    employeesQuery.isLoading,
    ownEmployeeId,
    onTeamChanged,
    onSelectEmployee,
    preferredTeamIds,
    selectedDepartmentId,
    selectedEmployeeId,
    selectedTeamId,
    selectionMode,
    teams,
  ])

  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', { pageSize: PERIODS_PAGE_SIZE }],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: PERIODS_PAGE_SIZE }),
  })
  const periods = periodsQuery.data?.data ?? []

  // Đổi phòng ban thì nhảy luôn sang team đầu tiên của phòng ban đó, tránh trạng thái trống giữa
  // chừng (effect bên trên sẽ kéo lựa chọn về team mặc định nếu để team = null).
  function handleDepartmentChange(departmentId: string) {
    const firstTeamId = teams.find((team) => team.departmentId === departmentId)?.id ?? null
    setSelectedDepartmentId(departmentId)
    setSelectedTeamId(firstTeamId)
    onTeamChanged(firstTeamId)
    if (selectedEmployee && !employeeBelongsToTeam(selectedEmployee, firstTeamId)) onSelectEmployee(null)
  }

  function handleTeamChange(teamId: string) {
    setSelectedTeamId(teamId)
    setSelectedDepartmentId(teams.find((team) => team.id === teamId)?.departmentId ?? null)
    onTeamChanged(teamId)
    if (selectedEmployee && !employeeBelongsToTeam(selectedEmployee, teamId)) onSelectEmployee(null)
  }

  const initials = selectedEmployee
    ? selectedEmployee.fullName
        .split(' ')
        .filter(Boolean)
        .slice(-2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : '—'

  const ownEmployee = ownEmployeeId ? employees.find((employee) => employee.id === ownEmployeeId) : undefined
  const canJumpToOwnProfile =
    selectionMode === 'scoped' && Boolean(ownEmployee) && selectedEmployeeId !== ownEmployeeId

  // Leader xem hồ sơ người khác cả ngày; cần một lối về hồ sơ của chính mình không phải dò 3 dropdown.
  function selectOwnProfile() {
    if (!ownEmployee) return
    setSelectedTeamId(ownEmployee.teamId)
    setSelectedDepartmentId(teams.find((team) => team.id === ownEmployee.teamId)?.departmentId ?? null)
    onTeamChanged(ownEmployee.teamId)
    onSelectEmployee(ownEmployee.id)
  }

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Hồ sơ đang xem</p>
            {selectedEmployee ? (
              <p className="mt-0.5 text-sm font-semibold">
                {selectedEmployee.fullName}{' '}
                <span className="font-normal text-muted-foreground">
                  · {selectedEmployee.jobTitle} · {teams.find((team) => team.id === effectiveTeamId)?.department.name ?? selectedEmployee.team.department.name} · {teams.find((team) => team.id === effectiveTeamId)?.name ?? selectedEmployee.team.name}
                </span>
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {employeesQuery.isLoading ? 'Đang tải danh sách nhân sự…' : 'Chưa chọn nhân sự'}
              </p>
            )}
            {canJumpToOwnProfile ? (
              <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs" onClick={selectOwnProfile}>
                <UserRound className="size-3.5" aria-hidden="true" />
                Xem hồ sơ của tôi
              </Button>
            ) : null}
          </div>
        </div>
        <div className={selectionMode === 'scoped' ? 'grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:grid-cols-[11rem_11rem_14rem_12rem]' : 'w-full sm:w-72'}>
          {selectionMode === 'scoped' ? <>
          <Select
            value={effectiveDepartmentId ?? undefined}
            onValueChange={handleDepartmentChange}
            disabled={employeesQuery.isLoading || departments.length === 0}
          >
            <SelectTrigger className="w-full min-w-0">
              <Building2 className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder={departments.length === 0 ? 'Chưa có phòng ban' : 'Chọn phòng ban'} />
            </SelectTrigger>
            <SelectContent searchPlaceholder="Tìm phòng ban...">
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={effectiveTeamId ?? undefined}
            onValueChange={handleTeamChange}
            disabled={employeesQuery.isLoading || departmentTeams.length === 0}
          >
            <SelectTrigger className="w-full min-w-0">
              <UsersRound className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder={departmentTeams.length === 0 ? 'Chưa có team' : 'Chọn team'} />
            </SelectTrigger>
            <SelectContent searchPlaceholder="Tìm team...">
              {departmentTeams.map((team) => (
                <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedEmployeeId ?? undefined}
            onValueChange={onSelectEmployee}
            disabled={!effectiveTeamId || employeesQuery.isLoading || teamEmployees.length === 0}
          >
            <SelectTrigger className="w-full min-w-0">
              <Filter className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder={!effectiveTeamId ? 'Chọn team trước' : teamEmployees.length === 0 ? 'Không có nhân sự' : 'Chọn nhân sự'} />
            </SelectTrigger>
            <SelectContent searchPlaceholder="Tìm nhân sự...">
              {teamEmployees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </> : null}
          <Select
            value={selectedPeriodId ?? undefined}
            onValueChange={onSelectPeriod}
            disabled={periodsQuery.isLoading || periods.length === 0}
          >
            <SelectTrigger className="w-full min-w-0">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder={periods.length === 0 ? 'Chưa có kỳ lương' : 'Chọn kỳ lương'} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}

function KpiTab({ periodId, employeeId, stage }: { periodId: string | null; employeeId: string | null; stage: PeriodStage }) {
  const { user } = useAuth()
  const isSelf = Boolean(employeeId) && user?.employeeId === employeeId
  // Bản ghi còn nháp được sửa trước khi tự xác nhận, kể cả khi kỳ đã chuyển sang duyệt.
  const isOwnProfile = (user?.permissions.includes('kpi.self_confirm') ?? false) && isSelf
  const canSelfConfirm = isOwnProfile && stage.isReview
  const canLeaderReview = (user?.permissions.includes('kpi.leader_approve') ?? false) && !isSelf && stage.isReview
  const canOverride = (user?.permissions.includes('kpi.override') ?? false) && !isSelf
  // UI chỉ hiển thị cho quyền Leader; BE kiểm tra thêm scope TEAM/ALL để user SELF không thể gọi API.
  // Mục tiêu chỉ đặt được trong giai đoạn nhập liệu — kỳ đang duyệt thì target phải đứng yên.
  const canManageEmployeeTargets = (user?.permissions.includes('kpi.leader_approve') ?? false) && stage.isDataEntry

  const profileQuery = useQuery({
    queryKey: periodId && employeeId ? KPI_KEYS.profile(periodId, employeeId) : ['kpi', 'profile', 'none'],
    queryFn: () => getKpiProfile(periodId!, employeeId!),
    enabled: Boolean(periodId && employeeId),
  })

  if (!periodId || !employeeId) {
    return (
      <InfoNotice
        title="Chưa chọn hồ sơ để xem"
        message='Chọn kỳ lương và nhân sự ở phần "Hồ sơ đang xem" phía trên để hiển thị KPI của kỳ đó.'
      />
    )
  }
  if (profileQuery.isLoading) {
    return <TabSkeleton rows={2} />
  }
  if (profileQuery.isError) {
    return <QueryError error={profileQuery.error} onRetry={() => profileQuery.refetch()} />
  }

  const groups = profileQuery.data?.groups ?? []

  if (groups.length === 0) {
    return (
      <InfoNotice
        title="Chưa có nhóm KPI nào trong kỳ"
        message="Nhân sự này chưa được gán nhóm KPI cho kỳ đã chọn. Dùng nút “Gán nhóm KPI” ở đầu trang hoặc kiểm tra lại nhóm nghiệp vụ của họ."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PeriodStageNotice stage={stage} />
      {groups.map((group) => (
        <KpiGroupProgressCard
          key={group.assignmentId}
          group={group}
          periodId={periodId}
          employeeId={employeeId}
          stage={stage}
          isOwnProfile={isOwnProfile}
          canSelfConfirm={canSelfConfirm}
          canLeaderReview={canLeaderReview}
          canOverride={canOverride}
          canManageEmployeeTargets={canManageEmployeeTargets}
        />
      ))}
    </div>
  )
}

/** Khung chờ khớp bố cục thật của các tab: vài thẻ nội dung xếp dọc. */
function TabSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Đang tải dữ liệu">
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index} className="py-0">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-56" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function KpiGroupProgressCard({
  group,
  periodId,
  employeeId,
  stage,
  isOwnProfile,
  canSelfConfirm,
  canLeaderReview,
  canOverride,
  canManageEmployeeTargets,
}: {
  group: KpiProfileGroup
  periodId: string
  employeeId: string
  stage: PeriodStage
  isOwnProfile: boolean
  canSelfConfirm: boolean
  canLeaderReview: boolean
  canOverride: boolean
  canManageEmployeeTargets: boolean
}) {
  const queryClient = useQueryClient()
  const [reviewError, setReviewError] = useState<string | null>(null)

  const isEmpty = group.items.length === 0
  const allConfirmed = !isEmpty && group.items.every((item) => item.selfConfirmationStatus === 'CONFIRMED')
  const allApproved = !isEmpty && group.items.every((item) => item.leaderReviewStatus === 'APPROVED')
  const allPendingReview = !isEmpty && group.items.every((item) => item.leaderReviewStatus === 'PENDING')
  const anyRejected = group.items.some((item) => item.leaderReviewStatus === 'REJECTED')
  const statusTone: Tone = isEmpty ? 'muted' : allApproved ? 'success' : anyRejected ? 'danger' : allConfirmed ? 'warning' : 'muted'
  const statusLabel = isEmpty ? 'Chưa cấu hình' : allApproved ? 'Đã duyệt' : anyRejected ? 'Bị từ chối' : allConfirmed ? 'Chờ duyệt' : 'Đang nhập'
  const confirmedCount = group.items.filter((item) => item.selfConfirmationStatus === 'CONFIRMED').length

  const approveMutation = useMutation({
    mutationFn: () => leaderApproveKpiGroup(group.kpiGroupId, employeeId, periodId, group.teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId, employeeId) })
      toast.success('Đã duyệt nhóm KPI')
      setReviewError(null)
    },
    onError: (error) => setReviewError(getApiErrorMessage(error)),
  })

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-muted px-2 py-1 text-xs font-semibold tracking-wide text-muted-foreground">{group.kpiGroupCode}</code>
                <StatusBadge tone="muted">{group.teamName}</StatusBadge>
              </div>
              <h2 className="mt-2 truncate text-lg font-bold tracking-tight text-foreground">{group.kpiGroupName}</h2>
              {group.progressPercent == null ? (
                <p className="mt-1 text-sm text-muted-foreground">Chưa thiết lập target cho kỳ này.</p>
              ) : (
                <div className="mt-2 max-w-md">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Tiến độ nhóm</span>
                    <span className="font-bold text-foreground tabular-nums">{group.progressPercent.toFixed(1)}%</span>
                  </div>
                  <ProgressBar
                    className="mt-1.5"
                    value={group.progressPercent}
                    tone={group.progressPercent >= 100 ? 'success' : group.progressPercent >= 50 ? 'info' : 'warning'}
                    label={`Tiến độ nhóm ${group.kpiGroupName}`}
                  />
                  {!isEmpty ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {formatNumber(confirmedCount)}/{formatNumber(group.items.length)} đầu mục đã tự xác nhận
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
            {canLeaderReview && !isEmpty && allPendingReview ? (
              <div className="flex gap-2">
                <LeaderRejectDialog
                  groupId={group.kpiGroupId}
                  employeeId={employeeId}
                  periodId={periodId}
                  teamId={group.teamId}
                  disabled={!allConfirmed}
                />
                <Button size="sm" disabled={!allConfirmed || approveMutation.isPending} onClick={() => approveMutation.mutate()}>
                  {approveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Duyệt nhóm
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {canLeaderReview && !isEmpty && !allConfirmed ? (
          <div className={`mx-5 mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.warning}`}>
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Còn {formatNumber(group.items.length - confirmedCount)} đầu mục chưa được nhân sự tự xác nhận, nên chưa thể duyệt hoặc từ chối cả nhóm.
          </div>
        ) : null}
        {reviewError ? (
          <p className={`mx-5 mt-4 rounded-lg px-3 py-2 text-sm ${toneSurface.danger}`}>{reviewError}</p>
        ) : null}

        {isEmpty ? (
          <EmptyState
            size="sm"
            icon={ListX}
            title="Chưa có đầu mục KPI hoạt động"
            description="Thêm đầu mục và đặt mục tiêu trong tab Cấu hình KPI để nhóm này có thể được theo dõi."
          />
        ) : (
          <Table className="min-w-180">
            <TableHeader>
              <TableRow>
                <TableHead>Dòng KPI</TableHead>
                <TableHead className="text-right">Mục tiêu</TableHead>
                <TableHead className="text-right">Thực đạt</TableHead>
                <TableHead className="text-right">Giá trị tính KPI</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((item) => (
                <KpiItemRow
                  key={item.kpiItemId}
                  item={item}
                  periodId={periodId}
                  employeeId={employeeId}
                  teamId={group.teamId}
                  stage={stage}
                  isOwnProfile={isOwnProfile}
                  canSelfConfirm={canSelfConfirm}
                  canOverride={canOverride}
                  canManageEmployeeTargets={canManageEmployeeTargets}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function KpiItemRow({
  item,
  periodId,
  employeeId,
  teamId,
  stage,
  isOwnProfile,
  canSelfConfirm,
  canOverride,
  canManageEmployeeTargets,
}: {
  item: KpiProfileItem
  periodId: string
  employeeId: string
  teamId: string
  stage: PeriodStage
  isOwnProfile: boolean
  canSelfConfirm: boolean
  canOverride: boolean
  canManageEmployeeTargets: boolean
}) {
  const queryClient = useQueryClient()

  const confirmMutation = useMutation({
    mutationFn: () => selfConfirmKpiActual(item.actualId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId, employeeId) })
      toast.success('Đã tự xác nhận')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  const isDraft = item.selfConfirmationStatus === 'DRAFT' && Boolean(item.actualId)
  const recordEditable = isRecordEditable(stage)
  const canEdit = isOwnProfile && isDraft && recordEditable
    && (item.dataSource !== 'AUTOMATION_GEN_VIDEO' || item.requiresManualEntry)
  // Đầu mục đồng bộ tự động vẫn phải tự xác nhận được — nhân sự không sửa số nhưng vẫn phải chốt.
  const canConfirm = canSelfConfirm && isDraft
  const unit = item.kpiItemUnit ? <span className="text-xs font-normal text-muted-foreground"> {item.kpiItemUnit}</span> : null

  return (
    <TableRow>
      <TableCell>
        <strong className="block font-semibold text-foreground">{item.kpiItemName}</strong>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <code className="text-xs text-muted-foreground">{item.kpiItemCode}</code>
          {item.externalItemId ? <StatusBadge tone="info">Đồng bộ VCBI</StatusBadge> : null}
          {item.direction === 'AT_MOST' ? <StatusBadge tone="muted">Càng thấp càng tốt</StatusBadge> : null}
        </div>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {item.targetValue ? <>{formatNumber(item.targetValue)}{unit}</> : '—'}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {formatNumber(item.actualValue ?? 0)}{unit}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap font-semibold tabular-nums">
        {formatNumber(item.effectiveActualValue)}{unit}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <StatusBadge tone={item.selfConfirmationStatus === 'CONFIRMED' ? 'success' : 'muted'}>
            {item.selfConfirmationStatus === 'CONFIRMED' ? 'Đã tự xác nhận' : 'Chưa tự xác nhận'}
          </StatusBadge>
          <StatusBadge
            tone={item.leaderReviewStatus === 'APPROVED' ? 'success' : item.leaderReviewStatus === 'REJECTED' ? 'danger' : 'warning'}
          >
            {item.leaderReviewStatus === 'APPROVED' ? 'Leader đã duyệt' : item.leaderReviewStatus === 'REJECTED' ? 'Leader từ chối' : 'Chờ leader duyệt'}
          </StatusBadge>
          {item.leaderReviewStatus === 'REJECTED' && item.leaderRejectionReason ? (
            <p className="max-w-48 text-xs text-muted-foreground">Lý do: {item.leaderRejectionReason}</p>
          ) : null}
          {item.overrideValue != null && item.overrideReason ? (
            <p className="max-w-48 text-xs text-muted-foreground">Điều chỉnh: {item.overrideReason}</p>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          {canEdit ? <UpdateActualDialog item={item} periodId={periodId} employeeId={employeeId} /> : null}
          {canManageEmployeeTargets && item.targetDataSource !== 'AUTOMATION_GEN_VIDEO' && (!canOverride || item.targetValue == null) ? (
            <SetEmployeeKpiTargetDialog item={item} periodId={periodId} employeeId={employeeId} teamId={teamId} />
          ) : null}
          {canOverride && stage.isDataEntry && item.targetValue != null ? (
            <OverrideTargetDialog item={item} periodId={periodId} employeeId={employeeId} teamId={teamId} />
          ) : null}
          {canConfirm ? (
            <Button variant="outline" size="sm" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Tự xác nhận
            </Button>
          ) : null}
          {canOverride && recordEditable && item.actualId && item.requiresManualEntry ? <ManualActualDialog item={item} periodId={periodId} employeeId={employeeId} /> : null}
          {canOverride && recordEditable && item.leaderReviewStatus !== 'APPROVED' && (!stage.isReview || item.selfConfirmationStatus === 'CONFIRMED') && item.actualId && !item.requiresManualEntry ? <OverrideActualDialog item={item} periodId={periodId} employeeId={employeeId} /> : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

function OkrTab({ periodId, employeeId, stage }: { periodId: string | null; employeeId: string | null; stage: PeriodStage }) {
  const { user } = useAuth()
  const isSelf = Boolean(employeeId) && user?.employeeId === employeeId
  // OKR còn nháp được sửa trước khi tự xác nhận trong kỳ đang mở hoặc đang duyệt.
  const canUpdateSelf = (user?.permissions.includes('okr.update_self') ?? false) && isSelf
  const canSelfConfirm = (user?.permissions.includes('okr.self_confirm') ?? false) && isSelf && stage.isReview
  const canLeaderReview = (user?.permissions.includes('okr.leader_approve') ?? false) && !isSelf && stage.isReview
  // Đối xứng với quyền tạo OKR (`okr.create`) — không tự chặn theo isSelf vì BE cũng không chặn.
  // Xoá chỉ mở khi kỳ đang nhập liệu: kỳ đang duyệt thì OKR bị từ chối chỉ được sửa, không được xoá.
  const canDelete = (user?.permissions.includes('okr.create') ?? false) && stage.isDataEntry
  const canManageReward = (user?.permissions.includes('kpi_reward_rate.manage') ?? false) && isRecordEditable(stage)

  const okrsQuery = useQuery({
    queryKey: periodId && employeeId ? OKR_KEYS.okrs(periodId, employeeId) : ['okr', 'list', 'none'],
    queryFn: () => listEmployeeOkrs(periodId!, employeeId!),
    enabled: Boolean(periodId && employeeId),
  })

  if (!periodId || !employeeId) {
    return (
      <InfoNotice
        title="Chưa chọn hồ sơ để xem"
        message='Chọn kỳ lương và nhân sự ở phần "Hồ sơ đang xem" phía trên để hiển thị OKR của kỳ đó.'
      />
    )
  }
  if (okrsQuery.isLoading) {
    return <TabSkeleton rows={1} />
  }
  if (okrsQuery.isError) {
    return <QueryError error={okrsQuery.error} onRetry={() => okrsQuery.refetch()} />
  }

  const okrs = okrsQuery.data ?? []
  const approvedOkrs = okrs.filter((okr) => okr.leaderReviewStatus === 'APPROVED')
  const waitingReview = okrs.filter(
    (okr) => okr.selfConfirmationStatus === 'CONFIRMED' && okr.leaderReviewStatus === 'PENDING',
  ).length
  const approvedReward = approvedOkrs.reduce((total, okr) => total + Number(okr.rewardAmount ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <PeriodStageNotice stage={stage} />
      {okrs.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Tổng quan OKR của hồ sơ">
          <MetricCard
            icon={ClipboardCheck}
            tone="info"
            label="Mục tiêu trong kỳ"
            value={formatNumber(okrs.length)}
            note={`${formatNumber(approvedOkrs.length)} mục tiêu đã được duyệt`}
            progress={toPercent(approvedOkrs.length, okrs.length)}
          />
          <MetricCard
            icon={UserRoundCheck}
            tone={waitingReview > 0 ? 'warning' : 'success'}
            label="Chờ leader duyệt"
            value={formatNumber(waitingReview)}
            note={waitingReview > 0 ? 'Nhân sự đã tự xác nhận, đang chờ duyệt' : 'Không có mục tiêu nào đang chờ'}
          />
          <MetricCard
            icon={Target}
            tone="success"
            label="Thưởng OKR đã duyệt"
            value={formatMoney(approvedReward)}
            note="Chỉ tính các mục tiêu đã được leader duyệt"
          />
        </section>
      ) : null}

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b p-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">OKR</h2>
              <p className="mt-1 text-xs text-muted-foreground">OKR nội bộ và OKR đồng bộ từ VCBI</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {formatNumber(okrs.length)} mục tiêu
            </span>
          </div>
          {okrs.length === 0 ? (
            <EmptyState
              icon={ListX}
              title="Chưa có OKR trong kỳ này"
              description="Tạo OKR nội bộ, hoặc dùng nút “Đồng bộ KPI/OKR” ở đầu trang để nhận OKR từ VCBI."
            />
          ) : (
            <Table className="min-w-240">
              <TableHeader>
                <TableRow>
                  <TableHead>Mục tiêu OKR</TableHead>
                  <TableHead className="text-right">Chỉ tiêu</TableHead>
                  <TableHead className="text-right">Thực đạt</TableHead>
                  <TableHead className="w-44">Tiến độ</TableHead>
                  <TableHead className="text-right">Mức thưởng</TableHead>
                  <TableHead>Hạn</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {okrs.map((okr) => (
                  <OkrRow
                    key={okr.id}
                    okr={okr}
                    periodId={periodId}
                    employeeId={employeeId}
                    stage={stage}
                    canUpdateSelf={canUpdateSelf}
                    canSelfConfirm={canSelfConfirm}
                    canLeaderReview={canLeaderReview}
                    canDelete={canDelete}
                    canManageReward={canManageReward}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function OkrRow({
  okr,
  periodId,
  employeeId,
  stage,
  canUpdateSelf,
  canSelfConfirm,
  canLeaderReview,
  canDelete,
  canManageReward,
}: {
  okr: EmployeeOkr
  periodId: string
  employeeId: string
  stage: PeriodStage
  canUpdateSelf: boolean
  canSelfConfirm: boolean
  canLeaderReview: boolean
  canDelete: boolean
  canManageReward: boolean
}) {
  const queryClient = useQueryClient()

  const confirmMutation = useMutation({
    mutationFn: () => selfConfirmOkr(okr.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.okrs(periodId, employeeId) })
      toast.success('Đã tự xác nhận OKR')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  const approveMutation = useMutation({
    mutationFn: () => leaderApproveOkr(okr.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.okrs(periodId, employeeId) })
      toast.success('Đã duyệt OKR')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  const isDraft = okr.selfConfirmationStatus === 'DRAFT'
  const isConfirmed = okr.selfConfirmationStatus === 'CONFIRMED'
  const statusTone: Tone =
    okr.leaderReviewStatus === 'APPROVED' ? 'success' : okr.leaderReviewStatus === 'REJECTED' ? 'danger' : isConfirmed ? 'warning' : 'muted'
  const statusLabel =
    okr.leaderReviewStatus === 'APPROVED' ? 'Đã duyệt' : okr.leaderReviewStatus === 'REJECTED' ? 'Từ chối' : isConfirmed ? 'Chờ duyệt' : 'Đang nhập'
  const progress = Math.min(Math.max(okr.progressPercent, 0), 100)
  const unit = okr.unit ? <span className="text-xs font-normal text-muted-foreground"> {okr.unit}</span> : null
  const hasReward = Number(okr.rewardAmount ?? 0) > 0

  return (
    <TableRow>
      <TableCell className="max-w-80 whitespace-normal">
        <strong className="block font-semibold text-foreground">{okr.title}</strong>
        {okr.description ? <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{okr.description}</p> : null}
        {okr.goalType === 'KPI' || okr.dataSource === 'AUTOMATION_GEN_VIDEO' || okr.direction === 'AT_MOST' ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {okr.goalType === 'KPI' ? <StatusBadge tone="muted">KPI</StatusBadge> : null}
            {okr.dataSource === 'AUTOMATION_GEN_VIDEO' ? <StatusBadge tone="info">Đồng bộ VCBI</StatusBadge> : null}
            {okr.direction === 'AT_MOST' ? <StatusBadge tone="muted">Càng thấp càng tốt</StatusBadge> : null}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {formatNumber(okr.targetValue)}{unit}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {okr.actualMissing ? <span className="text-muted-foreground">Chưa có</span> : <>{formatNumber(okr.actualValue)}{unit}</>}
        {okr.overrideValue != null ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Tính theo <strong className="font-semibold text-foreground">{formatNumber(okr.overrideValue)}</strong>
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <ProgressBar
            value={progress}
            tone={progress >= 100 ? 'success' : progress >= 50 ? 'info' : 'warning'}
            label={`Tiến độ OKR ${okr.title}`}
          />
          <span className="w-10 shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">{okr.progressPercent.toFixed(0)}%</span>
        </div>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {hasReward ? <span className="font-semibold text-foreground">{formatMoney(okr.rewardAmount)}</span> : <span className="text-muted-foreground">Chưa đặt</span>}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {okr.deadline ? formatDate(okr.deadline) : 'Không hạn'}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
          {okr.leaderReviewStatus === 'REJECTED' && okr.leaderRejectionReason ? (
            <p className="max-w-48 text-xs whitespace-normal text-muted-foreground">Lý do: {okr.leaderRejectionReason}</p>
          ) : null}
          {okr.overrideValue != null && okr.overrideReason ? (
            <p className="max-w-48 text-xs whitespace-normal text-muted-foreground">Điều chỉnh: {okr.overrideReason}</p>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          {canManageReward ? <UpdateGoalRewardDialog okr={okr} periodId={periodId} employeeId={employeeId} /> : null}
          {canDelete && isDraft && okr.dataSource === 'MANUAL' ? <DeleteOkrDialog okr={okr} periodId={periodId} employeeId={employeeId} /> : null}
          {canUpdateSelf && isDraft && isRecordEditable(stage) && okr.dataSource === 'MANUAL' ? <UpdateOkrDialog okr={okr} periodId={periodId} employeeId={employeeId} /> : null}
          {canSelfConfirm && isDraft && !okr.actualMissing ? (
            <Button variant="outline" size="sm" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Tự xác nhận
            </Button>
          ) : null}
          {canLeaderReview && isConfirmed && okr.leaderReviewStatus === 'PENDING' ? (
            <>
              <OverrideOkrActualDialog okr={okr} periodId={periodId} employeeId={employeeId} />
              <LeaderRejectOkrDialog okr={okr} periodId={periodId} employeeId={employeeId} />
              <Button size="sm" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
                {approveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Duyệt
              </Button>
            </>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

const PROPOSAL_STATUS_LABEL = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối' } as const
const PROPOSAL_STATUS_TONE: Record<keyof typeof PROPOSAL_STATUS_LABEL, Tone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
}
type ProposalStatusFilter = 'ALL' | keyof typeof PROPOSAL_STATUS_LABEL

function ProposalTab({ periodId }: { periodId: string | null }) {
  const { user } = useAuth()
  const canPropose = user?.permissions.includes('okr.propose') ?? false
  const canReviewKpi = user?.permissions.includes('kpi.leader_approve') ?? false
  const canReviewOkr = user?.permissions.includes('okr.leader_approve') ?? false
  const [statusFilter, setStatusFilter] = useState<ProposalStatusFilter>('ALL')

  const proposalsQuery = useQuery({ queryKey: OKR_KEYS.proposals, queryFn: listProposals })

  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', { pageSize: PERIODS_PAGE_SIZE }],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: PERIODS_PAGE_SIZE }),
  })
  const periodNameById = new Map((periodsQuery.data?.data ?? []).map((period) => [period.id, period.name]))
  const proposals = proposalsQuery.data ?? []
  const countByStatus = {
    PENDING: proposals.filter((item) => item.status === 'PENDING').length,
    APPROVED: proposals.filter((item) => item.status === 'APPROVED').length,
    REJECTED: proposals.filter((item) => item.status === 'REJECTED').length,
  }
  // Việc cần xử lý luôn nằm trên cùng, phần đã xử lý chỉ để tra cứu.
  const visibleProposals = proposals
    .filter((item) => statusFilter === 'ALL' || item.status === statusFilter)
    .sort((a, b) => (a.status === 'PENDING' ? 0 : 1) - (b.status === 'PENDING' ? 0 : 1))

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Đề xuất KPI & OKR</h2>
              <p className="mt-1 text-xs text-muted-foreground">Hàng chờ phê duyệt của bạn</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {formatNumber(proposals.length)} đề xuất
              </span>
              {canPropose ? <CreateProposalDialog periodId={periodId} /> : null}
            </div>
          </div>

          {proposals.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc đề xuất theo trạng thái">
              <ProposalFilterChip label="Tất cả" count={proposals.length} active={statusFilter === 'ALL'} onSelect={() => setStatusFilter('ALL')} />
              {(Object.keys(PROPOSAL_STATUS_LABEL) as Array<keyof typeof PROPOSAL_STATUS_LABEL>).map((status) => (
                <ProposalFilterChip
                  key={status}
                  label={PROPOSAL_STATUS_LABEL[status]}
                  count={countByStatus[status]}
                  active={statusFilter === status}
                  onSelect={() => setStatusFilter(status)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {proposalsQuery.isLoading ? (
          <div className="space-y-3 p-5">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div>
        ) : proposalsQuery.isError ? (
          <QueryError error={proposalsQuery.error} onRetry={() => proposalsQuery.refetch()} />
        ) : visibleProposals.length === 0 ? (
          <EmptyState
            icon={statusFilter === 'ALL' ? ListX : Filter}
            tone={statusFilter === 'PENDING' ? 'success' : 'muted'}
            title={statusFilter === 'ALL' ? 'Chưa có đề xuất cần xử lý' : `Không có đề xuất ở trạng thái “${PROPOSAL_STATUS_LABEL[statusFilter]}”`}
            description={statusFilter === 'ALL'
              ? 'Các đề xuất KPI và OKR trong phạm vi của bạn sẽ xuất hiện ở đây.'
              : 'Chọn bộ lọc khác để xem các đề xuất còn lại.'}
            action={statusFilter === 'ALL'
              ? undefined
              : <Button variant="outline" onClick={() => setStatusFilter('ALL')}><X className="size-4" />Bỏ lọc</Button>}
          />
        ) : (
          <div className="divide-y">
            {visibleProposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                periodName={periodNameById.get(proposal.payrollPeriodId)}
                canReview={proposal.proposalType === 'KPI_ITEM' ? canReviewKpi : canReviewOkr}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProposalFilterChip({ label, count, active, onSelect }: { label: string; count: number; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 tabular-nums ${active ? 'bg-primary-foreground/20' : 'bg-muted'}`}>{formatNumber(count)}</span>
    </button>
  )
}

function ProposalCard({
  proposal,
  periodName,
  canReview,
}: {
  proposal: KpiOkrProposal
  periodName: string | undefined
  canReview: boolean
}) {
  const queryClient = useQueryClient()

  const approveMutation = useMutation({
    mutationFn: () => approveProposal(proposal.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.proposals })
      void queryClient.invalidateQueries({ queryKey: ['okr', 'list'] })
      toast.success('Đã duyệt đề xuất')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <article className={`grid gap-4 p-5 lg:grid-cols-[minmax(16rem,1fr)_minmax(16rem,1fr)_auto] lg:items-center ${proposal.status === 'PENDING' ? '' : 'opacity-85'}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-1 text-xs font-semibold ${toneSurface.info}`}>{PROPOSAL_TYPE_LABEL[proposal.proposalType]}</span>
          <span className="text-xs text-muted-foreground">{periodName ?? '—'}</span>
        </div>
        <h3 className="mt-2 truncate font-bold text-foreground">{proposal.proposedName}</h3>
        {proposal.proposedKpiGroup ? (
          <p className="mt-1 text-xs text-muted-foreground">Nhóm KPI: {proposal.proposedKpiGroup.name}</p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">Đề xuất bởi {proposal.proposerEmployee?.fullName ?? '—'}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
        <div>
          <p className="text-xs text-muted-foreground">Mục tiêu đề xuất</p>
          <p className="mt-1 font-bold text-foreground tabular-nums">
            {formatNumber(proposal.proposedTargetValue)} <span className="text-xs font-medium text-muted-foreground">{proposal.proposedUnit ?? ''}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Lý do</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{proposal.reason}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 lg:items-end">
        <StatusBadge tone={PROPOSAL_STATUS_TONE[proposal.status]}>{PROPOSAL_STATUS_LABEL[proposal.status]}</StatusBadge>
        {proposal.status === 'REJECTED' && proposal.rejectionReason ? (
          <p className="max-w-70 text-xs text-muted-foreground lg:text-right">Lý do từ chối: {proposal.rejectionReason}</p>
        ) : null}
        {proposal.status === 'APPROVED' && proposal.proposalType === 'KPI_ITEM' ? (
          <p className="max-w-70 text-xs text-muted-foreground lg:text-right">
            Đã duyệt. Người có quyền cấu hình cần tạo đầu mục KPI tương ứng trong tab Cấu hình KPI.
          </p>
        ) : null}
        {canReview && proposal.status === 'PENDING' ? (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <RejectProposalDialog proposalId={proposal.id} />
            <Button size="sm" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
              {approveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Duyệt
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function AssignKpiDialog({ periodId, employeeId, teamId }: { periodId: string | null; employeeId: string | null; teamId: string | null }) {
  const { user } = useAuth()
  const canAssign = user?.permissions.includes('kpi.assign') ?? false
  const queryClient = useQueryClient()
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const groupsQuery = useQuery({ queryKey: KPI_KEYS.groups, queryFn: listKpiGroups })
  const groups = groupsQuery.data ?? []
  const eligibleGroups = groups.filter(
    (group) => group.teams.length === 0 || (teamId != null && group.teams.some((team) => team.id === teamId)),
  )

  const assignmentsQuery = useQuery({
    queryKey: periodId && employeeId ? KPI_KEYS.assignments(periodId, employeeId, teamId) : ['kpi', 'assignments', 'none'],
    queryFn: () => listKpiAssignments(periodId!, employeeId!, teamId ?? undefined),
    enabled: Boolean(periodId && employeeId),
  })
  const assignedByGroupId = new Map(
    (assignmentsQuery.data ?? [])
      .filter((assignment) => assignment.assignmentStatus === 'ASSIGNED')
      .map((assignment) => [assignment.kpiGroupId, assignment]),
  )

  const toggleMutation = useMutation({
    mutationFn: async (group: KpiGroup) => {
      const existing = assignedByGroupId.get(group.id)
      if (existing) {
        await cancelKpiAssignment(periodId!, existing.id)
      } else {
        await createKpiAssignment(periodId!, {
          employeeId: employeeId!,
          kpiGroupId: group.id,
          teamId: teamId ?? undefined,
        })
      }
    },
    onMutate: (group) => {
      setPendingGroupId(group.id)
      setRowError(null)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.assignments(periodId!, employeeId!, teamId) })
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId!, employeeId!) })
    },
    onError: (error) => setRowError(getApiErrorMessage(error)),
    onSettled: () => setPendingGroupId(null),
  })

  if (!canAssign) return null

  const missingSelection = !periodId || !employeeId

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={missingSelection}>
          <UserRoundCheck className="size-4" />
          Gán KPI theo kỳ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gán KPI cho nhân sự</DialogTitle>
          <DialogDescription>
            Nhân sự chỉ được nhập actual cho nhóm KPI đã được gán trong kỳ. Tick để gán, bỏ tick để hủy gán.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {groupsQuery.isLoading || assignmentsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
              {eligibleGroups.map((group) => {
                const isAssigned = assignedByGroupId.has(group.id)
                const isPending = toggleMutation.isPending && pendingGroupId === group.id
                return (
                  <label key={group.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/40">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={isAssigned}
                        disabled={isPending}
                        onChange={() => toggleMutation.mutate(group)}
                      />
                      {group.name}
                    </span>
                    {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  </label>
                )
              })}
              {eligibleGroups.length === 0 ? (
                <p className="text-muted-foreground">Chưa có nhóm KPI nào được cấu hình cho team của nhân sự này.</p>
              ) : null}
            </div>
          )}
          {rowError ? <p className="text-sm text-[var(--danger-700)]">{rowError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Đóng</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManualActualDialog({
  item,
  periodId,
  employeeId,
}: {
  item: KpiProfileItem
  periodId: string
  employeeId: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [actualValue, setActualValue] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => manualEnterKpiActual(item.actualId!, {
      actualValue: Number(actualValue),
      note: note.trim() || undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId, employeeId) })
      toast.success('Đã nhập tay actual còn thiếu')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    const value = Number(actualValue)
    setFormError(null)
    if (actualValue === '' || Number.isNaN(value) || value < 0) {
      setFormError('Giá trị thực đạt phải là số ≥ 0.')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) { setActualValue(''); setNote(''); setFormError(null) }; setOpen(next) }}>
      <DialogTrigger asChild><Button size="sm">Nhập tay</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nhập tay actual · {item.kpiItemName}</DialogTitle><DialogDescription>VCBI không có actual cho đầu mục này. Giá trị nhập sẽ được lưu nguồn MANUAL và ghi audit.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5"><Label htmlFor={`manual-actual-${item.actualId}`}>Thực đạt ({item.kpiItemUnit})</Label><Input id={`manual-actual-${item.actualId}`} type="number" min="0" value={actualValue} onChange={(event) => setActualValue(event.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor={`manual-note-${item.actualId}`}>Ghi chú</Label><Textarea id={`manual-note-${item.actualId}`} value={note} onChange={(event) => setNote(event.target.value)} /></div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter><DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose><Button onClick={submit} disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Lưu giá trị nhập tay</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UpdateActualDialog({
  item,
  periodId,
  employeeId,
}: {
  item: KpiProfileItem
  periodId: string
  employeeId: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [actualValue, setActualValue] = useState(item.actualValue ?? '0')
  const [selfAssessment, setSelfAssessment] = useState(item.selfAssessment ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setActualValue(item.actualValue ?? '0')
      setSelfAssessment(item.selfAssessment ?? '')
      setFormError(null)
    }
    setOpen(next)
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      updateKpiActual(item.actualId!, {
        actualValue: Number(actualValue),
        selfAssessment: selfAssessment.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId, employeeId) })
      toast.success('Đã lưu actual')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    const value = Number(actualValue)
    if (actualValue === '' || Number.isNaN(value) || value < 0) {
      setFormError('Giá trị thực đạt phải là số ≥ 0.')
      return
    }
    updateMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Sửa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nhập kết quả thực đạt · {item.kpiItemName}</DialogTitle>
          <DialogDescription>Chỉ sửa được khi chưa tự xác nhận.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="actual-value">Thực đạt ({item.kpiItemUnit})</Label>
            <Input
              id="actual-value"
              type="number"
              value={actualValue}
              onChange={(event) => setActualValue(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="actual-note">Tự đánh giá (không bắt buộc)</Label>
            <Textarea
              id="actual-note"
              value={selfAssessment}
              onChange={(event) => setSelfAssessment(event.target.value)}
            />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LeaderRejectDialog({
  groupId,
  employeeId,
  periodId,
  teamId,
  disabled,
}: {
  groupId: string
  employeeId: string
  periodId: string
  teamId: string
  disabled: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setReason('')
      setFormError(null)
    }
    setOpen(next)
  }

  const rejectMutation = useMutation({
    mutationFn: () => leaderRejectKpiGroup(groupId, employeeId, periodId, reason.trim(), teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId, employeeId) })
      toast.success('Đã từ chối nhóm KPI')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!reason.trim()) {
      setFormError('Nhập lý do từ chối.')
      return
    }
    rejectMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          Từ chối nhóm
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Từ chối nhóm KPI</DialogTitle>
          <DialogDescription>
            Nhân sự sẽ được mở lại để chỉnh sửa và nộp lại toàn bộ đầu mục trong nhóm.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="reject-reason">Lý do từ chối</Label>
            <Textarea id="reject-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button variant="destructive" onClick={submit} disabled={rejectMutation.isPending}>
            {rejectMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Từ chối
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OverrideActualDialog({
  item,
  periodId,
  employeeId,
}: {
  item: KpiProfileItem
  periodId: string
  employeeId: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [overrideValue, setOverrideValue] = useState(item.overrideValue ?? item.actualValue ?? '0')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setOverrideValue(item.overrideValue ?? item.actualValue ?? '0')
      setReason('')
      setFormError(null)
    }
    setOpen(next)
  }

  const overrideMutation = useMutation({
    mutationFn: () =>
      overrideKpiActual(item.actualId!, { overrideValue: Number(overrideValue), reason: reason.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId, employeeId) })
      toast.success('Đã cập nhật giá trị điều chỉnh')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    const value = Number(overrideValue)
    if (overrideValue === '' || !Number.isFinite(value) || value < 0) {
      setFormError('Giá trị điều chỉnh phải là số ≥ 0.')
      return
    }
    if (!reason.trim()) {
      setFormError('Vui lòng nhập lý do điều chỉnh.')
      return
    }
    overrideMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Điều chỉnh kết quả
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Điều chỉnh kết quả tính KPI · {item.kpiItemName}</DialogTitle>
          <DialogDescription>
            Chỉ dùng khi cần hiệu chỉnh theo quyết định quản lý. Kết quả nhân sự đã nhập sẽ được giữ nguyên.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className={`rounded-lg px-3 py-2 text-sm leading-5 ${toneSurface.warning}`}>
            Kết quả nhân sự đã nhập: <strong>{formatNumber(item.actualValue ?? 0)} {item.kpiItemUnit}</strong>. Sau khi lưu, hệ thống dùng giá trị bên dưới để tính KPI và lương.
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="override-value">Giá trị dùng để tính KPI ({item.kpiItemUnit})</Label>
            <Input
              id="override-value"
              type="number"
              min="0"
              step="any"
              value={overrideValue}
              onChange={(event) => setOverrideValue(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="override-reason">Lý do điều chỉnh <span className="text-[var(--danger-700)]">*</span></Label>
            <Textarea id="override-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={overrideMutation.isPending}>
            {overrideMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Xác nhận điều chỉnh
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Dialogs: OKR & đề xuất (M08 — dữ liệu thật) ─────────────────────────────

function CreateOkrDialog({ periodId, employeeId }: { periodId: string | null; employeeId: string | null }) {
  const { user } = useAuth()
  const canCreate = user?.permissions.includes('okr.create') ?? false
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [rewardAmount, setRewardAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setTitle('')
      setDescription('')
      setUnit('')
      setTargetValue('')
      setRewardAmount('')
      setDeadline('')
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createEmployeeOkr(periodId!, employeeId!, {
        title: title.trim(),
        description: description.trim() || undefined,
        unit: unit.trim() || undefined,
        targetValue: Number(targetValue),
        rewardAmount,
        deadline: deadline || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.okrs(periodId!, employeeId!) })
      toast.success('Đã tạo OKR')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    const target = Number(targetValue)
    const reward = Number(rewardAmount)
    if (!title.trim()) {
      setFormError('Nhập tiêu đề OKR.')
      return
    }
    if (!targetValue || Number.isNaN(target) || target <= 0) {
      setFormError('Mục tiêu phải là số lớn hơn 0.')
      return
    }
    if (!rewardAmount || Number.isNaN(reward) || reward < 0) {
      setFormError('Mức thưởng phải là số ≥ 0.')
      return
    }
    createMutation.mutate()
  }

  if (!canCreate) return null

  const missingSelection = !periodId || !employeeId

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={missingSelection}>
          <Plus className="size-4" />
          Tạo OKR
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo OKR cho nhân sự</DialogTitle>
          <DialogDescription>Nhân sự chỉ tự sửa được thực tế/tự đánh giá sau khi tạo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="okr-title">Tiêu đề OKR</Label>
            <Input id="okr-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="okr-desc">Mô tả (không bắt buộc)</Label>
            <Textarea id="okr-desc" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="okr-unit">Đơn vị (không bắt buộc)</Label>
              <Input id="okr-unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="%, video…" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="okr-target">Mục tiêu</Label>
              <Input id="okr-target" type="number" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="okr-reward">Mức thưởng (₫)</Label>
              <MoneyInput id="okr-reward" value={rewardAmount} onValueChange={setRewardAmount} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="okr-deadline">Hạn (không bắt buộc)</Label>
              <Input id="okr-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
            </div>
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Tạo OKR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UpdateGoalRewardDialog({ okr, periodId, employeeId }: { okr: EmployeeOkr; periodId: string; employeeId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [rewardAmount, setRewardAmount] = useState(okr.rewardAmount)
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setRewardAmount(okr.rewardAmount)
      setFormError(null)
    }
    setOpen(next)
  }

  const mutation = useMutation({
    mutationFn: () => updateEmployeeOkrReward(okr.id, rewardAmount || '0'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.okrs(periodId, employeeId) })
      toast.success('Đã cập nhật mức thưởng')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    const amount = Number(rewardAmount || '0')
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError('Mức thưởng phải là số tiền không âm.')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" aria-hidden="true" />
          Mức thưởng
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đặt mức thưởng · {okr.title}</DialogTitle>
          <DialogDescription>
            Mặc định 0 ₫. Khoản này chỉ được nhận khi {okr.goalType} đạt ngưỡng của kỳ lương.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`goal-reward-${okr.id}`}>Mức thưởng khi đạt</Label>
            <MoneyInput id={`goal-reward-${okr.id}`} value={rewardAmount} onValueChange={setRewardAmount} />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lưu mức thưởng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UpdateOkrDialog({ okr, periodId, employeeId }: { okr: EmployeeOkr; periodId: string; employeeId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [actualValue, setActualValue] = useState(okr.actualValue)
  const [selfAssessment, setSelfAssessment] = useState(okr.selfAssessment ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setActualValue(okr.actualValue)
      setSelfAssessment(okr.selfAssessment ?? '')
      setFormError(null)
    }
    setOpen(next)
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      updateEmployeeOkr(okr.id, {
        actualValue: Number(actualValue),
        selfAssessment: selfAssessment.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.okrs(periodId, employeeId) })
      toast.success('Đã lưu OKR')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    const value = Number(actualValue)
    if (actualValue === '' || Number.isNaN(value) || value < 0) {
      setFormError('Thực tế phải là số ≥ 0.')
      return
    }
    updateMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Sửa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cập nhật OKR · {okr.title}</DialogTitle>
          <DialogDescription>Chỉ sửa được khi chưa tự xác nhận.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="okr-actual">Thực tế ({okr.unit ?? '—'})</Label>
            <Input id="okr-actual" type="number" value={actualValue} onChange={(event) => setActualValue(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="okr-assessment">Tự đánh giá (không bắt buộc)</Label>
            <Textarea id="okr-assessment" value={selfAssessment} onChange={(event) => setSelfAssessment(event.target.value)} />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Chỉ xóa được khi còn DRAFT (tạo nhầm) — hard-delete, xem ghi chú ở employee-okrs.service.ts::remove.
function DeleteOkrDialog({ okr, periodId, employeeId }: { okr: EmployeeOkr; periodId: string; employeeId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteEmployeeOkr(okr.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.okrs(periodId, employeeId) })
      toast.success('Đã xóa OKR')
      setOpen(false)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error))
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-[var(--danger-700)] hover:text-[var(--danger-700)]">
          Xóa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa OKR · {okr.title}</DialogTitle>
          <DialogDescription>
            Dùng khi tạo nhầm. Hành động này không thể hoàn tác. Chỉ xóa được khi OKR còn ở trạng thái nháp
            (chưa được nhân sự tự xác nhận).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Xóa OKR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OverrideOkrActualDialog({ okr, periodId, employeeId }: { okr: EmployeeOkr; periodId: string; employeeId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(okr.overrideValue ?? okr.actualValue)
  const [reason, setReason] = useState(okr.overrideReason ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setValue(okr.overrideValue ?? okr.actualValue)
      setReason(okr.overrideReason ?? '')
      setFormError(null)
    }
    setOpen(next)
  }

  const mutation = useMutation({
    mutationFn: () => overrideOkrActual(okr.id, { overrideValue: Number(value), reason: reason.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.okrs(periodId, employeeId) })
      toast.success('Đã điều chỉnh kết quả OKR')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    if (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) {
      setFormError('Giá trị điều chỉnh phải là số ≥ 0.')
      return
    }
    if (!reason.trim()) {
      setFormError('Vui lòng nhập lý do điều chỉnh.')
      return
    }
    setFormError(null)
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild><Button variant="outline" size="sm">Điều chỉnh kết quả</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Điều chỉnh kết quả OKR · {okr.title}</DialogTitle>
          <DialogDescription>Số nhân sự đã nhập được giữ nguyên để đối chiếu. Giá trị điều chỉnh sẽ dùng để tính tiến độ và thưởng.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className={`rounded-lg px-3 py-2 text-sm ${toneSurface.warning}`}>Thực tế nhân sự đã nhập: <strong>{formatNumber(okr.actualValue)} {okr.unit ?? ''}</strong></div>
          <div className="grid gap-1.5">
            <Label htmlFor={`okr-override-value-${okr.id}`}>Giá trị dùng để tính OKR ({okr.unit ?? 'đơn vị'})</Label>
            <Input id={`okr-override-value-${okr.id}`} type="number" min="0" step="any" value={value} onChange={(event) => { setValue(event.target.value); setFormError(null) }} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`okr-override-reason-${okr.id}`}>Lý do điều chỉnh <span className="text-[var(--danger-700)]">*</span></Label>
            <Textarea id={`okr-override-reason-${okr.id}`} maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); setFormError(null) }} />
          </div>
          {formError ? <p role="alert" className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={mutation.isPending}>Hủy</Button></DialogClose>
          <Button onClick={submit} disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Lưu điều chỉnh</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LeaderRejectOkrDialog({ okr, periodId, employeeId }: { okr: EmployeeOkr; periodId: string; employeeId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setReason('')
      setFormError(null)
    }
    setOpen(next)
  }

  const rejectMutation = useMutation({
    mutationFn: () => leaderRejectOkr(okr.id, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.okrs(periodId, employeeId) })
      toast.success('Đã từ chối OKR')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!reason.trim()) {
      setFormError('Nhập lý do từ chối.')
      return
    }
    rejectMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Từ chối
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Từ chối OKR · {okr.title}</DialogTitle>
          <DialogDescription>Nhân sự sẽ được mở lại để chỉnh sửa và nộp lại.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="okr-reject-reason">Lý do từ chối</Label>
            <Textarea id="okr-reject-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button variant="destructive" onClick={submit} disabled={rejectMutation.isPending}>
            {rejectMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Từ chối
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateProposalDialog({ periodId }: { periodId: string | null }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [proposalType, setProposalType] = useState<ProposalType>('KPI_ITEM')
  const [kpiGroupId, setKpiGroupId] = useState<string | undefined>(undefined)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [rewardAmount, setRewardAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const groupsQuery = useQuery({ queryKey: KPI_KEYS.groups, queryFn: listKpiGroups, enabled: open })
  const groups = groupsQuery.data ?? []

  function handleOpenChange(next: boolean) {
    if (next) {
      setProposalType('KPI_ITEM')
      setKpiGroupId(undefined)
      setName('')
      setUnit('')
      setTargetValue('')
      setRewardAmount('')
      setDeadline('')
      setReason('')
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createProposal({
        payrollPeriodId: periodId!,
        proposalType,
        proposedKpiGroupId: proposalType === 'KPI_ITEM' ? kpiGroupId : undefined,
        proposedName: name.trim(),
        proposedUnit: unit.trim() || undefined,
        proposedTargetValue: Number(targetValue),
        proposedRewardAmount: proposalType === 'OKR' ? rewardAmount : undefined,
        proposedDeadline: deadline || undefined,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.proposals })
      toast.success('Đã gửi đề xuất')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Nhập tên đề xuất.')
      return
    }
    if (proposalType === 'KPI_ITEM' && !kpiGroupId) {
      setFormError('Chọn nhóm KPI cho đề xuất đầu mục KPI.')
      return
    }
    const target = Number(targetValue)
    if (!targetValue || Number.isNaN(target) || target <= 0) {
      setFormError('Mục tiêu phải là số lớn hơn 0.')
      return
    }
    if (proposalType === 'OKR') {
      const reward = Number(rewardAmount)
      if (!rewardAmount || Number.isNaN(reward) || reward < 0) {
        setFormError('Mức thưởng phải là số ≥ 0.')
        return
      }
    }
    if (!reason.trim()) {
      setFormError('Nhập lý do đề xuất.')
      return
    }
    createMutation.mutate()
  }

  const missingPeriod = !periodId

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={missingPeriod}>
          <Plus className="size-4" />
          Gửi đề xuất
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gửi đề xuất KPI/OKR</DialogTitle>
          <DialogDescription>
            Gửi cho kỳ đang chọn ở phần "Hồ sơ đang xem". Leader sẽ duyệt hoặc từ chối kèm lý do.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Loại đề xuất</Label>
            <Select value={proposalType} onValueChange={(value) => setProposalType(value as ProposalType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KPI_ITEM">Đầu mục KPI</SelectItem>
                <SelectItem value="OKR">OKR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {proposalType === 'KPI_ITEM' ? (
            <div className="grid gap-1.5">
              <Label>Nhóm KPI</Label>
              <Select value={kpiGroupId} onValueChange={setKpiGroupId} disabled={groupsQuery.isLoading || groups.length === 0}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={groups.length === 0 ? 'Chưa có nhóm KPI nào' : 'Chọn nhóm KPI'} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="proposal-name">Tên đề xuất</Label>
            <Input id="proposal-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="proposal-unit">Đơn vị (không bắt buộc)</Label>
              <Input id="proposal-unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="proposal-target">Mục tiêu</Label>
              <Input id="proposal-target" type="number" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} />
            </div>
          </div>
          {proposalType === 'OKR' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="proposal-reward">Mức thưởng (₫)</Label>
                <MoneyInput id="proposal-reward" value={rewardAmount} onValueChange={setRewardAmount} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="proposal-deadline">Hạn (không bắt buộc)</Label>
                <Input id="proposal-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="proposal-reason">Lý do đề xuất</Label>
            <Textarea id="proposal-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Gửi đề xuất
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectProposalDialog({ proposalId }: { proposalId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setReason('')
      setFormError(null)
    }
    setOpen(next)
  }

  const rejectMutation = useMutation({
    mutationFn: () => rejectProposal(proposalId, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OKR_KEYS.proposals })
      toast.success('Đã từ chối đề xuất')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!reason.trim()) {
      setFormError('Nhập lý do từ chối.')
      return
    }
    rejectMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Từ chối
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Từ chối đề xuất</DialogTitle>
          <DialogDescription>Bắt buộc nhập lý do để người đề xuất biết vì sao bị từ chối.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="proposal-reject-reason">Lý do từ chối</Label>
            <Textarea id="proposal-reject-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button variant="destructive" onClick={submit} disabled={rejectMutation.isPending}>
            {rejectMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Từ chối
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Tab: Cấu hình KPI (M06 — dữ liệu thật) ────────────────────────────────────

function KpiConfigTab() {
  const { user } = useAuth()
  const canConfigure = user?.permissions.includes('kpi.configure') ?? false
  const canConfigureAllTeams = user?.permissions.includes('kpi.view_all') ?? false
  const managedTeamIds = useMemo(
    () => (user?.roles ?? [])
      .filter((role) => role.scopeType === 'TEAM' && role.scopeTeamId)
      .map((role) => role.scopeTeamId!),
    [user?.roles],
  )
  // Xoá nhóm KPI: quyền riêng `kpi.delete_group`, mặc định chỉ ADMIN có.
  const canDeleteGroup = user?.permissions.includes('kpi.delete_group') ?? false
  const allowedTeamIds = canConfigureAllTeams ? undefined : managedTeamIds

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)
  const [groupSearch, setGroupSearch] = useState('')

  const groupsQuery = useQuery({ queryKey: KPI_KEYS.groups, queryFn: listKpiGroups })
  const scopedGroups = (groupsQuery.data ?? []).filter((group) =>
    canConfigureAllTeams || (
      group.teams.length > 0 && group.teams.every((team) => managedTeamIds.includes(team.id))
    ),
  )
  const term = groupSearch.trim().toLowerCase()
  const groups = term
    ? scopedGroups.filter((group) =>
        group.name.toLowerCase().includes(term) ||
        group.code.toLowerCase().includes(term) ||
        group.teams.some((team) => team.name.toLowerCase().includes(term)))
    : scopedGroups

  const groupDetailQuery = useQuery({
    queryKey: expandedGroupId ? KPI_KEYS.group(expandedGroupId) : ['kpi', 'groups', 'none'],
    queryFn: () => getKpiGroup(expandedGroupId!),
    enabled: Boolean(expandedGroupId),
  })

  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', { pageSize: PERIODS_PAGE_SIZE }],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: PERIODS_PAGE_SIZE }),
  })
  const periods = periodsQuery.data?.data ?? []
  // Mặc định kỳ hiện tại để mục tiêu hiện ngay khi mở nhóm, không bắt chọn kỳ trước.
  const activePeriodId = selectedPeriodId ?? findCurrentPayrollPeriodId(periods)

  const targetsQuery = useQuery({
    queryKey: activePeriodId ? KPI_KEYS.targets(activePeriodId) : ['kpi', 'period-targets', 'none'],
    queryFn: () => listKpiTargetsForPeriod(activePeriodId!),
    enabled: Boolean(activePeriodId),
  })
  const targetsByItemId = new Map((targetsQuery.data ?? []).map((target) => [target.kpiItemId, target]))

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Danh sách nhóm KPI</h2>
              <p className="mt-1 text-xs text-muted-foreground">Bấm vào một nhóm để xem đầu mục và đặt mục tiêu theo kỳ</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {term ? `${formatNumber(groups.length)}/${formatNumber(scopedGroups.length)} nhóm` : `${formatNumber(scopedGroups.length)} nhóm`}
              </span>
              {canConfigure ? <CreateKpiGroupDialog onCreated={setExpandedGroupId} allowedTeamIds={allowedTeamIds} /> : null}
            </div>
          </div>

          {scopedGroups.length > 0 ? (
            <div className="relative sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="w-full pr-9 pl-8"
                placeholder="Tìm nhóm KPI theo tên, mã hoặc team"
                aria-label="Tìm nhóm KPI"
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
              />
              {groupSearch ? (
                <button
                  type="button"
                  onClick={() => setGroupSearch('')}
                  aria-label="Xoá từ khoá tìm kiếm"
                  className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {groupsQuery.isLoading ? (
          <div className="space-y-3 bg-muted/30 p-3 sm:p-4">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full rounded-xl" />)}</div>
        ) : groupsQuery.isError ? (
          <QueryError error={groupsQuery.error} onRetry={() => groupsQuery.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={ListX}
            title={term ? 'Không có nhóm KPI phù hợp' : 'Chưa có nhóm KPI'}
            description={term
              ? 'Không tìm thấy nhóm nào khớp từ khoá. Thử từ khoá khác hoặc xoá tìm kiếm.'
              : 'Bạn chưa có nhóm KPI nào trong phạm vi team được cấu hình. Tạo nhóm mới để bắt đầu thiết lập đầu mục và mục tiêu.'}
            action={term
              ? <Button variant="outline" onClick={() => setGroupSearch('')}><X className="size-4" />Xoá tìm kiếm</Button>
              : canConfigure
                ? <CreateKpiGroupDialog onCreated={setExpandedGroupId} allowedTeamIds={allowedTeamIds} />
                : undefined}
          />
        ) : (
          <div className="space-y-3 bg-muted/30 p-3 sm:p-4">
            {groups.map((group) => {
              const expanded = expandedGroupId === group.id
              // Đổi nhóm đang mở thì query đổi key, nên chỉ dùng dữ liệu chi tiết khi đúng nhóm này.
              const detail = expanded && groupDetailQuery.data?.id === group.id ? groupDetailQuery.data : undefined
              return (
                <KpiGroupSection
                  key={group.id}
                  group={group}
                  expanded={expanded}
                  onToggle={() => setExpandedGroupId((current) => (current === group.id ? null : group.id))}
                  actions={detail && (canConfigure || canDeleteGroup) ? (
                    <>
                      {canConfigure ? <EditKpiGroupDialog group={detail} allowedTeamIds={allowedTeamIds} /> : null}
                      {canDeleteGroup ? <DeleteKpiGroupDialog group={detail} onDeleted={() => setExpandedGroupId(null)} /> : null}
                    </>
                  ) : null}
                >
                  {groupDetailQuery.isError ? (
                    <QueryError error={groupDetailQuery.error} onRetry={() => groupDetailQuery.refetch()} />
                  ) : detail ? (
                    <KpiGroupPanel
                      group={detail}
                      canConfigure={canConfigure}
                      periods={periods}
                      periodsLoading={periodsQuery.isLoading}
                      selectedPeriodId={activePeriodId}
                      onSelectPeriod={setSelectedPeriodId}
                      targetsByItemId={targetsByItemId}
                      targetsLoading={targetsQuery.isLoading}
                    />
                  ) : (
                    <div className="space-y-2 p-4" role="status" aria-label="Đang tải chi tiết nhóm KPI">
                      <Skeleton className="h-9 w-full sm:w-72" />
                      {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-11 w-full" />)}
                    </div>
                  )}
                </KpiGroupSection>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Một nhóm KPI dạng mục mở rộng — cùng khuôn với phòng ban ở trang Nhân sự & team. */
function KpiGroupSection({
  group,
  expanded,
  onToggle,
  actions,
  children,
}: {
  group: KpiGroup
  expanded: boolean
  onToggle: () => void
  actions: ReactNode
  children: ReactNode
}) {
  const panelId = `kpi-group-${group.id}`
  const assignment = group.applicableEmployeeGroups.length > 0
    ? `Tự gán: ${group.applicableEmployeeGroups.map((employeeGroup) => employeeGroup.name).join(', ')}`
    : 'Gán thủ công'

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Màn hẹp: nút Sửa/Xoá xuống dòng riêng để tên nhóm không bị ép. */}
      <div className={`flex flex-col gap-1 p-2 sm:flex-row sm:items-center sm:gap-3 sm:p-3 ${expanded ? 'border-b border-border bg-muted/40' : ''}`}>
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-3"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[15px] font-bold text-foreground">{group.name}</span>
              <StatusBadge tone={group.isActive ? 'success' : 'muted'}>{group.isActive ? 'Đang hoạt động' : 'Đã tắt'}</StatusBadge>
              {group.dataSource === 'AUTOMATION_GEN_VIDEO' ? <StatusBadge tone="info">Đồng bộ VCBI</StatusBadge> : null}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              <code>{group.code}</code> · {formatNumber(group._count?.items ?? 0)} đầu mục · {assignment}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="hidden sm:inline">{expanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
            <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-2 px-2 pb-1 sm:p-0">{actions}</div> : null}
      </div>

      {expanded ? <div id={panelId}>{children}</div> : null}
    </section>
  )
}

function KpiGroupPanel({
  group,
  canConfigure,
  periods,
  periodsLoading,
  selectedPeriodId,
  onSelectPeriod,
  targetsByItemId,
  targetsLoading,
}: {
  group: KpiGroupDetail
  canConfigure: boolean
  periods: PayrollPeriod[]
  periodsLoading: boolean
  selectedPeriodId: string | null
  onSelectPeriod: (id: string) => void
  targetsByItemId: Map<string, KpiPeriodTarget>
  targetsLoading: boolean
}) {
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId)
  const canSetTarget = canConfigure && selectedPeriod?.status !== 'CLOSED'

  return (
    <>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          {group.description ? <p className="text-sm text-foreground">{group.description}</p> : null}
          <p className="text-xs text-muted-foreground">Mục tiêu lưu riêng theo từng kỳ lương, không ảnh hưởng kỳ khác.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={selectedPeriodId ?? undefined}
            onValueChange={onSelectPeriod}
            disabled={periodsLoading || periods.length === 0}
          >
            <SelectTrigger className="w-full sm:w-56" aria-label="Kỳ lương để xem và đặt mục tiêu">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder={periods.length === 0 ? 'Chưa có kỳ lương' : 'Chọn kỳ lương'} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canConfigure && group.items.length > 0 ? <CreateKpiItemDialog groupId={group.id} /> : null}
        </div>
      </div>
      {group.items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={ListX}
          title="Chưa có đầu mục KPI"
          description="Thêm đầu mục để bắt đầu đặt mục tiêu và theo dõi hiệu suất của nhóm này."
          action={canConfigure ? <CreateKpiItemDialog groupId={group.id} /> : undefined}
        />
      ) : (
        <div className="border-t">
          <Table className="min-w-160">
            <TableHeader>
              <TableRow>
                <TableHead>Đầu mục</TableHead>
                <TableHead className="text-center">Thứ tự</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Mục tiêu kỳ</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((item) => {
                const target = targetsByItemId.get(item.id)
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <strong className="block font-semibold text-foreground">{item.name}</strong>
                      <span className="text-xs text-muted-foreground"><code>{item.code}</code>{item.unit ? ` · ${item.unit}` : ''}</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {item.externalItemId ? <StatusBadge tone="info">Đồng bộ VCBI</StatusBadge> : null}
                        {item.direction === 'AT_MOST' ? <StatusBadge tone="muted">Càng thấp càng tốt</StatusBadge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{item.sortOrder}</TableCell>
                    <TableCell>
                      <StatusBadge tone={item.isActive ? 'success' : 'muted'}>
                        {item.isActive ? 'Đang dùng' : 'Đã tắt'}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {item.externalItemId ? (
                        <span className="text-muted-foreground">Theo từng nhân sự</span>
                      ) : !selectedPeriodId ? (
                        <span className="text-muted-foreground">Chọn kỳ lương</span>
                      ) : targetsLoading ? (
                        <Skeleton className="ml-auto h-4 w-16" />
                      ) : target ? (
                        <>{formatNumber(target.targetValue)}{item.unit ? <span className="text-xs font-normal text-muted-foreground"> {item.unit}</span> : null}</>
                      ) : (
                        <span className="text-muted-foreground">Chưa đặt</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canConfigure && !item.externalItemId ? <EditKpiItemDialog item={item} /> : null}
                        {canSetTarget && selectedPeriodId && !item.externalItemId ? (
                          <SetKpiTargetDialog periodId={selectedPeriodId} item={item} currentValue={target?.targetValue} />
                        ) : item.externalItemId ? (
                          <span className="text-xs text-muted-foreground">Quản lý tại VCBI</span>
                        ) : selectedPeriod?.status === 'CLOSED' ? (
                          <span className="text-xs text-muted-foreground">Kỳ đã khóa</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

function CreateKpiGroupDialog({ onCreated, allowedTeamIds }: { onCreated: (id: string) => void; allowedTeamIds?: string[] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [applicableEmployeeGroupIds, setApplicableEmployeeGroupIds] = useState<string[]>([])
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName('')
      setDescription('')
      setApplicableEmployeeGroupIds([])
      setTeamIds([])
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createKpiGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        applicableEmployeeGroupIds,
        teamIds,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.groups })
      toast.success('Đã tạo nhóm KPI')
      setOpen(false)
      onCreated(created.id)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Nhập tên nhóm KPI.')
      return
    }
    if (teamIds.length === 0) {
      setFormError('Chọn ít nhất một team áp dụng.')
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Tạo nhóm KPI
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo nhóm KPI</DialogTitle>
          <DialogDescription>
            Chọn nhóm nhân sự để hệ thống tự động gán KPI khi mở kỳ lương mới.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="kg-name">Tên nhóm</Label>
            <Input
              id="kg-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Sản xuất content"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="kg-desc">Mô tả (không bắt buộc)</Label>
            <Textarea id="kg-desc" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <p className="rounded-lg bg-secondary p-3 text-xs leading-5 text-secondary-foreground">
            Kết quả và target hiện được nhập trong hệ thống. Nguồn VCBI sẽ được mở lại khi luồng đồng bộ hoàn thiện.
          </p>
          <KpiTeamSelector value={teamIds} onChange={setTeamIds} allowedTeamIds={allowedTeamIds} />
          <EmployeeGroupSelector
            value={applicableEmployeeGroupIds}
            onChange={setApplicableEmployeeGroupIds}
            teamIds={teamIds}
          />
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Tạo nhóm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditKpiGroupDialog({ group, allowedTeamIds }: { group: KpiGroup; allowedTeamIds?: string[] }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [applicableEmployeeGroupIds, setApplicableEmployeeGroupIds] = useState<string[]>(
    group.applicableEmployeeGroups.map((employeeGroup) => employeeGroup.id),
  )
  const [teamIds, setTeamIds] = useState<string[]>(group.teams.map((team) => team.id))
  const [isActive, setIsActive] = useState(group.isActive)
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(group.name)
      setDescription(group.description ?? '')
      setApplicableEmployeeGroupIds(
        group.applicableEmployeeGroups.map((employeeGroup) => employeeGroup.id),
      )
      setTeamIds(group.teams.map((team) => team.id))
      setIsActive(group.isActive)
      setFormError(null)
    }
    setOpen(next)
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      updateKpiGroup(group.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        applicableEmployeeGroupIds,
        teamIds,
        isActive,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.groups })
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.group(group.id) })
      toast.success('Đã cập nhật nhóm KPI')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Nhập tên nhóm KPI.')
      return
    }
    if (teamIds.length === 0) {
      setFormError('Chọn ít nhất một team áp dụng.')
      return
    }
    updateMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Sửa nhóm
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sửa nhóm KPI</DialogTitle>
          <DialogDescription>Tắt nhóm không xóa lịch sử target/actual cũ.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="kg-edit-name">Tên nhóm</Label>
            <Input id="kg-edit-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="kg-edit-desc">Mô tả</Label>
            <Textarea id="kg-edit-desc" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Trạng thái</Label>
            <Select value={isActive ? 'active' : 'inactive'} onValueChange={(value) => setIsActive(value === 'active')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Đang hoạt động</SelectItem>
                <SelectItem value="inactive">Đã tắt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <KpiTeamSelector value={teamIds} onChange={setTeamIds} allowedTeamIds={allowedTeamIds} />
          <EmployeeGroupSelector
            value={applicableEmployeeGroupIds}
            onChange={setApplicableEmployeeGroupIds}
            teamIds={teamIds}
          />
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Xoá cứng nhóm KPI — chỉ ADMIN (quyền `kpi.delete_group`). Chỉ dùng cho nhóm tạo nhầm: BE chặn
// (409) nếu nhóm đã được gán cho nhân sự hoặc đã có target/actual/đề xuất — khi đó dùng "Sửa nhóm"
// để chuyển trạng thái sang "Đã tắt".
function DeleteKpiGroupDialog({ group, onDeleted }: { group: KpiGroupDetail; onDeleted: () => void }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteKpiGroup(group.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.groups })
      toast.success('Đã xoá nhóm KPI')
      setOpen(false)
      onDeleted()
    },
    // Giữ dialog mở khi lỗi (thường là 409 "đã phát sinh dữ liệu") để người dùng đọc được lý do.
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-[var(--danger-700)] hover:text-[var(--danger-700)]"
        >
          Xoá nhóm
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xoá nhóm KPI · {group.name}</DialogTitle>
          <DialogDescription>
            Chỉ dùng khi tạo nhầm. Hành động này không thể hoàn tác và sẽ xoá luôn {group.items.length} đầu mục
            của nhóm. Nếu nhóm đã được gán cho nhân sự hoặc đã có target/actual/đề xuất, hệ thống sẽ chặn —
            khi đó hãy dùng "Sửa nhóm" để chuyển trạng thái sang "Đã tắt".
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Xoá nhóm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Nhóm nghiệp vụ là danh mục quản lý theo phòng ban, nên danh sách chọn ở đây phụ thuộc team đã
 * chọn ở trên: chỉ hiện nhóm của cùng phòng ban với các team đó, cộng nhóm dùng chung
 * (departmentId = null). Đây đúng là ràng buộc BE kiểm khi tạo/sửa nhóm KPI.
 */
function EmployeeGroupSelector({
  value,
  onChange,
  teamIds,
}: {
  value: string[]
  onChange: (value: string[]) => void
  teamIds: string[]
}) {
  const teamsQuery = useQuery({ queryKey: ['org', 'teams'], queryFn: listTeams })
  const groupsQuery = useQuery({ queryKey: EMPLOYEE_GROUPS_KEY, queryFn: () => listEmployeeGroups() })
  const teams = teamsQuery.data ?? EMPTY_TEAMS
  const groups = groupsQuery.data ?? EMPTY_EMPLOYEE_GROUPS

  const departmentIds = useMemo(
    () =>
      Array.from(
        new Set(teams.filter((team) => teamIds.includes(team.id)).map((team) => team.departmentId)),
      ),
    [teamIds, teams],
  )
  // Nhóm đã tắt vẫn hiện nếu nhóm KPI đang gán nó — để người dùng thấy và bỏ chọn được.
  const availableGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          (group.status === 'ACTIVE' || value.includes(group.id)) &&
          (group.departmentId === null || departmentIds.includes(group.departmentId)),
      ),
    [departmentIds, groups, value],
  )

  // Đổi team sang phòng ban khác làm nhóm đã chọn không còn hợp lệ — bỏ chọn luôn thay vì để BE
  // trả lỗi lúc bấm lưu.
  useEffect(() => {
    if (teamsQuery.isLoading || groupsQuery.isLoading) return
    const allowedIds = availableGroups.map((group) => group.id)
    const pruned = value.filter((groupId) => allowedIds.includes(groupId))
    if (pruned.length !== value.length) onChange(pruned)
  }, [availableGroups, groupsQuery.isLoading, onChange, teamsQuery.isLoading, value])

  function toggle(groupId: string) {
    onChange(value.includes(groupId) ? value.filter((item) => item !== groupId) : [...value, groupId])
  }

  return (
    <fieldset className="grid gap-2 rounded-xl border bg-muted/40 p-3">
      <legend className="px-1 text-sm font-semibold">Tự động gán cho nhóm nhân sự</legend>
      <p className="text-xs leading-5 text-muted-foreground">
        Khi mở kỳ lương, nhóm KPI này được gán cho mọi nhân sự đang hiệu lực có nhóm nghiệp vụ tương ứng. Bỏ chọn tất cả để chỉ gán thủ công.
      </p>
      {groupsQuery.isLoading ? <p className="text-sm text-muted-foreground">Đang tải nhóm nghiệp vụ…</p> : null}
      {groupsQuery.isError ? (
        <p className="text-sm text-[var(--danger-700)]">Không tải được danh mục nhóm nghiệp vụ.</p>
      ) : null}
      {!groupsQuery.isLoading && teamIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chọn team áp dụng trước để biết nhóm nghiệp vụ nào dùng được.</p>
      ) : null}
      {!groupsQuery.isLoading && teamIds.length > 0 && availableGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Phòng ban của các team đã chọn chưa có nhóm nghiệp vụ nào. Tạo nhóm ở trang Phòng ban, team &amp; nhân sự, hoặc để trống để gán thủ công.
        </p>
      ) : null}
      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto overscroll-contain">
        {availableGroups.map((group) => (
          <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={value.includes(group.id)}
              onChange={() => toggle(group.id)}
            />
            {group.name}
            {group.department ? (
              <span className="text-xs font-normal text-muted-foreground">· {group.department.name}</span>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">· Dùng chung</span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Chọn team theo 2 bước: phòng ban trước, rồi mới tới team của phòng ban đó — danh sách phẳng toàn
 * bộ team quá dài để chọn chính xác. Một nhóm KPI vẫn được phép trải nhiều phòng ban, nên lựa chọn
 * KHÔNG bị xoá khi đổi phòng ban; các team đã chọn luôn hiện ở hàng chip phía trên để không lạc mất.
 */
function KpiTeamSelector({
  value,
  onChange,
  allowedTeamIds,
}: {
  value: string[]
  onChange: (value: string[]) => void
  allowedTeamIds?: string[]
}) {
  const teamsQuery = useQuery({ queryKey: ['org', 'teams'], queryFn: listTeams })
  const teams = teamsQuery.data ?? EMPTY_TEAMS
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null)
  const [teamSearch, setTeamSearch] = useState('')
  const normalizedTeamSearch = teamSearch.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const availableTeams = useMemo(
    () =>
      teams.filter(
        (team) => team.status === 'ACTIVE' && (allowedTeamIds == null || allowedTeamIds.includes(team.id)),
      ),
    [allowedTeamIds, teams],
  )
  const departments = useMemo(
    () =>
      Array.from(new Map(availableTeams.map((team) => [team.department.id, team.department])).values())
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [availableTeams],
  )

  // Phòng ban mặc định suy thẳng lúc render (không cần effect): sửa nhóm có sẵn thì mở đúng phòng
  // ban của team đầu tiên đã chọn; chỉ có một phòng ban thì mở luôn để khỏi bấm thừa một lần.
  // Người dùng chọn tay thì `selectedDepartmentId` ghi đè.
  const effectiveDepartmentId =
    selectedDepartmentId ??
    availableTeams.find((team) => value.includes(team.id))?.departmentId ??
    (departments.length === 1 ? departments[0].id : null)

  const departmentTeams = effectiveDepartmentId
    ? availableTeams.filter((team) => team.departmentId === effectiveDepartmentId)
    : []
  const filteredTeams = departmentTeams.filter((team) =>
    team.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(normalizedTeamSearch),
  )
  const selectedTeams = availableTeams.filter((team) => value.includes(team.id))
  const visibleTeamIds = filteredTeams.map((team) => team.id)
  const allVisibleSelected =
    visibleTeamIds.length > 0 && visibleTeamIds.every((teamId) => value.includes(teamId))

  function toggle(team: Team) {
    onChange(value.includes(team.id) ? value.filter((id) => id !== team.id) : [...value, team.id])
  }

  // Tác động đúng những team đang hiển thị (đã lọc theo phòng ban + ô tìm), không đụng lựa chọn
  // ở phòng ban khác.
  function toggleAllVisible() {
    onChange(
      allVisibleSelected
        ? value.filter((teamId) => !visibleTeamIds.includes(teamId))
        : Array.from(new Set([...value, ...visibleTeamIds])),
    )
  }

  return (
    <fieldset className="grid gap-2 rounded-xl border border-primary/15 bg-primary/5 p-3">
      <legend className="px-1 text-sm font-semibold">Team áp dụng <span className="text-[var(--danger-700)]">*</span></legend>
      <p className="text-xs leading-5 text-muted-foreground">
        Chọn phòng ban trước, rồi tick các team trong phòng ban đó. Có thể chọn team ở nhiều phòng ban —
        đổi phòng ban không làm mất lựa chọn đã có.
      </p>
      {teamsQuery.isLoading ? <p className="text-sm text-muted-foreground">Đang tải team…</p> : null}
      {teamsQuery.isError ? <p className="text-sm text-[var(--danger-700)]">Không tải được danh sách team.</p> : null}
      {!teamsQuery.isLoading && !teamsQuery.isError && availableTeams.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có team để cấu hình.</p>
      ) : null}

      {selectedTeams.length > 0 ? (
        <div className="flex max-h-20 flex-wrap items-center gap-1.5 overflow-y-auto overscroll-contain rounded-lg bg-card p-2 ring-1 ring-primary/10">
          <span className="text-xs font-semibold text-muted-foreground">Đã chọn {selectedTeams.length}:</span>
          {selectedTeams.map((team) => (
            <button
              key={team.id}
              type="button"
              className="flex cursor-pointer items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              onClick={() => toggle(team)}
              aria-label={`Bỏ chọn ${team.name}`}
            >
              {team.name}
              <span className="text-xs font-normal text-primary/70">· {team.department.name}</span>
              <X className="size-3" />
            </button>
          ))}
        </div>
      ) : null}

      {availableTeams.length > 0 ? (
        <Select
          value={effectiveDepartmentId ?? undefined}
          onValueChange={(departmentId) => {
            setSelectedDepartmentId(departmentId)
            setTeamSearch('')
          }}
        >
          <SelectTrigger className="w-full bg-card">
            <Building2 className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="Chọn phòng ban" />
          </SelectTrigger>
          <SelectContent searchPlaceholder="Tìm phòng ban...">
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {availableTeams.length > 0 && !effectiveDepartmentId ? (
        <p className="py-2 text-center text-sm text-muted-foreground">Chọn phòng ban để xem danh sách team.</p>
      ) : null}

      {effectiveDepartmentId && departmentTeams.length > 4 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="bg-card pl-8"
            value={teamSearch}
            onChange={(event) => setTeamSearch(event.target.value)}
            placeholder="Tìm team..."
          />
        </div>
      ) : null}

      {effectiveDepartmentId ? (
        <>
          {filteredTeams.length > 0 ? (
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-xs text-muted-foreground">
                {filteredTeams.length} team{filteredTeams.length !== departmentTeams.length ? ` / ${departmentTeams.length}` : ''}
              </span>
              <button
                type="button"
                className="cursor-pointer text-xs font-semibold text-primary hover:underline"
                onClick={toggleAllVisible}
              >
                {allVisibleSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            </div>
          ) : null}
          <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto overscroll-contain rounded-lg border border-primary/10 bg-card/60 p-2">
            {filteredTeams.map((team) => (
              <label key={team.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={value.includes(team.id)}
                  onChange={() => toggle(team)}
                />
                {team.name}
              </label>
            ))}
            {departmentTeams.length === 0 ? (
              <p className="w-full py-2 text-center text-sm text-muted-foreground">Phòng ban này chưa có team đang hoạt động.</p>
            ) : filteredTeams.length === 0 ? (
              <p className="w-full py-2 text-center text-sm text-muted-foreground">Không tìm thấy team phù hợp.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </fieldset>
  )
}

function CreateKpiItemDialog({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [sortOrder, setSortOrder] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName('')
      setUnit('')
      setSortOrder('')
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createKpiItem(groupId, {
        name: name.trim(),
        unit: unit.trim(),
        sortOrder: sortOrder ? Number(sortOrder) : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.group(groupId) })
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.groups })
      toast.success('Đã thêm đầu mục KPI')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!name.trim() || !unit.trim()) {
      setFormError('Nhập đủ tên và đơn vị đầu mục.')
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          Thêm đầu mục
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm đầu mục KPI</DialogTitle>
          <DialogDescription>Mã đầu mục được hệ thống tự sinh sau khi tạo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ki-name">Tên đầu mục</Label>
            <Input id="ki-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Video A1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ki-unit">Đơn vị</Label>
              <Input id="ki-unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="video" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ki-sort">Thứ tự hiển thị</Label>
              <Input
                id="ki-sort"
                type="number"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Thêm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditKpiItemDialog({ item }: { item: KpiItem }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState(item.unit)
  const [sortOrder, setSortOrder] = useState(String(item.sortOrder))
  const [isActive, setIsActive] = useState(item.isActive)
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(item.name)
      setUnit(item.unit)
      setSortOrder(String(item.sortOrder))
      setIsActive(item.isActive)
      setFormError(null)
    }
    setOpen(next)
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      updateKpiItem(item.id, {
        name: name.trim(),
        unit: unit.trim(),
        sortOrder: sortOrder ? Number(sortOrder) : undefined,
        isActive,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.group(item.kpiGroupId) })
      toast.success('Đã cập nhật đầu mục KPI')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!name.trim() || !unit.trim()) {
      setFormError('Nhập đủ tên và đơn vị đầu mục.')
      return
    }
    updateMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa đầu mục KPI</DialogTitle>
          <DialogDescription>
            Mã đầu mục (<code className="text-xs">{item.code}</code>) không sửa được.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ki-edit-name">Tên đầu mục</Label>
            <Input id="ki-edit-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ki-edit-unit">Đơn vị</Label>
              <Input id="ki-edit-unit" value={unit} onChange={(event) => setUnit(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ki-edit-sort">Thứ tự hiển thị</Label>
              <Input id="ki-edit-sort" type="number" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Trạng thái</Label>
            <Select value={isActive ? 'active' : 'inactive'} onValueChange={(value) => setIsActive(value === 'active')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Đang dùng</SelectItem>
                <SelectItem value="inactive">Đã tắt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SetKpiTargetDialog({
  periodId,
  item,
  currentValue,
}: {
  periodId: string
  item: KpiItem
  currentValue?: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [targetValue, setTargetValue] = useState(currentValue ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setTargetValue(currentValue ?? '')
      setFormError(null)
    }
    setOpen(next)
  }

  const setMutation = useMutation({
    mutationFn: () => setKpiPeriodTarget(periodId, item.id, Number(targetValue)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.targets(periodId) })
      toast.success('Đã lưu target')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    const value = Number(targetValue)
    if (!targetValue || Number.isNaN(value) || value <= 0) {
      setFormError('Mục tiêu phải là số lớn hơn 0.')
      return
    }
    setMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {currentValue ? 'Sửa mục tiêu' : 'Đặt mục tiêu'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mục tiêu cho "{item.name}"</DialogTitle>
          <DialogDescription>Mục tiêu lưu riêng theo kỳ đang chọn — không ảnh hưởng các kỳ khác.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="kt-value">Mục tiêu ({item.unit})</Label>
            <Input id="kt-value" type="number" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={setMutation.isPending}>
            {setMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lưu mục tiêu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OverrideTargetDialog({ item, periodId, employeeId, teamId }: {
  item: KpiProfileItem
  periodId: string
  employeeId: string
  teamId: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(item.targetValue ?? '')
  const [reason, setReason] = useState(item.targetOverrideReason ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setValue(item.targetValue ?? '')
      setReason(item.targetOverrideReason ?? '')
      setFormError(null)
    }
    setOpen(next)
  }

  const mutation = useMutation({
    mutationFn: () => overrideEmployeeKpiTarget(periodId, employeeId, item.kpiItemId, {
      overrideValue: Number(value),
      reason: reason.trim(),
    }, teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId, employeeId) })
      toast.success('Đã điều chỉnh mục tiêu')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })
  const clearMutation = useMutation({
    mutationFn: () => clearEmployeeKpiTargetOverride(periodId, employeeId, item.kpiItemId, teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId, employeeId) })
      toast.success('Đã bỏ điều chỉnh, trở về mục tiêu gốc')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })
  const pending = mutation.isPending || clearMutation.isPending

  function submit() {
    setFormError(null)
    if (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) {
      setFormError('Mục tiêu điều chỉnh phải là số ≥ 0.')
      return
    }
    if (!reason.trim()) {
      setFormError('Vui lòng nhập lý do điều chỉnh.')
      return
    }
    mutation.mutate()
  }

  return <Dialog open={open} onOpenChange={handleOpenChange}>
    <DialogTrigger asChild><Button variant="outline" size="sm">Điều chỉnh mục tiêu</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Điều chỉnh mục tiêu · {item.kpiItemName}</DialogTitle><DialogDescription>Áp dụng riêng cho nhân sự và kỳ đang xem. Giá trị điều chỉnh được giữ nguyên khi đồng bộ lại.</DialogDescription></DialogHeader>
      <div className="grid gap-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">Mục tiêu gốc: <strong>{formatNumber(item.targetOriginalValue ?? item.targetValue ?? 0)}</strong></div>
        <div className="grid gap-1.5"><Label htmlFor={`override-target-${item.kpiItemId}`}>Mục tiêu điều chỉnh ({item.kpiItemUnit})</Label><Input id={`override-target-${item.kpiItemId}`} type="number" min="0" step="any" value={value} onChange={(event) => setValue(event.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`override-target-reason-${item.kpiItemId}`}>Lý do điều chỉnh</Label><Textarea id={`override-target-reason-${item.kpiItemId}`} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
      </div>
      <DialogFooter>
        {item.targetOverrideValue != null ? <Button variant="outline" disabled={pending} onClick={() => clearMutation.mutate()}>{clearMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Bỏ điều chỉnh</Button> : null}
        <DialogClose asChild><Button variant="outline" disabled={pending}>Hủy</Button></DialogClose>
        <Button disabled={pending} onClick={submit}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Lưu điều chỉnh</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

function SetEmployeeKpiTargetDialog({
  item,
  periodId,
  employeeId,
  teamId,
}: {
  item: KpiProfileItem
  periodId: string
  employeeId: string
  teamId: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [targetValue, setTargetValue] = useState(item.targetValue ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setTargetValue(item.targetValue ?? '')
      setFormError(null)
    }
    setOpen(next)
  }

  const setMutation = useMutation({
    mutationFn: () => setEmployeeKpiTarget(periodId, employeeId, item.kpiItemId, Number(targetValue), teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KPI_KEYS.profile(periodId, employeeId) })
      toast.success('Đã lưu mục tiêu')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    const value = Number(targetValue)
    if (targetValue === '' || !Number.isFinite(value) || value < 0) {
      setFormError('Mục tiêu phải là số ≥ 0.')
      return
    }
    setMutation.mutate()
  }

  const hasEmployeeTarget = item.targetSource === 'EMPLOYEE'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {hasEmployeeTarget ? 'Sửa mục tiêu' : 'Đặt mục tiêu'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mục tiêu · {item.kpiItemName}</DialogTitle>
          <DialogDescription>
            Giá trị này chỉ áp dụng cho nhân sự đang xem trong kỳ đã chọn và được ưu tiên hơn mục tiêu mặc định của kỳ.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`employee-kt-value-${item.kpiItemId}`}>Mục tiêu ({item.kpiItemUnit})</Label>
            <Input
              id={`employee-kt-value-${item.kpiItemId}`}
              type="number"
              value={targetValue}
              onChange={(event) => setTargetValue(event.target.value)}
            />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={setMutation.isPending}>
            {setMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lưu mục tiêu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InfoNotice({ message, title = 'Chưa có gì để hiển thị' }: { message: string; title?: string }) {
  return (
    <Card className="py-0">
      <EmptyState icon={Target} title={title} description={message} />
    </Card>
  )
}

/**
 * Nút hiện/ẩn theo giai đoạn kỳ nên phải nói rõ lý do, nếu không người dùng sẽ tưởng mất quyền.
 * Không hiện gì khi chưa xác định được kỳ — lúc đó tab đã có thông báo "Chưa chọn hồ sơ" riêng.
 */
function PeriodStageNotice({ stage }: { stage: PeriodStage }) {
  const hint = periodStageHint(stage)
  if (!hint) return null

  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${stage.isReview ? toneSurface.warning : toneSurface.info}`}>
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {hint}
    </div>
  )
}

function PermissionNotice({ message }: { message: string }) {
  return (
    <Card className="py-0">
      <EmptyState
        icon={AlertCircle}
        tone="warning"
        title="Không có nội dung phù hợp với quyền hiện tại"
        description={message}
      />
    </Card>
  )
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => unknown }) {
  return (
    <div className="p-1">
      <ErrorState description={getApiErrorMessage(error)} onRetry={() => onRetry()} />
    </div>
  )
}
