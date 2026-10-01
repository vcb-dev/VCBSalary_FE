import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, LockKeyhole, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  addSalaryBonus,
  getApiErrorMessage,
  removeSalaryBonus,
  type SalaryBreakdown,
  type SalaryComponent,
} from '@/api/salary'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { formatDateTime, formatMoney } from '@/lib/format'

// Khớp giới hạn của CreateSalaryBonusDto ở BE.
const NAME_MAX_LENGTH = 150
const NOTE_MAX_LENGTH = 500
const AMOUNT_MAX_DIGITS = 12

/**
 * Thưởng thêm ngoài công thức do leader/admin nhập tay, cộng thẳng vào tổng lương. Chỉ sửa được khi
 * bản lương còn nháp; nhân sự vẫn thấy các khoản đã được thưởng ở chế độ chỉ đọc.
 */
export function ExtraBonusCard({ record, canManage }: { record: SalaryBreakdown; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const editable = canManage && (record.status === 'PENDING' || record.status === 'WARNING')
  // Bản LOCKED cũ (đã có bản điều chỉnh mới hơn) không cần nhắc tạo bản điều chỉnh nữa.
  const lockedLatest = canManage && record.status === 'LOCKED' && record.versionHistory[0]?.id === record.id
  const nameError = name.trim() ? undefined : 'Nhập nội dung khoản thưởng'
  const amountError = amount && BigInt(amount) > 0n ? undefined : 'Nhập số tiền lớn hơn 0'
  const previewTotal = amountError ? null : (toBigInt(record.totalSalaryAmount) + BigInt(amount)).toString()

  function refreshSalary() {
    void queryClient.invalidateQueries({ queryKey: ['salary-record'] })
    void queryClient.invalidateQueries({ queryKey: ['salary-records'] })
  }

  function closeForm() {
    setFormOpen(false)
    setName('')
    setAmount('')
    setNote('')
    setSubmitted(false)
  }

  const addMutation = useMutation({
    mutationFn: () => addSalaryBonus(record.id, { name: name.trim(), amount, note: note.trim() || undefined }),
    onSuccess: (result) => {
      refreshSalary()
      closeForm()
      toast.success(`Đã thêm thưởng · tổng lương mới ${formatMoney(result.totalSalaryAmount)}`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })
  const removeMutation = useMutation({
    mutationFn: (bonusId: string) => removeSalaryBonus(record.id, bonusId),
    onSuccess: (result) => {
      refreshSalary()
      setConfirmingId(null)
      toast.success(`Đã xóa khoản thưởng · tổng lương mới ${formatMoney(result.totalSalaryAmount)}`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  if (!editable && !lockedLatest && record.components.length === 0) return null

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (nameError || amountError) return
    addMutation.mutate()
  }

  const fieldId = (field: string) => `salary-bonus-${field}-${record.id}`
  const showNameError = submitted && Boolean(nameError)
  const showAmountError = submitted && Boolean(amountError)

  return <Card className="overflow-hidden py-0"><CardContent className="p-0">
    <div className="flex items-start justify-between gap-3 border-b border-border p-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">Thưởng thêm</h3>
        <p className="mt-1 text-xs text-muted-foreground">Khoản thưởng ngoài công thức, cộng thẳng vào tổng lương.</p>
      </div>
      {editable && !formOpen ? (
        <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
          <Plus aria-hidden="true" />Thêm thưởng
        </Button>
      ) : null}
    </div>

    <div className="divide-y divide-border">
      {editable && formOpen ? (
        <form onSubmit={submit} noValidate className="grid gap-3 bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="grid content-start gap-1.5">
              <Label htmlFor={fieldId('name')}>Nội dung thưởng</Label>
              <Input
                id={fieldId('name')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={NAME_MAX_LENGTH}
                placeholder="Ví dụ: Thưởng nóng dự án Tết"
                autoFocus
                aria-invalid={showNameError}
                aria-describedby={showNameError ? fieldId('name-error') : undefined}
              />
              {showNameError ? <p id={fieldId('name-error')} className="text-xs text-destructive">{nameError}</p> : null}
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor={fieldId('amount')}>Số tiền</Label>
              <MoneyInput
                id={fieldId('amount')}
                value={amount}
                onValueChange={setAmount}
                maxDigits={AMOUNT_MAX_DIGITS}
                placeholder="1.000.000"
                aria-invalid={showAmountError}
                aria-describedby={showAmountError ? fieldId('amount-error') : undefined}
              />
              {showAmountError ? <p id={fieldId('amount-error')} className="text-xs text-destructive">{amountError}</p> : null}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={fieldId('note')}>Ghi chú <span className="font-normal text-muted-foreground">(không bắt buộc)</span></Label>
            <Textarea
              id={fieldId('note')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={NOTE_MAX_LENGTH}
              rows={2}
              placeholder="Lý do thưởng để người duyệt đối chiếu"
            />
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {previewTotal
                ? <>Tổng lương sau khi thêm <strong className="text-foreground tabular-nums">{formatMoney(previewTotal)}</strong></>
                : <>Tổng lương hiện tại <span className="tabular-nums">{formatMoney(record.totalSalaryAmount)}</span></>}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeForm} disabled={addMutation.isPending}>Hủy</Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                Lưu thưởng
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {record.components.length > 0 ? (
        <ul className="divide-y divide-border">
          {record.components.map((bonus) => (
            <BonusRow
              key={bonus.id}
              bonus={bonus}
              removable={editable && bonus.source === 'MANUAL'}
              confirming={confirmingId === bonus.id}
              removing={removeMutation.isPending && removeMutation.variables === bonus.id}
              onAskRemove={() => setConfirmingId(bonus.id)}
              onCancelRemove={() => setConfirmingId(null)}
              onRemove={() => removeMutation.mutate(bonus.id)}
            />
          ))}
        </ul>
      ) : editable && !formOpen ? (
        <p className="p-4 text-sm text-muted-foreground">Chưa có khoản thưởng thêm nào trong bản lương này.</p>
      ) : null}

      {lockedLatest ? (
        <p className="flex items-start gap-2 p-4 text-xs text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Bản lương đã khóa nên không thể thay đổi thưởng thêm. Cần tạo phiên bản điều chỉnh trước.
        </p>
      ) : null}
    </div>
  </CardContent></Card>
}

function BonusRow({
  bonus, removable, confirming, removing, onAskRemove, onCancelRemove, onRemove,
}: {
  bonus: SalaryComponent
  removable: boolean
  confirming: boolean
  removing: boolean
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
}) {
  return <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <strong className="block text-sm font-medium break-words">{bonus.name}</strong>
      {bonus.note ? <p className="mt-0.5 text-xs break-words text-muted-foreground">{bonus.note}</p> : null}
      <p className="mt-0.5 text-xs text-muted-foreground">Thêm bởi {bonus.createdBy.fullName} · {formatDateTime(bonus.createdAt)}</p>
    </div>
    <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
      <span className="font-semibold whitespace-nowrap tabular-nums">{bonus.amount.startsWith('-') ? '' : '+'}{formatMoney(bonus.amount)}</span>
      {removable && confirming ? (
        <span className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onCancelRemove} disabled={removing}>Hủy</Button>
          <Button size="sm" variant="destructive" onClick={onRemove} disabled={removing}>
            {removing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}Xóa
          </Button>
        </span>
      ) : removable ? (
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          title="Xóa khoản thưởng"
          aria-label={`Xóa khoản thưởng ${bonus.name}`}
          onClick={onAskRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  </li>
}

function toBigInt(value: string) {
  try { return BigInt(value.split('.')[0] || '0') } catch { return 0n }
}
