import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  BadgeDollarSign,
  ChevronRight,
  History,
  Loader2,
  Pencil,
  Plus,
  Building2,
  ChevronLeft,
  Filter,
  Lock,
  Search,
  Settings2,
  Target,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { listKpiGroups, type KpiGroup } from '@/api/kpi'
import { listEmployees, type Employee } from '@/api/organization'
import {
  activateRewardRuleSet,
  archiveRewardRuleSet,
  createBaseSalaryHistory,
  createKpiRewardRate,
  createRevenueBracket,
  createRewardRuleSet,
  deleteKpiRewardRate,
  deleteRevenueBracket,
  getApiErrorMessage,
  listBaseSalaryHistory,
  listCurrentBaseSalaries,
  listCurrentKpiRewardRates,
  listKpiRewardRates,
  listRevenueBrackets,
  listRewardRuleSets,
  updateBaseSalaryHistory,
  updateKpiRewardRate,
  updateRevenueBracket,
  type BaseSalaryHistory,
  type KpiRewardRate,
  type RevenueRewardBracket,
  type RewardRuleSet,
  type RewardRuleSetStatus,
} from '@/api/reward-config'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatNumber } from '@/lib/format'
import { useDebouncedValue } from '@/lib/use-debounced-value'
import { toneSurface, type Tone } from '@/lib/tone'

const REWARD_KEYS = {
  ruleSets: ['reward-config', 'rule-sets'] as const,
  brackets: (ruleSetId: string) => ['reward-config', 'rule-sets', ruleSetId, 'brackets'] as const,
  baseSalary: (employeeId: string) => ['reward-config', 'base-salary', employeeId] as const,
  baseSalaryCurrent: ['reward-config', 'base-salary', 'current'] as const,
  kpiRewardRates: (employeeId: string) => ['reward-config', 'kpi-reward-rates', employeeId] as const,
  kpiRewardRatesCurrent: ['reward-config', 'kpi-reward-rates', 'current'] as const,
  // Prefix dùng khi ghi dữ liệu: làm mới cả lịch sử của một người lẫn bảng tổng hợp "current".
  baseSalaryAll: ['reward-config', 'base-salary'] as const,
  kpiRewardRatesAll: ['reward-config', 'kpi-reward-rates'] as const,
}

const EMPLOYEES_PAGE_SIZE = 100
const NONE_CLONE = '__none__'
const RULE_SET_SECTION_ID = 'rule-set-overview'
const DIRECTORY_PAGE_SIZE = 20
const ALL = '__all__'

const RULE_SET_STATUS_LABEL: Record<RewardRuleSetStatus, string> = {
  DRAFT: 'Bản nháp',
  ACTIVE: 'Đang áp dụng',
  ARCHIVED: 'Đã lưu trữ',
}
const RULE_SET_STATUS_TONE: Record<RewardRuleSetStatus, Tone> = {
  DRAFT: 'warning',
  ACTIVE: 'success',
  ARCHIVED: 'muted',
}
// Ưu tiên hiển thị ACTIVE làm "ruleset hiện hành"; nếu chưa có ACTIVE thì lấy DRAFT mới nhất.
const STATUS_PRIORITY: Record<RewardRuleSetStatus, number> = {
  ACTIVE: 0,
  DRAFT: 1,
  ARCHIVED: 2,
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'dd/MM/yyyy')
}

function formatMoney(value: string) {
  const num = Number(value)
  return Number.isNaN(num) ? value : `${num.toLocaleString('vi-VN')} ₫`
}

function formatPercent(value: string) {
  const num = Number(value)
  return Number.isNaN(num) ? value : `${num.toLocaleString('vi-VN')}%`
}

type EffectiveRangeStatus = {
  label: 'Sắp hiệu lực' | 'Đang hiệu lực' | 'Hết hiệu lực'
  tone: 'success' | 'warning' | 'muted'
}

/**
 * So sánh theo ngày nghiệp vụ, không theo timestamp để tránh lệch múi giờ với cột PostgreSQL DATE.
 * Khoảng hiệu lực là đoạn đóng [effectiveFrom, effectiveTo]: còn hiệu lực đến hết ngày effectiveTo.
 */
function getEffectiveRangeStatus(
  effectiveFrom: string,
  effectiveTo: string | null,
): EffectiveRangeStatus {
  const today = format(new Date(), 'yyyy-MM-dd')
  const from = effectiveFrom.slice(0, 10)
  const to = effectiveTo?.slice(0, 10) ?? null
  if (today < from) return { label: 'Sắp hiệu lực', tone: 'warning' }
  if (to && today > to) return { label: 'Hết hiệu lực', tone: 'muted' }
  return { label: 'Đang hiệu lực', tone: 'success' }
}

export function SalarySettingsPage() {
  const { user } = useAuth()
  const canViewRules = user?.permissions.includes('reward_rules.view') ?? false
  const canManageRules = user?.permissions.includes('reward_rules.manage') ?? false
  const canViewBaseSalary = user?.permissions.includes('base_salary.view') ?? false
  const canManageBaseSalary = user?.permissions.includes('base_salary.manage') ?? false
  const canViewKpiRewardRate = user?.permissions.includes('kpi_reward_rate.view') ?? false
  const canManageKpiRewardRate = user?.permissions.includes('kpi_reward_rate.manage') ?? false
  // Bộ lọc nhân sự dùng chung cho tab "Lương cơ bản" và "Mức tiền KPI theo nhân sự":
  // đặt ở cấp trang để tìm kiếm/phòng ban/team/trang không bị mất khi Tabs unmount tab cũ.
  const employeeDirectory = useEmployeeDirectory(canViewBaseSalary || canViewKpiRewardRate)
  const visibleTabs = [
    canViewBaseSalary ? 'base-salary' : null,
    canViewKpiRewardRate ? 'kpi-reward' : null,
    canViewRules ? 'history' : null,
  ].filter((tab): tab is 'base-salary' | 'kpi-reward' | 'history' => Boolean(tab))

  // Tab nằm trên URL để gửi link thẳng tới đúng nhóm cấu hình và không mất khi tải lại trang.
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? visibleTabs[0] ?? ''
  const visibleActiveTab = visibleTabs.includes(activeTab as (typeof visibleTabs)[number])
    ? activeTab
    : visibleTabs[0]

  function setActiveTab(tab: string) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<string | null>(null)

  const ruleSetsQuery = useQuery({
    queryKey: REWARD_KEYS.ruleSets,
    queryFn: listRewardRuleSets,
    enabled: canViewRules,
  })
  const ruleSetsData = ruleSetsQuery.data
  const ruleSets = ruleSetsData ?? []

  const currentRuleSet = useMemo(() => {
    const list = ruleSetsData ?? []
    if (selectedRuleSetId) {
      const found = list.find((item) => item.id === selectedRuleSetId)
      if (found) return found
    }
    return [...list].sort((a, b) => {
      const priorityDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
      if (priorityDiff !== 0) return priorityDiff
      return b.version - a.version
    })[0]
  }, [ruleSetsData, selectedRuleSetId])

  const ruleSetsState: 'no-permission' | 'loading' | 'error' | 'empty' | 'ready' = !canViewRules
    ? 'no-permission'
    : ruleSetsQuery.isLoading
      ? 'loading'
      : ruleSetsQuery.isError
        ? 'error'
        : !currentRuleSet
          ? 'empty'
          : 'ready'

  function viewRuleSet(id: string) {
    setSelectedRuleSetId(id)
    document.getElementById(RULE_SET_SECTION_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Quản trị cấu hình"
        title="Cấu hình lương & thưởng"
        description="Quản lý bộ quy tắc, mức lương cơ bản và mức tiền KPI theo hiệu lực; mọi thay đổi được lưu theo phiên bản."
        action={canManageRules ? <CreateVersionDialog ruleSets={ruleSets} onCreated={viewRuleSet} /> : null}
      />

      {!canViewRules ? null : ruleSetsState === 'loading' ? (
        <section className="grid gap-4 xl:grid-cols-5">
          <Card className="py-0 xl:col-span-3"><CardContent className="space-y-4 p-5">
            <Skeleton className="h-5 w-40" /><Skeleton className="h-7 w-56" /><Skeleton className="h-28 w-full rounded-xl" />
          </CardContent></Card>
          <Card className="py-0 xl:col-span-2"><CardContent className="space-y-3 p-5">
            <Skeleton className="h-4 w-32" /><Skeleton className="h-20 w-full" />
          </CardContent></Card>
        </section>
      ) : ruleSetsState === 'error' ? (
        <ErrorState description={getApiErrorMessage(ruleSetsQuery.error)} onRetry={() => void ruleSetsQuery.refetch()} />
      ) : ruleSetsState === 'empty' ? (
        <Card className="py-0">
          <EmptyState
            icon={Settings2}
            title="Chưa có bộ quy tắc thưởng nào"
            description={canManageRules
              ? 'Tạo phiên bản đầu tiên để thiết lập mốc doanh thu, hoa hồng và RPM cho việc tính lương.'
              : 'Chưa có bộ quy tắc nào được cấu hình. Liên hệ người phụ trách quản trị cấu hình để thiết lập.'}
            action={canManageRules ? <CreateVersionDialog ruleSets={ruleSets} onCreated={viewRuleSet} /> : undefined}
          />
        </Card>
      ) : (
        <section id={RULE_SET_SECTION_ID} className="grid scroll-mt-24 gap-4 xl:grid-cols-5">
          <Card className="py-0 xl:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">Bộ quy tắc hiện hành · phiên bản {currentRuleSet!.version}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Tạo lúc {formatDate(currentRuleSet!.createdAt)}</p>
                  </div>
                </div>
                <StatusBadge tone={RULE_SET_STATUS_TONE[currentRuleSet!.status]}>
                  {RULE_SET_STATUS_LABEL[currentRuleSet!.status]}
                </StatusBadge>
              </div>

              <dl className="mt-5 divide-y rounded-xl border bg-muted/40 px-4 text-sm">
                <Rule label="Ngưỡng đạt KPI/OKR" value={formatPercent(currentRuleSet!.achievementThresholdPercent)} />
                <Rule label="Quy tắc vượt 100%" value="Chặn trần 100%, không thưởng thêm" />
                <Rule label="KPI/OKR quy đổi tiền" value="Binary: đạt ngưỡng nhận đủ, không đạt nhận 0 ₫" />
                <Rule label="RPM phụ thuộc KPI/OKR" value="Không" success />
              </dl>

              {/* Chỉ nhắc quy tắc bất biến khi bộ quy tắc thật sự đang ở chế độ chỉ xem. */}
              {currentRuleSet!.status !== 'DRAFT' ? (
                <p className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.warning}`}>
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Phiên bản này không sửa trực tiếp được. Muốn đổi mốc doanh thu, RPM hay điều kiện KPI/OKR thì tạo phiên bản
                    mới — bảng lương đã tính vẫn giữ nguyên bộ quy tắc tại thời điểm tính.
                  </span>
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <RuleSetActions ruleSet={currentRuleSet!} canManage={canManageRules} />
                {canViewRules ? (
                  <Button variant="outline" onClick={() => setActiveTab('history')}>
                    Xem lịch sử phiên bản <History className="size-4" />
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="xl:col-span-3">
            <RevenueBracketsTab ruleSet={currentRuleSet!} canManage={canManageRules} />
          </div>
        </section>
      )}

      {visibleActiveTab ? <Tabs value={visibleActiveTab} onValueChange={setActiveTab}>
        <TabsList variant="line">
          {canViewBaseSalary ? <TabsTrigger value="base-salary">Lương cơ bản</TabsTrigger> : null}
          {canViewKpiRewardRate ? <TabsTrigger value="kpi-reward">Mức tiền KPI theo nhân sự</TabsTrigger> : null}
          {canViewRules ? <TabsTrigger value="history">Lịch sử bộ quy tắc</TabsTrigger> : null}
        </TabsList>

        {canViewBaseSalary ? <TabsContent value="base-salary" className="mt-3">
          <BaseSalaryTab canView={canViewBaseSalary} canManage={canManageBaseSalary} directory={employeeDirectory} />
        </TabsContent> : null}

        {canViewKpiRewardRate ? <TabsContent value="kpi-reward" className="mt-3">
          <KpiRewardTab canView={canViewKpiRewardRate} canManage={canManageKpiRewardRate} directory={employeeDirectory} />
        </TabsContent> : null}

        {canViewRules ? <TabsContent value="history" className="mt-3">
          {ruleSetsState === 'loading' ? (
            <Skeleton className="h-48 w-full" />
          ) : ruleSetsState === 'error' ? (
            <QueryError error={ruleSetsQuery.error} onRetry={() => ruleSetsQuery.refetch()} />
          ) : (
            <VersionHistoryTab ruleSets={ruleSets} currentId={currentRuleSet?.id} onView={viewRuleSet} />
          )}
        </TabsContent> : null}
      </Tabs> : <InfoNotice message="Tài khoản chưa được cấp quyền xem nhóm cấu hình nào." />}
    </div>
  )
}
function RuleSetActions({ ruleSet, canManage }: { ruleSet: RewardRuleSet; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [confirmActivate, setConfirmActivate] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const activateMutation = useMutation({
    mutationFn: () => activateRewardRuleSet(ruleSet.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.ruleSets })
      toast.success('Đã kích hoạt bộ quy tắc')
      setConfirmActivate(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const archiveMutation = useMutation({
    mutationFn: () => archiveRewardRuleSet(ruleSet.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.ruleSets })
      toast.success(ruleSet.status === 'DRAFT' ? 'Đã hủy bản nháp' : 'Đã lưu trữ bộ quy tắc')
      setConfirmArchive(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  if (!canManage || ruleSet.status === 'ARCHIVED') return null

  return (
    <div className="flex gap-2">
      {ruleSet.status === 'DRAFT' ? (
        <Dialog open={confirmActivate} onOpenChange={setConfirmActivate}>
          <DialogTrigger asChild>
            <Button>Kích hoạt</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Kích hoạt bộ quy tắc phiên bản {ruleSet.version}?</DialogTitle>
              <DialogDescription>
                Bản đang áp dụng (nếu có) sẽ tự động chuyển sang trạng thái Đã lưu trữ. Kỳ lương mở sau thời điểm này sẽ dùng
                đúng phiên bản này.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Hủy</Button>
              </DialogClose>
              <Button onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                {activateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Xác nhận kích hoạt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogTrigger asChild>
          <Button variant="outline">{ruleSet.status === 'DRAFT' ? 'Hủy bản nháp' : 'Lưu trữ'}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ruleSet.status === 'DRAFT' ? `Hủy bản nháp phiên bản ${ruleSet.version}?` : `Lưu trữ bộ quy tắc phiên bản ${ruleSet.version}?`}
            </DialogTitle>
            <DialogDescription>
              {ruleSet.status === 'DRAFT'
                ? 'Bản nháp sẽ chuyển sang trạng thái Đã lưu trữ, không thể kích hoạt lại — phải tạo bản nháp mới nếu cần.'
                : 'Bộ quy tắc sẽ không còn hiệu lực cho các kỳ lương mở sau thời điểm này.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Đóng</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>
              {archiveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateVersionDialog({ ruleSets, onCreated }: { ruleSets: RewardRuleSet[]; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [achievementThresholdPercent, setAchievementThresholdPercent] = useState('80')
  const activeRuleSet = ruleSets.find((item) => item.status === 'ACTIVE')
  const [cloneFromId, setCloneFromId] = useState(activeRuleSet?.id ?? NONE_CLONE)
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setAchievementThresholdPercent('80')
      setCloneFromId(activeRuleSet?.id ?? NONE_CLONE)
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createRewardRuleSet({
        achievementThresholdPercent: Number(achievementThresholdPercent),
        cloneRevenueBracketsFromRuleSetId: cloneFromId === NONE_CLONE ? undefined : cloneFromId,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.ruleSets })
      toast.success(`Đã tạo bộ quy tắc phiên bản ${created.version} (Bản nháp)`)
      setOpen(false)
      onCreated(created.id)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    const value = Number(achievementThresholdPercent)
    if (!achievementThresholdPercent || Number.isNaN(value) || value < 0 || value > 100) {
      setFormError('Ngưỡng đạt KPI/OKR phải là số từ 0 đến 100.')
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Tạo phiên bản mới
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo bộ quy tắc bản nháp</DialogTitle>
          <DialogDescription>Bản nháp có thể chỉnh sửa mốc doanh thu trước khi kích hoạt.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="rrs-threshold">Ngưỡng đạt KPI/OKR (%)</Label>
            <Input
              id="rrs-threshold"
              type="number"
              min={0}
              max={100}
              value={achievementThresholdPercent}
              onChange={(event) => setAchievementThresholdPercent(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Sao chép mốc doanh thu từ</Label>
            <Select value={cloneFromId} onValueChange={setCloneFromId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_CLONE}>— Không sao chép (tạo rỗng) —</SelectItem>
                {ruleSets.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    Bộ quy tắc phiên bản {item.version} ({RULE_SET_STATUS_LABEL[item.status]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Tạo bản nháp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Tab: Mốc doanh thu & RPM ─────────────────────────────────────────────────

/**
 * Danh bạ nhân sự dùng chung cho hai tab cấu hình theo người: lọc theo phòng ban/team/từ khoá
 * rồi phân trang cho dễ đọc. Dữ liệu cấu hình của cả danh sách lấy một lần qua endpoint
 * `/current`, nên phân trang ở đây thuần tuý là chuyện hiển thị.
 */
function useEmployeeDirectory(enabled: boolean) {
  const employeesQuery = useQuery({
    queryKey: ['org', 'employees', { pageSize: EMPLOYEES_PAGE_SIZE, excludeLeft: true }],
    queryFn: () => listEmployees({ page: 1, pageSize: EMPLOYEES_PAGE_SIZE, excludeLeft: true }),
    enabled,
  })
  const employees = useMemo(() => employeesQuery.data?.data ?? [], [employeesQuery.data])

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 250)
  const [departmentId, setDepartmentId] = useState(ALL)
  const [teamId, setTeamId] = useState(ALL)
  const [page, setPage] = useState(1)

  const teams = useMemo(
    () => Array.from(new Map(employees.map((item) => [item.team.id, item.team])).values())
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [employees],
  )
  const departments = useMemo(
    () => Array.from(new Map(teams.map((team) => [team.department.id, team.department])).values())
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [teams],
  )
  const visibleTeams = departmentId === ALL ? teams : teams.filter((team) => team.departmentId === departmentId)

  const filtered = useMemo(() => employees.filter((item) => {
    if (departmentId !== ALL && item.team.departmentId !== departmentId) return false
    if (teamId !== ALL && item.teamId !== teamId) return false
    if (!debouncedSearch) return true
    return item.fullName.toLowerCase().includes(debouncedSearch)
      || item.employeeCode.toLowerCase().includes(debouncedSearch)
      || item.jobTitle.toLowerCase().includes(debouncedSearch)
  }), [debouncedSearch, departmentId, employees, teamId])

  const totalPages = Math.max(1, Math.ceil(filtered.length / DIRECTORY_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * DIRECTORY_PAGE_SIZE, currentPage * DIRECTORY_PAGE_SIZE)
  const isFiltering = debouncedSearch !== '' || departmentId !== ALL || teamId !== ALL

  function changeDepartment(value: string) {
    setDepartmentId(value)
    setTeamId(ALL)
    setPage(1)
  }

  function changeTeam(value: string) {
    setTeamId(value)
    setPage(1)
  }

  function changeSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function clearFilters() {
    setSearch('')
    setDepartmentId(ALL)
    setTeamId(ALL)
    setPage(1)
  }

  return {
    employeesQuery,
    employees,
    departments,
    visibleTeams,
    filtered,
    pageItems,
    currentPage,
    totalPages,
    isFiltering,
    search,
    departmentId,
    teamId,
    setPage,
    changeSearch,
    changeDepartment,
    changeTeam,
    clearFilters,
  }
}

type EmployeeDirectory = ReturnType<typeof useEmployeeDirectory>

type DirectoryFilterProps = {
  search: string
  onSearchChange: (value: string) => void
  departmentId: string
  onDepartmentChange: (value: string) => void
  teamId: string
  onTeamChange: (value: string) => void
  departments: Array<{ id: string; name: string }>
  teams: Array<{ id: string; name: string }>
}

function DirectoryFilters({
  search, onSearchChange, departmentId, onDepartmentChange, teamId, onTeamChange, departments, teams,
}: DirectoryFilterProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_13rem_13rem]">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          className="w-full pr-9 pl-8"
          placeholder="Tìm theo tên, mã nhân sự hoặc chức danh"
          aria-label="Tìm nhân sự"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {search ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Xoá từ khoá tìm kiếm"
            className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <Select value={departmentId} onValueChange={onDepartmentChange}>
        <SelectTrigger className="w-full" aria-label="Lọc theo phòng ban">
          <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <SelectValue placeholder="Phòng ban" />
        </SelectTrigger>
        <SelectContent searchPlaceholder="Tìm phòng ban...">
          <SelectItem value={ALL}>Tất cả phòng ban</SelectItem>
          {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={teamId} onValueChange={onTeamChange}>
        <SelectTrigger className="w-full" aria-label="Lọc theo team">
          <UsersRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <SelectValue placeholder="Team" />
        </SelectTrigger>
        <SelectContent searchPlaceholder="Tìm team...">
          <SelectItem value={ALL}>Tất cả team</SelectItem>
          {teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function DirectoryPagination({
  current, total, count, onPage,
}: { current: number; total: number; count: number; onPage: (page: number) => void }) {
  if (total <= 1) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-sm">
      <span className="text-muted-foreground">
        Trang <strong className="text-foreground">{formatNumber(current)}</strong> / {formatNumber(total)} · {formatNumber(count)} nhân sự
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={current === 1} onClick={() => onPage(current - 1)}>
          <ChevronLeft className="size-4" aria-hidden="true" />Trang trước
        </Button>
        <Button variant="outline" size="sm" disabled={current === total} onClick={() => onPage(current + 1)}>
          Trang sau <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

function EmployeeCell({ employee }: { employee: Employee }) {
  return (
    <>
      <strong className="block font-semibold text-foreground">{employee.fullName}</strong>
      <span className="text-xs text-muted-foreground">{employee.employeeCode} · {employee.jobTitle}</span>
    </>
  )
}

function RevenueBracketsTab({ ruleSet, canManage }: { ruleSet: RewardRuleSet; canManage: boolean }) {
  const bracketsQuery = useQuery({
    queryKey: REWARD_KEYS.brackets(ruleSet.id),
    queryFn: () => listRevenueBrackets(ruleSet.id),
  })
  const brackets = bracketsQuery.data ?? []
  const canEdit = canManage && ruleSet.status === 'DRAFT'

  return (
    <Card className="h-full overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Mốc doanh thu → Hoa hồng &amp; RPM</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Phiên bản {ruleSet.version}{ruleSet.status !== 'DRAFT' ? ' · chỉ xem' : ''}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Một doanh thu chỉ khớp một mốc: min ≤ doanh thu &lt; max; mốc cao nhất không giới hạn trên.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {formatNumber(brackets.length)} mốc
            </span>
            {canEdit ? <CreateBracketDialog ruleSetId={ruleSet.id} /> : null}
          </div>
        </div>

        {bracketsQuery.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div>
        ) : bracketsQuery.isError ? (
          <QueryError error={bracketsQuery.error} onRetry={() => bracketsQuery.refetch()} />
        ) : brackets.length === 0 ? (
          <EmptyState
            size="sm"
            icon={BadgeDollarSign}
            title="Chưa có mốc doanh thu nào"
            description="Thêm mốc để thiết lập tỷ lệ hoa hồng và đơn giá RPM tương ứng với từng khoảng doanh thu."
            action={canEdit ? <CreateBracketDialog ruleSetId={ruleSet.id} /> : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mốc doanh thu</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead className="text-right">RPM / 1.000 views</TableHead>
                {canEdit ? <TableHead className="text-right">Hành động</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {brackets.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <strong className="block font-semibold text-foreground">{item.label}</strong>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Từ {formatMoney(item.minRevenueAmount)} đến {item.maxRevenueAmount ? formatMoney(item.maxRevenueAmount) : 'không giới hạn'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-bold whitespace-nowrap text-primary tabular-nums">
                    {formatPercent(item.commissionRatePercent)}
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                    {formatMoney(item.rpmRatePer1000Views)}
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <EditBracketDialog bracket={item} />
                        <DeleteBracketButton bracket={item} />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function CreateBracketDialog({ ruleSetId }: { ruleSetId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [minRevenueAmount, setMinRevenueAmount] = useState('')
  const [maxMode, setMaxMode] = useState<'bounded' | 'unbounded'>('bounded')
  const [maxRevenueAmount, setMaxRevenueAmount] = useState('')
  const [commissionRatePercent, setCommissionRatePercent] = useState('')
  const [rpmRatePer1000Views, setRpmRatePer1000Views] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setLabel('')
      setMinRevenueAmount('')
      setMaxMode('bounded')
      setMaxRevenueAmount('')
      setCommissionRatePercent('')
      setRpmRatePer1000Views('')
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createRevenueBracket(ruleSetId, {
        label: label.trim(),
        minRevenueAmount,
        maxRevenueAmount: maxMode === 'unbounded' ? undefined : maxRevenueAmount,
        commissionRatePercent,
        rpmRatePer1000Views,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.brackets(ruleSetId) })
      toast.success('Đã thêm mốc doanh thu')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!label.trim() || !minRevenueAmount || (maxMode === 'bounded' && !maxRevenueAmount) || !commissionRatePercent || !rpmRatePer1000Views) {
      setFormError('Nhập đủ thông tin mốc doanh thu.')
      return
    }
    if (maxMode === 'bounded' && Number(maxRevenueAmount) <= Number(minRevenueAmount)) {
      setFormError('Doanh thu đến phải lớn hơn doanh thu từ.')
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          Thêm mốc
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm mốc doanh thu</DialogTitle>
          <DialogDescription>Chỉ áp dụng được khi bộ quy tắc đang ở trạng thái Bản nháp.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="bracket-label">Tên mốc</Label>
            <Input id="bracket-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="0-100 triệu" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bracket-min">Từ doanh thu (₫)</Label>
            <MoneyInput
              id="bracket-min"
              value={minRevenueAmount}
              onValueChange={setMinRevenueAmount}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Giới hạn trên</Label>
            <Select value={maxMode} onValueChange={(value) => setMaxMode(value as 'bounded' | 'unbounded')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bounded">Có giới hạn</SelectItem>
                <SelectItem value="unbounded">Không giới hạn (mốc cao nhất)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {maxMode === 'bounded' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="bracket-max">Đến doanh thu (₫)</Label>
              <MoneyInput
                id="bracket-max"
                value={maxRevenueAmount}
                onValueChange={setMaxRevenueAmount}
              />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bracket-commission">% Hoa hồng</Label>
              <Input
                id="bracket-commission"
                type="number"
                step="0.01"
                value={commissionRatePercent}
                onChange={(event) => setCommissionRatePercent(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bracket-rpm">RPM / 1.000 views (₫)</Label>
              <MoneyInput
                id="bracket-rpm"
                value={rpmRatePer1000Views}
                onValueChange={setRpmRatePer1000Views}
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
            Thêm mốc
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditBracketDialog({ bracket }: { bracket: RevenueRewardBracket }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(bracket.label)
  const [minRevenueAmount, setMinRevenueAmount] = useState(bracket.minRevenueAmount)
  const [maxRevenueAmount, setMaxRevenueAmount] = useState(bracket.maxRevenueAmount ?? '')
  const [commissionRatePercent, setCommissionRatePercent] = useState(bracket.commissionRatePercent)
  const [rpmRatePer1000Views, setRpmRatePer1000Views] = useState(bracket.rpmRatePer1000Views)
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setLabel(bracket.label)
      setMinRevenueAmount(bracket.minRevenueAmount)
      setMaxRevenueAmount(bracket.maxRevenueAmount ?? '')
      setCommissionRatePercent(bracket.commissionRatePercent)
      setRpmRatePer1000Views(bracket.rpmRatePer1000Views)
      setFormError(null)
    }
    setOpen(next)
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      updateRevenueBracket(bracket.id, {
        label: label.trim(),
        minRevenueAmount,
        maxRevenueAmount: maxRevenueAmount || undefined,
        commissionRatePercent,
        rpmRatePer1000Views,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.brackets(bracket.rewardRuleSetId) })
      toast.success('Đã cập nhật mốc doanh thu')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!label.trim() || !minRevenueAmount || !commissionRatePercent || !rpmRatePer1000Views) {
      setFormError('Nhập đủ thông tin mốc doanh thu.')
      return
    }
    if (maxRevenueAmount && Number(maxRevenueAmount) <= Number(minRevenueAmount)) {
      setFormError('Doanh thu đến phải lớn hơn doanh thu từ.')
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
          <DialogTitle>Sửa mốc doanh thu</DialogTitle>
          <DialogDescription>Chỉ áp dụng được khi bộ quy tắc đang ở trạng thái Bản nháp.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="bracket-edit-label">Tên mốc</Label>
            <Input id="bracket-edit-label" value={label} onChange={(event) => setLabel(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bracket-edit-min">Từ doanh thu (₫)</Label>
              <MoneyInput
                id="bracket-edit-min"
                value={minRevenueAmount}
                onValueChange={setMinRevenueAmount}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bracket-edit-max">Đến doanh thu (₫)</Label>
              <MoneyInput
                id="bracket-edit-max"
                value={maxRevenueAmount}
                onValueChange={setMaxRevenueAmount}
                placeholder={bracket.maxRevenueAmount ? undefined : 'Không giới hạn'}
              />
            </div>
          </div>
          {!bracket.maxRevenueAmount ? (
            <p className="text-xs text-muted-foreground">
              Mốc này đang không giới hạn trên. Để trống = giữ nguyên; muốn bỏ giới hạn của một mốc đã có giới hạn, xóa mốc và
              tạo lại.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bracket-edit-commission">% Hoa hồng</Label>
              <Input
                id="bracket-edit-commission"
                type="number"
                step="0.01"
                value={commissionRatePercent}
                onChange={(event) => setCommissionRatePercent(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bracket-edit-rpm">RPM / 1.000 views (₫)</Label>
              <MoneyInput
                id="bracket-edit-rpm"
                value={rpmRatePer1000Views}
                onValueChange={setRpmRatePer1000Views}
              />
            </div>
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

function DeleteBracketButton({ bracket }: { bracket: RevenueRewardBracket }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteRevenueBracket(bracket.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.brackets(bracket.rewardRuleSetId) })
      toast.success('Đã xóa mốc doanh thu')
      setOpen(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa mốc "{bracket.label}"?</DialogTitle>
          <DialogDescription>Không thể hoàn tác.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Xóa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Tab: Lương cơ bản ─────────────────────────────────────────────────────────

function BaseSalaryTab({
  canView, canManage, directory,
}: { canView: boolean; canManage: boolean; directory: EmployeeDirectory }) {
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null)

  // Một request cho toàn bộ danh sách: BE trả mức đang hiệu lực + số bản ghi lịch sử của từng người.
  const currentQuery = useQuery({
    queryKey: REWARD_KEYS.baseSalaryCurrent,
    queryFn: () => listCurrentBaseSalaries(),
    enabled: canView,
    staleTime: 60_000,
  })
  const currentByEmployee = useMemo(
    () => new Map((currentQuery.data ?? []).map((row) => [String(row.employeeId), row])),
    [currentQuery.data],
  )

  if (!canView) {
    return (
      <Card className="py-0">
        <EmptyState
          icon={Lock}
          tone="warning"
          title="Không đủ quyền xem lương cơ bản"
          description="Tài khoản của bạn cần quyền base_salary.view để xem lịch sử lương cơ bản của nhân sự."
        />
      </Card>
    )
  }

  return (
    <>
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">Lương cơ bản &amp; hiệu lực</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {directory.isFiltering
                      ? `${formatNumber(directory.filtered.length)}/${formatNumber(directory.employees.length)} nhân sự khớp bộ lọc`
                      : `${formatNumber(directory.employees.length)} nhân sự đang làm việc`}
                  </p>
                </div>
              </div>
              {directory.isFiltering ? (
                <Button variant="ghost" size="sm" onClick={directory.clearFilters}>
                  <Filter className="size-3.5" aria-hidden="true" />Xoá bộ lọc
                </Button>
              ) : null}
            </div>

            <DirectoryFilters
              search={directory.search}
              onSearchChange={directory.changeSearch}
              departmentId={directory.departmentId}
              onDepartmentChange={directory.changeDepartment}
              teamId={directory.teamId}
              onTeamChange={directory.changeTeam}
              departments={directory.departments}
              teams={directory.visibleTeams}
            />
          </div>

          {directory.employeesQuery.isLoading || currentQuery.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
          ) : directory.employeesQuery.isError || currentQuery.isError ? (
            <QueryError
              error={directory.employeesQuery.error ?? currentQuery.error}
              onRetry={() => { void directory.employeesQuery.refetch(); void currentQuery.refetch() }}
            />
          ) : directory.pageItems.length === 0 ? (
            <EmptyState
              size="sm"
              icon={UserRound}
              title={directory.isFiltering ? 'Không có nhân sự phù hợp' : 'Chưa có nhân sự nào'}
              description={directory.isFiltering
                ? 'Thử đổi từ khoá hoặc bỏ bớt bộ lọc phòng ban / team.'
                : 'Thêm nhân sự ở màn Nhân sự & team trước khi cấu hình lương cơ bản.'}
              action={directory.isFiltering ? <Button variant="outline" onClick={directory.clearFilters}><X className="size-4" />Xoá bộ lọc</Button> : undefined}
            />
          ) : (
            <>
              <Table className="min-w-200">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân sự</TableHead>
                    <TableHead>Phòng ban / Team</TableHead>
                    <TableHead className="text-right">Lương cơ bản hiện hành</TableHead>
                    <TableHead>Hiệu lực</TableHead>
                    <TableHead className="text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directory.pageItems.map((employee) => {
                    const summary = currentByEmployee.get(employee.id)
                    const current = summary?.current ?? null

                    return (
                      <TableRow key={employee.id}>
                        <TableCell><EmployeeCell employee={employee} /></TableCell>
                        <TableCell>
                          <span className="block text-sm">{employee.team.name}</span>
                          <span className="text-xs text-muted-foreground">{employee.team.department.name}</span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {current ? (
                            <strong className="font-bold text-foreground">{formatMoney(current.monthlyBaseSalary)}</strong>
                          ) : (
                            <StatusBadge tone="warning">Chưa cấu hình</StatusBadge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {current ? <>Từ {formatDate(current.effectiveFrom)} · Đến {formatDate(current.effectiveTo)}</> : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setHistoryEmployee(employee)}>
                              <History className="size-4" aria-hidden="true" />
                              Lịch sử{summary?.entryCount ? ` (${formatNumber(summary.entryCount)})` : ''}
                            </Button>
                            {canManage ? <CreateBaseSalaryDialog employeeId={employee.id} compact /> : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <DirectoryPagination
                current={directory.currentPage}
                total={directory.totalPages}
                count={directory.filtered.length}
                onPage={directory.setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <BaseSalaryHistoryDialog
        employee={historyEmployee}
        canManage={canManage}
        onClose={() => setHistoryEmployee(null)}
      />
    </>
  )
}

function BaseSalaryHistoryDialog({
  employee, canManage, onClose,
}: { employee: Employee | null; canManage: boolean; onClose: () => void }) {
  const query = useQuery({
    queryKey: employee ? REWARD_KEYS.baseSalary(employee.id) : ['reward-config', 'base-salary', 'none'],
    queryFn: () => listBaseSalaryHistory(employee!.id),
    enabled: Boolean(employee),
  })
  const history = query.data ?? []

  return (
    <Dialog open={Boolean(employee)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lịch sử lương cơ bản</DialogTitle>
          <DialogDescription>
            {employee ? `${employee.fullName} · ${employee.employeeCode} · ${employee.team.name}` : ''}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
        ) : query.isError ? (
          <ErrorState description={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : history.length === 0 ? (
          <EmptyState
            size="sm"
            icon={BadgeDollarSign}
            title="Chưa có lịch sử lương cơ bản"
            description="Nhân sự này chưa được thiết lập mức lương nào. Thêm mức đầu tiên để hệ thống tính được lương."
            action={canManage && employee ? <CreateBaseSalaryDialog employeeId={employee.id} /> : undefined}
          />
        ) : (
          <ul className="divide-y rounded-xl border">
            {history.map((item) => {
              const status = getEffectiveRangeStatus(item.effectiveFrom, item.effectiveTo)
              const active = status.tone === 'success'

              return (
                <li key={item.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 ${active ? 'bg-[var(--success-500)]/5' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${active ? toneSurface.success : toneSurface.muted}`}>
                      <BadgeDollarSign className="size-4.5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-lg font-bold text-foreground tabular-nums">{formatMoney(item.monthlyBaseSalary)}</p>
                      <p className="text-xs text-muted-foreground">
                        Từ {formatDate(item.effectiveFrom)} · Đến {formatDate(item.effectiveTo)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    {canManage ? <EditBaseSalaryDialog entry={item} /> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateBaseSalaryDialog({ employeeId, compact = false }: { employeeId: string; compact?: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [monthlyBaseSalary, setMonthlyBaseSalary] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setMonthlyBaseSalary('')
      setEffectiveFrom('')
      setFormError(null)
    }
    setOpen(next)
  }

  const createMutation = useMutation({
    mutationFn: () => createBaseSalaryHistory(employeeId, { monthlyBaseSalary, effectiveFrom }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.baseSalaryAll })
      toast.success('Đã thêm mức lương cơ bản mới')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!monthlyBaseSalary || !effectiveFrom) {
      setFormError('Nhập đủ mức lương và ngày hiệu lực.')
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant={compact ? 'outline' : 'default'}>
          <Plus className="size-4" aria-hidden="true" />
          {compact ? 'Thêm' : 'Thêm mức lương'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm mức lương cơ bản</DialogTitle>
          <DialogDescription>Mức lương hiện tại vẫn có hiệu lực đến trước ngày này; mức mới chỉ bắt đầu từ đúng ngày đã chọn.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="bs-amount">Mức lương cơ bản (₫/tháng)</Label>
            <MoneyInput
              id="bs-amount"
              value={monthlyBaseSalary}
              onValueChange={setMonthlyBaseSalary}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bs-from">Hiệu lực từ ngày</Label>
            <Input id="bs-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
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

function EditBaseSalaryDialog({ entry }: { entry: BaseSalaryHistory }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [monthlyBaseSalary, setMonthlyBaseSalary] = useState(entry.monthlyBaseSalary)
  const [effectiveFrom, setEffectiveFrom] = useState(entry.effectiveFrom.slice(0, 10))
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setMonthlyBaseSalary(entry.monthlyBaseSalary)
      setEffectiveFrom(entry.effectiveFrom.slice(0, 10))
      setFormError(null)
    }
    setOpen(next)
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      updateBaseSalaryHistory(entry.id, { monthlyBaseSalary, effectiveFrom }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.baseSalaryAll })
      toast.success('Đã cập nhật bản ghi lương cơ bản')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Sửa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa bản ghi lương cơ bản</DialogTitle>
          <DialogDescription>
            Đính chính bản ghi lịch sử đã có. Không sửa được ngày kết thúc hiệu lực ở đây — trường này tự quản lý khi thêm bản
            ghi mới.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="bs-edit-amount">Mức lương cơ bản (₫/tháng)</Label>
            <MoneyInput
              id="bs-edit-amount"
              value={monthlyBaseSalary}
              onValueChange={setMonthlyBaseSalary}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bs-edit-from">Từ ngày</Label>
            <Input
              id="bs-edit-from"
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Tab: Mức tiền KPI theo nhân sự ───────────────────────────────────────────

function KpiRewardTab({
  canView, canManage, directory,
}: { canView: boolean; canManage: boolean; directory: EmployeeDirectory }) {
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null)
  const groupsQuery = useQuery({ queryKey: ['kpi-groups'], queryFn: listKpiGroups, enabled: canView })
  const groups = groupsQuery.data ?? []

  // Một request cho toàn bộ danh sách: BE trả các mức đang hiệu lực + tổng tiền của từng người.
  const currentQuery = useQuery({
    queryKey: REWARD_KEYS.kpiRewardRatesCurrent,
    queryFn: () => listCurrentKpiRewardRates(),
    enabled: canView,
    staleTime: 60_000,
  })
  const currentByEmployee = useMemo(
    () => new Map((currentQuery.data ?? []).map((row) => [String(row.employeeId), row])),
    [currentQuery.data],
  )

  if (!canView) {
    return (
      <Card className="py-0">
        <EmptyState
          icon={Lock}
          tone="warning"
          title="Không đủ quyền xem mức tiền KPI"
          description="Tài khoản của bạn cần quyền kpi_reward_rate.view để xem mức tiền KPI theo từng nhân sự."
        />
      </Card>
    )
  }

  return (
    <>
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">Mức tiền KPI theo từng nhân sự</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {directory.isFiltering
                      ? `${formatNumber(directory.filtered.length)}/${formatNumber(directory.employees.length)} nhân sự khớp bộ lọc`
                      : `${formatNumber(directory.employees.length)} nhân sự đang làm việc`}
                  </p>
                </div>
              </div>
              {directory.isFiltering ? (
                <Button variant="ghost" size="sm" onClick={directory.clearFilters}>
                  <Filter className="size-3.5" aria-hidden="true" />Xoá bộ lọc
                </Button>
              ) : null}
            </div>

            <DirectoryFilters
              search={directory.search}
              onSearchChange={directory.changeSearch}
              departmentId={directory.departmentId}
              onDepartmentChange={directory.changeDepartment}
              teamId={directory.teamId}
              onTeamChange={directory.changeTeam}
              departments={directory.departments}
              teams={directory.visibleTeams}
            />
          </div>

          {directory.employeesQuery.isLoading || groupsQuery.isLoading || currentQuery.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
          ) : directory.employeesQuery.isError || groupsQuery.isError || currentQuery.isError ? (
            <QueryError
              error={directory.employeesQuery.error ?? groupsQuery.error ?? currentQuery.error}
              onRetry={() => {
                void directory.employeesQuery.refetch()
                void groupsQuery.refetch()
                void currentQuery.refetch()
              }}
            />
          ) : directory.pageItems.length === 0 ? (
            <EmptyState
              size="sm"
              icon={UserRound}
              title={directory.isFiltering ? 'Không có nhân sự phù hợp' : 'Chưa có nhân sự nào'}
              description={directory.isFiltering
                ? 'Thử đổi từ khoá hoặc bỏ bớt bộ lọc phòng ban / team.'
                : 'Thêm nhân sự ở màn Nhân sự & team trước khi cấu hình mức tiền KPI.'}
              action={directory.isFiltering ? <Button variant="outline" onClick={directory.clearFilters}><X className="size-4" />Xoá bộ lọc</Button> : undefined}
            />
          ) : (
            <>
              <Table className="min-w-200">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhân sự</TableHead>
                    <TableHead>Phòng ban / Team</TableHead>
                    <TableHead className="text-center">Nhóm KPI đang áp dụng</TableHead>
                    <TableHead className="text-right">Tổng mức tiền khi đạt</TableHead>
                    <TableHead className="text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directory.pageItems.map((employee) => {
                    const summary = currentByEmployee.get(employee.id)
                    const activeCount = summary?.activeRates.length ?? 0

                    return (
                      <TableRow key={employee.id}>
                        <TableCell><EmployeeCell employee={employee} /></TableCell>
                        <TableCell>
                          <span className="block text-sm">{employee.team.name}</span>
                          <span className="text-xs text-muted-foreground">{employee.team.department.name}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {activeCount > 0 ? (
                            <span className="font-semibold tabular-nums">{formatNumber(activeCount)}</span>
                          ) : (
                            <StatusBadge tone="warning">Chưa cấu hình</StatusBadge>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {activeCount > 0 ? (
                            <strong className="font-bold text-foreground">{formatMoney(summary!.totalRewardAmount)}</strong>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setDetailEmployee(employee)}>
                              <History className="size-4" aria-hidden="true" />
                              Chi tiết{summary?.rateCount ? ` (${formatNumber(summary.rateCount)})` : ''}
                            </Button>
                            {canManage ? <CreateKpiRewardRateDialog employeeId={employee.id} groups={groups} compact /> : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <DirectoryPagination
                current={directory.currentPage}
                total={directory.totalPages}
                count={directory.filtered.length}
                onPage={directory.setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <KpiRewardRateDialog
        employee={detailEmployee}
        groups={groups}
        canManage={canManage}
        onClose={() => setDetailEmployee(null)}
      />
    </>
  )
}

function KpiRewardRateDialog({
  employee, groups, canManage, onClose,
}: { employee: Employee | null; groups: KpiGroup[]; canManage: boolean; onClose: () => void }) {
  const query = useQuery({
    queryKey: employee ? REWARD_KEYS.kpiRewardRates(employee.id) : ['reward-config', 'kpi-reward-rates', 'none'],
    queryFn: () => listKpiRewardRates(employee!.id),
    enabled: Boolean(employee),
  })
  const rates = query.data ?? []

  return (
    <Dialog open={Boolean(employee)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mức tiền KPI theo nhóm</DialogTitle>
          <DialogDescription>
            {employee ? `${employee.fullName} · ${employee.employeeCode} · ${employee.team.name}` : ''}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
        ) : query.isError ? (
          <ErrorState description={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rates.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Target}
            title="Chưa cấu hình mức tiền KPI"
            description="Nhân sự này chưa có mức tiền KPI nào. Thêm mức thưởng cho từng nhóm KPI để hệ thống quy đổi khi đạt ngưỡng."
            action={canManage && employee ? <CreateKpiRewardRateDialog employeeId={employee.id} groups={groups} /> : undefined}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhóm KPI</TableHead>
                <TableHead className="text-right">Mức tiền khi đạt</TableHead>
                <TableHead>Hiệu lực</TableHead>
                <TableHead>Trạng thái</TableHead>
                {canManage ? <TableHead className="text-right">Hành động</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((rate) => {
                const status = getKpiRewardRateStatus(rate)
                return (
                  <TableRow key={rate.id} className={status.tone === 'success' ? 'bg-[var(--success-500)]/5' : undefined}>
                    <TableCell>
                      <strong className="block">{rate.kpiGroup.name}</strong>
                      <span className="text-xs text-muted-foreground">{rate.kpiGroup.code}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">{formatMoney(rate.rewardAmount)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="block text-sm">Từ {formatDate(rate.effectiveFrom)}</span>
                      <span className="text-xs text-muted-foreground">Đến {formatDate(rate.effectiveTo)}</span>
                    </TableCell>
                    <TableCell><StatusBadge tone={status.tone}>{status.label}</StatusBadge></TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <EditKpiRewardRateDialog rate={rate} />
                          <DeleteKpiRewardRateButton rate={rate} />
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}

function getKpiRewardRateStatus(rate: KpiRewardRate): EffectiveRangeStatus {
  return getEffectiveRangeStatus(rate.effectiveFrom, rate.effectiveTo)
}

function CreateKpiRewardRateDialog({ employeeId, groups, compact = false }: { employeeId: string; groups: KpiGroup[]; compact?: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [kpiGroupId, setKpiGroupId] = useState<string | null>(null)
  const [rewardAmount, setRewardAmount] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setKpiGroupId(null)
      setRewardAmount('')
      setEffectiveFrom('')
      setFormError(null)
    }
    setOpen(next)
  }

  const mutation = useMutation({
    mutationFn: () => createKpiRewardRate(employeeId, {
      kpiGroupId: kpiGroupId!,
      rewardAmount,
      effectiveFrom,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.kpiRewardRatesAll })
      toast.success('Đã thêm mức tiền KPI')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!kpiGroupId || !rewardAmount || !effectiveFrom) {
      setFormError('Chọn nhóm KPI và nhập đủ mức tiền, ngày hiệu lực.')
      return
    }
    if (Number.isNaN(Number(rewardAmount)) || Number(rewardAmount) < 0) {
      setFormError('Mức tiền KPI phải là số không âm.')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant={compact ? 'outline' : 'default'}>
          <Plus className="size-4" aria-hidden="true" />
          {compact ? 'Thêm' : 'Thêm mức tiền'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm mức tiền KPI</DialogTitle>
          <DialogDescription>Mức đang hiệu lực của cùng nhóm KPI sẽ tự kết thúc tại ngày bắt đầu mức mới.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Nhóm KPI</Label>
            <Select value={kpiGroupId ?? undefined} onValueChange={setKpiGroupId}>
              <SelectTrigger><SelectValue placeholder="Chọn nhóm KPI" /></SelectTrigger>
              <SelectContent searchPlaceholder="Tìm nhóm KPI...">
                {groups.filter((group) => group.isActive).map((group) => (
                  <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="kpi-rate-amount">Mức tiền khi đạt (₫)</Label>
            <MoneyInput id="kpi-rate-amount" value={rewardAmount} onValueChange={setRewardAmount} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="kpi-rate-from">Hiệu lực từ ngày</Label>
            <Input id="kpi-rate-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose>
          <Button onClick={submit} disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Thêm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditKpiRewardRateDialog({ rate }: { rate: KpiRewardRate }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [rewardAmount, setRewardAmount] = useState(rate.rewardAmount)
  const [effectiveFrom, setEffectiveFrom] = useState(rate.effectiveFrom.slice(0, 10))
  const [effectiveTo, setEffectiveTo] = useState(rate.effectiveTo?.slice(0, 10) ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setRewardAmount(rate.rewardAmount)
      setEffectiveFrom(rate.effectiveFrom.slice(0, 10))
      setEffectiveTo(rate.effectiveTo?.slice(0, 10) ?? '')
      setFormError(null)
    }
    setOpen(next)
  }

  const mutation = useMutation({
    mutationFn: () => updateKpiRewardRate(rate.id, {
      rewardAmount,
      effectiveFrom,
      effectiveTo: effectiveTo || null,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.kpiRewardRatesAll })
      toast.success('Đã cập nhật mức tiền KPI')
      setOpen(false)
    },
    onError: (error) => setFormError(getApiErrorMessage(error)),
  })

  function submit() {
    setFormError(null)
    if (!rewardAmount || !effectiveFrom) {
      setFormError('Nhập đủ mức tiền và ngày bắt đầu.')
      return
    }
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      setFormError('Ngày kết thúc phải sau ngày bắt đầu.')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild><Button variant="ghost" size="sm"><Pencil className="size-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa mức tiền KPI</DialogTitle>
          <DialogDescription>{rate.kpiGroup.name} · khoảng hiệu lực không được chồng với lịch sử khác.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`kpi-rate-edit-amount-${rate.id}`}>Mức tiền khi đạt (₫)</Label>
            <MoneyInput id={`kpi-rate-edit-amount-${rate.id}`} value={rewardAmount} onValueChange={setRewardAmount} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`kpi-rate-edit-from-${rate.id}`}>Từ ngày</Label>
              <Input id={`kpi-rate-edit-from-${rate.id}`} type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`kpi-rate-edit-to-${rate.id}`}>Đến ngày</Label>
              <Input id={`kpi-rate-edit-to-${rate.id}`} type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} />
              <p className="text-xs text-muted-foreground">Có hiệu lực đến hết ngày này. Để trống nếu chưa có ngày kết thúc.</p>
            </div>
          </div>
          {formError ? <p className="text-sm text-[var(--danger-700)]">{formError}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose>
          <Button onClick={submit} disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteKpiRewardRateButton({ rate }: { rate: KpiRewardRate }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const mutation = useMutation({
    mutationFn: () => deleteKpiRewardRate(rate.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REWARD_KEYS.kpiRewardRatesAll })
      toast.success('Đã xóa mức tiền KPI')
      setOpen(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm"><Trash2 className="size-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa mức tiền KPI?</DialogTitle>
          <DialogDescription>
            Bản ghi của nhóm “{rate.kpiGroup.name}” sẽ bị xóa. Khoảng hiệu lực của mức trước đó sẽ được nối lại nếu có.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Hủy</Button></DialogClose>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Xóa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Tab: Lịch sử bộ quy tắc ───────────────────────────────────────────────────

function VersionHistoryTab({ ruleSets, onView, currentId }: { ruleSets: RewardRuleSet[]; onView: (id: string) => void; currentId?: string }) {
  const sorted = [...ruleSets].sort((a, b) => b.version - a.version)

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b p-5">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Lịch sử phiên bản bộ quy tắc</h2>
              <p className="mt-1 text-xs text-muted-foreground">Nhật ký cấu hình lương &amp; thưởng</p>
            </div>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {formatNumber(sorted.length)} phiên bản
          </span>
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            size="sm"
            icon={History}
            title="Chưa có phiên bản nào"
            description="Lịch sử sẽ xuất hiện sau khi bạn tạo phiên bản bộ quy tắc đầu tiên."
          />
        ) : (
          <Table className="min-w-160">
            <TableHeader>
              <TableRow>
                <TableHead>Phiên bản</TableHead>
                <TableHead className="text-right">Ngưỡng đạt KPI/OKR</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((item) => {
                const isCurrent = item.id === currentId
                return (
                  <TableRow key={item.id} className={isCurrent ? 'bg-primary/5' : undefined}>
                    <TableCell className="font-semibold">v{item.version}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(item.achievementThresholdPercent)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={RULE_SET_STATUS_TONE[item.status]}>{RULE_SET_STATUS_LABEL[item.status]}</StatusBadge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(item.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {isCurrent ? (
                        <span className="text-xs font-semibold text-primary">Đang xem</span>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => onView(item.id)}>
                          Xem mốc doanh thu <ChevronRight className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// ── Helper chung ───────────────────────────────────────────────────────────────

function Rule({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right font-semibold ${success ? 'text-[var(--success-700)]' : ''}`}>{value}</dd>
    </div>
  )
}

function InfoNotice({ message }: { message: string }) {
  return (
    <Card className="py-0">
      <EmptyState icon={Settings2} title="Chưa có nội dung để hiển thị" description={message} />
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
