import type { SalaryBreakdown } from '@/api/salary'

const MAX_VALUE = 999_999_999_999_999_999n
const RATE_SCALE = 10_000n

function integer(value: string) {
  return BigInt(value.split('.')[0] || '0')
}

function scaledRate(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole || '0') * RATE_SCALE + BigInt(fraction.padEnd(4, '0').slice(0, 4))
}

function roundRatio(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / 2n) / denominator
}

function commission(revenue: bigint, rate: string) {
  return roundRatio(revenue * scaledRate(rate), 100n * RATE_SCALE)
}

function rpm(views: bigint, rate: string) {
  return roundRatio(views * scaledRate(rate), 1_000n * RATE_SCALE)
}

function firstAtLeast(low: bigint, high: bigint, target: bigint, valueAt: (value: bigint) => bigint) {
  if (low > high || valueAt(high) < target) return null
  while (low < high) {
    const mid = (low + high) / 2n
    if (valueAt(mid) >= target) high = mid
    else low = mid + 1n
  }
  return low
}

export type GoalAction = { id: string; name: string; progress: string; threshold: string; amount: bigint }

export function calculateSalaryGoal(record: SalaryBreakdown, target: bigint) {
  const current = integer(record.totalSalaryAmount)
  const gap = target > current ? target - current : 0n
  const options: GoalAction[] = [
    ...record.kpiItems.filter((item) => !item.isAchieved).map((item) => ({
      id: `kpi-${item.id}`,
      name: `KPI · ${item.kpiGroupName}${item.teamName ? ` (${item.teamName})` : ''}`,
      progress: item.progressPercent,
      threshold: item.thresholdPercent,
      amount: roundRatio(integer(item.rewardAmount) * scaledRate(item.salaryWeightPercent), 100n * RATE_SCALE),
    })),
    ...record.okrItems.filter((item) => !item.isAchieved).map((item) => ({
      id: `okr-${item.id}`,
      name: `OKR · ${item.title}`,
      progress: item.progressPercent,
      threshold: item.thresholdPercent,
      amount: integer(item.rewardAmount),
    })),
  ].filter((item) => item.amount > 0n).sort((a, b) => a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1)

  const actions: GoalAction[] = []
  let selectedReward = 0n
  for (const option of options) {
    if (selectedReward >= gap) break
    actions.push(option)
    selectedReward += option.amount
  }

  const remaining = target > current + selectedReward ? target - current - selectedReward : 0n
  const currentRevenue = integer(record.revenueAmount)
  const currentViews = integer(record.totalViews)
  const fixed = current - integer(record.commissionAmount) - integer(record.rpmRewardAmount) + selectedReward

  let revenueGoal: { total: bigint; bracket: string } | null = null
  if (remaining > 0n) {
    for (const bracket of record.revenueBrackets) {
      const minimum = integer(bracket.minRevenueAmount)
      const maximum = bracket.maxRevenueAmount ? integer(bracket.maxRevenueAmount) - 1n : MAX_VALUE
      const low = currentRevenue > minimum ? currentRevenue : minimum
      const result = firstAtLeast(low, maximum, target, (revenue) =>
        fixed + commission(revenue, bracket.commissionRatePercent) + rpm(currentViews, bracket.rpmRatePer1000Views),
      )
      if (result !== null && (revenueGoal === null || result < revenueGoal.total)) {
        revenueGoal = { total: result, bracket: bracket.label }
      }
    }
  }

  const matchedBracket = record.revenueBrackets.find((bracket) =>
    currentRevenue >= integer(bracket.minRevenueAmount) &&
    (bracket.maxRevenueAmount === null || currentRevenue < integer(bracket.maxRevenueAmount)),
  )
  const viewsGoal = remaining > 0n && matchedBracket && scaledRate(matchedBracket.rpmRatePer1000Views) > 0n
    ? firstAtLeast(currentViews, MAX_VALUE, target, (views) =>
      fixed + commission(currentRevenue, matchedBracket.commissionRatePercent) + rpm(views, matchedBracket.rpmRatePer1000Views),
    )
    : null

  return { current, gap, actions, selectedReward, remaining, currentRevenue, currentViews, revenueGoal, viewsGoal }
}
