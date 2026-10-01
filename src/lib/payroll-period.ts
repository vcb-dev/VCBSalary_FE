import type { PayrollPeriod } from '@/api/payroll-periods'

/**
 * Chọn kỳ lương mà hệ thống nên hiển thị khi người dùng chưa tự chọn.
 *
 * Kỳ chưa khóa cũ nhất luôn được ưu tiên để công việc của tháng trước được hoàn tất trước khi
 * chuyển sang tháng tiếp theo. Khi không còn kỳ nào cần xử lý, kỳ đã khóa mới nhất được dùng để
 * người dùng vẫn nhìn thấy dữ liệu gần nhất.
 */
export function selectDefaultPayrollPeriod(periods: readonly PayrollPeriod[]) {
  const chronological = [...periods].sort(comparePayrollPeriods)
  return chronological.find((period) => period.status !== 'CLOSED') ?? chronological.at(-1)
}

function comparePayrollPeriods(left: PayrollPeriod, right: PayrollPeriod) {
  const yearDifference = left.payrollYear - right.payrollYear
  if (yearDifference !== 0) return yearDifference

  const monthDifference = left.payrollMonth - right.payrollMonth
  if (monthDifference !== 0) return monthDifference

  return left.startDate.localeCompare(right.startDate)
}
