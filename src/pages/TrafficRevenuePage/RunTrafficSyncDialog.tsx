import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { PayrollPeriod } from '@/api/payroll-periods'
import { PLATFORM_LABEL } from '@/lib/platform'
import {
  getApiErrorMessage,
  getTrafficSyncRun,
  listTrafficSyncTeams,
  triggerTrafficSync,
  type TrafficSyncRunItem,
} from '@/api/traffic-sync'
import { Button } from '@/components/ui/button'
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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatNumber } from '@/lib/format'
import { toneSurface, toneText, type Tone } from '@/lib/tone'

const ALL_TEAMS = '__all__'

const ITEM_STATUS_LABEL: Record<TrafficSyncRunItem['resultStatus'], string> = {
  SUCCESS: 'Đã ghi',
  SKIPPED: 'Bỏ qua',
  FAILED: 'Lỗi',
  CONFLICT: 'Xung đột',
}

function itemTone(status: TrafficSyncRunItem['resultStatus']): Tone {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'CONFLICT') return 'warning'
  return 'muted'
}

function formatViews(value: string | null) {
  if (value === null) return '—'
  try {
    return BigInt(value).toLocaleString('vi-VN')
  } catch {
    return value
  }
}

/**
 * Nút kéo traffic từ AutomationGenVideo về kỳ lương đang chọn.
 *
 * Sau khi chạy, dialog KHÔNG đóng mà đổi sang bảng kết quả: đồng bộ có thể bỏ qua hoặc báo xung
 * đột trên từng nền tảng của từng người, và những dòng đó phải có người xử lý tay trước khi chốt
 * lương — đóng dialog rồi chỉ còn một dòng toast thì coi như mất.
 */
export function RunTrafficSyncDialog({ period }: { period: PayrollPeriod | null }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [team, setTeam] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)

  // BE đã lọc theo phạm vi sync.trigger: Leader chỉ nhận team mình quản lý và không được kéo
  // toàn hệ thống. Tên team bên hệ thống lương được đồng bộ nguyên văn từ AutomationGenVideo, nên
  // dùng thẳng làm bộ lọc `externalTeamName`.
  const teamsQuery = useQuery({ queryKey: ['traffic-sync-teams'], queryFn: listTrafficSyncTeams, enabled: open })
  const canSyncAllTeams = teamsQuery.data?.canSyncAllTeams ?? false
  const teams = useMemo(() => teamsQuery.data?.teams ?? [], [teamsQuery.data])
  const selectedTeam = team ?? (canSyncAllTeams ? ALL_TEAMS : teams[0]?.name ?? '')

  const periodOpen = period?.status === 'OPEN'

  const mutation = useMutation({
    mutationFn: () =>
      triggerTrafficSync({
        payrollPeriodId: period!.id,
        externalTeamName: selectedTeam === ALL_TEAMS ? undefined : selectedTeam,
      }),
    onSuccess: async (run) => {
      setRunId(run.id)
      await queryClient.invalidateQueries({ queryKey: ['traffic'] })
      if (run.status === 'SUCCESS') toast.success('Đã kéo traffic từ VCBI')
      else if (run.status === 'SKIPPED') toast.warning(run.errorSummary ?? 'Lượt đồng bộ bị bỏ qua')
      else toast.warning('Đồng bộ xong nhưng có dòng cần xử lý tay')
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  function reset(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setRunId(null)
      mutation.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!period}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Đồng bộ traffic
        </Button>
      </DialogTrigger>
      <DialogContent className={runId ? 'sm:max-w-4xl' : undefined}>
        <DialogHeader>
          <DialogTitle>{runId ? 'Kết quả đồng bộ traffic' : 'Đồng bộ traffic từ VCBI'}</DialogTitle>
          <DialogDescription>
            {runId
              ? 'Những dòng bỏ qua hoặc xung đột cần được xử lý tay trước khi chốt lương.'
              : `Lấy traffic nhân sự tự báo cáo, tách theo từng nền tảng, cho ${period?.name ?? 'kỳ đang chọn'}.`}
          </DialogDescription>
        </DialogHeader>

        {runId ? (
          <SyncResult runId={runId} />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Phạm vi</Label>
              <Select value={selectedTeam} onValueChange={setTeam}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn team" /></SelectTrigger>
                <SelectContent>
                  {canSyncAllTeams ? <SelectItem value={ALL_TEAMS}>Toàn hệ thống</SelectItem> : null}
                  {teams.map((item) => (
                    <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.warning}`}>
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Dữ liệu được bảo vệ:</strong> chỉ ghi vào kỳ đang mở, và chỉ ghi đè bản ghi còn nháp.
                Traffic đã tự xác nhận hoặc đã duyệt sẽ được giữ nguyên và báo xung đột nếu lệch số.
              </span>
            </div>

            {teamsQuery.isError ? (
              <p className={`text-sm ${toneText.danger}`}>Không tải được danh sách team.</p>
            ) : null}
            {!teamsQuery.isLoading && !canSyncAllTeams && teams.length === 0 ? (
              <p className={`text-sm ${toneText.warning}`}>
                Không có team VCBI nào trong phạm vi bạn được đồng bộ. Kiểm tra team được gán cho tài khoản.
              </p>
            ) : null}

            {!periodOpen ? (
              <p className={`text-sm ${toneText.warning}`}>
                Kỳ {period?.name} không ở trạng thái đang mở. Lượt đồng bộ vẫn được ghi lại nhưng sẽ không thay đổi số liệu.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild><Button variant="outline">{runId ? 'Đóng' : 'Hủy'}</Button></DialogClose>
          {runId ? null : (
            <Button disabled={!period || !selectedTeam || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {mutation.isPending ? 'Đang kéo dữ liệu…' : 'Chạy đồng bộ'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SyncResult({ runId }: { runId: string }) {
  const query = useQuery({ queryKey: ['traffic-sync-run', runId], queryFn: () => getTrafficSyncRun(runId) })
  const run = query.data
  const items = run?.items ?? []
  const attention = items.filter((item) => item.resultStatus === 'CONFLICT' || item.resultStatus === 'FAILED')

  if (query.isLoading || !run) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Đang tải kết quả…
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 divide-x divide-y divide-border rounded-lg border border-border bg-muted/30 sm:grid-cols-5 sm:divide-y-0">
        <Stat label="Dòng từ nguồn" value={run.receivedRows} />
        <Stat label="Khớp nhân sự" value={run.matchedEmployees} tone={run.matchedEmployees > 0 ? 'success' : 'muted'} />
        <Stat label="Đã ghi" value={run.successfulRecords} tone={run.successfulRecords > 0 ? 'success' : 'muted'} />
        <Stat label="Bỏ qua" value={run.skippedRecords} />
        <Stat label="Xung đột" value={run.conflictRecords} tone={run.conflictRecords > 0 ? 'danger' : 'muted'} />
      </div>

      {run.errorSummary ? (
        <p className={`rounded-lg px-3 py-2 text-sm ${toneSurface.danger}`}>{run.errorSummary}</p>
      ) : null}

      {run.unmatchedRows > 0 ? (
        <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.warning}`}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {formatNumber(run.unmatchedRows)} người báo cáo traffic bên VCBI nhưng không khớp được nhân sự
          nào trong kỳ. Kiểm tra lại email hoặc chạy đồng bộ cơ cấu tổ chức trước.
        </p>
      ) : null}

      {run.sourceWarnings?.length ? (
        <p className={`rounded-lg px-3 py-2 text-xs leading-5 ${toneSurface.warning}`}>
          {run.sourceWarnings.slice(0, 3).map((warning) => warning.message).join(' · ')}
          {run.sourceWarnings.length > 3 ? ` · và ${formatNumber(run.sourceWarnings.length - 3)} cảnh báo khác` : ''}
        </p>
      ) : null}

      {attention.length === 0 ? (
        <EmptyState
          size="sm"
          icon={CheckCircle2}
          tone="success"
          title="Không có dòng nào cần xử lý"
          description="Toàn bộ traffic nhận từ nguồn đã được ghi hoặc bỏ qua đúng quy tắc bảo vệ dữ liệu."
        />
      ) : (
        <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nhân sự</TableHead>
                <TableHead>Nền tảng</TableHead>
                <TableHead className="text-right">Đang lưu</TableHead>
                <TableHead className="text-right">Nguồn trả về</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead>Lý do</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attention.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <strong className="block text-sm font-medium text-foreground">
                      {item.employee?.fullName ?? item.externalName ?? 'Không khớp'}
                    </strong>
                    <span className="text-xs text-muted-foreground">{item.externalEmail ?? '—'}</span>
                  </TableCell>
                  <TableCell>{item.platform ? PLATFORM_LABEL[item.platform] : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatViews(item.previousViews)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatViews(item.incomingViews)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={itemTone(item.resultStatus)}>{ITEM_STATUS_LABEL[item.resultStatus]}</StatusBadge>
                  </TableCell>
                  <TableCell className="max-w-72 text-xs text-muted-foreground">{item.message ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone = 'muted' }: { label: string; value: number; tone?: Tone }) {
  return (
    <div className="p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong className={`mt-1 block text-sm font-bold tabular-nums ${toneText[tone]}`}>{formatNumber(value)}</strong>
    </div>
  )
}
