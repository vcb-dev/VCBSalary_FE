import type { PayrollPeriodStatus } from '@/api/payroll-periods'

/**
 * Hai giai đoạn của một kỳ lương quyết định UI được phép làm gì với KPI/OKR — phải khớp với
 * `period-stage.util.ts` bên BE, vì BE cũng chặn đúng các mốc này:
 *
 * - `OPEN` (nhập liệu): đồng bộ KPI, gán nhóm, đặt mục tiêu, nhập & sửa thực đạt, tạo/sửa/xoá OKR.
 * - `IN_REVIEW` (chốt): bản ghi còn nháp có thể sửa trước khi tự xác nhận; Leader có thể điều chỉnh
 *   số liệu kèm lý do trước khi duyệt. Bản ghi đã duyệt bị khoá.
 * - `DRAFT`/`CLOSED`: không mở thao tác nào.
 */
export type PeriodStage = {
  status: PayrollPeriodStatus | null
  /** Kỳ đang mở — giai đoạn nhập liệu. */
  isDataEntry: boolean
  /** Kỳ đang duyệt — giai đoạn tự xác nhận và duyệt. */
  isReview: boolean
}

export function resolvePeriodStage(status: PayrollPeriodStatus | null | undefined): PeriodStage {
  return {
    status: status ?? null,
    isDataEntry: status === 'OPEN',
    isReview: status === 'IN_REVIEW',
  }
}

/** Quyền sửa nháp được kiểm tra riêng tại từng dòng. */
export function isRecordEditable(stage: PeriodStage) {
  return stage.isDataEntry || stage.isReview
}

/** Câu giải thích hiển thị cho người dùng biết vì sao nhóm nút hiện tại bị ẩn. */
export function periodStageHint(stage: PeriodStage): string | null {
  if (stage.isDataEntry) {
    return 'Kỳ đang mở — giai đoạn nhập liệu: đồng bộ KPI, đặt mục tiêu và nhập thực đạt. Nút tự xác nhận và duyệt sẽ mở khi kỳ chuyển sang “Đang duyệt”.'
  }
  if (stage.isReview) {
    return 'Kỳ đang duyệt — nhân sự có thể sửa đầu mục còn nháp trước khi tự xác nhận. Leader có thể điều chỉnh số liệu kèm lý do trước khi duyệt hoặc từ chối.'
  }
  if (stage.status === 'CLOSED') {
    return 'Kỳ đã đóng — dữ liệu KPI/OKR là bất biến, chỉ xem lại được.'
  }
  if (stage.status === 'DRAFT') {
    return 'Kỳ chưa được mở — chưa nhập hay duyệt được KPI/OKR. Mở kỳ ở trang Kỳ lương để bắt đầu.'
  }
  return null
}
