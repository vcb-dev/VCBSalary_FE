/* oxlint-disable react/only-export-components -- provider và hook dùng chung một context kỳ lương */
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { listPayrollPeriods, type PayrollPeriod } from '@/api/payroll-periods'
import { selectDefaultPayrollPeriod } from '@/lib/payroll-period'

type PayrollPeriodContextValue = {
  periods: PayrollPeriod[]
  selectedPeriod: PayrollPeriod | null
  selectedPeriodId: string | null
  isPeriodSelectionExplicit: boolean
  selectPeriod: (periodId: string) => void
  resetPeriodSelection: () => void
  isLoading: boolean
}

const PayrollPeriodContext = createContext<PayrollPeriodContextValue | null>(null)

export function PayrollPeriodProvider({ children }: { children: ReactNode }) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)
  const periodsQuery = useQuery({
    queryKey: ['payroll-periods', 'global-selector'],
    queryFn: () => listPayrollPeriods({ page: 1, pageSize: 100 }),
    staleTime: 30_000,
  })
  const periods = useMemo(() => periodsQuery.data?.data ?? [], [periodsQuery.data])
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId)
    ?? selectDefaultPayrollPeriod(periods)
    ?? null

  const value = useMemo<PayrollPeriodContextValue>(() => ({
    periods,
    selectedPeriod,
    selectedPeriodId: selectedPeriod?.id ?? null,
    isPeriodSelectionExplicit: selectedPeriodId !== null,
    selectPeriod: setSelectedPeriodId,
    resetPeriodSelection: () => setSelectedPeriodId(null),
    isLoading: periodsQuery.isLoading,
  }), [periods, periodsQuery.isLoading, selectedPeriod, selectedPeriodId])

  return <PayrollPeriodContext.Provider value={value}>{children}</PayrollPeriodContext.Provider>
}

export function usePayrollPeriodSelection() {
  const context = useContext(PayrollPeriodContext)
  if (!context) throw new Error('usePayrollPeriodSelection must be used inside PayrollPeriodProvider')
  return context
}
