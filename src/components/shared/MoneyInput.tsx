import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type MoneyInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: string
  onValueChange: (value: string) => void
  currencyLabel?: string
  maxDigits?: number
}

function normalizeMoneyValue(value: string, maxDigits: number) {
  const digits = value.replace(/\D/g, '').slice(0, maxDigits)
  return digits.replace(/^0+(?=\d)/, '')
}

function formatMoneyValue(value: string) {
  if (!value) return ''

  try {
    return BigInt(value).toLocaleString('vi-VN')
  } catch {
    return value
  }
}

export function MoneyInput({
  value,
  onValueChange,
  currencyLabel = '₫',
  maxDigits = 18,
  className,
  ...props
}: MoneyInputProps) {
  return (
    <div className="relative w-full">
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatMoneyValue(value)}
        onChange={(event) => onValueChange(normalizeMoneyValue(event.target.value, maxDigits))}
        className={cn('pr-10 tabular-nums', className)}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
      >
        {currencyLabel}
      </span>
    </div>
  )
}
