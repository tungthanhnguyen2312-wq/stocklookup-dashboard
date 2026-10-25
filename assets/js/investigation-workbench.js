(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VSInvestigationWorkbench = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // INVESTOR_EVIDENCE_INVESTIGATION_WORKBENCH_V1: Discover -> Investigate -> Challenge ->
  // Compare -> Monitor -> Retain notes -> Export. Every market statement on these surfaces is a
  // Producer field rendered verbatim (or a Vietnamese label for that exact field value). This
  // module only regroups, labels and counts what the published workspace detail already says:
  // it never derives a posture, score, rank, target, probability, size or recommendation, and it
  // never computes a cross-security statistic the published contract does not explicitly permit.

  const JOURNAL_STORAGE_KEY = "stocklookup.investigation-journal.v1";
  const JOURNAL_SCHEMA = "investigation_journal/v1";
  const EXPORT_SCHEMA = "investor_research_dossier_export/v1";
  const MIN_COMPARE = 2;
  const MAX_COMPARE = 5;
  const LIMITS = Object.freeze({ entries: 200, hypothesis: 4000, item: 600, questions: 60, conditions: 40, importBytes: 1000000 });
  const TICKER_RE = /^[A-Z0-9]{2,10}$/;
  const SESSION_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
  const DISCLAIMER = "Tài liệu ghi chú nghiên cứu cá nhân, chỉ phục vụ nghiên cứu. Không phải gói dữ liệu niêm phong của Producer, không phải báo cáo tài chính đã được kiểm toán hay soát xét, không phải khuyến nghị mua/bán, không có giá mục tiêu, xác suất hay quy mô vị thế.";

  function getValueFormat() {
    if (typeof window !== "undefined" && window.VSValueFormat) return window.VSValueFormat;
    if (typeof require === "function") {
      try { return require("./value-format.js"); } catch (err) { return null; }
    }
    return null;
  }
  function getCardPresentation() {
    if (typeof window !== "undefined" && window.VSWorkspaceCardPresentation) return window.VSWorkspaceCardPresentation;
    if (typeof require === "function") {
      try { return require("./workspace-card-presentation.js"); } catch (err) { return null; }
    }
    return null;
  }

  function h(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function str(value) { return typeof value === "string" ? value : ""; }
  function hasValue(value) {
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.trim() !== "";
    return false;
  }
  function normTicker(value) {
    const t = String(value ?? "").trim().toUpperCase();
    return TICKER_RE.test(t) ? t : "";
  }
  function stableHash(text) {
    let hash = 5381;
    const s = String(text);
    for (let i = 0; i < s.length; i++) hash = ((hash * 33) ^ s.charCodeAt(i)) >>> 0;
    return hash.toString(36);
  }

  // ---------------------------------------------------------------------------------------
  // Labels. Vietnamese wording for Producer codes that value-format.js does not yet carry.
  // A label restates the code; it never adds a judgement the code does not already make.
  // ---------------------------------------------------------------------------------------
  const WB_LABELS = Object.freeze({
    // posture condition classes / scenario reasons
    BEARISH_STRUCTURE_ADVERSE: "Cấu trúc giá giảm, bất lợi",
    UNQUALIFIED_TACTICAL_STRUCTURE: "Cấu trúc kỹ thuật chưa đủ điều kiện",
    UNQUALIFIED_TACTICAL_AND_FUNDAMENTAL: "Kỹ thuật và nền tảng đều chưa đủ điều kiện",
    MISSING_CURRENT_EVIDENCE: "Thiếu bằng chứng phiên hiện tại",
    PENDING_DEFINED_CONFIRMATION: "Đang chờ điều kiện xác nhận đã xác định",
    EARLY_MONITOR_NO_TRIGGER: "Theo dõi sớm, chưa có mức kích hoạt",
    FUNDAMENTAL_DETERIORATION_VETO_NO_NEW_ENTRY: "Nền tảng suy yếu — không mở vị thế mới",
    EXTENDED_NO_CHASE: "Giá đã đi xa — không đuổi giá",
    FRESH_ENTRY_TRIGGER: "Có mức kích hoạt mới",
    BASE_UNCONFIRMED: "Nền giá chưa được xác nhận",
    DISTRIBUTION_OR_BREAKDOWN_WITH_DETERIORATION: "Phân phối hoặc phá vỡ kèm suy yếu",
    CONSTRUCTIVE_TREND_NO_FRESH_ENTRY: "Xu hướng tích cực nhưng chưa có điểm vào mới",
    EARLY_REVERSAL_AWAITING_HIGHER_LOW: "Đảo chiều sớm, chờ đáy sau cao hơn",
    DISTRIBUTION_RISK_NO_FRESH_ENTRY: "Rủi ro phân phối — không mở vị thế mới",
    PARTICIPATION_CONTRADICTION_NARROWS_ENTRY: "Mức tham gia mâu thuẫn, thu hẹp điều kiện vào",
    CONFIRMED_RETEST_ENTRY: "Kiểm định lại đã được xác nhận",
    FAILED_BREAKOUT_REBASE_REQUIRED: "Bứt phá thất bại — cần tạo nền lại",
    NO_QUALIFIED_ENTRY_TRIGGER: "Chưa có mức kích hoạt đủ điều kiện",
    NO_QUALIFIED_INVALIDATION_OR_ADVERSE_EVIDENCE: "Chưa có điều kiện vô hiệu hoặc bằng chứng bất lợi đủ điều kiện",
    QUALIFIED_INTEGRATED_INVALIDATION: "Có điều kiện vô hiệu tích hợp đủ điều kiện",
    QUALIFIED_INTEGRATED_ENTRY_TRIGGER: "Có mức kích hoạt tích hợp đủ điều kiện",
    OBSERVED_REFERENCE: "Kịch bản tham chiếu đang quan sát",
    NOT_ADMITTED: "Chưa được chấp nhận",
    REFERENCE_CASE_NOT_MOST_PROBABLE: "Kịch bản tham chiếu không phải kịch bản có khả năng nhất",
    RESEARCH_ONLY_NOT_EXECUTION: "Chỉ để nghiên cứu, không phải lệnh giao dịch",
    PRICE_BASIS_UNVERIFIED_OR_MIXED: "Cơ sở giá chưa được kiểm chứng hoặc lẫn nhiều cơ sở",
    UPWARD_INVALIDATION_RESOLVES_BEARISH_STRUCTURE_NOT_LONG_SETUP: "Vô hiệu theo chiều lên chỉ chấm dứt cấu trúc giảm, không tạo thiết lập mua",
    UNKNOWN_UNCALIBRATED: "Chưa hiệu chỉnh — không có xác suất",
    TECHNICAL_INVALIDATION_ALREADY_SOURCED_FROM_TACTICAL_CONFIRMATION_INVALIDATION_BOUNDARIES_VIA_TACTICAL_BEHAVIOR_CONTEXT: "Biên vô hiệu kỹ thuật đã nằm trong điều kiện xác nhận/vô hiệu kỹ thuật",
    STATE_HAS_NO_DIRECTIONAL_THESIS_TO_CONFIRM_OR_INVALIDATE: "Trạng thái hiện tại không có luận điểm định hướng để xác nhận hay vô hiệu",
    ENTRY_STATE_TECHNICALLY_INELIGIBLE_NO_RETAINED_BOUNDARY: "Trạng thái kỹ thuật chưa đủ điều kiện, chưa có biên được giữ lại",
    // financial analysis
    FA_V2_CAPITAL_EFFICIENCY_UNAVAILABLE: "Chưa có dữ liệu hiệu quả sử dụng vốn",
    FA_V2_DEBT_EVIDENCE_UNAVAILABLE: "Chưa có bằng chứng về nợ",
    FA_V2_CASH_CONVERSION_PROXY_NOT_READY: "Chỉ số chuyển đổi tiền mặt chưa sẵn sàng",
    FA_V2_BALANCE_SHEET_STRENGTHENING: "Bảng cân đối kế toán củng cố",
    SECTOR_LEADERSHIP_LEADING: "Ngành đang dẫn dắt",
    MISSING_SAME_NATIVE_PERIOD_SCOPE_SERIES: "Thiếu chuỗi dữ liệu cùng kỳ và phạm vi",
    KBS_PERIOD_IDENTITY_UNVERIFIED: "Kỳ dữ liệu của nguồn KBS chưa được kiểm chứng",
    MISSING_STANDALONE_QUARTER_CFO: "Thiếu dòng tiền kinh doanh quý riêng lẻ",
    FUNDAMENTAL_FEATURE_STORE_ABSENT: "Chưa có kho chỉ tiêu nền tảng",
    MISSING_COMPATIBLE_POINT_IN_TIME_SERIES: "Thiếu chuỗi số dư thời điểm tương thích",
    MISSING_COMPATIBLE_STANDALONE_QUARTER_SERIES: "Thiếu chuỗi quý riêng lẻ tương thích",
    GENERIC_CORPORATE_FEATURE_NOT_APPLICABLE: "Chỉ tiêu doanh nghiệp chung không áp dụng",
    MISSING_STANDALONE_QUARTER_EARNINGS: "Thiếu lợi nhuận quý riêng lẻ",
    MISSING_COMPATIBLE_FLOW_INPUT: "Thiếu dữ liệu dòng tương thích",
    MISSING_SAME_PROVIDER_CFO_AND_NET_INCOME: "Thiếu dòng tiền kinh doanh và lợi nhuận cùng nguồn",
    MISSING_STANDALONE_NET_INCOME: "Thiếu lợi nhuận quý riêng lẻ",
    MISSING_STANDALONE_OPERATING_CASH_FLOW: "Thiếu dòng tiền kinh doanh quý riêng lẻ",
    MISSING_SAME_PROVIDER_SAME_QUARTER_PRIOR_YEAR_FCF_PROXY_INPUTS: "Thiếu dữ liệu dòng tiền tự do cùng quý năm trước",
    MISSING_SAME_PROVIDER_TICKER_PERIOD_SECURITIES_COMPONENT_PAIR: "Thiếu cặp số liệu công ty chứng khoán cùng nguồn",
    MISSING_SAME_PROVIDER_TICKER_PERIOD_BANK_COMPONENT_PAIR: "Thiếu cặp số liệu ngân hàng cùng nguồn",
    MISSING_COMPATIBLE_SAME_QUARTER_PRIOR_YEAR_LOAN_BALANCE: "Thiếu dư nợ cho vay cùng quý năm trước",
    MISSING_PROVIDER_DERIVED_NET_INTEREST_MARGIN_OBSERVATION: "Thiếu quan sát biên lãi ròng từ nhà cung cấp",
    MISSING_PRIOR_YEAR_TTM_WINDOW: "Thiếu cửa sổ 12 tháng của năm trước",
    ISSUER_NOT_BANK: "Không phải ngân hàng",
    ISSUER_NOT_SECURITIES: "Không phải công ty chứng khoán",
    ENTITY_TYPE_NOT_SUPPORTED_THIS_MILESTONE: "Loại hình doanh nghiệp chưa được hỗ trợ",
    FEATURE_STORE_RESEARCH_PROXY: "Chỉ số thay thế từ kho dữ liệu nghiên cứu",
    BLOCKED_BY_EVIDENCE: "Bị chặn do thiếu bằng chứng",
    INDUSTRIAL_FINANCIAL_ANALYSIS: "Phân tích tài chính doanh nghiệp phi tài chính",
    OTHER_FINANCIAL_LIMITED_ANALYSIS: "Phân tích giới hạn cho tổ chức tài chính",
    UNCLASSIFIED_GENERIC_FINANCIAL_ANALYSIS: "Phân tích chung, chưa phân loại",
    POSITIVE_NET_WORKING_CAPITAL: "Vốn lưu động ròng dương",
    NEGATIVE_NET_WORKING_CAPITAL: "Vốn lưu động ròng âm",
    WORKING_CAPITAL_IMPROVING: "Vốn lưu động cải thiện",
    WORKING_CAPITAL_WORSENING: "Vốn lưu động xấu đi",
    WORKING_CAPITAL_UNAVAILABLE: "Chưa có dữ liệu vốn lưu động",
    CURRENT_RATIO_IMPROVING: "Hệ số thanh toán hiện hành cải thiện",
    CURRENT_RATIO_WORSENING: "Hệ số thanh toán hiện hành xấu đi",
    STRENGTHENING: "Củng cố",
    WORSENING: "Xấu đi",
    WEAKENING: "Suy yếu",
    HEALTHY: "Lành mạnh",
    WEAK: "Yếu",
    CASH_QUALITY_UNAVAILABLE: "Chưa có dữ liệu chất lượng dòng tiền",
    POSITIVE_CFO: "Dòng tiền kinh doanh dương",
    NEGATIVE_CFO: "Dòng tiền kinh doanh âm",
    BLOCKED_INCOMPATIBLE: "Bị chặn do không tương thích",
    POINT_IN_TIME_TRAJECTORY_COMPATIBLE: "Tương thích theo quỹ đạo số dư thời điểm",
    SAME_NATIVE_SERIES_RESEARCH_COMPATIBLE: "Cùng chuỗi gốc, tương thích cho nghiên cứu",
    OBSERVED_EQUITY_ASSETS_DETERIORATING: "Tỷ lệ vốn chủ/tài sản đang suy giảm",
    OBSERVED_CASH_CONVERSION_WEAK: "Chuyển đổi tiền mặt yếu",
    EQUITY_ASSETS_DETERIORATION_WATCH: "Theo dõi suy giảm tỷ lệ vốn chủ/tài sản",
    CASH_CONVERSION_DETERIORATION_WATCH: "Theo dõi suy giảm chuyển đổi tiền mặt",
    BALANCE_SHEET: "Bảng cân đối kế toán",
    CASH_CONVERSION: "Chuyển đổi tiền mặt",
    // valuation
    RESEARCH_USABLE: "Dùng được cho nghiên cứu",
    PB_NOT_MEANINGFUL: "P/B không có ý nghĩa",
    ENTITY_CLASS_UNRESOLVED: "Chưa xác định loại hình doanh nghiệp",
    PROVIDER_RESEARCH_NOT_AUTHORIZED_FOR_ABSOLUTE_VALUATION_INPUTS: "Dữ liệu nhà cung cấp chưa được phép dùng cho định giá tuyệt đối",
    ebitda_not_ready: "EBITDA chưa sẵn sàng",
    PRICE_SESSION_MISSING: "Thiếu giá của phiên",
    price_basis_unknown_and_unverified_universe_wide: "Cơ sở giá chưa xác định và chưa được kiểm chứng",
    share_count_not_evidenced_by_any_retained_provider_line: "Số cổ phiếu chưa có bằng chứng từ nguồn",
    "unusable_term:cash_and_cash_equivalents": "Không dùng được khoản tiền và tương đương tiền",
    "unusable_term:total_interest_bearing_debt": "Không dùng được khoản tổng nợ vay chịu lãi",
    BOOK_EQUITY_UNAVAILABLE: "Chưa có vốn chủ sở hữu sổ sách",
    BOOK_EQUITY_PERIOD_STALE: "Kỳ vốn chủ sở hữu đã cũ",
    negative_or_zero_ebitda_denominator: "EBITDA âm hoặc bằng 0",
    NON_POSITIVE_BOOK_EQUITY: "Vốn chủ sở hữu không dương",
    OFFICIAL_QUALIFIED_FINANCIAL_INPUT_UNAVAILABLE: "Chưa có đầu vào tài chính chính thức đủ điều kiện",
    FINANCIAL_VALUE_SCALE_NOT_CANONICAL_FOR_CURRENT_VALUATION: "Đơn vị số liệu tài chính chưa chuẩn hóa cho định giá",
    conflicted_input_fact: "Dữ kiện đầu vào mâu thuẫn",
    OFFICIAL_REPORTED_PERIOD_INPUT_NOT_ADMITTED: "Đầu vào kỳ báo cáo chính thức chưa được chấp nhận",
    PRICE_PROVIDER_REJECTED: "Nguồn giá bị từ chối",
    CURRENT_COMMON_OUTSTANDING_COVERAGE_NOT_PROVEN_THROUGH_PRICE_SESSION: "Chưa chứng minh số cổ phiếu lưu hành đến phiên giá",
    STALE_SHARE_FAIL_CLOSED_CORPORATE_ACTION_OR_UNVERIFIABLE_FRESHNESS: "Số cổ phiếu có thể đã cũ do sự kiện doanh nghiệp",
    missing_explicit_official_ex_date_on_share_relevant_event: "Thiếu ngày giao dịch không hưởng quyền chính thức",
    PRICE_FINANCIAL_CURRENCY_MISMATCH_NO_FX_CONVERSION_CONTRACT: "Lệch đơn vị tiền tệ giữa giá và báo cáo tài chính",
    CALCULATION_READINESS_PERIOD_STALE: "Kỳ dữ liệu tính toán đã cũ",
    POSITIVE_DENOMINATOR_REQUIRED: "Cần mẫu số dương",
    STATEMENT_SCOPE_UNKNOWN_NOT_PEER_COMPARABLE: "Chưa rõ phạm vi báo cáo — không đối sánh được",
    BELOW_MIN_COHORT_MEMBERS: "Nhóm đối sánh dưới số thành viên tối thiểu",
    INCOMPATIBLE_OR_UNAVAILABLE_BASIS: "Cơ sở không tương thích hoặc chưa có",
    INTRINSIC_VALUE_METHOD_NOT_ADMITTED: "Chưa có phương pháp định giá nội tại được chấp nhận",
    NO_VALUATION_METHOD_AVAILABLE: "Chưa có phương pháp định giá",
    RESEARCH_METHODS_AVAILABLE_NOT_PEER_QUALIFIED: "Có phương pháp nghiên cứu nhưng chưa đủ điều kiện đối sánh",
    PEER_RELATIVE_QUALIFIED: "Đối sánh tương đối đủ điều kiện nghiên cứu",
    CURRENT_SHARE_RESEARCH_PROXY: "Số cổ phiếu hiện tại, chỉ dùng nghiên cứu",
    PROVIDER_VALUATION_PROXY: "Định giá của nhà cung cấp, chỉ dùng nghiên cứu",
    TTM_SUM: "12 tháng gần nhất",
    POINT_IN_TIME_BALANCE_SHEET: "Số dư tại thời điểm",
    EXISTING_CURRENT_VALUATION_METHOD: "Phương pháp định giá hiện hành",
    UNVERIFIED_RESEARCH_PRICE: "giá nghiên cứu chưa kiểm chứng",
    RETURN_RATIO: "tỷ suất",
    // technical / triggers
    SIGNAL_VELOCITY_ARTIFACT_NOT_SUPPLIED_OR_UNSUPPORTED_CONTRACT: "Chưa có dữ liệu xu hướng tín hiệu nhiều phiên cho mã này",
    BELOW_TRIGGER: "Dưới mức kích hoạt",
    APPROACHING: "Đang tiến gần mức kích hoạt",
    PIVOT_BREAKOUT_TRIGGER: "Kích hoạt khi vượt đỉnh xoay",
    NO_TRIGGER: "Không có mức kích hoạt",
    CONFIRMED_BOS_TRIGGER: "Kích hoạt khi phá cấu trúc đã xác nhận",
    RETEST_BROKEN_PIVOT: "Kiểm định lại đỉnh xoay đã vượt",
    CONFIRMED_SWING_LOW_BY_RULE_OR_V1_SUPPORT_FALLBACK: "Đáy xoay đã xác nhận (hoặc hỗ trợ dự phòng)",
    CONFIRMED_SWING_HIGH_BY_RULE_OR_V1_RESISTANCE_FALLBACK: "Đỉnh xoay đã xác nhận (hoặc kháng cự dự phòng)",
    MULTI_SIGNAL_RULE_NOT_REDUCED_TO_A_SINGLE_THRESHOLD: "Quy tắc nhiều tín hiệu, không quy về một ngưỡng",
    NO_RETAINED_NEXT_SESSION_EXTENSION_THRESHOLD: "Chưa có ngưỡng mở rộng cho phiên kế tiếp",
    DISJUNCTIVE_CONFIRMATION_NOT_A_SINGLE_FIXED_BOUNDARY: "Xác nhận theo nhiều nhánh, không phải một biên cố định",
    BELOW_TO_INVALIDATE: "Vô hiệu nếu xuống dưới",
    ABOVE_TO_INVALIDATE: "Vô hiệu nếu vượt lên trên",
    SECTOR_LEADING: "Ngành dẫn dắt",
    SECTOR_WEAKENING: "Ngành suy yếu",
    // corporate events
    CASH_DIVIDEND: "Cổ tức tiền mặt",
    STOCK_DIVIDEND: "Cổ tức cổ phiếu",
    AGM: "Đại hội cổ đông",
    BONUS: "Cổ phiếu thưởng",
    RIGHTS: "Quyền mua",
    OTHER: "Sự kiện khác",
    POSITIVE_CATALYST: "Chất xúc tác tích cực",
    INELIGIBLE: "Không đủ điều kiện làm chất xúc tác",
    NEUTRAL_INFORMATION: "Thông tin trung tính",
    RECENT: "Gần đây",
    UPCOMING: "Sắp diễn ra",
    PAST: "Đã qua",
    EX_DATE_TODAY: "Ngày không hưởng quyền là hôm nay",
    // public thesis focus cards (history)
    LONG_TERM_INVESTOR: "Góc nhìn dài hạn",
    SHORT_TERM_INVESTOR: "Góc nhìn ngắn hạn",
    CONTESTED: "Đang có bằng chứng trái chiều",
    ADVERSE: "Bất lợi",
    NOT_CONFIRMED: "Chưa xác nhận",
    SUPPORTIVE: "Ủng hộ",
    BUILT: "Đầy đủ",
    PARTIAL: "Một phần",
    // published contract blocked outputs
    NOT_EMITTED: "Không phát hành",
    RANKING_PROHIBITED: "Cấm xếp hạng",
    FORECAST_PROHIBITED: "Cấm dự báo xác suất",
    SCORING_PROHIBITED: "Cấm chấm điểm",
    backtest_or_pit_outcome: "Kết quả kiểm định quá khứ",
    ordinal_rank: "Xếp hạng thứ tự",
    portfolio_optimization: "Tối ưu hóa danh mục",
    probability_of_success: "Xác suất thành công",
    target_price: "Giá mục tiêu",
    universal_score: "Điểm tổng hợp",
  });

  const FEATURE_LABELS = Object.freeze({
    assets_yoy: "Tổng tài sản (so cùng kỳ)", bank_cir: "Tỷ lệ chi phí/thu nhập (CIR)", bank_ldr: "Tỷ lệ cho vay/huy động (LDR)",
    bank_loan_growth: "Tăng trưởng cho vay", bank_nim_provider_proxy: "Biên lãi ròng (NIM)", bank_npl_ratio: "Tỷ lệ nợ xấu (NPL)",
    bank_provision_coverage: "Tỷ lệ bao phủ dự phòng", brokerage_revenue_mix: "Cơ cấu doanh thu môi giới", cash_to_assets: "Tiền / Tổng tài sản",
    cash_yoy: "Tiền (so cùng kỳ)", cfo_to_net_income: "Dòng tiền kinh doanh / Lợi nhuận", cfo_to_net_income_ttm: "Dòng tiền kinh doanh / Lợi nhuận (12 tháng)",
    current_ratio: "Hệ số thanh toán hiện hành", current_ratio_direction: "Xu hướng hệ số thanh toán hiện hành", debt_to_assets: "Nợ / Tổng tài sản",
    debt_to_equity: "Nợ / Vốn chủ sở hữu", debt_to_equity_direction: "Xu hướng Nợ / Vốn chủ sở hữu", equity_to_assets: "Vốn chủ sở hữu / Tổng tài sản",
    equity_to_assets_direction: "Xu hướng Vốn chủ sở hữu / Tổng tài sản", equity_yoy: "Vốn chủ sở hữu (so cùng kỳ)", free_cash_flow_proxy: "Dòng tiền tự do (ước tính)",
    free_cash_flow_proxy_direction: "Xu hướng dòng tiền tự do", fvtpl_asset_intensity: "Tỷ trọng tài sản FVTPL", gross_margin: "Biên lợi nhuận gộp",
    gross_margin_direction: "Xu hướng biên lợi nhuận gộp", loan_interest_income_mix: "Cơ cấu thu nhập lãi cho vay", margin_lending_asset_intensity: "Tỷ trọng cho vay ký quỹ",
    mixed_provider_asset_turnover_proxy: "Vòng quay tài sản (nhiều nguồn)", mixed_provider_roa_proxy: "ROA (nhiều nguồn)", net_income_qoq: "Lợi nhuận (so quý trước)",
    net_income_same_quarter_yoy: "Lợi nhuận (so cùng quý năm trước)", net_income_sign: "Dấu của lợi nhuận", net_income_ttm: "Lợi nhuận 12 tháng",
    net_income_ttm_yoy: "Lợi nhuận 12 tháng (so cùng kỳ)", net_income_ytd_yoy: "Lợi nhuận lũy kế năm (so cùng kỳ)", net_margin: "Biên lợi nhuận ròng",
    net_margin_direction: "Xu hướng biên lợi nhuận ròng", net_working_capital: "Vốn lưu động ròng", net_working_capital_direction: "Xu hướng vốn lưu động ròng",
    operating_cash_flow_qoq: "Dòng tiền kinh doanh (so quý trước)", operating_cash_flow_same_quarter_yoy: "Dòng tiền kinh doanh (so cùng quý năm trước)",
    operating_cash_flow_sign: "Dấu của dòng tiền kinh doanh", operating_cash_flow_ttm: "Dòng tiền kinh doanh 12 tháng", operating_cash_flow_ttm_yoy: "Dòng tiền kinh doanh 12 tháng (so cùng kỳ)",
    pbt_margin: "Biên lợi nhuận trước thuế", profit_before_tax_qoq: "Lợi nhuận trước thuế (so quý trước)", profit_before_tax_same_quarter_yoy: "Lợi nhuận trước thuế (so cùng quý năm trước)",
    profit_before_tax_ttm: "Lợi nhuận trước thuế 12 tháng", profit_before_tax_ttm_yoy: "Lợi nhuận trước thuế 12 tháng (so cùng kỳ)", revenue_qoq: "Doanh thu (so quý trước)",
    revenue_same_quarter_yoy: "Doanh thu (so cùng quý năm trước)", revenue_ttm: "Doanh thu 12 tháng", revenue_ttm_yoy: "Doanh thu 12 tháng (so cùng kỳ)",
    revenue_ytd_yoy: "Doanh thu lũy kế năm (so cùng kỳ)", same_provider_asset_turnover_eop_proxy: "Vòng quay tài sản (tài sản cuối kỳ)", same_provider_roa: "ROA",
    same_provider_roa_avg_assets: "ROA (tài sản bình quân)", same_provider_roa_eop_proxy: "ROA (tài sản cuối kỳ)", same_provider_roe: "ROE",
    same_provider_roe_avg_equity: "ROE (vốn chủ bình quân)", same_provider_roe_eop_proxy: "ROE (vốn chủ cuối kỳ)", ttm_net_margin: "Biên lợi nhuận ròng 12 tháng",
    ttm_pbt_margin: "Biên lợi nhuận trước thuế 12 tháng",
    cash_and_cash_equivalents_pit_trajectory: "Quỹ đạo tiền và tương đương tiền", cash_earnings_alignment: "Mức khớp giữa tiền và lợi nhuận",
    net_income_same_period_yoy: "Lợi nhuận (so cùng kỳ)", net_income_ttm_sum: "Tổng lợi nhuận 12 tháng", operating_cash_flow_ttm_sum: "Tổng dòng tiền kinh doanh 12 tháng",
    profit_state: "Trạng thái lợi nhuận", revenue_same_period_yoy: "Doanh thu (so cùng kỳ)", revenue_ttm_sum: "Tổng doanh thu 12 tháng",
    roa_eop_proxy: "ROA (tài sản cuối kỳ)", roe_eop_proxy: "ROE (vốn chủ cuối kỳ)", shareholders_equity_pit_trajectory: "Quỹ đạo vốn chủ sở hữu",
    total_assets_pit_trajectory: "Quỹ đạo tổng tài sản",
    balance_sheet_state: "Bảng cân đối kế toán", bank_asset_quality_state: "Chất lượng tài sản ngân hàng", bank_efficiency_state: "Hiệu quả hoạt động ngân hàng",
    bank_funding_state: "Huy động vốn ngân hàng", brokerage_mix_trajectory_state: "Cơ cấu doanh thu môi giới", capital_efficiency_state: "Hiệu quả sử dụng vốn",
    cash_conversion_state: "Chuyển đổi tiền mặt", current_ratio_trajectory_state: "Hệ số thanh toán hiện hành", earnings_turnaround_state: "Chuyển biến lợi nhuận",
    free_cash_flow_proxy_direction_state: "Dòng tiền tự do", fvtpl_asset_intensity_trajectory_state: "Tài sản FVTPL", gross_margin_trajectory_state: "Biên lợi nhuận gộp",
    growth_state: "Tăng trưởng", leverage_state: "Đòn bẩy tài chính", margin_lending_intensity_trajectory_state: "Cho vay ký quỹ", margin_state: "Biên lợi nhuận",
    profitability_state: "Khả năng sinh lời", resilience_state: "Sức chống chịu", working_capital_state: "Vốn lưu động", working_capital_trajectory_state: "Xu hướng vốn lưu động",
    balance_sheet: "Bảng cân đối kế toán", cash_quality: "Chất lượng dòng tiền", leverage: "Đòn bẩy", margin: "Biên lợi nhuận", profitability: "Khả năng sinh lời",
  });

  // The financial-analysis evidence sentences are a small fixed set of Producer templates
  // ("<TICKER>: <template>"). Each is shown in Vietnamese with the original kept as a tooltip;
  // an unseen template is shown verbatim and marked as the Producer's original wording.
  const FA_TEXT_LABELS = Object.freeze({
    "positive net working capital": "Vốn lưu động ròng dương",
    "negative net working capital": "Vốn lưu động ròng âm",
    "equity/assets strengthening": "Tỷ lệ vốn chủ sở hữu / tổng tài sản củng cố",
    "leverage improving alongside working capital improving": "Đòn bẩy cải thiện cùng vốn lưu động cải thiện",
    "leverage worsening alongside working capital worsening": "Đòn bẩy xấu đi cùng vốn lưu động xấu đi",
    "leverage worsening despite positive net working capital": "Đòn bẩy xấu đi dù vốn lưu động ròng dương",
    "CFO/net-income proxy is positive": "Dòng tiền kinh doanh / lợi nhuận (ước tính) dương",
    "CFO/net-income proxy is weak": "Dòng tiền kinh doanh / lợi nhuận (ước tính) yếu",
  });
  function faTextItem(text, ticker, polarity, period, source) {
    const body = ticker && String(text).startsWith(`${ticker}:`) ? String(text).slice(ticker.length + 1).trim() : String(text);
    const known = FA_TEXT_LABELS[body];
    return item("PRODUCER_INFERENCE", "business", known || text, { polarity, period, source: known ? "Phân tích tài chính" : `${source} (mô tả gốc)`, verbatim: !known, originalText: text });
  }

  const AXIS_LABELS = Object.freeze({
    catalyst: "Sự kiện doanh nghiệp", downside_invalidation: "Điều kiện vô hiệu", fundamental: "Nền tảng doanh nghiệp", liquidity: "Thanh khoản",
    market_sector: "Thị trường & ngành", tactical: "Kỹ thuật", valuation: "Định giá", valuation_share_basis: "Cơ sở số cổ phiếu định giá",
  });

  const VALUATION_METHOD_LABELS = Object.freeze({
    "P/E": "P/E", "P/E_TTM": "P/E · 12 tháng gần nhất", "P/E_REPORTED_PERIOD": "P/E · kỳ báo cáo", "P/S": "P/S", "P/S_TTM": "P/S · 12 tháng gần nhất",
    "P/S_REPORTED_PERIOD": "P/S · kỳ báo cáo", "P/B": "P/B", "P/B_CURRENT_RESEARCH": "P/B · nghiên cứu hiện tại", "P/B_OFFICIAL_RESEARCH": "P/B · nghiên cứu chính thức",
    "EV/EBITDA": "EV/EBITDA", "EV/EBITDA_CALC_READY": "EV/EBITDA · khả năng tính", "EV/Sales": "EV/Doanh thu", market_cap: "Vốn hóa",
  });

  // Placeholder labels value-format.js returns for a code it does not know. Treated as unknown.
  const PLACEHOLDER_LABELS = new Set(["", "Chưa xác định", "Điều kiện kỹ thuật", "Xem chi tiết kỹ thuật"]);

  // Returns { raw, label, known }. Never returns a bare code as the visible label.
  function codeLabel(code, domain) {
    const raw = code === null || code === undefined ? "" : String(code).trim();
    if (!raw) return { raw: "", label: "Chưa có dữ liệu", known: false };
    if (Object.prototype.hasOwnProperty.call(WB_LABELS, raw)) return { raw, label: WB_LABELS[raw], known: true };
    const vf = getValueFormat();
    if (vf) {
      if (domain && typeof vf.formatDomainState === "function") {
        const f = vf.formatDomainState(raw, domain);
        if (f.known && !PLACEHOLDER_LABELS.has(f.label)) return { raw, label: f.label, known: true };
      }
      if (typeof vf.formatKnownLabel === "function") {
        const label = vf.formatKnownLabel(raw, domain || "rule_condition");
        if (!PLACEHOLDER_LABELS.has(label)) return { raw, label, known: true };
      }
    }
    if (/^\d{4}(?:-(?:Q[1-4]|H[12]|\d{2}-\d{2}))?$/.test(raw)) return { raw, label: raw, known: true };
    return { raw, label: "Điều kiện dữ liệu chưa có nhãn tiếng Việt", known: false };
  }
  function featureLabel(id) {
    const raw = String(id || "");
    return FEATURE_LABELS[raw] || AXIS_LABELS[raw] || "Chỉ tiêu tài chính khác";
  }
  function axisLabel(axis) {
    const raw = String(axis || "");
    if (AXIS_LABELS[raw]) return AXIS_LABELS[raw];
    const vf = getValueFormat();
    const label = vf && typeof vf.formatAxisLabel === "function" ? vf.formatAxisLabel(raw) : "";
    return label && label !== raw ? label : "Trục dữ liệu khác";
  }
  function methodLabel(id) { return VALUATION_METHOD_LABELS[id] || "Phương pháp định giá khác"; }

  // Polarity of a Producer code, read from the code's own wording. Adverse wording wins so an
  // adverse fact can never be shown as support.
  function codePolarity(code) {
    const raw = String(code || "").toUpperCase();
    if (!raw) return "neutral";
    if (/(^|_)(ADVERSE|DETERIORAT\w*|RISK|BREAKDOWN|EXPENSIVE|WEAK\w*|WORSEN\w*|NEGATIVE|VETO|DOWNTREND|DISTRIBUTION|FAILED|FAILURE|CONTRADICT\w*)(_|$)/.test(raw)) return "adverse";
    if (/^(NOT|NO|NON|UN)_/.test(raw)) return "neutral";
    if (/(^|_)(STRENGTHEN\w*|IMPROV\w*|LEADING|ATTRACTIVE|CONSTRUCTIVE|POSITIVE|HEALTHY|UPTREND|SUPPORTIVE)(_|$)/.test(raw)) return "constructive";
    return "neutral";
  }
  function textPolarity(text) {
    const s = String(text || "").toLowerCase();
    if (/(worsen|deteriorat|weak|negative|declin)/.test(s)) return "adverse";
    if (/(strengthen|improv|positive|healthy)/.test(s)) return "constructive";
    return "neutral";
  }

  // Which business dimension a Producer reason code speaks to. Used only to group evidence so a
  // technical reason is never presented as evidence about the business.
  function reasonDimension(code) {
    const raw = String(code || "").toUpperCase();
    if (/^FA_V2|CASH_CONVERSION|BALANCE_SHEET|EQUITY_ASSETS|DEBT_EVIDENCE/.test(raw)) return "business";
    if (/TACTICAL|TECHNICAL|BREAKOUT|BREAKDOWN|PRICE_VOLUME|MOMENTUM|TREND|DISTRIBUTION|RETEST|PIVOT|REVERSAL|BASE_/.test(raw)) return "technical";
    if (/FUNDAMENTAL|EARNINGS|PROFIT|MARGIN|REVENUE/.test(raw)) return "business";
    if (/RELATIVE_RESEARCH|VALUATION/.test(raw)) return "valuation";
    if (/SECTOR|MARKET|BREADTH|LEADERSHIP/.test(raw)) return "market";
    if (/CATALYST|EVENT/.test(raw)) return "catalyst";
    return "other";
  }
  const DIMENSIONS = Object.freeze({
    technical: { label: "Kỹ thuật & giá", caveat: "Bằng chứng kỹ thuật và giá — không xác lập chất lượng doanh nghiệp." },
    market: { label: "Thị trường & ngành", caveat: "Bối cảnh thị trường/ngành — không phải bằng chứng về doanh nghiệp." },
    business: { label: "Doanh nghiệp & tài chính", caveat: "Bằng chứng tài chính theo kỳ báo cáo đã nêu." },
    valuation: { label: "Định giá", caveat: "Nhãn định giá tương đối chỉ dùng cho nghiên cứu, không phải giá trị hợp lý." },
    catalyst: { label: "Sự kiện doanh nghiệp", caveat: "Sự kiện theo nguồn công bố; không suy ra tác động giá." },
    other: { label: "Khác", caveat: "" },
  });

  // Visible separation of what kind of statement each item is.
  const EVIDENCE_KINDS = Object.freeze({
    SOURCE_FACT: { label: "Dữ kiện nguồn công bố", cls: "source" },
    PRODUCER_INFERENCE: { label: "Suy luận của Producer", cls: "inference" },
    CONDITIONAL: { label: "Thiết lập có điều kiện", cls: "conditional" },
    RESEARCH_ONLY: { label: "Chỉ số thay thế, chỉ dùng nghiên cứu", cls: "research" },
    HISTORICAL: { label: "Bằng chứng lịch sử", cls: "historical" },
    MISSING: { label: "Thiếu", cls: "gap" },
    STALE: { label: "Đã cũ", cls: "gap" },
    BLOCKED: { label: "Bị chặn", cls: "gap" },
    INCOMPATIBLE: { label: "Không tương thích", cls: "gap" },
    LIMITATION: { label: "Giới hạn dữ liệu", cls: "gap" },
    HUMAN_NOTE: { label: "Ghi chú của bạn", cls: "note" },
  });
  const GAP_KINDS = new Set(["MISSING", "STALE", "BLOCKED", "INCOMPATIBLE", "LIMITATION"]);

  function kindBadgeHtml(kind) {
    const k = EVIDENCE_KINDS[kind] || EVIDENCE_KINDS.PRODUCER_INFERENCE;
    return `<span class="wb-kind wb-kind-${k.cls}" data-evidence-kind="${h(kind)}">${h(k.label)}</span>`;
  }
  function codeHtml(code, domain) {
    const l = codeLabel(code, domain);
    return `<span data-code="${h(l.raw)}" title="${h(l.raw)}"${l.known ? "" : ' data-unlabeled="true"'}>${h(l.label)}</span>`;
  }
  function toneFor(polarity) { return polarity === "adverse" ? "adverse" : polarity === "constructive" ? "constructive" : "neutral"; }
  function pillHtml(code, domain, toneOverride) {
    const l = codeLabel(code, domain);
    const vf = getValueFormat();
    const tone = toneOverride || (vf && typeof vf.getSemanticTone === "function" ? vf.getSemanticTone(l.raw || "UNAVAILABLE", domain) : "neutral");
    return `<span class="cockpit-state tone-${h(tone)}" data-state="${h(l.raw)}" title="${h(l.raw)}">${h(l.label)}</span>`;
  }

  function formatNumber(value, digits) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "";
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits === undefined ? 2 : digits }).format(value);
  }
  function featureValueText(id, value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "";
    const key = String(id || "");
    if (/current_ratio$|debt_to_equity$|turnover/.test(key)) return `${formatNumber(value, 2)} lần`;
    if (/yoy|qoq|margin|_to_assets|roa|roe|growth|mix|intensity|ldr|cir|npl|nim|coverage|trajectory|cfo_to/.test(key)) return `${formatNumber(value * 100, 1)}%`;
    return `${formatNumber(value, 2)} (đơn vị chưa công bố)`;
  }

  // ---------------------------------------------------------------------------------------
  // Dossier adapter
  // ---------------------------------------------------------------------------------------
  function item(kind, dimension, labelText, extra) {
    return Object.assign({ kind, dimension: dimension || "other", label: labelText }, extra || {});
  }
  function codeItem(kind, code, extra) {
    const l = codeLabel(code, (extra && extra.domain) || "rule_condition");
    return item(kind, (extra && extra.dimension) || reasonDimension(code), l.label, Object.assign({ raw: l.raw, polarity: codePolarity(code) }, extra || {}));
  }
  function dedupeItems(items) {
    const seen = new Set();
    return items.filter((it) => {
      const key = `${it.kind}|${it.raw || ""}|${it.label}|${it.detail || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function entityClassOf(card) {
    const c = obj(card);
    const fa = obj(obj(obj(c.why).financial_analysis).compact);
    const raw = str(obj(c.fundamental).entity_type) || str(obj(c.valuation).entity_class) || str(fa.issuer_type);
    return raw ? raw.toLowerCase() : "unknown";
  }
  function industryOf(sectorRaw) {
    const raw = str(sectorRaw);
    const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts[0] === "PROVIDER_DESCRIPTIVE_CLASSIFICATION" && parts.length >= 3) return parts[parts.length - 1];
    return "";
  }
  function sectorDisplay(sectorRaw) {
    const vf = getValueFormat();
    if (vf && typeof vf.formatSectorLineage === "function") return vf.formatSectorLineage(sectorRaw).label;
    return industryOf(sectorRaw) || "Chưa phân loại ngành";
  }

  function postureBlock(c) {
    const pres = getCardPresentation();
    const conditionClass = str(c.posture_condition_class);
    const ev = str(c.evidence_currency);
    return {
      raw: c.research_action_posture || null,
      label: pres ? pres.actionPostureLabel(c) : (c.research_action_posture || "Chưa có dữ liệu"),
      html: pres ? pres.actionPostureHtml(c) : h(c.research_action_posture || ""),
      evidenceCurrencyRaw: ev || null,
      evidenceCurrencyHtml: pres ? pres.evidenceCurrencyHtml(ev) : h(ev),
      evidenceCurrencyClass: pres ? pres.evidenceCurrencyClass(ev) : "UNKNOWN",
      conditionClass: conditionClass ? codeLabel(conditionClass) : null,
      policyVersion: str(c.research_action_policy_version) || null,
      positionState: str(obj(c.position_context).position_state) || "UNKNOWN_POSITION_NOT_SUPPLIED",
      positionConditional: Boolean(obj(c.action_presentation).position_conditional),
      secondaryScreen: c.research_stance ? codeLabel(c.research_stance, "research_stance") : null,
      priority: obj(c.opportunity_priority).research_priority_tier ? codeLabel(obj(c.opportunity_priority).research_priority_tier, "opportunity_priority") : null,
      reasons: arr(obj(c.why).deterministic_reasons).filter((r) => typeof r === "string").map((r) => codeItem("PRODUCER_INFERENCE", r)),
    };
  }

  function strategyBlock(c) {
    const scen = obj(c.conditional_scenarios);
    const cases = ["base", "bull", "bear"].filter((k) => obj(scen[k]).case_status).map((k) => {
      const s = obj(scen[k]);
      return {
        case: k,
        caseLabel: k === "base" ? "Kịch bản tham chiếu" : k === "bull" ? "Kịch bản tích cực" : "Kịch bản bất lợi",
        status: codeLabel(s.case_status, "evidence_state"),
        reason: s.reason_code ? codeLabel(s.reason_code) : null,
        probability: codeLabel(s.probability_status || "UNKNOWN_UNCALIBRATED"),
        actionable: s.is_actionable === true,
      };
    });
    return {
      entryState: c.entry_state || null,
      entryAction: c.entry_action || null,
      readiness: c.research_stance_readiness || null,
      setupTags: arr(c.setup_tags).filter((t) => typeof t === "string"),
      scenarios: cases,
      scenarioLimitations: arr(scen.limitations).filter((t) => typeof t === "string").map((t) => codeLabel(t)),
      targetPriceStatus: scen.official_target_price_status || "NOT_EMITTED",
      probabilityStatus: scen.probability_status || "NOT_EMITTED",
    };
  }

  function evidenceBlock(c) {
    const why = obj(c.why);
    const ct = obj(c.counter_thesis);
    const fa = obj(obj(why.financial_analysis).compact);
    const faPeriod = str(fa.as_of_financial_period) || str(obj(c.fundamental).source_period);
    const sv = obj(c.signal_velocity);
    const cat = obj(c.catalyst);
    const support = [];
    const counter = [];
    const neutral = [];
    const place = (it) => {
      if (it.polarity === "adverse") counter.push(it);
      else if (it.polarity === "constructive") support.push(it);
      else neutral.push(it);
    };
    arr(why.deterministic_reasons).filter((r) => typeof r === "string").forEach((r) => place(codeItem("PRODUCER_INFERENCE", r, { source: "Lý do Producer nêu cho tư thế" })));
    arr(why.counterbalancing_context).filter((r) => typeof r === "string").forEach((r) => place(codeItem("PRODUCER_INFERENCE", r, { source: "Bối cảnh đối trọng" })));
    arr(obj(why.financial_analysis).supporting).filter((r) => typeof r === "string").forEach((r) => place(codeItem("PRODUCER_INFERENCE", r, { dimension: "business", period: faPeriod, source: "Phân tích tài chính" })));
    const ticker = str(c.ticker);
    arr(fa.deterministic_positive_evidence).filter((t) => typeof t === "string").forEach((t) => support.push(faTextItem(t, ticker, "constructive", faPeriod, "Phân tích tài chính")));
    arr(ct.key_counter_thesis).filter((r) => typeof r === "string").forEach((r) => counter.push(Object.assign(codeItem("PRODUCER_INFERENCE", r, { source: "Phản luận chính" }), { polarity: "adverse" })));
    arr(fa.negative_evidence).filter((t) => typeof t === "string").forEach((t) => counter.push(faTextItem(t, ticker, "adverse", faPeriod, "Phân tích tài chính")));
    arr(fa.conflicting_evidence).filter((t) => typeof t === "string").forEach((t) => counter.push(faTextItem(t, ticker, "adverse", faPeriod, "Bằng chứng tài chính trái chiều")));
    const ctFa = obj(ct.financial_analysis);
    arr(ctFa.counter_thesis).concat(arr(ctFa.current_financial_weakness)).filter((r) => typeof r === "string")
      .forEach((r) => counter.push(Object.assign(codeItem("PRODUCER_INFERENCE", r, { dimension: "business", period: faPeriod, source: "Điểm yếu tài chính hiện tại" }), { polarity: "adverse" })));
    arr(sv.independent_supporting_axes).filter((a) => typeof a === "string").forEach((a) => support.push(item("PRODUCER_INFERENCE", "technical", `Trục kỹ thuật ủng hộ: ${axisLabel(a)}`, { raw: a, polarity: "constructive", source: "Xu hướng tín hiệu" })));
    arr(sv.contradicting_axes).filter((a) => typeof a === "string").forEach((a) => counter.push(item("PRODUCER_INFERENCE", "technical", `Trục kỹ thuật mâu thuẫn: ${axisLabel(a)}`, { raw: a, polarity: "adverse", source: "Xu hướng tín hiệu" })));
    const eventItem = (e, polarity) => {
      const ev = obj(e);
      const label = `${codeLabel(ev.event_type).label}${ev.event_date ? ` · ${ev.event_date}` : ""} · ${codeLabel(ev.event_state).label}`;
      return item(ev.event_state === "PAST" ? "HISTORICAL" : "SOURCE_FACT", "catalyst", label, { raw: str(ev.event_type), polarity, knownAt: str(ev.known_at), source: codeLabel(ev.catalyst_class).label });
    };
    arr(cat.qualified_current_catalysts).forEach((e) => support.push(eventItem(e, "constructive")));
    arr(cat.adverse_events).forEach((e) => counter.push(eventItem(e, "adverse")));
    return { support: dedupeItems(support), counter: dedupeItems(counter), neutral: dedupeItems(neutral) };
  }

  // Adverse conditions are collected separately so they stay visible in the compact overview.
  function adverseBlock(c, evidence) {
    const out = [];
    const posture = str(c.research_action_posture);
    if (posture === "AVOID" || posture === "REDUCE") out.push({ label: `Tư thế của Producer: ${codeLabel(posture, "research_action_posture").label}`, raw: posture });
    if (posture === "HOLD_DO_NOT_ADD") out.push({ label: "Tư thế của Producer: không mua thêm", raw: posture });
    if (["BREAKDOWN_RISK", "DISTRIBUTION_RISK", "DOWNTREND"].includes(str(c.entry_state))) out.push({ label: `Trạng thái kỹ thuật: ${codeLabel(c.entry_state, "tactical_state").label}`, raw: c.entry_state });
    const cond = str(c.posture_condition_class);
    if (cond && codePolarity(cond) === "adverse") out.push({ label: `Phân loại điều kiện: ${codeLabel(cond).label}`, raw: cond });
    const pres = getCardPresentation();
    const evClass = pres ? pres.evidenceCurrencyClass(c.evidence_currency) : "";
    if (evClass === "NO_CURRENT_EVIDENCE" || evClass === "LAST_TRADE_AS_OF") out.push({ label: pres.evidenceCurrencyLabel(c.evidence_currency), raw: str(c.evidence_currency) });
    const inv = obj(c.invalidation);
    if (str(obj(inv.technical).status) === "TRIGGERED") out.push({ label: "Điều kiện vô hiệu kỹ thuật đã được Producer ghi nhận là đã kích hoạt", raw: "TECHNICAL_INVALIDATION_TRIGGERED" });
    if (str(obj(inv.fundamental).status) === "TRIGGERED") out.push({ label: "Điều kiện vô hiệu nền tảng đã được Producer ghi nhận là đã kích hoạt", raw: "FUNDAMENTAL_INVALIDATION_TRIGGERED" });
    if (str(obj(c.signal_velocity).overall_transition_state) === "DETERIORATING") out.push({ label: "Xu hướng tín hiệu: đang suy yếu", raw: "DETERIORATING" });
    if (str(obj(c.official_research_scope).scope_bucket) === "OUTSIDE_CURRENT_OFFICIAL_RESEARCH_SCOPE") out.push({ label: "Ngoài phạm vi nghiên cứu chính thức hiện hành", raw: "OUTSIDE_CURRENT_OFFICIAL_RESEARCH_SCOPE" });
    (evidence ? evidence.counter : []).forEach((it) => out.push({ label: it.label, raw: it.raw || "", verbatim: it.verbatim }));
    const seen = new Set();
    return out.filter((a) => { const k = a.label; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  function technicalBlock(c) {
    const sv = obj(c.signal_velocity);
    const fp = obj(c.flow_price);
    const ms = obj(c.market_sector);
    const src = obj(ms.sector_relative_context);
    const liq = obj(c.liquidity);
    const ref = obj(c.reference_trigger);
    const price = [c.current_price, c.price, obj(c.tactical).current_price].find(hasValue);
    return {
      entryState: c.entry_state || null,
      entryAction: c.entry_action || null,
      setupTags: arr(c.setup_tags).filter((t) => typeof t === "string"),
      price: hasValue(price) ? price : null,
      priceUnit: "giá nghiên cứu chưa kiểm chứng",
      signalVelocity: { state: sv.overall_transition_state || null, quality: sv.evidence_quality || null, reason: sv.reason_code ? codeLabel(sv.reason_code) : null, observations: typeof sv.valid_observation_count === "number" ? sv.valid_observation_count : null },
      flow: { relationship: fp.relationship || null, cohort: fp.cohort_membership || null, foreignFlow: fp.foreign_flow_state || null, persistence: fp.flow_persistence || null, latestSession: str(fp.latest_qualified_flow_session) || null },
      market: { breadth: ms.breadth_regime || null, leadership: src.leadership_state || null, marketBucket: src.market_relative_momentum_bucket || null, sectorBucket: src.sector_relative_momentum_bucket || null },
      liquidity: { readiness: liq.readiness || null, volume: hasValue(liq.current_session_volume) ? liq.current_session_volume : null, session: str(liq.source_session) || null, execution: liq.exact_execution_capacity_status || null },
      referenceLevel: hasValue(ref.trigger_level) ? ref.trigger_level : null,
    };
  }

  function featureRecord(id, ff) {
    const f = obj(ff);
    const ctx = obj(f.source_feature_context);
    const fitness = str(f.fitness);
    const reasons = arr(f.reason_codes).filter((r) => typeof r === "string");
    const value = typeof ctx.value === "number" ? ctx.value : (typeof f.value === "number" ? f.value : null);
    const providers = Array.from(new Set(arr(ctx.source_fact_refs).map((r) => str(obj(r).provider)).filter(Boolean)));
    const periods = Array.from(new Set(arr(ctx.period_identity).filter((p) => typeof p === "string")));
    return {
      id, label: featureLabel(id), fitness, reasons, value, valueText: featureValueText(id, value),
      periods, asOf: str(f.as_of_period), scope: arr(ctx.scope).filter((s) => typeof s === "string"), method: str(ctx.method),
      providers, factRefCount: arr(ctx.source_fact_refs).length, notApplicable: fitness === "NOT_APPLICABLE",
      ready: /^READY/.test(fitness) && value !== null,
      blocked: /BLOCKED/.test(fitness) || (!/^READY/.test(fitness) && fitness !== "NOT_APPLICABLE" && value === null),
      mixedProvider: /^mixed_provider/.test(id) || providers.length > 1,
    };
  }

  function fundamentalsBlock(c) {
    const fu = obj(c.fundamental);
    const fa = obj(obj(obj(c.why).financial_analysis).compact);
    const entityClass = entityClassOf(c);
    const period = str(fa.as_of_financial_period) || str(fu.source_period) || null;
    const establishes = [];
    const unavailable = [];
    const unavailableStates = [];
    let notApplicableCount = 0;
    const isUnavailableState = (v) => !v || /UNAVAILABLE|NOT_APPLICABLE|INSUFFICIENT|NOT_READY/.test(v);
    Object.keys(fa).filter((k) => /_state$/.test(k) && typeof fa[k] === "string").sort().forEach((k) => {
      const v = fa[k];
      if (v === "NOT_APPLICABLE") { notApplicableCount++; return; }
      if (isUnavailableState(v)) { unavailableStates.push({ raw: k, label: featureLabel(k), state: codeLabel(v).label }); return; }
      establishes.push(item("PRODUCER_INFERENCE", "business", featureLabel(k), { raw: k, value: codeLabel(v).label, valueRaw: v, polarity: codePolarity(v), period, source: "Phân loại trạng thái tài chính của Producer" }));
    });
    const features = Object.keys(obj(fa.feature_fitness)).sort().map((id) => featureRecord(id, fa.feature_fitness[id]));
    features.forEach((f) => {
      if (f.notApplicable) { notApplicableCount++; return; }
      if (f.ready) {
        establishes.push(item("RESEARCH_ONLY", "business", f.label, {
          raw: f.id, value: f.valueText, period: f.periods.join(" → ") || f.asOf, source: f.providers.length ? `Tính từ dữ liệu nhà cung cấp ${f.providers.join(", ")}` : "Tính từ dữ liệu nhà cung cấp",
          detail: f.mixedProvider ? "Kết hợp nhiều nguồn" : "", factRefCount: f.factRefCount, numeric: true,
        }));
      } else if (f.blocked) {
        const reason = f.reasons[0] || f.fitness;
        const incompatible = /INCOMPATIBLE|CROSS_PROVIDER|UNVERIFIED/.test(f.reasons.join(" "));
        unavailable.push(item(incompatible ? "INCOMPATIBLE" : (/BLOCKED/.test(f.fitness) ? "BLOCKED" : "MISSING"), "business", f.label, { raw: f.id, detail: codeLabel(reason).label, reasonRaw: reason, period }));
      }
    });
    const seenIds = new Set(features.map((f) => f.id));
    arr(fa.missing_dimensions).filter((m) => typeof m === "string").forEach((m) => {
      const [id, reason] = m.split(":");
      if (seenIds.has(id)) return;
      unavailable.push(item("MISSING", "business", featureLabel(id), { raw: id, detail: codeLabel(reason || "").label, reasonRaw: reason || "", period }));
    });
    const health = obj(fu.financial_health);
    const healthRows = Object.keys(health).filter((k) => typeof health[k] === "string").map((k) => ({ id: k, label: featureLabel(k), state: codeLabel(health[k], "fundamental_state"), raw: health[k] }));
    const limitations = [];
    if (str(fa.pit_authority) === "NOT_GRANTED" || arr(fa.warnings).includes("PIT_AUTHORITY_NOT_GRANTED")) limitations.push("Số liệu chưa được xác lập là dữ liệu đã biết tại đúng thời điểm (PIT); chỉ dùng cho nghiên cứu hiện tại.");
    if (str(fu.freshness_status) && str(fu.freshness_status) !== "CURRENT") limitations.push(`Độ mới: ${codeLabel(fu.freshness_status, "freshness").label}${period ? ` (kỳ ${period})` : ""}.`);
    arr(fu.warnings_blockers).filter((w) => typeof w === "string").slice(0, 6).forEach((w) => limitations.push(codeLabel(w, "diagnostic_reason").label));
    return {
      entityClass, isBank: entityClass === "bank", family: fa.analysis_family ? codeLabel(fa.analysis_family) : null,
      period, freshness: str(fu.freshness_status) || null, state: fu.state || null, trajectory: fu.trajectory || null,
      researchFitness: str(fu.research_fitness) || null, establishes: dedupeItems(establishes), unavailable: dedupeItems(unavailable), unavailableStates,
      notApplicableCount, health: healthRows, limitations: Array.from(new Set(limitations)), lineageRef: str(fa.lineage_ref) || null,
      contentIdentity: str(fa.financial_content_identity) || null,
    };
  }

  function citationOf(sourceFact) {
    const s = obj(sourceFact);
    if (!s.citation_id) return null;
    return {
      citationId: str(s.citation_id), documentSha256: str(s.document_sha256), reportingPeriod: str(s.reporting_period),
      periodStart: str(s.period_start), periodEnd: str(s.period_end), statementScope: str(s.statement_scope),
      sourcePage: typeof s.source_page === "number" ? s.source_page : null, lineCode: str(s.line_code),
      knowledgeAvailableAt: str(s.knowledge_available_at), observedAt: str(s.observed_at), publicationDate: str(s.publication_date) || null,
      currency: str(s.currency), assurance: str(s.assurance) || str(s.assurance_level) || null,
    };
  }

  function valuationBlock(c) {
    const va = obj(c.valuation);
    const summary = obj(va.valuation_summary);
    const methods = obj(va.method_diagnostics);
    const establishes = [];
    const unavailable = [];
    Object.keys(methods).forEach((id) => {
      const m = obj(methods[id]);
      const peer = obj(m.peer_relative);
      const citation = citationOf(m.source_fact);
      if (hasValue(m.value) && m.availability_state !== "NOT_AVAILABLE") {
        establishes.push(item("RESEARCH_ONLY", "valuation", methodLabel(id), {
          raw: id, value: typeof m.value === "number" ? (id === "market_cap" ? `${formatNumber(m.value, 0)} đồng` : `${formatNumber(m.value, 2)}×`) : String(m.value),
          availability: codeLabel(m.availability_state, "availability_state"), period: str(m.period_basis) ? codeLabel(m.period_basis).label : "",
          shareBasis: str(m.share_basis) ? codeLabel(m.share_basis).label : "",
          peer: peer.status ? { status: codeLabel(peer.status, "diagnostic_reason"), count: typeof peer.peer_count === "number" ? peer.peer_count : null, percentile: typeof peer.percentile === "number" ? peer.percentile : null } : null,
          citation, numeric: true,
        }));
      } else {
        const blockers = arr(m.blocker_reason_codes).filter((b) => typeof b === "string");
        const reason = blockers[0] || str(m.status) || str(m.availability_state);
        unavailable.push(item(/BLOCK/.test(str(m.status)) || blockers.length ? "BLOCKED" : "MISSING", "valuation", methodLabel(id), { raw: id, detail: codeLabel(reason, "diagnostic_reason").label, reasonRaw: reason, extraReasons: blockers.slice(1, 3).map((b) => codeLabel(b, "diagnostic_reason").label) }));
      }
    });
    const rr = obj(va.research_readiness);
    const intrinsic = obj(rr.intrinsic_value);
    return {
      relativeState: va.relative_research_state || null,
      displayState: summary.valuation_display_state ? codeLabel(summary.valuation_display_state) : null,
      availableCount: typeof summary.available_method_count === "number" ? summary.available_method_count : null,
      qualifiedCount: typeof summary.qualified_relative_method_count === "number" ? summary.qualified_relative_method_count : null,
      entityClass: str(va.entity_class) || null,
      shareBasis: str(va.share_basis) ? codeLabel(va.share_basis) : null,
      freshness: str(va.freshness_status) || null,
      establishes, unavailable,
      intrinsic: intrinsic.readiness ? { readiness: codeLabel(intrinsic.readiness, "research_readiness"), reason: codeLabel(intrinsic.reason_code) } : null,
      targetPrice: codeLabel(rr.official_target_price_status || "NOT_EMITTED"),
      probability: codeLabel(rr.probability_status || "NOT_EMITTED"),
      citedInputs: establishes.filter((e) => e.citation).length,
    };
  }

  // A condition is described by what the Producer published; a future comparison is never shown
  // as having happened, and a reference level never becomes entry authority.
  function conditionRecord(cond, role) {
    const c = obj(cond);
    const operator = str(c.comparison_operator);
    const isFuture = /^FUTURE_/.test(operator) || str(c.direction) === "STATE_TRANSITION";
    const triggerState = str(c.confirmation_trigger_state);
    let fired = "UNKNOWN";
    if (role === "confirmation") fired = triggerState === "TRIGGERED" ? "PRODUCER_REPORTED_TRIGGERED" : (triggerState ? "NOT_EVALUATED_OR_NOT_TRIGGERED" : "UNKNOWN");
    if (role === "invalidation") fired = str(c.status) === "TRIGGERED" ? "PRODUCER_REPORTED_TRIGGERED" : "NOT_TRIGGERED_PER_PRODUCER";
    return {
      role,
      status: c.status ? codeLabel(c.status, role === "invalidation" ? "invalidation_state" : "confirmation_state") : codeLabel(""),
      statusRaw: str(c.status) || null,
      boundary: c.boundary_type ? codeLabel(c.boundary_type) : null,
      operator: operator ? codeLabel(operator) : null,
      direction: c.direction ? codeLabel(c.direction) : null,
      level: hasValue(c.value) ? c.value : null,
      unit: str(c.unit) ? codeLabel(c.unit).label : "",
      baselineSession: str(c.baseline_period_session) || null,
      semantic: str(c.semantic) || null,
      isFuture,
      fired,
      triggerState: triggerState ? codeLabel(triggerState, "confirmation_state") : null,
      warnings: arr(c.warnings).filter((w) => typeof w === "string").map((w) => codeLabel(w).label),
      sourceText: str(c.reason) && !/^[A-Z0-9_]+$/.test(str(c.reason)) ? str(c.reason) : "",
      reasonCode: str(c.reason) && /^[A-Z0-9_]+$/.test(str(c.reason)) ? codeLabel(c.reason) : null,
      available: Boolean(c.status && c.status !== "UNAVAILABLE"),
    };
  }

  function conditionsBlock(c) {
    const ref = obj(c.reference_trigger);
    const inv = obj(c.invalidation);
    const fi = obj(inv.fundamental);
    const scen = obj(c.conditional_scenarios);
    const sv = obj(c.signal_velocity);
    const confirmation = [conditionRecord(c.confirmation, "confirmation")];
    const reference = ref.status ? {
      level: hasValue(ref.trigger_level) ? ref.trigger_level : null,
      state: ref.trigger_state ? codeLabel(ref.trigger_state, "confirmation_state") : null,
      stateRaw: str(ref.trigger_state) || null,
      type: ref.trigger_type ? codeLabel(ref.trigger_type) : null,
      satisfied: ref.trigger_condition_satisfied === true,
      attached: ref.trigger_condition_attached === true,
      entryAuthority: ref.entry_authority === true,
      invalidationLevel: hasValue(ref.invalidation_level) ? ref.invalidation_level : null,
      invalidationMethod: ref.invalidation_method ? codeLabel(ref.invalidation_method) : null,
    } : null;
    const weakening = [];
    const bear = obj(scen.bear);
    if (bear.case_status) weakening.push({ label: `Kịch bản bất lợi: ${codeLabel(bear.case_status, "evidence_state").label}`, detail: bear.reason_code ? codeLabel(bear.reason_code).label : "", kind: "CONDITIONAL" });
    arr(inv.future_financial_invalidation_watch).forEach((w) => {
      if (typeof w === "string") weakening.push({ label: codeLabel(w).label, detail: "Điều kiện theo dõi cho kỳ báo cáo tương lai", kind: "CONDITIONAL" });
      else if (w && typeof w === "object") weakening.push({ label: codeLabel(w.trigger_type || w.watch_state).label, detail: w.thesis_dimension ? codeLabel(w.thesis_dimension).label : "", kind: "CONDITIONAL" });
    });
    arr(sv.contradicting_axes).filter((a) => typeof a === "string").forEach((a) => weakening.push({ label: `Trục mâu thuẫn: ${axisLabel(a)}`, detail: "Xu hướng tín hiệu", kind: "PRODUCER_INFERENCE" }));
    if (str(sv.overall_transition_state) === "DETERIORATING") weakening.push({ label: "Xu hướng tín hiệu đang suy yếu", detail: "", kind: "PRODUCER_INFERENCE" });
    const invalidation = [conditionRecord(inv.technical, "invalidation")];
    const fundamentalInvalidation = fi.status ? {
      status: codeLabel(fi.status, "invalidation_state"), statusRaw: str(fi.status),
      dimension: fi.thesis_dimension ? codeLabel(fi.thesis_dimension).label : "",
      baseline: fi.baseline_state ? codeLabel(fi.baseline_state).label : "",
      watch: fi.watch_state ? codeLabel(fi.watch_state).label : "",
      asOf: str(fi.as_of) || null,
      trigger: fi.trigger_type ? codeLabel(fi.trigger_type) : null,
      fired: str(fi.status) === "TRIGGERED",
    } : null;
    const bull = obj(scen.bull);
    return {
      confirmation, reference, weakening, invalidation, fundamentalInvalidation,
      bull: bull.case_status ? { status: codeLabel(bull.case_status, "evidence_state"), reason: bull.reason_code ? codeLabel(bull.reason_code) : null } : null,
    };
  }

  // Every gap the Producer published, normalized. Questions are derived from these mechanically:
  // one template per gap kind, filled only with the gap's own labels.
  function gapsBlock(c, fundamentals, valuation, ctx) {
    const gaps = [];
    const add = (kind, axis, key, labelText, detail, extra) => gaps.push(Object.assign({ kind, axis, key: `${axis}|${key}`, label: labelText, detail: detail || "" }, extra || {}));
    const li = obj(c.lineage);
    const fresh = obj(li.per_axis_freshness);
    const srcSession = obj(li.per_axis_source_session);
    Object.keys(fresh).sort().forEach((axis) => {
      const v = str(fresh[axis]);
      if (!v || v === "CURRENT") return;
      add(v === "UNAVAILABLE" ? "MISSING" : "STALE", axis, `fresh:${v}`, axisLabel(axis), codeLabel(v, "freshness").label, { source: str(srcSession[axis]) || null });
    });
    arr(li.blockers).forEach((b) => {
      const bb = obj(b);
      if (!bb.axis) return;
      add(/BLOCK/.test(str(bb.readiness)) ? "BLOCKED" : "MISSING", str(bb.axis), `blocker:${bb.readiness}`, axisLabel(bb.axis), `${codeLabel(bb.readiness, "research_readiness").label}${bb.freshness_status ? ` · ${codeLabel(bb.freshness_status, "freshness").label}` : ""}`);
    });
    const pres = getCardPresentation();
    const evClass = pres ? pres.evidenceCurrencyClass(c.evidence_currency) : "";
    if (evClass === "NO_CURRENT_EVIDENCE" || evClass === "LAST_TRADE_AS_OF") add("STALE", "tactical", `currency:${evClass}`, "Bằng chứng kỹ thuật", pres.evidenceCurrencyLabel(c.evidence_currency));
    // One gap per shared Producer reason, listing the affected items, so a single root cause
    // (for example one missing source series) yields one verification question, not twenty.
    const grouped = (items, axis, prefix, noun) => {
      const groups = new Map();
      items.forEach((u) => {
        const k = `${u.kind}|${u.reasonRaw || u.detail}`;
        if (!groups.has(k)) groups.set(k, { kind: u.kind, detail: u.detail, reasonRaw: u.reasonRaw || "", period: u.period || null, labels: [], raws: [] });
        const g = groups.get(k);
        g.labels.push(u.label);
        g.raws.push(u.raw);
      });
      groups.forEach((g) => {
        const shown = g.labels.slice(0, 4).join(", ") + (g.labels.length > 4 ? ` và ${g.labels.length - 4} ${noun} khác` : "");
        add(g.kind, axis, `${prefix}:${g.kind}:${g.reasonRaw || g.detail}`, g.labels.length === 1 ? g.labels[0] : `${g.labels.length} ${noun}: ${shown}`, g.detail, { period: g.period, members: g.raws });
      });
    };
    grouped(fundamentals.unavailable, "fundamental", "features", "chỉ tiêu");
    grouped(valuation.unavailable, "valuation", "methods", "phương pháp");
    if (valuation.intrinsic && /BLOCK/.test(valuation.intrinsic.readiness.raw)) add("BLOCKED", "valuation", "intrinsic", "Định giá nội tại", valuation.intrinsic.reason.label);
    const ct = obj(c.counter_thesis);
    arr(ct.unavailable_dimensions).filter((d) => typeof d === "string").forEach((d) => add("MISSING", reasonDimension(d) === "business" ? "fundamental" : "other", `dim:${d}`, codeLabel(d).label, ""));
    arr(ct.warnings).filter((w) => typeof w === "string").forEach((w) => add("LIMITATION", "other", `warn:${w}`, codeLabel(w).label, ""));
    const sv = obj(c.signal_velocity);
    if (sv.reason_code) add("MISSING", "tactical", `sv:${sv.reason_code}`, "Xu hướng tín hiệu nhiều phiên", codeLabel(sv.reason_code).label);
    const fp = obj(c.flow_price);
    if (fp.cohort_membership === "OUTSIDE_CURRENT_FLOW_RESEARCH_COHORT") add("LIMITATION", "market_sector", "flow:outside", "Dòng vốn ngoại", "Mã chưa nằm trong nhóm theo dõi dòng ngoại hiện hành");
    const cat = obj(c.catalyst);
    if (str(cat.status) === "UNAVAILABLE" && !gaps.some((g) => g.axis === "catalyst")) add("MISSING", "catalyst", "catalyst", "Sự kiện doanh nghiệp", "Chưa có dữ liệu sự kiện được giữ lại");
    const ck = obj(c.current_corporate_knowledge);
    if (str(ck.status) === "UNAVAILABLE") add("MISSING", "catalyst", "knowledge", "Thông tin doanh nghiệp hiện hành", "Chưa có lớp thông tin doanh nghiệp hiện hành");
    const pc = obj(c.prospective_case);
    if (pc.status && /UNAVAILABLE/.test(str(pc.status))) add("MISSING", "other", "prospective", "Hồ sơ theo dõi luận điểm qua thời gian", codeLabel(pc.status, "prospective_case").label);
    if (str(obj(c.position_context).position_state) === "UNKNOWN_POSITION_NOT_SUPPLIED") add("LIMITATION", "other", "position", "Vị thế cá nhân", "Producer không biết bạn có nắm giữ mã này hay không; trang không suy đoán điều đó");
    const seen = new Set();
    return gaps.filter((g) => { if (seen.has(g.key)) return false; seen.add(g.key); return true; }).map((g) => Object.assign(g, { question: verificationQuestion(g, ctx) }));
  }

  function verificationQuestion(gap, ctx) {
    const t = (ctx && ctx.ticker) || "mã này";
    const postureLabel = (ctx && ctx.postureLabel) || "hiện tại";
    let text;
    switch (gap.kind) {
      case "STALE":
        text = `${gap.label} của ${t} đang dùng dữ liệu ${gap.source ? `kỳ/phiên ${gap.source}` : "không thuộc phiên hiện tại"} (${gap.detail}). Đã có số liệu mới hơn được công bố chưa?`;
        break;
      case "INCOMPATIBLE":
        text = `${gap.label} của ${t}: dữ liệu khác nguồn, khác kỳ hoặc chưa kiểm chứng (${gap.detail}). Có thể đối chiếu từ một nguồn duy nhất, cùng kỳ và cùng phạm vi báo cáo không?`;
        break;
      case "BLOCKED":
        text = gap.axis === "valuation"
          ? `${gap.label} của ${t} đang bị chặn (${gap.detail}). Đầu vào nào cần kiểm chứng từ báo cáo gốc để mở khóa?`
          : `${gap.label} của ${t} đang bị chặn (${gap.detail}). Báo cáo gốc có cung cấp dữ liệu cần thiết${gap.period ? ` cho kỳ ${gap.period}` : ""} không?`;
        break;
      case "LIMITATION":
        text = `Giới hạn "${gap.label}"${gap.detail ? ` (${gap.detail})` : ""} ảnh hưởng thế nào đến cách đọc tư thế "${postureLabel}" của ${t}?`;
        break;
      default:
        text = `${gap.label} của ${t} chưa có${gap.detail ? ` (${gap.detail})` : ""}. Nguồn công bố nào có thể cung cấp${gap.period ? ` cho kỳ ${gap.period}` : ""}?`;
    }
    return { id: `g-${stableHash(`${t}|${gap.key}`)}`, text, gapKey: gap.key };
  }

  function freshnessBlock(c, ctx) {
    const li = obj(c.lineage);
    const fresh = obj(li.per_axis_freshness);
    const src = obj(li.per_axis_source_session);
    const pq = obj(li.per_axis_proxy_or_qualified_state);
    const axes = Object.keys(fresh).sort().map((axis) => ({
      axis, label: axisLabel(axis), freshness: str(fresh[axis]), source: str(src[axis]) || null, qualification: pq[axis] ? codeLabel(pq[axis], "data_fitness").label : "",
    }));
    const dm = obj(c.display_metrics);
    const dmKeys = Object.keys(dm);
    const dmAvailable = dmKeys.filter((k) => str(obj(dm[k]).display_state) === "AVAILABLE" && obj(dm[k]).value !== null && obj(dm[k]).value !== undefined).length;
    const cardSession = str(c.as_of_session) || null;
    return {
      axes,
      currentAxes: axes.filter((a) => a.freshness === "CURRENT").length,
      metricsAvailable: dmAvailable, metricsTotal: dmKeys.length,
      deepEvidence: li.deep_evidence_availability ? codeLabel(li.deep_evidence_availability, "data_fitness").label : null,
      cardSession, indexSession: (ctx && ctx.session) || null,
      sessionMismatch: Boolean(ctx && ctx.session && cardSession && ctx.session !== cardSession),
    };
  }

  function provenanceBlock(c, ctx, fundamentals) {
    const rows = [];
    const add = (labelText, value) => { if (hasValue(value)) rows.push({ label: labelText, value: String(value) }); };
    add("Định danh quyết định", c.decision_identity);
    add("Bản chiếu Cơ hội đã công bố", ctx && ctx.sourceArtifactIdentity);
    add("Nguồn quyết định hành động", ctx && ctx.decisionSource);
    add("Dòng dõi phân tích tài chính", fundamentals.lineageRef);
    add("Nội dung tài chính", fundamentals.contentIdentity);
    add("Hợp đồng kịch bản", obj(c.conditional_scenarios).source_contract);
    add("Hàng đợi ưu tiên xem xét", obj(c.opportunity_priority).source_contract);
    add("Dòng ngoại – giá", obj(c.flow_price).source_artifact_identity);
    add("Phiên dữ liệu", c.as_of_session);
    return rows;
  }

  function buildDossier(card, ctx) {
    const c = obj(card);
    const context = obj(ctx);
    const ticker = normTicker(c.ticker || context.ticker);
    if (!ticker || !Object.keys(c).length) return null;
    const posture = postureBlock(c);
    const qctx = { ticker, postureLabel: posture.label };
    const evidence = evidenceBlock(c);
    const fundamentals = fundamentalsBlock(c);
    const valuation = valuationBlock(c);
    const gaps = gapsBlock(c, fundamentals, valuation, qctx);
    return {
      ticker,
      session: str(c.as_of_session) || context.session || null,
      sector: { raw: str(c.sector), label: sectorDisplay(c.sector), industry: industryOf(c.sector) },
      entityClass: entityClassOf(c),
      posture,
      strategy: strategyBlock(c),
      evidence,
      adverse: adverseBlock(c, evidence),
      technical: technicalBlock(c),
      fundamentals,
      valuation,
      conditions: conditionsBlock(c),
      gaps,
      questions: gaps.map((g) => g.question),
      freshness: freshnessBlock(c, context),
      provenance: provenanceBlock(c, context, fundamentals),
      authority: { isActionable: false, probability: "NOT_EMITTED", targetPrice: "NOT_EMITTED", ranking: "PROHIBITED" },
    };
  }

  // ---------------------------------------------------------------------------------------
  // Dossier rendering
  // ---------------------------------------------------------------------------------------
  function itemHtml(it) {
    const meta = [];
    if (it.value) meta.push(`<strong class="wb-item-value">${h(it.value)}</strong>`);
    if (it.detail) meta.push(`<span>${h(it.detail)}</span>`);
    if (it.period) meta.push(`<span>${/^\d/.test(String(it.period)) ? `Kỳ ${h(it.period)}` : `Cơ sở kỳ: ${h(it.period)}`}</span>`);
    if (it.source) meta.push(`<span>${h(it.source)}</span>`);
    if (it.knownAt) meta.push(`<span>Biết từ ${h(it.knownAt)}</span>`);
    return `<li class="wb-item wb-item-${h(EVIDENCE_KINDS[it.kind] ? EVIDENCE_KINDS[it.kind].cls : "inference")}" data-polarity="${h(it.polarity || "neutral")}"${it.raw ? ` data-code="${h(it.raw)}"` : ""}>
      <div class="wb-item-head">${kindBadgeHtml(it.kind)}<span class="wb-item-label"${it.verbatim ? ' lang="en"' : ""}${it.originalText && !it.verbatim ? ` title="${h(it.originalText)}"` : ""}>${h(it.label)}</span></div>
      ${meta.length ? `<div class="wb-item-meta">${meta.join(" · ")}</div>` : ""}
      ${it.citation ? citationHtml(it.citation) : ""}
    </li>`;
  }
  function itemsByDimensionHtml(items, emptyText) {
    if (!items.length) return `<p class="cockpit-note mb-0">${h(emptyText)}</p>`;
    const groups = {};
    items.forEach((it) => { (groups[it.dimension] = groups[it.dimension] || []).push(it); });
    return Object.keys(DIMENSIONS).filter((d) => groups[d]).map((d) => `<div class="wb-dim" data-dimension="${h(d)}">
      <div class="wb-dim-head">${h(DIMENSIONS[d].label)}</div>
      ${DIMENSIONS[d].caveat ? `<div class="wb-dim-caveat">${h(DIMENSIONS[d].caveat)}</div>` : ""}
      <ul class="wb-items">${groups[d].map(itemHtml).join("")}</ul></div>`).join("");
  }
  function citationHtml(cit) {
    return `<div class="wb-citation">${kindBadgeHtml("SOURCE_FACT")}
      <div>Đầu vào có trích dẫn báo cáo: kỳ ${h(cit.reportingPeriod || "—")}${cit.periodStart || cit.periodEnd ? ` (${h(cit.periodStart)} → ${h(cit.periodEnd)})` : ""}${cit.statementScope ? ` · ${h(cit.statementScope === "consolidated" ? "hợp nhất" : cit.statementScope)}` : ""}${cit.sourcePage !== null ? ` · trang ${h(cit.sourcePage)}` : ""}${cit.lineCode ? ` · mã chỉ tiêu ${h(cit.lineCode)}` : ""}</div>
      <div>Thời điểm biết: ${h(cit.knowledgeAvailableAt || "—")} · Ngày công bố: ${h(cit.publicationDate || "chưa công bố")} · Mức đảm bảo (kiểm toán/soát xét): ${h(cit.assurance || "chưa được công bố trong dữ liệu")}</div>
      <details class="wb-tech"><summary>Định danh trích dẫn</summary><div class="wb-mono">${h(cit.citationId)}</div><div class="wb-mono">tài liệu ${h(cit.documentSha256)}</div></details>
    </div>`;
  }
  function conditionHtml(cond) {
    if (!cond.available && !cond.reasonCode) return '<p class="cockpit-note mb-0">Producer chưa công bố điều kiện này cho phiên hiện tại.</p>';
    const fired = !cond.available ? "" : cond.fired === "PRODUCER_REPORTED_TRIGGERED"
      ? '<span class="cockpit-state tone-watch" data-fired="producer-reported">Producer ghi nhận đã kích hoạt</span>'
      : (cond.isFuture ? '<span class="cockpit-state tone-neutral" data-fired="future">Điều kiện cho phiên tương lai — chưa xảy ra</span>' : '<span class="cockpit-state tone-neutral" data-fired="not-reported">Chưa được ghi nhận là đã kích hoạt</span>');
    const parts = [];
    if (cond.boundary) parts.push(`<div><b>Biên</b> ${h(cond.boundary.label)}</div>`);
    if (cond.operator) parts.push(`<div><b>So sánh</b> ${h(cond.operator.label)}</div>`);
    if (cond.direction) parts.push(`<div><b>Chiều</b> ${h(cond.direction.label)}</div>`);
    if (cond.level !== null) parts.push(`<div><b>Mức tham chiếu</b> ${h(formatNumber(cond.level, 4))}${cond.unit ? ` <span class="cockpit-note">(${h(cond.unit)})</span>` : ""}${cond.baselineSession ? ` <span class="cockpit-note">từ phiên ${h(cond.baselineSession)}</span>` : ""}</div>`);
    if (cond.semantic === "STANCE_RECONSIDERATION_WATCH") parts.push('<div class="cockpit-note">Biên này cho biết khi nào lệnh cấm mở vị thế mới đáng được xem xét lại — không phải tín hiệu mua.</div>');
    if (cond.reasonCode) parts.push(`<div class="cockpit-note">${h(cond.reasonCode.label)}</div>`);
    cond.warnings.forEach((w) => parts.push(`<div class="cockpit-note">${h(w)}</div>`));
    return `<div class="wb-condition" data-condition-role="${h(cond.role)}">
      <div class="wb-condition-head">${kindBadgeHtml("CONDITIONAL")} ${pillHtml(cond.statusRaw || "UNAVAILABLE", cond.role === "invalidation" ? "invalidation_state" : "confirmation_state")} ${fired}</div>
      ${parts.join("")}
      ${cond.sourceText ? `<details class="wb-tech"><summary>Mô tả gốc của Producer</summary><p lang="en">${h(cond.sourceText)}</p></details>` : ""}
    </div>`;
  }
  function referenceHtml(ref) {
    if (!ref) return "";
    const fired = ref.satisfied
      ? '<span class="cockpit-state tone-watch" data-fired="producer-reported">Producer ghi nhận đã chạm mức tham chiếu</span>'
      : '<span class="cockpit-state tone-neutral" data-fired="not-reported">Chưa chạm mức tham chiếu</span>';
    return `<div class="wb-condition" data-condition-role="reference">
      <div class="wb-condition-head">${kindBadgeHtml("CONDITIONAL")} <b>Mức kích hoạt tham chiếu</b> ${ref.level !== null ? `<strong>${h(formatNumber(ref.level, 4))}</strong>` : '<span class="cockpit-note">chưa có mức</span>'} ${fired}</div>
      ${ref.type ? `<div><b>Loại</b> ${h(ref.type.label)}</div>` : ""}
      ${ref.state ? `<div><b>Trạng thái do Producer công bố</b> ${h(ref.state.label)}</div>` : ""}
      ${ref.invalidationLevel !== null ? `<div><b>Mức vô hiệu tham chiếu</b> ${h(formatNumber(ref.invalidationLevel, 4))}${ref.invalidationMethod ? ` <span class="cockpit-note">${h(ref.invalidationMethod.label)}</span>` : ""}</div>` : ""}
      <div class="cockpit-note">Quyền mở vị thế: ${ref.entryAuthority ? "Producer đã xác lập" : "chưa được xác lập"}. Mức tham chiếu không phải điểm mua và không tự thay đổi tư thế.</div>
    </div>`;
  }

  function sectionHtml(id, title, countText, body, open) {
    return `<details class="wb-section" id="${h(id)}"${open ? " open" : ""}><summary><span class="wb-section-title">${h(title)}</span>${countText ? `<span class="wb-section-count">${h(countText)}</span>` : ""}</summary><div class="wb-section-body">${body}</div></details>`;
  }

  function legendHtml() {
    return `<details class="wb-legend"><summary>Cách đọc các nhãn bằng chứng</summary><ul>${Object.keys(EVIDENCE_KINDS).map((k) => `<li>${kindBadgeHtml(k)} ${h({
      SOURCE_FACT: "Số liệu hoặc sự kiện có nguồn công bố cụ thể (kỳ, trang, thời điểm biết).",
      PRODUCER_INFERENCE: "Phân loại hoặc lý do do Producer suy ra từ dữ liệu.",
      CONDITIONAL: "Điều kiện cho tương lai; chỉ là thiết lập, không phải sự kiện đã xảy ra.",
      RESEARCH_ONLY: "Số liệu tính từ dữ liệu nhà cung cấp, chưa phải số liệu chính thức đã kiểm chứng.",
      HISTORICAL: "Thông tin của các phiên hoặc kỳ trước.",
      MISSING: "Producer chưa có dữ liệu.", STALE: "Dữ liệu không thuộc phiên/kỳ hiện tại.", BLOCKED: "Dữ liệu bị chặn bởi điều kiện kiểm chứng.",
      INCOMPATIBLE: "Dữ liệu khác nguồn hoặc khác kỳ, không ghép được.", LIMITATION: "Giới hạn cách dùng dữ liệu.",
      HUMAN_NOTE: "Nội dung bạn tự viết; không phải dữ liệu của Producer.",
    }[k])}</li>`).join("")}</ul></details>`;
  }

  function overviewHtml(m, opts) {
    const saved = Boolean(opts && opts.saved);
    const inCompare = Boolean(opts && opts.inCompare);
    const p = m.posture;
    return `<section class="wb-overview" aria-labelledby="wb-dossier-heading" data-dossier-ticker="${h(m.ticker)}">
      <div class="wb-overview-head">
        <div><div class="section-eyebrow">Hồ sơ điều tra · phiên ${h(m.session || "—")}</div>
          <h2 id="wb-dossier-heading" class="wb-dossier-title" tabindex="-1">${h(m.ticker)} <span>${h(m.sector.label)}</span></h2></div>
        <div class="wb-posture">${p.html} ${p.evidenceCurrencyHtml}</div>
      </div>
      ${m.freshness.sessionMismatch ? `<div class="vs-alert vs-alert-warning" role="status">Dữ liệu chi tiết thuộc phiên ${h(m.freshness.cardSession)}, khác phiên đang hiển thị ${h(m.freshness.indexSession)}. Không ghép hai phiên.</div>` : ""}
      ${p.conditionClass ? `<div class="wb-keyline"><span class="cockpit-note">Phân loại điều kiện của Producer:</span> ${codeHtml(p.conditionClass.raw)}</div>` : ""}
      <div class="wb-keyline">${p.reasons.length ? p.reasons.map((r) => `<span class="cockpit-chip wb-reason" data-code="${h(r.raw)}">${h(r.label)}</span>`).join("") : '<span class="cockpit-note">Chưa có lý do ngắn được giữ lại</span>'}</div>
      ${m.adverse.length ? `<div class="wb-adverse" role="note" aria-label="Điều kiện bất lợi"><div class="wb-adverse-title">Điều kiện bất lợi đang được ghi nhận (${m.adverse.length})</div><ul>${m.adverse.map((a) => `<li${a.verbatim ? ' lang="en"' : ""} data-code="${h(a.raw)}">${h(a.label)}</li>`).join("")}</ul></div>` : '<div class="wb-adverse wb-adverse-none">Producer không ghi nhận điều kiện bất lợi riêng cho mã này ở phiên hiện tại.</div>'}
      <div class="wb-counts">
        <a href="#wb-sec-evidence" class="wb-count"><b>${m.evidence.support.length}</b><span>Bằng chứng ủng hộ</span></a>
        <a href="#wb-sec-evidence" class="wb-count wb-count-adverse"><b>${m.evidence.counter.length}</b><span>Phản biện / bất lợi</span></a>
        <a href="#wb-sec-conditions" class="wb-count"><b>${m.conditions.confirmation.filter((x) => x.available).length + m.conditions.invalidation.filter((x) => x.available).length + m.conditions.weakening.length}</b><span>Điều kiện theo dõi</span></a>
        <a href="#wb-sec-questions" class="wb-count"><b>${m.gaps.length}</b><span>Khoảng trống cần kiểm chứng</span></a>
        <a href="#wb-sec-freshness" class="wb-count"><b>${m.freshness.currentAxes}/${m.freshness.axes.length}</b><span>Trục dữ liệu hiện hành</span></a>
      </div>
      <div class="wb-actions" role="group" aria-label="Thao tác với hồ sơ">
        <button type="button" class="btn btn-sm ${saved ? "btn-outline-warning" : "btn-outline-light"}" data-wb-action="${saved ? "unsave" : "save"}" aria-pressed="${saved ? "true" : "false"}">${saved ? "Bỏ khỏi sổ nghiên cứu" : "Lưu vào sổ nghiên cứu"}</button>
        <button type="button" class="btn btn-sm btn-outline-light" data-wb-action="${inCompare ? "compare-remove" : "compare-add"}">${inCompare ? "Bỏ khỏi danh sách so sánh" : "Thêm vào so sánh"}</button>
        <button type="button" class="btn btn-sm btn-outline-light" data-wb-action="export-json">Xuất hồ sơ (JSON)</button>
        <button type="button" class="btn btn-sm btn-outline-light" data-wb-action="export-html">Tải bản in (HTML)</button>
        <button type="button" class="btn btn-sm btn-outline-light" data-wb-action="print">In hồ sơ</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-wb-action="open-drawer">Xem thẻ chi tiết đầy đủ</button>
      </div>
      <p class="cockpit-note mb-0">Tư thế và mọi nhãn là của Producer, hiển thị nguyên trạng. Hồ sơ không tạo kết luận mới, không xếp hạng, không có giá mục tiêu hay xác suất.</p>
    </section>`;
  }

  function strategyHtml(m) {
    const s = m.strategy;
    const p = m.posture;
    return `<div class="cockpit-grid mb-2">
        <div class="cockpit-kpi"><div class="label">Quyết định hành động</div><div class="value">${p.html}</div></div>
        <div class="cockpit-kpi"><div class="label">Trạng thái kỹ thuật</div><div class="value">${pillHtml(s.entryState, "tactical_state")}</div></div>
        <div class="cockpit-kpi"><div class="label">Mức sẵn sàng kỹ thuật</div><div class="value">${pillHtml(s.entryAction, "entry_action")}</div></div>
        <div class="cockpit-kpi"><div class="label">Mức sẵn sàng nghiên cứu</div><div class="value">${pillHtml(s.readiness, "research_readiness")}</div></div>
      </div>
      <div class="wb-keyline"><span class="cockpit-note">Lý do Producer nêu (theo thứ tự công bố):</span></div>
      <ul class="wb-items">${p.reasons.map(itemHtml).join("") || '<li class="cockpit-note">Chưa có lý do được giữ lại</li>'}</ul>
      ${p.secondaryScreen ? `<div class="cockpit-note mt-2">Sàng lọc nghiên cứu (phụ, không phải quyết định): ${h(p.secondaryScreen.label)}</div>` : ""}
      ${p.priority ? `<div class="cockpit-note">Ưu tiên xem xét (thứ tự kiểm tra, không thay đổi tư thế): ${h(p.priority.label)}</div>` : ""}
      ${p.policyVersion ? `<div class="cockpit-note">Phiên bản chính sách tư thế: ${h(p.policyVersion)}</div>` : ""}
      ${s.setupTags.length ? `<div class="wb-keyline mt-2"><span class="cockpit-note">Dấu hiệu kỹ thuật:</span> ${s.setupTags.map((t) => pillHtml(t, "setup_tag", "neutral")).join(" ")}</div>` : ""}
      ${s.scenarios.length ? `<h6 class="mt-3">Kịch bản có điều kiện của Producer</h6><ul class="wb-items">${s.scenarios.map((sc) => `<li class="wb-item wb-item-conditional" data-scenario="${h(sc.case)}"><div class="wb-item-head">${kindBadgeHtml("CONDITIONAL")}<span class="wb-item-label">${h(sc.caseLabel)}: ${h(sc.status.label)}</span></div><div class="wb-item-meta">${sc.reason ? `${h(sc.reason.label)} · ` : ""}${h(sc.probability.label)}</div></li>`).join("")}</ul>` : ""}
      ${s.scenarioLimitations.length ? `<ul class="cockpit-list">${s.scenarioLimitations.map((l) => `<li class="cockpit-note">${h(l.label)}</li>`).join("")}</ul>` : ""}
      <div class="cockpit-note">Giá mục tiêu: ${h(codeLabel(s.targetPriceStatus).label)} · Xác suất: ${h(codeLabel(s.probabilityStatus).label)}</div>`;
  }

  function technicalHtml(m) {
    const t = m.technical;
    const rows = [
      ["Trạng thái kỹ thuật", pillHtml(t.entryState, "tactical_state")],
      ["Mức sẵn sàng kỹ thuật", pillHtml(t.entryAction, "entry_action")],
      ["Giá hiện tại", t.price !== null ? `${h(formatNumber(t.price, 4))} <span class="cockpit-note">(${h(t.priceUnit)})</span>` : '<span class="cockpit-note">Chưa có giá được giữ lại</span>'],
      ["Xu hướng tín hiệu", `${pillHtml(t.signalVelocity.state, "signal_velocity_state")}${t.signalVelocity.reason ? ` <span class="cockpit-note">${h(t.signalVelocity.reason.label)}</span>` : ""}`],
      ["Dòng ngoại – giá", t.flow.cohort === "OUTSIDE_CURRENT_FLOW_RESEARCH_COHORT" ? '<span class="cockpit-note">Chưa thuộc nhóm theo dõi dòng ngoại</span>' : `${pillHtml(t.flow.relationship, "flow_price_relationship")} ${t.flow.foreignFlow ? pillHtml(t.flow.foreignFlow, "foreign_flow_state") : ""}${t.flow.latestSession ? ` <span class="cockpit-note">phiên ${h(t.flow.latestSession)}</span>` : ""}`],
      ["Độ rộng thị trường", pillHtml(t.market.breadth, "data_fitness", "neutral")],
      ["Dẫn dắt ngành", pillHtml(t.market.leadership, "data_fitness", "neutral")],
      ["Động lượng so với thị trường / ngành", `${pillHtml(t.market.marketBucket, "data_fitness", "neutral")} / ${pillHtml(t.market.sectorBucket, "data_fitness", "neutral")}`],
      ["Thanh khoản nghiên cứu", `${pillHtml(t.liquidity.readiness, "liquidity_state")}${t.liquidity.volume !== null ? ` · khối lượng ${h(formatNumber(t.liquidity.volume, 0))}${t.liquidity.session ? ` (phiên ${h(t.liquidity.session)})` : ""}` : ""}`],
    ];
    return `<div class="wb-dim-caveat">${h(DIMENSIONS.technical.caveat)} Thiết lập kỹ thuật vẫn được hiển thị đầy đủ dù dữ liệu tài chính thiếu.</div>
      <dl class="wb-dl">${rows.map(([k, v]) => `<div><dt>${h(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>
      <div class="cockpit-note">Năng lực thực hiện lệnh: ${h(codeLabel(t.liquidity.execution, "liquidity_state").label)}. Thanh khoản nghiên cứu không xác lập quy mô lệnh.</div>`;
  }

  function fundamentalsHtml(m) {
    const f = m.fundamentals;
    const v = m.valuation;
    const est = f.establishes;
    const head = `<div class="wb-keyline"><span class="cockpit-note">Loại hình:</span> ${pillHtml(f.entityClass === "unknown" ? "" : f.entityClass, "entity_type", "neutral")} ${f.family ? `<span class="cockpit-note">${h(f.family.label)}</span>` : ""} ${f.period ? `<span class="cockpit-note">Kỳ tài chính ${h(f.period)}</span>` : ""} ${f.freshness ? pillHtml(f.freshness, "freshness") : ""}</div>
      ${f.isBank ? '<div class="wb-bank-note">Ngân hàng dùng thước đo riêng (biên lãi ròng, nợ xấu, cho vay/huy động…). Không đọc theo biên lợi nhuận hay P/E của doanh nghiệp phi tài chính.</div>' : ""}
      ${f.limitations.length ? `<ul class="cockpit-list">${f.limitations.map((l) => `<li class="cockpit-note">${h(l)}</li>`).join("")}</ul>` : ""}`;
    const establishedHtml = est.length
      ? `<ul class="wb-items">${est.slice(0, 10).map(itemHtml).join("")}</ul>${est.length > 10 ? `<details class="wb-more"><summary>Xem thêm ${est.length - 10} mục</summary><ul class="wb-items">${est.slice(10).map(itemHtml).join("")}</ul></details>` : ""}`
      : '<p class="cockpit-note">Dữ liệu tài chính hiện chưa xác lập được chỉ tiêu nào cho mã này.</p>';
    const unavailableHtml = f.unavailable.length
      ? `<ul class="wb-items">${f.unavailable.slice(0, 8).map(itemHtml).join("")}</ul>${f.unavailable.length > 8 ? `<details class="wb-more"><summary>Xem thêm ${f.unavailable.length - 8} mục</summary><ul class="wb-items">${f.unavailable.slice(8).map(itemHtml).join("")}</ul></details>` : ""}`
      : '<p class="cockpit-note">Không có chỉ tiêu bị thiếu được ghi nhận.</p>';
    const valEst = v.establishes.length ? `<ul class="wb-items">${v.establishes.map((e) => itemHtml(Object.assign({}, e, {
      detail: [e.availability ? e.availability.label : "", e.shareBasis, e.peer ? `Đối sánh trong nhóm riêng của mã: ${e.peer.status.label}${e.peer.count !== null ? ` · ${e.peer.count} mã` : ""}` : ""].filter(Boolean).join(" · "),
    }))).join("")}</ul>` : '<p class="cockpit-note">Chưa có phương pháp định giá nào có giá trị được giữ lại.</p>';
    const valUn = v.unavailable.length ? `<ul class="wb-items">${v.unavailable.map(itemHtml).join("")}</ul>` : "";
    return `${head}
      <div class="wb-two-col">
        <div><h6>Điều dữ liệu tài chính đang xác lập</h6>${establishedHtml}</div>
        <div><h6>Điều chưa có / bị chặn</h6>${unavailableHtml}${f.unavailableStates.length ? `<p class="cockpit-note">Trạng thái Producer chưa xác định được: ${h(f.unavailableStates.map((x) => x.label).join(", "))}.</p>` : ""}${f.notApplicableCount ? `<p class="cockpit-note">${f.notApplicableCount} chỉ tiêu không áp dụng cho loại hình doanh nghiệp này (không tính là thiếu).</p>` : ""}</div>
      </div>
      <h6 class="mt-3">Định giá</h6>
      <div class="wb-keyline">${pillHtml(v.relativeState, "valuation_state")} ${v.displayState ? `<span class="cockpit-note">${h(v.displayState.label)}</span>` : ""} ${v.shareBasis ? `<span class="cockpit-note">Cơ sở: ${h(v.shareBasis.label)}</span>` : ""}</div>
      <div class="wb-dim-caveat">${h(DIMENSIONS.valuation.caveat)} Định giá nghiêm ngặt: ${v.intrinsic ? `${h(v.intrinsic.readiness.label)} — ${h(v.intrinsic.reason.label)}` : "chưa được công bố"}. Giá mục tiêu: ${h(v.targetPrice.label)}.</div>
      <div class="wb-two-col"><div><h6>Có giá trị (chỉ dùng nghiên cứu)</h6>${valEst}</div><div><h6>Chưa có / bị chặn</h6>${valUn || '<p class="cockpit-note">Không có phương pháp bị chặn.</p>'}</div></div>`;
  }

  function conditionsHtml(m) {
    const c = m.conditions;
    return `<p class="cockpit-note">Đây là các điều kiện Producer công bố để theo dõi. Một điều kiện cho phiên tương lai chưa bao giờ được hiển thị như đã xảy ra.</p>
      <h6>Xác nhận</h6>${c.confirmation.map(conditionHtml).join("")}${referenceHtml(c.reference)}
      ${c.bull ? `<div class="cockpit-note">Kịch bản tích cực: ${h(c.bull.status.label)}${c.bull.reason ? ` — ${h(c.bull.reason.label)}` : ""}</div>` : ""}
      <h6 class="mt-3">Suy yếu</h6>${c.weakening.length ? `<ul class="wb-items">${c.weakening.map((w) => `<li class="wb-item">${kindBadgeHtml(w.kind)} <span class="wb-item-label">${h(w.label)}</span>${w.detail ? `<div class="wb-item-meta">${h(w.detail)}</div>` : ""}</li>`).join("")}</ul>` : '<p class="cockpit-note">Producer chưa công bố điều kiện suy yếu riêng.</p>'}
      <h6 class="mt-3">Vô hiệu / xem xét lại</h6>${c.invalidation.map(conditionHtml).join("")}
      ${c.fundamentalInvalidation ? `<div class="wb-condition" data-condition-role="fundamental-invalidation"><div class="wb-condition-head">${kindBadgeHtml("CONDITIONAL")} <b>Vô hiệu nền tảng</b> ${pillHtml(c.fundamentalInvalidation.statusRaw, "invalidation_state")} ${c.fundamentalInvalidation.fired ? '<span class="cockpit-state tone-adverse" data-fired="producer-reported">Producer ghi nhận đã kích hoạt</span>' : '<span class="cockpit-state tone-neutral" data-fired="future">Điều kiện cho kỳ báo cáo tương lai — chưa xảy ra</span>'}</div>
        ${c.fundamentalInvalidation.dimension ? `<div><b>Khía cạnh</b> ${h(c.fundamentalInvalidation.dimension)}${c.fundamentalInvalidation.baseline ? ` · hiện tại ${h(c.fundamentalInvalidation.baseline)}` : ""}${c.fundamentalInvalidation.watch ? ` · vô hiệu nếu chuyển sang ${h(c.fundamentalInvalidation.watch)}` : ""}</div>` : ""}
        ${c.fundamentalInvalidation.asOf ? `<div class="cockpit-note">Kỳ cơ sở ${h(c.fundamentalInvalidation.asOf)}</div>` : ""}</div>` : ""}`;
  }

  function questionsHtml(m, journalEntry) {
    const userQs = journalEntry ? journalEntry.questions : [];
    const tracked = new Set(userQs.map((q) => q.gap_key).filter(Boolean));
    const byAxis = {};
    m.gaps.forEach((g) => { (byAxis[g.axis] = byAxis[g.axis] || []).push(g); });
    const groupsHtml = Object.keys(byAxis).sort().map((axis) => `<div class="wb-dim"><div class="wb-dim-head">${h(axisLabel(axis) === "Trục dữ liệu khác" ? "Khác" : axisLabel(axis))} <span class="cockpit-note">(${byAxis[axis].length})</span></div><ul class="wb-items">${byAxis[axis].map((g) => `<li class="wb-item wb-item-gap" data-gap-key="${h(g.key)}">
        <div class="wb-item-head">${kindBadgeHtml(g.kind)}<span class="wb-item-label">${h(g.label)}</span></div>
        ${g.detail ? `<div class="wb-item-meta">${h(g.detail)}${g.source ? ` · nguồn ${h(g.source)}` : ""}</div>` : ""}
        <div class="wb-question">Câu hỏi kiểm chứng: ${h(g.question.text)}</div>
        ${journalEntry ? (tracked.has(g.key) ? '<span class="cockpit-note">Đã đưa vào sổ nghiên cứu</span>' : `<button type="button" class="btn btn-sm btn-outline-light" data-wb-action="track-question" data-gap-key="${h(g.key)}">Theo dõi câu hỏi này</button>`) : ""}
      </li>`).join("")}</ul></div>`).join("");
    return `<p class="cockpit-note">Mỗi câu hỏi được tạo theo một mẫu cố định từ đúng khoảng trống dữ liệu Producer đã công bố — không phải nhận định mới.${journalEntry ? "" : " Lưu hồ sơ vào sổ nghiên cứu để theo dõi trạng thái từng câu hỏi."}</p>${groupsHtml || '<p class="cockpit-note">Producer không ghi nhận khoảng trống dữ liệu cho mã này.</p>'}`;
  }

  function freshnessHtml(m) {
    const f = m.freshness;
    return `<div class="table-responsive"><table class="cockpit-table wb-table"><thead><tr><th>Trục</th><th>Độ mới</th><th>Phiên/kỳ nguồn</th><th>Mức đủ điều kiện</th></tr></thead><tbody>${f.axes.map((a) => `<tr><td>${h(a.label)}</td><td>${pillHtml(a.freshness, "freshness")}</td><td>${h(a.source || "—")}</td><td>${h(a.qualification || "—")}</td></tr>`).join("")}</tbody></table></div>
      <p class="cockpit-note mb-1">${f.currentAxes}/${f.axes.length} trục dữ liệu ở phiên hiện tại · ${f.metricsAvailable}/${f.metricsTotal} chỉ tiêu hiển thị có giá trị. Đây là số đếm độ đầy đủ, không phải điểm đánh giá.</p>
      ${f.deepEvidence ? `<p class="cockpit-note mb-0">Bằng chứng sâu: ${h(f.deepEvidence)}</p>` : ""}`;
  }

  function provenanceHtml(m) {
    return `<p class="cockpit-note">Nguồn gốc của hồ sơ này. Hồ sơ là bản đọc lại dữ liệu đã công bố, không phải gói dữ liệu niêm phong của Producer.</p>
      <dl class="wb-dl wb-dl-mono">${m.provenance.map((r) => `<div><dt>${h(r.label)}</dt><dd class="wb-mono">${h(r.value)}</dd></div>`).join("")}</dl>`;
  }

  function notesHtml(m, entry, stale) {
    if (!entry) {
      return `<div class="wb-note-empty">${kindBadgeHtml("HUMAN_NOTE")} <span>Lưu hồ sơ vào sổ nghiên cứu để viết giả thuyết, câu hỏi và điều kiện bạn muốn theo dõi. Ghi chú chỉ nằm trong trình duyệt này.</span>
        <button type="button" class="btn btn-sm btn-outline-light" data-wb-action="save">Lưu vào sổ nghiên cứu</button></div>`;
    }
    const open = entry.questions.filter((q) => q.status === "open").length;
    return `<div class="wb-notes" data-journal-entry="${h(entry.id)}">
      <div class="wb-notes-head">${kindBadgeHtml("HUMAN_NOTE")} <span class="cockpit-note">Lưu từ phiên ${h(entry.session_saved)} · cập nhật ${h(entry.updated_at)}</span></div>
      ${stale && stale.sessionDiffers ? `<div class="vs-alert vs-alert-warning" role="status">Ghi chú được viết ở phiên ${h(entry.session_saved)}; dữ liệu đang hiển thị thuộc phiên ${h(stale.currentSession)}. Hãy đọc lại các điều kiện trước khi dùng ghi chú.</div>` : ""}
      <label class="form-label" for="wb-hypothesis">Giả thuyết của bạn</label>
      <textarea id="wb-hypothesis" class="form-control form-control-sm wb-textarea" rows="3" maxlength="${LIMITS.hypothesis}" data-wb-field="hypothesis" placeholder="Bạn đang kiểm tra điều gì về mã này?">${h(entry.hypothesis)}</textarea>
      <div class="wb-note-status cockpit-note" aria-live="polite" data-wb-save-status></div>
      <h6 class="mt-3">Câu hỏi nghiên cứu <span class="cockpit-note">(${open} đang mở / ${entry.questions.length})</span></h6>
      <ul class="wb-note-list">${entry.questions.map((q) => `<li data-question-id="${h(q.id)}" data-status="${h(q.status)}">
        <button type="button" class="btn btn-sm ${q.status === "reviewed" ? "btn-outline-success" : "btn-outline-light"}" data-wb-action="toggle-question" data-question-id="${h(q.id)}" aria-pressed="${q.status === "reviewed" ? "true" : "false"}">${q.status === "reviewed" ? "Đã xem xét" : "Đang mở"}</button>
        <span class="wb-note-text">${h(q.text)}</span>${q.origin === "producer_gap" ? ' <span class="cockpit-note">(từ khoảng trống dữ liệu)</span>' : ""}
        <button type="button" class="btn btn-sm btn-link wb-remove" data-wb-action="remove-question" data-question-id="${h(q.id)}" aria-label="Xóa câu hỏi">Xóa</button></li>`).join("") || '<li class="cockpit-note">Chưa có câu hỏi.</li>'}</ul>
      <form class="wb-inline-form" data-wb-form="question"><label class="vs-visually-hidden" for="wb-new-question">Câu hỏi mới</label><input id="wb-new-question" class="form-control form-control-sm" maxlength="${LIMITS.item}" placeholder="Thêm câu hỏi…" autocomplete="off"><button type="submit" class="btn btn-sm btn-outline-light">Thêm</button></form>
      <h6 class="mt-3">Điều kiện bạn muốn theo dõi</h6>
      <ul class="wb-note-list">${entry.conditions.map((c) => `<li data-condition-id="${h(c.id)}"><span class="wb-note-text">${h(c.text)}</span><button type="button" class="btn btn-sm btn-link wb-remove" data-wb-action="remove-condition" data-condition-id="${h(c.id)}" aria-label="Xóa điều kiện">Xóa</button></li>`).join("") || '<li class="cockpit-note">Chưa có điều kiện.</li>'}</ul>
      <form class="wb-inline-form" data-wb-form="condition"><label class="vs-visually-hidden" for="wb-new-condition">Điều kiện mới</label><input id="wb-new-condition" class="form-control form-control-sm" maxlength="${LIMITS.item}" placeholder="Ví dụ: đọc lại khi có báo cáo quý mới" autocomplete="off"><button type="submit" class="btn btn-sm btn-outline-light">Thêm</button></form>
      <p class="cockpit-note mt-2 mb-0">Ghi chú của bạn không phải dữ liệu Producer và không thay đổi tư thế nghiên cứu.</p>
    </div>`;
  }

  function dossierHtml(m, opts) {
    const o = opts || {};
    if (!m) return '<div class="cockpit-note" data-dossier-unavailable="true">Chưa có dữ liệu để lập hồ sơ cho mã này.</div>';
    const entry = o.journalEntry || null;
    const ev = m.evidence;
    return `${overviewHtml(m, { saved: Boolean(entry), inCompare: o.inCompare })}
      ${legendHtml()}
      ${sectionHtml("wb-sec-notes", "Ghi chú của bạn", entry ? `${entry.questions.filter((q) => q.status === "open").length} câu hỏi đang mở` : "chưa lưu", notesHtml(m, entry, o.stale), Boolean(entry))}
      ${sectionHtml("wb-sec-posture", "Tư thế & chiến lược của Producer", m.posture.conditionClass ? m.posture.conditionClass.label : "", strategyHtml(m), false)}
      ${sectionHtml("wb-sec-evidence", "Bằng chứng ủng hộ & phản biện", `${ev.support.length} ủng hộ · ${ev.counter.length} phản biện`, `<p class="cockpit-note">"Ủng hộ" và "phản biện" chỉ phân theo chiều của chính mã điều kiện Producer công bố (tích cực hay bất lợi), nhóm theo khía cạnh. Việc phân nhóm không thay đổi tư thế và không cân đo bên nào thắng.</p><div class="wb-two-col"><div><h6>Bằng chứng ủng hộ</h6>${itemsByDimensionHtml(ev.support, "Producer chưa ghi nhận bằng chứng ủng hộ cho phiên này.")}</div><div><h6>Phản biện / bất lợi</h6>${itemsByDimensionHtml(ev.counter, "Producer chưa ghi nhận phản luận cho phiên này.")}</div></div>${ev.neutral.length ? `<h6 class="mt-3">Lý do trung tính / đang chờ</h6>${itemsByDimensionHtml(ev.neutral, "")}` : ""}`, false)}
      ${sectionHtml("wb-sec-technical", "Kỹ thuật & thị trường", "", technicalHtml(m), false)}
      ${sectionHtml("wb-sec-fundamentals", "Cơ bản & định giá: đã xác lập và chưa có", `${m.fundamentals.establishes.length + m.valuation.establishes.length} xác lập · ${m.fundamentals.unavailable.length + m.valuation.unavailable.length} chưa có`, fundamentalsHtml(m), false)}
      ${sectionHtml("wb-sec-conditions", "Điều kiện xác nhận, suy yếu và vô hiệu", "", conditionsHtml(m), false)}
      ${sectionHtml("wb-sec-questions", "Câu hỏi chưa có lời giải", `${m.gaps.length} khoảng trống`, questionsHtml(m, entry), false)}
      ${sectionHtml("wb-sec-freshness", "Độ mới & độ đầy đủ của bằng chứng", `${m.freshness.currentAxes}/${m.freshness.axes.length} hiện hành`, freshnessHtml(m), false)}
      ${sectionHtml("wb-sec-history", "Lịch sử công khai", "", o.historyHtml || historyPlaceholderHtml(), false)}
      ${sectionHtml("wb-sec-provenance", "Nguồn gốc dữ liệu", "", provenanceHtml(m), false)}`;
  }

  // ---------------------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------------------
  const COMPARE_REFUSALS = Object.freeze({
    TOO_FEW: `Chọn ít nhất ${MIN_COMPARE} mã để so sánh.`,
    TOO_MANY: `Chỉ so sánh tối đa ${MAX_COMPARE} mã một lần.`,
    DUPLICATE: "Danh sách có mã bị trùng; mỗi mã chỉ xuất hiện một lần.",
    INVALID_TICKER: "Có mã không hợp lệ.",
    UNKNOWN_TICKER: "Có mã không có trong dữ liệu phiên hiện tại.",
    SESSION_MISMATCH: "Liên kết so sánh thuộc một phiên khác phiên dữ liệu đang hiển thị. Không ghép dữ liệu của hai phiên.",
    MIXED_SESSION_DETAIL: "Dữ liệu chi tiết của các mã không cùng một phiên. Không so sánh.",
  });

  function parseTickerList(value) {
    if (Array.isArray(value)) return value.map((t) => String(t));
    return String(value || "").split(/[\s,;]+/).filter(Boolean);
  }

  function validateComparisonRequest(rawTickers, indexDoc, requestedSession) {
    const errors = [];
    const list = parseTickerList(rawTickers).map((t) => String(t).trim().toUpperCase()).filter(Boolean);
    const session = str(obj(indexDoc).as_of_session);
    const invalid = list.filter((t) => !TICKER_RE.test(t));
    if (invalid.length) errors.push({ code: "INVALID_TICKER", label: COMPARE_REFUSALS.INVALID_TICKER, tickers: invalid.slice(0, 5) });
    const valid = list.filter((t) => TICKER_RE.test(t));
    const unique = Array.from(new Set(valid));
    if (unique.length !== valid.length) errors.push({ code: "DUPLICATE", label: COMPARE_REFUSALS.DUPLICATE });
    const cards = obj(obj(indexDoc).cards);
    const unknown = unique.filter((t) => !cards[t]);
    if (unknown.length) errors.push({ code: "UNKNOWN_TICKER", label: COMPARE_REFUSALS.UNKNOWN_TICKER, tickers: unknown });
    if (unique.length < MIN_COMPARE) errors.push({ code: "TOO_FEW", label: COMPARE_REFUSALS.TOO_FEW });
    if (unique.length > MAX_COMPARE) errors.push({ code: "TOO_MANY", label: COMPARE_REFUSALS.TOO_MANY });
    if (requestedSession && requestedSession !== session) errors.push({ code: "SESSION_MISMATCH", label: COMPARE_REFUSALS.SESSION_MISMATCH, requestedSession, session });
    const mixed = unique.filter((t) => cards[t] && str(cards[t].as_of_session) && str(cards[t].as_of_session) !== session);
    if (mixed.length) errors.push({ code: "MIXED_SESSION_DETAIL", label: COMPARE_REFUSALS.MIXED_SESSION_DETAIL, tickers: mixed });
    return { ok: errors.length === 0, tickers: unique, session, errors };
  }

  // The only cross-security statistics this page may compute are the ones the published contract
  // names explicitly. workspace_index/v1 names none (and blocks ranking and scoring), so the
  // permitted list is empty and every number is shown side by side instead.
  function permittedCrossSecurityStatistics(indexDoc) {
    const declared = obj(indexDoc).permitted_cross_security_statistics;
    return Array.isArray(declared) ? declared.filter((s) => typeof s === "string") : [];
  }

  const COMPARE_VALUATION_METHODS = ["P/E", "P/B", "P/S", "EV/Sales", "EV/EBITDA", "P/E_TTM", "P/S_TTM", "P/B_CURRENT_RESEARCH"];
  const COMPARE_FEATURES = ["equity_to_assets", "debt_to_assets", "cash_to_assets", "current_ratio", "assets_yoy", "equity_yoy", "revenue_same_quarter_yoy", "net_income_same_quarter_yoy", "gross_margin", "net_margin"];
  const NC_REASONS = Object.freeze({
    DETAIL_UNAVAILABLE: "Chưa tải được dữ liệu chi tiết",
    VALUE_MISSING: "Không có giá trị được giữ lại",
    METHOD_BLOCKED: "Phương pháp bị chặn",
    PERIOD_DIFFERS: "Khác kỳ dữ liệu",
    SHARE_BASIS_DIFFERS: "Khác cơ sở số cổ phiếu",
    ENTITY_CLASS_DIFFERS: "Khác loại hình (ngân hàng / phi ngân hàng)",
    METHOD_DIFFERS: "Khác phương pháp tính",
    SCOPE_DIFFERS: "Khác phạm vi báo cáo",
    NOT_APPLICABLE: "Không áp dụng cho loại hình",
  });

  function compareRow(kind, id, label, cells) {
    const reasons = new Set();
    if (cells.some((cl) => cl.reason)) cells.forEach((cl) => { if (cl.reason) reasons.add(cl.reason); });
    if (!reasons.size) {
      const keys = ["period", "shareBasis", "entityClass", "method", "scope"];
      const codes = { period: "PERIOD_DIFFERS", shareBasis: "SHARE_BASIS_DIFFERS", entityClass: "ENTITY_CLASS_DIFFERS", method: "METHOD_DIFFERS", scope: "SCOPE_DIFFERS" };
      keys.forEach((k) => {
        const vals = new Set(cells.map((cl) => cl[k] === undefined ? "" : String(cl[k])));
        if (vals.size > 1) reasons.add(codes[k]);
      });
    }
    return { kind, id, label, cells, comparable: reasons.size === 0, reasons: Array.from(reasons).map((r) => ({ code: r, label: NC_REASONS[r] })) };
  }

  function buildComparison(entries, ctx) {
    const context = obj(ctx);
    const list = arr(entries);
    const tickers = list.map((e) => e.ticker);
    const models = list.map((e) => ({ ticker: e.ticker, thin: obj(e.thin), detail: e.detail ? obj(e.detail) : null, entityClass: entityClassOf(e.detail || e.thin), industry: industryOf((e.detail || e.thin || {}).sector) }));
    const classes = new Set(models.map((m) => m.entityClass));
    const bankMix = classes.has("bank") && classes.size > 1;
    const producerState = models.map((m) => {
      const c = m.detail || m.thin;
      const pres = getCardPresentation();
      return {
        ticker: m.ticker, postureHtml: pres ? pres.actionPostureHtml(c) : h(c.research_action_posture), postureRaw: c.research_action_posture || null,
        evidenceCurrencyHtml: pres ? pres.evidenceCurrencyHtml(c.evidence_currency) : "", conditionClass: c.posture_condition_class ? codeLabel(c.posture_condition_class).label : "",
        entryState: c.entry_state || null, sector: sectorDisplay(c.sector), entityClass: m.entityClass,
      };
    });
    const valuationRows = COMPARE_VALUATION_METHODS.map((id) => {
      const cells = models.map((m) => {
        if (!m.detail) return { ticker: m.ticker, reason: "DETAIL_UNAVAILABLE" };
        const md = obj(obj(obj(m.detail.valuation).method_diagnostics)[id]);
        if (!Object.keys(md).length) return { ticker: m.ticker, reason: "VALUE_MISSING" };
        const base = { ticker: m.ticker, period: str(md.period_basis), shareBasis: str(md.share_basis), entityClass: m.entityClass, status: str(md.status) };
        if (md.availability_state === "NOT_AVAILABLE" || /BLOCK/.test(str(md.status))) return Object.assign(base, { reason: "METHOD_BLOCKED", detail: codeLabel(arr(md.blocker_reason_codes)[0] || md.status, "diagnostic_reason").label });
        if (!hasValue(md.value)) return Object.assign(base, { reason: "VALUE_MISSING" });
        return Object.assign(base, { value: md.value, display: `${formatNumber(md.value, 2)}×`, availability: codeLabel(md.availability_state, "availability_state").label });
      });
      return compareRow("valuation", id, methodLabel(id), cells);
    }).filter((row) => row.cells.some((cl) => cl.reason !== "VALUE_MISSING" || cl.value !== undefined) && row.cells.some((cl) => cl.reason !== "DETAIL_UNAVAILABLE"));
    const featureRows = COMPARE_FEATURES.map((id) => {
      const cells = models.map((m) => {
        if (!m.detail) return { ticker: m.ticker, reason: "DETAIL_UNAVAILABLE" };
        const ff = obj(obj(obj(obj(obj(m.detail.why).financial_analysis).compact).feature_fitness)[id]);
        if (!Object.keys(ff).length) return { ticker: m.ticker, reason: "VALUE_MISSING" };
        const f = featureRecord(id, ff);
        const base = { ticker: m.ticker, period: f.periods.join("→") || f.asOf, method: f.method, scope: f.scope.join(","), entityClass: m.entityClass };
        if (f.notApplicable) return Object.assign(base, { reason: "NOT_APPLICABLE" });
        if (!f.ready) return Object.assign(base, { reason: f.blocked ? "METHOD_BLOCKED" : "VALUE_MISSING", detail: f.reasons[0] ? codeLabel(f.reasons[0]).label : "" });
        return Object.assign(base, { value: f.value, display: f.valueText, provider: f.providers.join(", ") });
      });
      return compareRow("fundamental", id, featureLabel(id), cells);
    }).filter((row) => row.cells.some((cl) => cl.value !== undefined));
    const byIndustry = {};
    models.forEach((m) => { if (m.industry) (byIndustry[m.industry] = byIndustry[m.industry] || []).push(m.ticker); });
    const sameSectorGroups = Object.keys(byIndustry).filter((k) => byIndustry[k].length >= 2).map((k) => ({ industry: k, tickers: byIndustry[k] }));
    const sectorContext = models.map((m) => {
      const c = m.detail || m.thin;
      const src = obj(obj(c.market_sector).sector_relative_context);
      return { ticker: m.ticker, industry: m.industry, sector: sectorDisplay(c.sector), leadership: src.leadership_state || null, sectorBucket: src.sector_relative_momentum_bucket || null, marketBucket: src.market_relative_momentum_bucket || null };
    });
    const descriptive = models.map((m) => {
      const c = m.detail || m.thin;
      const fresh = obj(obj(c.lineage).per_axis_freshness);
      const axes = Object.keys(fresh);
      return {
        ticker: m.ticker, entryState: c.entry_state || null, signalVelocity: obj(c.signal_velocity).overall_transition_state || null,
        flow: obj(c.flow_price).cohort_membership === "OUTSIDE_CURRENT_FLOW_RESEARCH_COHORT" ? "OUTSIDE" : (obj(c.flow_price).relationship || null),
        valuationLabel: obj(c.valuation).relative_research_state || null, fundamentalState: obj(c.fundamental).state || null,
        currentAxes: axes.filter((a) => fresh[a] === "CURRENT").length, totalAxes: axes.length,
      };
    });
    const rows = valuationRows.concat(featureRows);
    return {
      tickers, session: context.session || null, bankMix, entityClasses: Array.from(classes),
      producerState, comparable: rows.filter((r) => r.comparable), notComparable: rows.filter((r) => !r.comparable),
      sameSectorGroups, sectorContext, descriptive,
      permittedStatistics: permittedCrossSecurityStatistics(context.indexDoc),
      blockedOutputs: Object.entries(obj(obj(context.indexDoc).blocked_outputs)).map(([k, v]) => ({ key: k, label: codeLabel(k).label, state: codeLabel(v).label })),
      detailMissing: models.filter((m) => !m.detail).map((m) => m.ticker),
    };
  }

  function periodText(period) {
    const raw = String(period || "");
    return /^\d{4}/.test(raw) ? raw : codeLabel(raw).label;
  }
  function compareCellHtml(cell) {
    if (cell.value !== undefined) return `<strong>${h(cell.display)}</strong>${cell.period ? `<div class="cockpit-note">${h(periodText(cell.period))}</div>` : ""}`;
    return `<span class="cockpit-note">${h(NC_REASONS[cell.reason] || "Chưa có dữ liệu")}${cell.detail ? ` · ${h(cell.detail)}` : ""}</span>${cell.period ? `<div class="cockpit-note">${h(periodText(cell.period))}</div>` : ""}`;
  }
  function compareTableHtml(rows, tickers, mode) {
    if (!rows.length) return `<p class="cockpit-note">${mode === "comparable" ? "Không có chỉ tiêu nào cùng phương pháp, cùng kỳ và cùng cơ sở cho các mã đã chọn." : "Không có hàng nào bị loại."}</p>`;
    return `<div class="table-responsive"><table class="cockpit-table wb-table wb-compare-table"><thead><tr><th>Chỉ tiêu</th>${tickers.map((t) => `<th>${h(t)}</th>`).join("")}${mode === "comparable" ? "" : "<th>Lý do không so sánh</th>"}</tr></thead><tbody>${rows.map((r) => `<tr data-compare-row="${h(r.id)}" data-comparable="${r.comparable ? "true" : "false"}"><th scope="row">${h(r.label)}${mode === "comparable" ? "" : ' <span class="cockpit-state tone-watch">KHÔNG SO SÁNH ĐƯỢC</span>'}</th>${r.cells.map((cl) => `<td>${compareCellHtml(cl)}</td>`).join("")}${mode === "comparable" ? "" : `<td>${h(r.reasons.map((x) => x.label).join(" · "))}</td>`}</tr>`).join("")}</tbody></table></div>`;
  }

  function comparisonHtml(cmp, opts) {
    const o = opts || {};
    if (!cmp) return "";
    const t = cmp.tickers;
    return `<section class="wb-compare-result" aria-labelledby="wb-compare-heading">
      <h2 id="wb-compare-heading" class="h5" tabindex="-1">So sánh ${h(t.join(", "))} · phiên ${h(cmp.session || "—")}</h2>
      <p class="cockpit-note">Thứ tự giữ nguyên như bạn chọn. Không có điểm, xếp hạng hay mã "thắng". Mỗi tư thế là của Producer cho từng mã.</p>
      <div class="wb-actions" role="group" aria-label="Thao tác với so sánh">
        <button type="button" class="btn btn-sm ${o.saved ? "btn-outline-warning" : "btn-outline-light"}" data-wb-action="${o.saved ? "compare-unsave" : "compare-save"}" aria-pressed="${o.saved ? "true" : "false"}">${o.saved ? "Bỏ khỏi sổ nghiên cứu" : "Lưu so sánh vào sổ"}</button>
        <button type="button" class="btn btn-sm btn-outline-light" data-wb-action="compare-export-json">Xuất so sánh (JSON)</button>
        <button type="button" class="btn btn-sm btn-outline-light" data-wb-action="compare-export-html">Tải bản in (HTML)</button>
      </div>
      ${cmp.detailMissing.length ? `<div class="vs-alert vs-alert-warning" role="status">Chưa tải được dữ liệu chi tiết cho ${h(cmp.detailMissing.join(", "))}; các ô liên quan được đánh dấu chưa có dữ liệu.</div>` : ""}
      <h3 class="h6 mt-3">Tư thế của Producer (đặt cạnh nhau)</h3>
      <div class="table-responsive"><table class="cockpit-table wb-table"><thead><tr><th>Mã</th><th>Quyết định hành động</th><th>Phân loại điều kiện</th><th>Kỹ thuật</th><th>Loại hình</th></tr></thead><tbody>${cmp.producerState.map((p) => `<tr><th scope="row"><a href="investment-workspace.html?view=dossier&amp;ticker=${encodeURIComponent(p.ticker)}" data-wb-open-dossier="${h(p.ticker)}">${h(p.ticker)}</a></th><td>${p.postureHtml} ${p.evidenceCurrencyHtml}</td><td>${h(p.conditionClass || "—")}</td><td>${pillHtml(p.entryState, "tactical_state")}</td><td>${h(codeLabel(p.entityClass === "unknown" ? "" : p.entityClass, "entity_type").label)}</td></tr>`).join("")}</tbody></table></div>
      ${cmp.bankMix ? '<div class="wb-bank-note" role="note"><b>Ngân hàng và doanh nghiệp phi ngân hàng</b>: mô hình kinh tế khác nhau (thu nhập lãi, nợ xấu, đòn bẩy theo quy định). Các chỉ số như P/E, P/S, EV/Doanh thu hay biên lợi nhuận được đánh dấu không so sánh được giữa hai nhóm.</div>' : ""}
      <h3 class="h6 mt-3">Số liệu cùng phương pháp, cùng kỳ, cùng cơ sở</h3>
      <p class="cockpit-note">Chỉ đặt cạnh nhau. Không tính chênh lệch, trung bình hay thứ hạng.</p>
      ${compareTableHtml(cmp.comparable, t, "comparable")}
      <h3 class="h6 mt-3">Thống kê liên mã</h3>
      <p class="cockpit-note">${cmp.permittedStatistics.length ? `Hợp đồng dữ liệu cho phép: ${h(cmp.permittedStatistics.join(", "))}.` : "Hợp đồng dữ liệu đã công bố không cho phép phép tính liên mã nào, nên trang không tính."}${cmp.blockedOutputs.length ? ` Đầu ra bị chặn: ${h(cmp.blockedOutputs.map((b) => `${b.label} (${b.state})`).join(" · "))}.` : ""}</p>
      <h3 class="h6 mt-3">Bối cảnh cùng ngành</h3>
      ${cmp.sameSectorGroups.length ? cmp.sameSectorGroups.map((g) => `<div class="wb-dim"><div class="wb-dim-head">${h(g.industry)}: ${h(g.tickers.join(", "))}</div><ul class="cockpit-list">${cmp.sectorContext.filter((s) => g.tickers.includes(s.ticker)).map((s) => `<li>${h(s.ticker)}: dẫn dắt ngành ${h(codeLabel(s.leadership, "data_fitness").label)} · động lượng so với ngành ${h(codeLabel(s.sectorBucket, "data_fitness").label)}</li>`).join("")}</ul><div class="cockpit-note">Bối cảnh do Producer công bố cho từng mã; không xếp hạng trong ngành.</div></div>`).join("") : '<p class="cockpit-note">Không có cặp mã nào được công bố cùng một ngành chi tiết. Phân loại hiện có chủ yếu là loại hình doanh nghiệp, chưa đủ để coi là cùng ngành.</p>'}
      <h3 class="h6 mt-3">Quan sát mô tả (khác ngành / khác loại hình)</h3>
      <p class="cockpit-note">Mô tả trạng thái từng mã, không phải so sánh.</p>
      <div class="table-responsive"><table class="cockpit-table wb-table"><thead><tr><th>Mã</th><th>Ngành / loại hình</th><th>Kỹ thuật</th><th>Xu hướng tín hiệu</th><th>Dòng ngoại – giá</th><th>Nền tảng</th><th>Nhãn định giá (nhóm riêng)</th><th>Trục hiện hành</th></tr></thead><tbody>${cmp.descriptive.map((d) => {
        const sc = cmp.sectorContext.find((s) => s.ticker === d.ticker) || {};
        return `<tr><th scope="row">${h(d.ticker)}</th><td>${h(sc.industry || sc.sector || "—")}</td><td>${pillHtml(d.entryState, "tactical_state")}</td><td>${pillHtml(d.signalVelocity, "signal_velocity_state")}</td><td>${d.flow === "OUTSIDE" ? '<span class="cockpit-note">Chưa theo dõi</span>' : pillHtml(d.flow, "flow_price_relationship")}</td><td>${pillHtml(d.fundamentalState, "fundamental_state")}</td><td>${pillHtml(d.valuationLabel, "valuation_state")}</td><td>${d.currentAxes}/${d.totalAxes}</td></tr>`;
      }).join("")}</tbody></table></div>
      <h3 class="h6 mt-3">So sánh không đủ điều kiện</h3>
      <p class="cockpit-note">Các chỉ tiêu dưới đây được hiển thị cạnh nhau nhưng KHÔNG so sánh được, kèm lý do.</p>
      ${compareTableHtml(cmp.notComparable, t, "not")}
    </section>`;
  }

  function refusalHtml(validation) {
    return `<div class="vs-alert vs-alert-warning" role="alert" data-compare-refused="true"><b>Không so sánh.</b><ul class="mb-0">${validation.errors.map((e) => `<li data-refusal="${h(e.code)}">${h(e.label)}${e.tickers && e.tickers.length ? ` (${h(e.tickers.join(", "))})` : ""}${e.requestedSession ? ` Phiên trong liên kết: ${h(e.requestedSession)}; phiên hiện tại: ${h(e.session)}.` : ""}</li>`).join("")}</ul></div>`;
  }

  // ---------------------------------------------------------------------------------------
  // Personal research journal (browser storage only)
  // ---------------------------------------------------------------------------------------
  function sanitizeText(value, max) {
    if (typeof value !== "string") return "";
    let s = typeof value.normalize === "function" ? value.normalize("NFC") : value;
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[‪-‮⁦-⁩​-‏﻿]/g, "").replace(/\r\n?/g, "\n").trim();
    if (max && s.length > max) s = s.slice(0, max);
    return s;
  }
  // Untrusted timestamps: well-formed and not in the future, otherwise replaced by `fallback`.
  function validIso(value, fallback) {
    if (typeof value !== "string" || !ISO_RE.test(value)) return fallback;
    const t = Date.parse(value);
    return Number.isFinite(t) && t <= Date.parse(fallback) + 86400000 ? value : fallback;
  }
  function nowIso(now) { return (now instanceof Date ? now : new Date()).toISOString().replace(/\.\d{3}Z$/, "Z"); }
  function entryIdFor(kind, tickers) {
    return kind === "comparison" ? `comparison:${tickers.slice().sort().join("+")}` : `dossier:${tickers[0]}`;
  }
  function emptyJournal() { return { schema_version: JOURNAL_SCHEMA, entries: [] }; }

  function normalizeQuestion(raw, usedIds, stamp) {
    const q = obj(raw);
    const text = sanitizeText(q.text, LIMITS.item);
    if (!text) return null;
    let id = typeof q.id === "string" && /^[a-z0-9-]{1,40}$/.test(q.id) ? q.id : `q-${stableHash(text)}`;
    while (usedIds.has(id)) id = `${id.slice(0, 34)}-${stableHash(id + usedIds.size)}`.slice(0, 40);
    usedIds.add(id);
    const gapKey = typeof q.gap_key === "string" && q.gap_key.length <= 160 && /^[A-Za-z0-9_|:+\-./]+$/.test(q.gap_key) ? q.gap_key : null;
    return { id, text, status: q.status === "reviewed" ? "reviewed" : "open", origin: q.origin === "producer_gap" && gapKey ? "producer_gap" : "user", gap_key: gapKey, created_at: validIso(q.created_at, stamp) };
  }
  function normalizeCondition(raw, usedIds, stamp) {
    const c = obj(raw);
    const text = sanitizeText(c.text, LIMITS.item);
    if (!text) return null;
    let id = typeof c.id === "string" && /^[a-z0-9-]{1,40}$/.test(c.id) ? c.id : `c-${stableHash(text)}`;
    while (usedIds.has(id)) id = `${id.slice(0, 34)}-${stableHash(id + usedIds.size)}`.slice(0, 40);
    usedIds.add(id);
    return { id, text, created_at: validIso(c.created_at, stamp) };
  }

  // Builds a clean entry from untrusted input. Identity is always re-derived from the tickers,
  // never trusted from the input. Unknown fields (including any holdings) are dropped.
  function normalizeEntry(raw, stamp) {
    const e = obj(raw);
    const kind = e.kind === "comparison" ? "comparison" : "dossier";
    const tickers = Array.from(new Set(arr(e.tickers).map(normTicker).filter(Boolean)));
    if (kind === "dossier" && tickers.length !== 1) return null;
    if (kind === "comparison" && (tickers.length < MIN_COMPARE || tickers.length > MAX_COMPARE)) return null;
    const usedQ = new Set();
    const usedC = new Set();
    const questions = arr(e.questions).slice(0, LIMITS.questions).map((q) => normalizeQuestion(q, usedQ, stamp)).filter(Boolean);
    const conditions = arr(e.conditions).slice(0, LIMITS.conditions).map((c) => normalizeCondition(c, usedC, stamp)).filter(Boolean);
    const seenText = new Set();
    const dedupQ = questions.filter((q) => { const k = q.text.toLowerCase(); if (seenText.has(k)) return false; seenText.add(k); return true; });
    return {
      id: entryIdFor(kind, tickers), kind, tickers,
      session_saved: typeof e.session_saved === "string" && SESSION_RE.test(e.session_saved) ? e.session_saved : null,
      saved_at: validIso(e.saved_at, stamp), updated_at: validIso(e.updated_at, stamp),
      hypothesis: sanitizeText(e.hypothesis, LIMITS.hypothesis), questions: dedupQ, conditions,
    };
  }

  function normalizeJournal(raw, now) {
    const stamp = nowIso(now);
    const j = obj(raw);
    if (j.schema_version !== JOURNAL_SCHEMA) return null;
    const out = emptyJournal();
    const ids = new Set();
    arr(j.entries).slice(0, LIMITS.entries).forEach((e) => {
      const n = normalizeEntry(e, stamp);
      if (n && !ids.has(n.id)) { ids.add(n.id); out.entries.push(n); }
    });
    return out;
  }

  function loadJournal(storage) {
    let store = storage;
    try { if (!store && typeof localStorage !== "undefined") store = localStorage; } catch (err) { store = null; }
    if (!store) return { status: "unavailable", journal: emptyJournal() };
    let raw;
    try { raw = store.getItem(JOURNAL_STORAGE_KEY); } catch (err) { return { status: "unavailable", journal: emptyJournal() }; }
    if (!raw) return { status: "empty", journal: emptyJournal() };
    try {
      const parsed = JSON.parse(raw);
      const journal = normalizeJournal(parsed);
      return journal ? { status: "ok", journal } : { status: "corrupt", journal: emptyJournal() };
    } catch (err) {
      return { status: "corrupt", journal: emptyJournal() };
    }
  }
  function saveJournal(storage, journal) {
    let store = storage;
    try { if (!store && typeof localStorage !== "undefined") store = localStorage; } catch (err) { store = null; }
    if (!store) return false;
    try { store.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journal)); return true; } catch (err) { return false; }
  }
  function clearJournal(storage) {
    try { (storage || localStorage).removeItem(JOURNAL_STORAGE_KEY); return true; } catch (err) { return false; }
  }

  function findEntry(journal, id) { return arr(obj(journal).entries).find((e) => e.id === id) || null; }
  function upsertEntry(journal, kind, tickers, session, now) {
    const stamp = nowIso(now);
    const clean = Array.from(new Set(arr(tickers).map(normTicker).filter(Boolean)));
    const id = entryIdFor(kind, clean);
    const existing = findEntry(journal, id);
    if (existing) return { journal, entry: existing, created: false };
    if (journal.entries.length >= LIMITS.entries) return { journal, entry: null, created: false, error: "LIMIT" };
    const entry = normalizeEntry({ kind, tickers: clean, session_saved: session, saved_at: stamp, updated_at: stamp }, stamp);
    if (!entry) return { journal, entry: null, created: false, error: "INVALID" };
    journal.entries.push(entry);
    return { journal, entry, created: true };
  }
  function removeEntry(journal, id) { journal.entries = journal.entries.filter((e) => e.id !== id); return journal; }
  function touch(entry, now) { entry.updated_at = nowIso(now); return entry; }
  function setHypothesis(entry, text, now) { entry.hypothesis = sanitizeText(text, LIMITS.hypothesis); return touch(entry, now); }
  function addQuestion(entry, text, origin, gapKey, now) {
    if (entry.questions.length >= LIMITS.questions) return null;
    const used = new Set(entry.questions.map((q) => q.id));
    const q = normalizeQuestion({ text, origin, gap_key: gapKey, created_at: nowIso(now) }, used, nowIso(now));
    if (!q) return null;
    if (entry.questions.some((x) => x.text.toLowerCase() === q.text.toLowerCase() || (gapKey && x.gap_key === gapKey))) return null;
    entry.questions.push(q);
    touch(entry, now);
    return q;
  }
  function setQuestionStatus(entry, id, status, now) {
    const q = entry.questions.find((x) => x.id === id);
    if (!q) return null;
    q.status = status === "reviewed" ? "reviewed" : "open";
    touch(entry, now);
    return q;
  }
  function removeQuestion(entry, id, now) { entry.questions = entry.questions.filter((q) => q.id !== id); return touch(entry, now); }
  function addCondition(entry, text, now) {
    if (entry.conditions.length >= LIMITS.conditions) return null;
    const used = new Set(entry.conditions.map((c) => c.id));
    const c = normalizeCondition({ text, created_at: nowIso(now) }, used, nowIso(now));
    if (!c || entry.conditions.some((x) => x.text.toLowerCase() === c.text.toLowerCase())) return null;
    entry.conditions.push(c);
    touch(entry, now);
    return c;
  }
  function removeCondition(entry, id, now) { entry.conditions = entry.conditions.filter((c) => c.id !== id); return touch(entry, now); }

  function entryStaleness(entry, indexDoc) {
    const cards = obj(obj(indexDoc).cards);
    const currentSession = str(obj(indexDoc).as_of_session) || null;
    const missing = entry.tickers.filter((t) => !cards[t]);
    return { missingTickers: missing, sessionDiffers: Boolean(entry.session_saved && currentSession && entry.session_saved !== currentSession), currentSession };
  }

  function exportJournal(journal, now) {
    return {
      schema_version: JOURNAL_SCHEMA, export_kind: "USER_RESEARCH_JOURNAL", exported_at: nowIso(now),
      privacy_note: "Ghi chú cá nhân do người dùng viết, chỉ lưu trong trình duyệt. Không chứa vị thế nắm giữ.",
      not_a_sealed_producer_packet: true, entries: journal.entries,
    };
  }

  // Merging never silently replaces what is already in this browser: a differing imported
  // hypothesis is appended under a label, existing question statuses stay as they are, and new
  // questions/conditions are added with fresh identities when an imported id collides.
  function mergeEntry(target, incoming, stamp) {
    let changed = false;
    if (incoming.hypothesis && incoming.hypothesis !== target.hypothesis) {
      target.hypothesis = target.hypothesis
        ? sanitizeText(`${target.hypothesis}

[Nhập từ tệp] ${incoming.hypothesis}`, LIMITS.hypothesis)
        : incoming.hypothesis;
      changed = true;
    }
    const usedIds = new Set(target.questions.map((q) => q.id));
    const texts = new Set(target.questions.map((q) => q.text.toLowerCase()));
    incoming.questions.forEach((q) => {
      if (target.questions.length >= LIMITS.questions || texts.has(q.text.toLowerCase())) return;
      const copy = Object.assign({}, q);
      while (usedIds.has(copy.id)) copy.id = `${copy.id.slice(0, 32)}-${stableHash(copy.id + usedIds.size)}`.slice(0, 40);
      usedIds.add(copy.id);
      texts.add(copy.text.toLowerCase());
      target.questions.push(copy);
      changed = true;
    });
    const ctexts = new Set(target.conditions.map((c) => c.text.toLowerCase()));
    const cids = new Set(target.conditions.map((c) => c.id));
    incoming.conditions.forEach((c) => {
      if (target.conditions.length >= LIMITS.conditions || ctexts.has(c.text.toLowerCase())) return;
      const copy = Object.assign({}, c);
      while (cids.has(copy.id)) copy.id = `${copy.id.slice(0, 32)}-${stableHash(copy.id + cids.size)}`.slice(0, 40);
      cids.add(copy.id);
      ctexts.add(copy.text.toLowerCase());
      target.conditions.push(copy);
      changed = true;
    });
    if (changed) target.updated_at = stamp;
    if (!target.session_saved && incoming.session_saved) target.session_saved = incoming.session_saved;
    return target;
  }

  // Safe import of a journal export or of a dossier export's labelled user-notes section.
  // Never throws; returns the merged journal plus a report the page shows verbatim.
  function importJournal(current, text, ctx) {
    const context = obj(ctx);
    const report = { ok: false, error: null, added: 0, merged: 0, duplicatesInFile: 0, invalid: 0, overLimit: 0, sanitized: 0, staleTickers: [], sessionDiffers: 0, ignoredHoldings: false };
    const base = normalizeJournal(current || emptyJournal(), context.now) || emptyJournal();
    if (typeof text !== "string" || !text.trim()) { report.error = "EMPTY_FILE"; return { journal: base, report }; }
    if (text.length > LIMITS.importBytes) { report.error = "FILE_TOO_LARGE"; return { journal: base, report }; }
    let parsed;
    try { parsed = JSON.parse(text); } catch (err) { report.error = "NOT_JSON"; return { journal: base, report }; }
    const doc = obj(parsed);
    let rawEntries;
    if (doc.schema_version === JOURNAL_SCHEMA) rawEntries = arr(doc.entries);
    else if (doc.schema_version === EXPORT_SCHEMA) rawEntries = arr(obj(doc.user_notes).entries);
    else { report.error = "UNSUPPORTED_SCHEMA"; return { journal: base, report }; }
    const blob = JSON.stringify(parsed);
    report.ignoredHoldings = /"(positions|normalized_positions|holdings|weight|quantity)"\s*:/.test(blob);
    const stamp = nowIso(context.now);
    const cards = obj(obj(context.indexDoc).cards);
    const currentSession = str(obj(context.indexDoc).as_of_session);
    const seenInFile = new Set();
    rawEntries.forEach((rawEntry) => {
      const n = normalizeEntry(rawEntry, stamp);
      if (!n) { report.invalid++; return; }
      const re = obj(rawEntry);
      const rawTexts = [re.hypothesis].concat(arr(re.questions).map((q) => obj(q).text), arr(re.conditions).map((c) => obj(c).text)).filter((x) => typeof x === "string");
      const cleanTexts = [n.hypothesis].concat(n.questions.map((q) => q.text), n.conditions.map((c) => c.text));
      if (rawTexts.some((t) => !cleanTexts.includes(t.trim()) && t.trim())) report.sanitized++;
      if (seenInFile.has(n.id)) report.duplicatesInFile++;
      seenInFile.add(n.id);
      n.tickers.forEach((t) => { if (Object.keys(cards).length && !cards[t] && !report.staleTickers.includes(t)) report.staleTickers.push(t); });
      if (currentSession && n.session_saved && n.session_saved !== currentSession) report.sessionDiffers++;
      const existing = findEntry(base, n.id);
      if (existing) { mergeEntry(existing, n, stamp); report.merged++; return; }
      if (base.entries.length >= LIMITS.entries) { report.overLimit++; return; }
      base.entries.push(n);
      report.added++;
    });
    report.ok = true;
    return { journal: base, report };
  }

  const IMPORT_ERRORS = Object.freeze({
    EMPTY_FILE: "Tệp trống.",
    FILE_TOO_LARGE: "Tệp quá lớn (giới hạn 1 MB).",
    NOT_JSON: "Tệp không phải JSON hợp lệ.",
    UNSUPPORTED_SCHEMA: "Tệp không phải sổ nghiên cứu hoặc hồ sơ đã xuất từ trang này.",
  });
  function importReportHtml(report) {
    if (!report) return "";
    if (!report.ok) return `<div class="vs-alert vs-alert-warning" role="alert" data-import-error="${h(report.error)}">Không nhập được: ${h(IMPORT_ERRORS[report.error] || "Lỗi không xác định.")} Sổ nghiên cứu hiện tại không thay đổi.</div>`;
    const lines = [`Đã thêm ${report.added} mục, gộp ${report.merged} mục trùng với sổ hiện có.`];
    if (report.duplicatesInFile) lines.push(`${report.duplicatesInFile} mục trùng lặp trong tệp đã được gộp.`);
    if (report.invalid) lines.push(`${report.invalid} mục không hợp lệ đã bị bỏ qua.`);
    if (report.overLimit) lines.push(`${report.overLimit} mục vượt giới hạn ${LIMITS.entries} mục đã bị bỏ qua.`);
    if (report.sanitized) lines.push(`${report.sanitized} mục có ký tự điều khiển, quá dài hoặc trùng nội dung đã được làm sạch; mọi nội dung chỉ hiển thị dạng văn bản thuần.`);
    if (report.staleTickers.length) lines.push(`Mã không còn trong dữ liệu hiện hành: ${report.staleTickers.join(", ")} (ghi chú vẫn được giữ, được đánh dấu cũ).`);
    if (report.sessionDiffers) lines.push(`${report.sessionDiffers} mục được viết ở phiên khác phiên hiện tại.`);
    if (report.ignoredHoldings) lines.push("Tệp có dữ liệu vị thế/danh mục; phần đó đã bị bỏ qua vì sổ nghiên cứu không lưu vị thế nắm giữ.");
    return `<div class="vs-alert vs-alert-info" role="status" data-import-ok="true"><ul class="mb-0">${lines.map((l) => `<li>${h(l)}</li>`).join("")}</ul></div>`;
  }

  // ---------------------------------------------------------------------------------------
  // Export: JSON + printable HTML
  // ---------------------------------------------------------------------------------------
  function exportItem(it) {
    const out = { evidence_kind: it.kind, dimension: it.dimension, label: it.label };
    ["raw", "value", "detail", "period", "source"].forEach((k) => { if (hasValue(it[k])) out[k === "raw" ? "producer_code" : k] = it[k]; });
    if (it.citation) out.citation = it.citation;
    return out;
  }
  function dossierExportRecord(m) {
    return {
      ticker: m.ticker, session: m.session, sector: m.sector.label, entity_class: m.entityClass,
      producer_state: {
        research_action_posture: m.posture.raw, posture_label: m.posture.label, evidence_currency: m.posture.evidenceCurrencyRaw,
        posture_condition_class: m.posture.conditionClass ? m.posture.conditionClass.raw : null,
        entry_state: m.strategy.entryState, entry_action: m.strategy.entryAction, policy_version: m.posture.policyVersion,
        producer_reasons: m.posture.reasons.map(exportItem),
        scenarios: m.strategy.scenarios.map((s) => ({ case: s.case, status: s.status.raw, reason: s.reason ? s.reason.raw : null, probability: s.probability.raw })),
      },
      adverse_conditions: m.adverse.map((a) => ({ label: a.label, producer_code: a.raw || null })),
      evidence_for: m.evidence.support.map(exportItem),
      evidence_against: m.evidence.counter.map(exportItem),
      evidence_neutral: m.evidence.neutral.map(exportItem),
      fundamentals: { period: m.fundamentals.period, freshness: m.fundamentals.freshness, establishes: m.fundamentals.establishes.map(exportItem), unavailable: m.fundamentals.unavailable.map(exportItem), limitations: m.fundamentals.limitations },
      valuation: { relative_research_state: m.valuation.relativeState, establishes: m.valuation.establishes.map(exportItem), unavailable: m.valuation.unavailable.map(exportItem), target_price: "NOT_EMITTED", probability: "NOT_EMITTED" },
      conditions: {
        confirmation: m.conditions.confirmation.map((c) => ({ status: c.statusRaw, boundary: c.boundary ? c.boundary.raw : null, operator: c.operator ? c.operator.raw : null, level: c.level, is_future_condition: c.isFuture, fired: c.fired })),
        reference_trigger: m.conditions.reference ? { level: m.conditions.reference.level, producer_state: m.conditions.reference.stateRaw, satisfied_per_producer: m.conditions.reference.satisfied, entry_authority: m.conditions.reference.entryAuthority } : null,
        weakening: m.conditions.weakening.map((w) => ({ label: w.label, detail: w.detail })),
        invalidation: m.conditions.invalidation.map((c) => ({ status: c.statusRaw, boundary: c.boundary ? c.boundary.raw : null, operator: c.operator ? c.operator.raw : null, level: c.level, semantic: c.semantic, fired: c.fired })),
        fundamental_invalidation: m.conditions.fundamentalInvalidation ? { status: m.conditions.fundamentalInvalidation.statusRaw, dimension: m.conditions.fundamentalInvalidation.dimension, fired: m.conditions.fundamentalInvalidation.fired } : null,
      },
      gaps: m.gaps.map((g) => ({ kind: g.kind, axis: g.axis, label: g.label, detail: g.detail, verification_question: g.question.text })),
      freshness: { per_axis: m.freshness.axes, current_axes: m.freshness.currentAxes, total_axes: m.freshness.axes.length, metrics_available: m.freshness.metricsAvailable, metrics_total: m.freshness.metricsTotal },
      provenance: m.provenance,
    };
  }
  function comparisonExportRecord(cmp) {
    if (!cmp) return null;
    const row = (r) => ({ id: r.id, label: r.label, comparable: r.comparable, not_comparable_reasons: r.reasons.map((x) => x.code), cells: r.cells.map((cl) => ({ ticker: cl.ticker, value: cl.value === undefined ? null : cl.value, period: cl.period || null, reason: cl.reason || null })) });
    return {
      tickers: cmp.tickers, session: cmp.session, bank_non_bank_mix: cmp.bankMix,
      producer_state: cmp.producerState.map((p) => ({ ticker: p.ticker, research_action_posture: p.postureRaw, entity_class: p.entityClass })),
      comparable_side_by_side: cmp.comparable.map(row), not_comparable: cmp.notComparable.map(row),
      cross_security_statistics: cmp.permittedStatistics.length ? cmp.permittedStatistics : "NONE_PERMITTED_BY_PUBLISHED_CONTRACT",
      same_sector_groups: cmp.sameSectorGroups, ranking: "NOT_PRODUCED",
    };
  }
  function buildDossierExport(input) {
    const i = obj(input);
    const dossiers = arr(i.dossiers).filter(Boolean);
    const indexDoc = obj(i.indexDoc);
    const notes = arr(i.journalEntries).filter(Boolean);
    return {
      schema_version: EXPORT_SCHEMA,
      export_kind: "USER_RESEARCH_DOSSIER",
      exported_at: nowIso(i.now),
      disclaimer: DISCLAIMER,
      not_a_sealed_producer_packet: true,
      not_a_qualified_financial_report: true,
      not_a_recommendation: true,
      session: str(indexDoc.as_of_session) || (dossiers[0] && dossiers[0].session) || null,
      tickers: i.comparison ? i.comparison.tickers : dossiers.map((d) => d.ticker),
      source: {
        index_contract: str(indexDoc.contract_version) || null,
        source_artifact_identity: str(indexDoc.source_artifact_identity) || null,
        primary_action_decision_source: str(obj(indexDoc.decision_authority).primary_action_decision_source) || null,
        rendered_by: "Dashboard investigation workbench (client-side regrouping of published fields)",
      },
      dossiers: dossiers.map(dossierExportRecord),
      comparison: comparisonExportRecord(i.comparison),
      user_notes: {
        label: "Ghi chú của người dùng — không phải dữ liệu Producer",
        entries: notes.map((e) => JSON.parse(JSON.stringify(e))),
      },
    };
  }

  function printableHtml(doc) {
    const d = obj(doc);
    const list = (items) => arr(items).length ? `<ul>${arr(items).map((x) => `<li>${h(x.label)}${x.value ? ` — <b>${h(x.value)}</b>` : ""}${x.detail ? ` (${h(x.detail)})` : ""}${x.period ? ` · kỳ ${h(x.period)}` : ""} <small>[${h((EVIDENCE_KINDS[x.evidence_kind] || {}).label || x.evidence_kind || "")}]</small></li>`).join("")}</ul>` : "<p><i>Không có mục nào.</i></p>";
    const dossierSection = (r) => `<section><h2>${h(r.ticker)} <small>${h(r.sector || "")} · phiên ${h(r.session || "")}</small></h2>
      <p><b>Tư thế của Producer:</b> ${h(r.producer_state.posture_label)} <small>(${h(r.producer_state.research_action_posture || "")})</small></p>
      ${r.adverse_conditions.length ? `<div class="adverse"><b>Điều kiện bất lợi:</b><ul>${r.adverse_conditions.map((a) => `<li>${h(a.label)}</li>`).join("")}</ul></div>` : ""}
      <h3>Bằng chứng ủng hộ</h3>${list(r.evidence_for)}
      <h3>Phản biện / bất lợi</h3>${list(r.evidence_against)}
      <h3>Cơ bản đã xác lập</h3>${list(r.fundamentals.establishes)}
      <h3>Cơ bản chưa có</h3>${list(r.fundamentals.unavailable)}
      <h3>Định giá (chỉ dùng nghiên cứu)</h3>${list(r.valuation.establishes)}
      <h3>Điều kiện</h3><ul>${r.conditions.confirmation.map((c) => `<li>Xác nhận: ${h(c.status || "—")}${c.is_future_condition ? " · điều kiện tương lai, chưa xảy ra" : ""}</li>`).join("")}${r.conditions.weakening.map((w) => `<li>Suy yếu: ${h(w.label)}</li>`).join("")}${r.conditions.invalidation.map((c) => `<li>Vô hiệu: ${h(c.status || "—")}</li>`).join("")}</ul>
      <h3>Khoảng trống & câu hỏi kiểm chứng</h3><ol>${r.gaps.map((g) => `<li>${h(g.verification_question)}</li>`).join("")}</ol>
      <h3>Độ mới</h3><p>${h(r.freshness.current_axes)}/${h(r.freshness.total_axes)} trục hiện hành.</p>
      <h3>Nguồn gốc</h3><ul class="mono">${r.provenance.map((p) => `<li>${h(p.label)}: ${h(p.value)}</li>`).join("")}</ul></section>`;
    const cmp = d.comparison;
    const cmpSection = cmp ? `<section><h2>So sánh ${h(cmp.tickers.join(", "))}</h2><p>Không xếp hạng, không chấm điểm. Thống kê liên mã: ${h(Array.isArray(cmp.cross_security_statistics) ? cmp.cross_security_statistics.join(", ") : "không được hợp đồng dữ liệu cho phép")}.</p>
      <h3>Cùng cơ sở (đặt cạnh nhau)</h3><ul>${cmp.comparable_side_by_side.map((r) => `<li>${h(r.label)}: ${r.cells.map((c) => `${h(c.ticker)} ${h(c.value === null ? "—" : formatNumber(c.value, 4))}`).join(" | ")}</li>`).join("") || "<li><i>Không có</i></li>"}</ul>
      <h3>Không so sánh được</h3><ul>${cmp.not_comparable.map((r) => `<li>${h(r.label)}: ${h(r.not_comparable_reasons.map((x) => NC_REASONS[x] || x).join(", "))}</li>`).join("") || "<li><i>Không có</i></li>"}</ul></section>` : "";
    const notes = arr(obj(d.user_notes).entries);
    const notesSection = `<section class="notes"><h2>${h(obj(d.user_notes).label || "Ghi chú của người dùng")}</h2>${notes.length ? notes.map((e) => `<div><h3>${h(e.tickers.join(", "))}</h3>${e.hypothesis ? `<p><b>Giả thuyết:</b> ${h(e.hypothesis)}</p>` : ""}<ul>${e.questions.map((q) => `<li>[${q.status === "reviewed" ? "đã xem xét" : "đang mở"}] ${h(q.text)}</li>`).join("")}</ul>${e.conditions.length ? `<p><b>Điều kiện theo dõi:</b></p><ul>${e.conditions.map((c) => `<li>${h(c.text)}</li>`).join("")}</ul>` : ""}</div>`).join("") : "<p><i>Không có ghi chú.</i></p>"}</section>`;
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hồ sơ nghiên cứu ${h((d.tickers || []).join(", "))} · ${h(d.session || "")}</title>
<style>body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;background:#fff;max-width:900px;margin:24px auto;padding:0 16px}h1{font-size:20px}h2{font-size:17px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:28px}h3{font-size:14px;margin:14px 0 4px}small{color:#555;font-weight:400}.disclaimer{border:2px solid #b45309;background:#fff7ed;padding:10px 12px;border-radius:6px}.adverse{border-left:4px solid #b91c1c;padding-left:10px}.notes{border:1px dashed #a16207;background:#fefce8;padding:8px 14px;border-radius:6px}.mono{font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all}@media print{body{margin:0}section{break-inside:avoid-page}}</style></head><body>
<h1>Hồ sơ nghiên cứu cá nhân — ${h((d.tickers || []).join(", "))}</h1>
<p class="disclaimer"><b>Chỉ phục vụ nghiên cứu.</b> ${h(d.disclaimer || DISCLAIMER)}</p>
<p><small>Phiên dữ liệu ${h(d.session || "—")} · xuất lúc ${h(d.exported_at || "")} · nguồn ${h(obj(d.source).source_artifact_identity || "—")}</small></p>
${arr(d.dossiers).map(dossierSection).join("")}${cmpSection}${notesSection}
</body></html>`;
  }

  // ---------------------------------------------------------------------------------------
  // Public history. The only per-ticker history the public Dashboard publishes is the rotating
  // set of thesis focus cards inside each session companion manifest (about 12 tickers per
  // session, lens states only). Posture history per ticker is not published. HISTORY_SOURCES is
  // the seam for a future per-ticker history artifact.
  // ---------------------------------------------------------------------------------------
  const HISTORY_SOURCES = Object.freeze([{
    id: "thesis_focus_cards",
    label: "Thẻ luận điểm trọng tâm trong tệp phiên công khai",
    urlForSession: (session) => `data/session_${session.replace(/-/g, "_")}_manifest.json`,
    limitation: "Mỗi phiên chỉ công bố khoảng 12 thẻ luận điểm trọng tâm, luân phiên giữa các mã, và chỉ có trạng thái theo góc nhìn dài hạn/ngắn hạn. Lịch sử tư thế hành động từng mã chưa được công bố công khai.",
  }]);

  function candidateSessions(currentSession, count) {
    if (!SESSION_RE.test(str(currentSession))) return [];
    const out = [];
    const d = new Date(`${currentSession}T00:00:00Z`);
    for (let i = 0; out.length < (count || 30) && i < 90; i++) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return out;
  }
  function extractFocusCardHistory(manifest, ticker) {
    const m = obj(manifest);
    const session = str(m.dashboard_session);
    const cards = arr(obj(m.thesis_evidence).focus_cards);
    const card = cards.find((c) => obj(c).ticker === ticker);
    if (!session) return null;
    if (!card) return { session, present: false, cohortSize: cards.length };
    const lenses = obj(card.lenses);
    return {
      session, present: true, cohortSize: cards.length,
      lenses: Object.keys(lenses).sort().map((k) => ({ lens: k, label: codeLabel(k).label, state: str(obj(lenses[k]).state), stateLabel: codeLabel(obj(lenses[k]).state, "evidence_state").label })),
      matrixStatus: str(card.matrix_status), limitationCount: arr(card.blocker_families).length,
    };
  }
  function loadPublicHistory(ticker, currentSession, fetchJson, count) {
    const source = HISTORY_SOURCES[0];
    const sessions = candidateSessions(currentSession, count || 30);
    const fetcher = fetchJson || ((url) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)));
    return Promise.all(sessions.map((s) => Promise.resolve().then(() => fetcher(source.urlForSession(s))).catch(() => null))).then((docs) => {
      const published = docs.map((doc) => (doc ? extractFocusCardHistory(doc, ticker) : null)).filter(Boolean);
      const appearances = published.filter((p) => p.present);
      return { status: published.length ? "ok" : "none", source: source.id, sourceLabel: source.label, limitation: source.limitation, checkedSessions: sessions.length, publishedSessions: published.length, appearances, ticker };
    });
  }
  function historyPlaceholderHtml() {
    return `<p class="cockpit-note">${h(HISTORY_SOURCES[0].limitation)}</p><button type="button" class="btn btn-sm btn-outline-light" data-wb-action="load-history">Tải lịch sử công khai (khoảng 30 phiên)</button>`;
  }
  function historyHtml(result) {
    if (!result) return historyPlaceholderHtml();
    if (result.status === "loading") return '<p class="cockpit-note" role="status">Đang tải các tệp phiên công khai…</p>';
    const r = result;
    const body = r.appearances.length
      ? `<div class="table-responsive"><table class="cockpit-table wb-table"><thead><tr><th>Phiên</th>${r.appearances[0].lenses.map((l) => `<th>${h(l.label)}</th>`).join("")}<th>Mức đầy đủ</th></tr></thead><tbody>${r.appearances.map((a) => `<tr><td>${h(a.session)}</td>${a.lenses.map((l) => `<td>${pillHtml(l.state, "evidence_state", "neutral")}</td>`).join("")}<td>${h(codeLabel(a.matrixStatus).label)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="cockpit-note">${h(r.ticker)} không xuất hiện trong thẻ luận điểm trọng tâm của ${r.publishedSessions} phiên công khai gần nhất. Điều này không nói gì về tư thế của mã ở các phiên đó.</p>`;
    return `${kindBadgeHtml("HISTORICAL")} <span class="cockpit-note">${h(r.sourceLabel)} · đã kiểm tra ${r.checkedSessions} ngày giao dịch, có ${r.publishedSessions} tệp phiên công khai.</span>
      ${body}<p class="cockpit-note mb-0">${h(r.limitation)}</p>`;
  }

  // ---------------------------------------------------------------------------------------
  // Journal view rendering
  // ---------------------------------------------------------------------------------------
  function journalListHtml(journal, indexDoc, status) {
    const privacy = `<div class="wb-privacy" role="note"><b>Quyền riêng tư:</b> Sổ nghiên cứu chỉ lưu trong trình duyệt này trên thiết bị này, tách biệt với Trình soạn danh mục. Trang không gửi ghi chú đi đâu, không có tài khoản hay máy chủ. Sổ nghiên cứu không phải danh mục nắm giữ và trang không suy đoán bạn đang nắm giữ mã nào. Xóa dữ liệu trình duyệt sẽ xóa sổ — hãy xuất tệp để giữ bản sao.</div>`;
    const statusHtml = status === "corrupt"
      ? '<div class="vs-alert vs-alert-warning" role="alert">Dữ liệu sổ nghiên cứu trong trình duyệt bị hỏng nên không được dùng. <button type="button" class="btn btn-sm btn-outline-light" data-wb-action="journal-reset">Xóa dữ liệu hỏng</button></div>'
      : (status === "unavailable" ? '<div class="vs-alert vs-alert-warning" role="alert">Trình duyệt đang chặn lưu trữ cục bộ; ghi chú sẽ mất khi tải lại trang. Hãy xuất tệp để giữ bản sao.</div>' : "");
    const entries = arr(obj(journal).entries).slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    const rows = entries.map((e) => {
      const st = entryStaleness(e, indexDoc);
      const open = e.questions.filter((q) => q.status === "open").length;
      const href = e.kind === "comparison"
        ? `investment-workspace.html?view=compare&tickers=${encodeURIComponent(e.tickers.join(","))}&session=${encodeURIComponent(e.session_saved || "")}`
        : `investment-workspace.html?view=dossier&ticker=${encodeURIComponent(e.tickers[0])}`;
      return `<li class="wb-journal-entry" data-entry-id="${h(e.id)}">
        <div class="wb-journal-main"><a href="${h(href)}" data-wb-open-entry="${h(e.id)}" class="wb-journal-link">${e.kind === "comparison" ? "So sánh " : ""}<b>${h(e.tickers.join(", "))}</b></a>
          <span class="cockpit-note">lưu từ phiên ${h(e.session_saved || "—")} · ${open} câu hỏi đang mở / ${e.questions.length} · ${e.conditions.length} điều kiện</span>
          ${st.missingTickers.length ? `<span class="cockpit-state tone-watch">Mã không còn trong dữ liệu hiện hành: ${h(st.missingTickers.join(", "))}</span>` : ""}
          ${st.sessionDiffers ? '<span class="cockpit-state tone-neutral">Viết ở phiên khác</span>' : ""}
          ${e.hypothesis ? `<div class="wb-journal-hypothesis">${kindBadgeHtml("HUMAN_NOTE")} ${h(e.hypothesis.length > 160 ? `${e.hypothesis.slice(0, 160)}…` : e.hypothesis)}</div>` : ""}</div>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-wb-action="journal-remove" data-entry-id="${h(e.id)}" aria-label="Xóa ${h(e.tickers.join(", "))} khỏi sổ">Xóa</button>
      </li>`;
    }).join("");
    return `${privacy}${statusHtml}
      <div class="wb-actions" role="group" aria-label="Sao lưu sổ nghiên cứu">
        <button type="button" class="btn btn-sm btn-outline-light" data-wb-action="journal-export"${entries.length ? "" : " disabled"}>Xuất sổ nghiên cứu (tệp JSON)</button>
        <label class="btn btn-sm btn-outline-light mb-0" for="wb-journal-import">Nhập sổ nghiên cứu từ tệp</label>
        <input id="wb-journal-import" type="file" accept="application/json,.json" class="vs-visually-hidden" data-wb-import>
      </div>
      <div data-wb-import-report aria-live="polite"></div>
      ${entries.length ? `<ul class="wb-journal-list">${rows}</ul>` : '<p class="cockpit-note">Sổ nghiên cứu đang trống. Mở một hồ sơ điều tra và chọn "Lưu vào sổ nghiên cứu".</p>'}`;
  }

  // ---------------------------------------------------------------------------------------
  // Browser wiring
  // ---------------------------------------------------------------------------------------
  const UI = { ctx: null, bound: false, journal: emptyJournal(), journalStatus: "empty", compare: [], dossier: null, dossierCard: null, dossierToken: 0, compareToken: 0, comparison: null, history: {}, hypothesisTimer: null };

  function wsDoc() { return UI.ctx && UI.ctx.getWorkspace ? UI.ctx.getWorkspace() : null; }
  function persist() {
    const ok = saveJournal(null, UI.journal);
    if (!ok && UI.journalStatus !== "corrupt") UI.journalStatus = "unavailable";
    return ok;
  }
  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function printHtml(html) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.srcdoc = html;
    frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (err) { /* print unavailable */ } setTimeout(() => frame.remove(), 1000); };
    document.body.appendChild(frame);
  }
  function setUrl(params) {
    try {
      const url = new URL(window.location.href);
      Object.keys(params).forEach((k) => { if (params[k] === null || params[k] === undefined || params[k] === "") url.searchParams.delete(k); else url.searchParams.set(k, params[k]); });
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (err) { /* history unavailable */ }
  }
  function focusHeading(id) {
    const el = document.getElementById(id);
    if (el && typeof el.focus === "function") el.focus({ preventScroll: false });
  }

  function renderDossierView(focus) {
    const root = document.getElementById("wb-dossier");
    const doc = wsDoc();
    if (!root || !doc) return;
    const params = new URLSearchParams(window.location.search);
    const requested = (UI.ctx.getSelectedTicker && UI.ctx.getSelectedTicker()) || params.get("ticker") || "";
    const ticker = normTicker(requested);
    if (!ticker) {
      root.innerHTML = '<p class="cockpit-note">Chọn một mã ở ô "Mã" phía trên, hoặc mở "Xem luận điểm" từ danh sách, để lập hồ sơ điều tra.</p>';
      return;
    }
    if (!doc.cards[ticker]) {
      root.innerHTML = `<div class="cockpit-note" data-dossier-unavailable="true">Không tìm thấy mã "${h(requested)}" trong dữ liệu phiên ${h(doc.as_of_session)}. Không chọn mã thay thế.</div>`;
      return;
    }
    const token = ++UI.dossierToken;
    if (!UI.dossier || UI.dossier.ticker !== ticker) root.innerHTML = `<p class="cockpit-note" role="status">Đang tải hồ sơ ${h(ticker)}…</p>`;
    const readModel = UI.ctx.readModel;
    const resolve = readModel ? readModel.getTickerDetail(ticker, doc) : Promise.resolve({ status: "unavailable" });
    resolve.then((result) => {
      if (token !== UI.dossierToken) return;
      let card = result && result.status === "ok" ? result.card : null;
      let partial = false;
      if (!card) { card = doc.cards[ticker]; partial = true; }
      const model = buildDossier(card, { ticker, session: doc.as_of_session, sourceArtifactIdentity: doc.source_artifact_identity, decisionSource: obj(doc.decision_authority).primary_action_decision_source });
      UI.dossier = model;
      UI.dossierCard = card;
      const entry = findEntry(UI.journal, entryIdFor("dossier", [ticker]));
      root.innerHTML = `${partial ? '<div class="vs-alert vs-alert-warning" role="status">Tạm chưa tải được dữ liệu chi tiết; hồ sơ chỉ dựng từ phần tóm tắt nên nhiều mục được đánh dấu thiếu.</div>' : ""}${dossierHtml(model, {
        journalEntry: entry, inCompare: UI.compare.includes(ticker), stale: entry ? entryStaleness(entry, doc) : null,
        historyHtml: UI.history[ticker] ? historyHtml(UI.history[ticker]) : null,
      })}`;
      if (focus) focusHeading("wb-dossier-heading");
    });
  }

  function renderCompareTray() {
    const tray = document.getElementById("wb-compare-tray");
    if (!tray) return;
    tray.innerHTML = UI.compare.length
      ? UI.compare.map((t) => `<span class="cockpit-chip wb-tray-chip">${h(t)} <button type="button" class="wb-chip-remove" data-wb-action="tray-remove" data-ticker="${h(t)}" aria-label="Bỏ ${h(t)} khỏi danh sách so sánh">×</button></span>`).join("")
      : '<span class="cockpit-note">Chưa chọn mã nào.</span>';
    const count = document.getElementById("wb-compare-count");
    if (count) count.textContent = `${UI.compare.length}/${MAX_COMPARE}`;
  }

  function runComparison(tickers, requestedSession, focus) {
    const out = document.getElementById("wb-compare-result");
    const doc = wsDoc();
    if (!out || !doc) return;
    const validation = validateComparisonRequest(tickers, doc, requestedSession);
    if (!validation.ok) {
      UI.comparison = null;
      out.innerHTML = refusalHtml(validation);
      const alertEl = out.querySelector("[role=alert]");
      if (focus && alertEl) { alertEl.setAttribute("tabindex", "-1"); alertEl.focus(); }
      return;
    }
    UI.compare = validation.tickers.slice();
    renderCompareTray();
    setUrl({ view: "compare", tickers: validation.tickers.join(","), session: validation.session, ticker: null });
    const token = ++UI.compareToken;
    out.innerHTML = `<p class="cockpit-note" role="status">Đang tải dữ liệu chi tiết cho ${h(validation.tickers.join(", "))}…</p>`;
    const readModel = UI.ctx.readModel;
    Promise.all(validation.tickers.map((t) => (readModel ? readModel.getTickerDetail(t, doc) : Promise.resolve({ status: "unavailable" })).then((r) => ({ ticker: t, thin: doc.cards[t], detail: r && r.status === "ok" ? r.card : null }))))
      .then((entries) => {
        if (token !== UI.compareToken) return;
        const detailSessions = new Set(entries.filter((e) => e.detail).map((e) => str(e.detail.as_of_session)));
        if (detailSessions.size > 1 || (detailSessions.size === 1 && !detailSessions.has(validation.session))) {
          UI.comparison = null;
          out.innerHTML = refusalHtml({ errors: [{ code: "MIXED_SESSION_DETAIL", label: COMPARE_REFUSALS.MIXED_SESSION_DETAIL }] });
          return;
        }
        UI.comparison = buildComparison(entries, { session: validation.session, indexDoc: doc });
        const saved = Boolean(findEntry(UI.journal, entryIdFor("comparison", validation.tickers)));
        out.innerHTML = comparisonHtml(UI.comparison, { saved });
        if (focus) focusHeading("wb-compare-heading");
      });
  }

  function renderCompareView(focus) {
    const doc = wsDoc();
    if (!doc) return;
    const list = document.getElementById("wb-ticker-options");
    if (list && !list.childElementCount) list.innerHTML = Object.keys(doc.cards).sort().map((t) => `<option value="${h(t)}"></option>`).join("");
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("tickers");
    if (fromUrl !== null) {
      runComparison(fromUrl, params.get("session") || "", focus);
    } else {
      renderCompareTray();
      const out = document.getElementById("wb-compare-result");
      if (out && !UI.comparison) out.innerHTML = '<p class="cockpit-note">Thêm 2–5 mã rồi chọn "So sánh". Liên kết của trang sẽ giữ nguyên danh sách và phiên dữ liệu để bạn quay lại.</p>';
    }
  }

  function renderJournalView(focus) {
    const root = document.getElementById("wb-journal");
    if (!root) return;
    root.innerHTML = journalListHtml(UI.journal, wsDoc(), UI.journalStatus);
    if (focus) focusHeading("wb-journal-heading");
  }

  function renderView(view, opts) {
    const focus = Boolean(opts && opts.focus);
    if (view === "dossier") renderDossierView(focus);
    else if (view === "compare") renderCompareView(focus);
    else if (view === "journal") renderJournalView(focus);
  }

  function currentDossierEntry(create) {
    if (!UI.dossier) return null;
    const id = entryIdFor("dossier", [UI.dossier.ticker]);
    let entry = findEntry(UI.journal, id);
    if (!entry && create) {
      const res = upsertEntry(UI.journal, "dossier", [UI.dossier.ticker], UI.dossier.session);
      entry = res.entry;
    }
    return entry;
  }

  function exportFor(kind) {
    const doc = wsDoc();
    if (kind === "dossier" && UI.dossier) {
      const entry = currentDossierEntry(false);
      return buildDossierExport({ dossiers: [UI.dossier], indexDoc: doc, journalEntries: entry ? [entry] : [] });
    }
    if (kind === "compare" && UI.comparison) {
      const entry = findEntry(UI.journal, entryIdFor("comparison", UI.comparison.tickers));
      return buildDossierExport({ dossiers: [], comparison: UI.comparison, indexDoc: doc, journalEntries: entry ? [entry] : [] });
    }
    return null;
  }

  function handleAction(action, el) {
    const doc = wsDoc();
    switch (action) {
      case "save": { if (!UI.dossier) return; upsertEntry(UI.journal, "dossier", [UI.dossier.ticker], UI.dossier.session); persist(); renderDossierView(false); setTimeout(() => focusHeading("wb-hypothesis"), 0); return; }
      case "unsave": { if (!UI.dossier) return; const entry = currentDossierEntry(false); if (entry && (entry.hypothesis || entry.questions.length || entry.conditions.length) && !window.confirm(`Xóa hồ sơ ${UI.dossier.ticker} và mọi ghi chú khỏi sổ nghiên cứu?`)) return; removeEntry(UI.journal, entryIdFor("dossier", [UI.dossier.ticker])); persist(); renderDossierView(false); return; }
      case "compare-add": case "compare-remove": {
        if (!UI.dossier) return;
        const t = UI.dossier.ticker;
        if (action === "compare-add" && !UI.compare.includes(t)) { if (UI.compare.length >= MAX_COMPARE) { window.alert(COMPARE_REFUSALS.TOO_MANY); return; } UI.compare.push(t); }
        if (action === "compare-remove") UI.compare = UI.compare.filter((x) => x !== t);
        renderCompareTray(); renderDossierView(false); return;
      }
      case "export-json": case "compare-export-json": {
        const out = exportFor(action === "export-json" ? "dossier" : "compare"); if (!out) return;
        download(`ho-so-nghien-cuu-${out.tickers.join("-")}-${out.session || "phien"}.json`, JSON.stringify(out, null, 2), "application/json"); return;
      }
      case "export-html": case "compare-export-html": {
        const out = exportFor(action === "export-html" ? "dossier" : "compare"); if (!out) return;
        download(`ho-so-nghien-cuu-${out.tickers.join("-")}-${out.session || "phien"}.html`, printableHtml(out), "text/html"); return;
      }
      case "print": { const out = exportFor("dossier"); if (out) printHtml(printableHtml(out)); return; }
      case "open-drawer": { if (UI.dossier && UI.ctx.openDrawer) UI.ctx.openDrawer(UI.dossier.ticker); return; }
      case "track-question": {
        const entry = currentDossierEntry(true); if (!entry || !UI.dossier) return;
        const gap = UI.dossier.gaps.find((g) => g.key === el.dataset.gapKey); if (!gap) return;
        addQuestion(entry, gap.question.text, "producer_gap", gap.key); persist(); renderDossierView(false); return;
      }
      case "toggle-question": { const entry = currentDossierEntry(false); if (!entry) return; const q = entry.questions.find((x) => x.id === el.dataset.questionId); if (!q) return; setQuestionStatus(entry, q.id, q.status === "open" ? "reviewed" : "open"); persist(); renderDossierView(false); setTimeout(() => { const b = document.querySelector(`[data-wb-action="toggle-question"][data-question-id="${q.id}"]`); if (b) b.focus(); }, 0); return; }
      case "remove-question": { const entry = currentDossierEntry(false); if (!entry) return; removeQuestion(entry, el.dataset.questionId); persist(); renderDossierView(false); return; }
      case "remove-condition": { const entry = currentDossierEntry(false); if (!entry) return; removeCondition(entry, el.dataset.conditionId); persist(); renderDossierView(false); return; }
      case "load-history": {
        if (!UI.dossier || !doc) return;
        const t = UI.dossier.ticker;
        UI.history[t] = { status: "loading" };
        const sec = document.querySelector("#wb-sec-history .wb-section-body"); if (sec) sec.innerHTML = historyHtml(UI.history[t]);
        loadPublicHistory(t, doc.as_of_session).then((r) => { UI.history[t] = r; const s = document.querySelector("#wb-sec-history .wb-section-body"); if (s && UI.dossier && UI.dossier.ticker === t) s.innerHTML = historyHtml(r); });
        return;
      }
      case "tray-remove": { UI.compare = UI.compare.filter((x) => x !== el.dataset.ticker); renderCompareTray(); return; }
      case "compare-run": { runComparison(UI.compare, "", true); return; }
      case "compare-clear": { UI.compare = []; UI.comparison = null; renderCompareTray(); setUrl({ tickers: null, session: null }); const out = document.getElementById("wb-compare-result"); if (out) out.innerHTML = ""; return; }
      case "compare-save": { if (!UI.comparison) return; upsertEntry(UI.journal, "comparison", UI.comparison.tickers, UI.comparison.session); persist(); document.getElementById("wb-compare-result").innerHTML = comparisonHtml(UI.comparison, { saved: true }); return; }
      case "compare-unsave": { if (!UI.comparison) return; removeEntry(UI.journal, entryIdFor("comparison", UI.comparison.tickers)); persist(); document.getElementById("wb-compare-result").innerHTML = comparisonHtml(UI.comparison, { saved: false }); return; }
      case "journal-export": { download(`so-nghien-cuu-${(doc && doc.as_of_session) || "phien"}.json`, JSON.stringify(exportJournal(UI.journal), null, 2), "application/json"); return; }
      case "journal-remove": {
        const id = el.dataset.entryId; const entry = findEntry(UI.journal, id); if (!entry) return;
        if (!window.confirm(`Xóa ${entry.tickers.join(", ")} và mọi ghi chú khỏi sổ nghiên cứu?`)) return;
        removeEntry(UI.journal, id); persist(); renderJournalView(false); focusHeading("wb-journal-heading"); return;
      }
      case "journal-reset": { if (!window.confirm("Xóa dữ liệu sổ nghiên cứu bị hỏng trong trình duyệt này?")) return; clearJournal(); UI.journal = emptyJournal(); UI.journalStatus = "empty"; renderJournalView(true); return; }
      default:
    }
  }

  function addTickerToTray(raw) {
    const doc = wsDoc();
    const t = normTicker(raw);
    const msg = document.getElementById("wb-compare-msg");
    const say = (text) => { if (msg) msg.textContent = text; };
    if (!t) { say("Mã không hợp lệ."); return false; }
    if (!doc || !doc.cards[t]) { say(`Không có mã ${t} trong dữ liệu phiên hiện tại.`); return false; }
    if (UI.compare.includes(t)) { say(`${t} đã có trong danh sách.`); return false; }
    if (UI.compare.length >= MAX_COMPARE) { say(COMPARE_REFUSALS.TOO_MANY); return false; }
    UI.compare.push(t);
    say(`Đã thêm ${t}.`);
    renderCompareTray();
    return true;
  }

  function bind() {
    if (UI.bound) return;
    UI.bound = true;
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-wb-action]");
      if (btn && btn.closest(".wb-root")) { e.preventDefault(); handleAction(btn.dataset.wbAction, btn); return; }
      const openDossier = e.target.closest("[data-wb-open-dossier]");
      if (openDossier && UI.ctx) { e.preventDefault(); UI.ctx.openDossier(openDossier.dataset.wbOpenDossier); return; }
      const openEntry = e.target.closest("[data-wb-open-entry]");
      if (openEntry && UI.ctx) {
        e.preventDefault();
        const entry = findEntry(UI.journal, openEntry.dataset.wbOpenEntry);
        if (!entry) return;
        if (entry.kind === "comparison") { UI.compare = entry.tickers.slice(); UI.ctx.setView("compare"); runComparison(entry.tickers, "", true); }
        else UI.ctx.openDossier(entry.tickers[0]);
      }
    });
    document.addEventListener("submit", (e) => {
      const form = e.target.closest("[data-wb-form]");
      if (!form) return;
      e.preventDefault();
      const input = form.querySelector("input");
      const value = input ? input.value : "";
      if (form.dataset.wbForm === "compare-add") { if (addTickerToTray(value) && input) input.value = ""; return; }
      const entry = currentDossierEntry(false);
      if (!entry || !value.trim()) return;
      const added = form.dataset.wbForm === "question" ? addQuestion(entry, value, "user", null) : addCondition(entry, value);
      if (!added) return;
      persist();
      renderDossierView(false);
      setTimeout(() => { const next = document.getElementById(form.dataset.wbForm === "question" ? "wb-new-question" : "wb-new-condition"); if (next) next.focus(); }, 0);
    });
    document.addEventListener("input", (e) => {
      const field = e.target.closest("[data-wb-field='hypothesis']");
      if (!field) return;
      const entry = currentDossierEntry(false);
      if (!entry) return;
      clearTimeout(UI.hypothesisTimer);
      const status = document.querySelector("[data-wb-save-status]");
      if (status) status.textContent = "Đang lưu…";
      UI.hypothesisTimer = setTimeout(() => { setHypothesis(entry, field.value); const ok = persist(); if (status) status.textContent = ok ? "Đã lưu trong trình duyệt này." : "Không lưu được vào trình duyệt; hãy xuất tệp để giữ ghi chú."; }, 400);
    });
    document.addEventListener("change", (e) => {
      const input = e.target.closest("[data-wb-import]");
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      const reportEl = () => document.querySelector("[data-wb-import-report]");
      if (file.size > LIMITS.importBytes) { const r = reportEl(); if (r) r.innerHTML = importReportHtml({ ok: false, error: "FILE_TOO_LARGE" }); input.value = ""; return; }
      const reader = new FileReader();
      reader.onload = () => {
        const { journal, report } = importJournal(UI.journal, String(reader.result || ""), { indexDoc: wsDoc() });
        if (report.ok) { UI.journal = journal; if (UI.journalStatus !== "unavailable") UI.journalStatus = "ok"; persist(); }
        renderJournalView(false);
        const r = reportEl(); if (r) r.innerHTML = importReportHtml(report);
      };
      reader.onerror = () => { const r = reportEl(); if (r) r.innerHTML = importReportHtml({ ok: false, error: "NOT_JSON" }); };
      reader.readAsText(file);
      input.value = "";
    });
    window.addEventListener("storage", (e) => {
      if (e.key !== JOURNAL_STORAGE_KEY) return;
      const loaded = loadJournal();
      UI.journal = loaded.journal;
      UI.journalStatus = loaded.status;
      const view = UI.ctx && UI.ctx.getView ? UI.ctx.getView() : "";
      if (view === "journal") renderJournalView(false);
    });
  }

  function attach(ctx) {
    UI.ctx = ctx;
    const loaded = loadJournal();
    UI.journal = loaded.journal;
    UI.journalStatus = loaded.status;
    if (typeof document !== "undefined") bind();
  }

  return {
    JOURNAL_STORAGE_KEY, JOURNAL_SCHEMA, EXPORT_SCHEMA, MIN_COMPARE, MAX_COMPARE, LIMITS, DISCLAIMER, EVIDENCE_KINDS, HISTORY_SOURCES, WB_LABELS,
    codeLabel, codePolarity, reasonDimension, featureLabel, axisLabel, sanitizeText, stableHash, normTicker,
    buildDossier, dossierHtml, verificationQuestion,
    validateComparisonRequest, buildComparison, comparisonHtml, refusalHtml, permittedCrossSecurityStatistics,
    emptyJournal, normalizeEntry, normalizeJournal, loadJournal, saveJournal, clearJournal, findEntry, upsertEntry, removeEntry,
    setHypothesis, addQuestion, setQuestionStatus, removeQuestion, addCondition, removeCondition, entryStaleness, entryIdFor,
    exportJournal, importJournal, importReportHtml, journalListHtml,
    buildDossierExport, printableHtml,
    candidateSessions, extractFocusCardHistory, loadPublicHistory, historyHtml,
    attach, renderView,
  };
});
