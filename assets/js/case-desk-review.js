(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VSCaseDeskReview = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // INVESTOR_CASE_DESK_LOCAL_REVIEW_INTEGRATION_V1: open one Consumer Investment Research Case
  // Desk case (`investment_research_case/v1`, written by stocklookup-ai-research
  // `research-case`) inside the Cơ hội investigation workflow. The file the investor picks is
  // parsed in this tab only: it is never uploaded, stored, published or written into the URL,
  // and a reload forgets it. This module only validates, regroups and labels what the case
  // already states. It derives no posture, score, rank, target, probability or instruction, and
  // a Producer trigger state is shown as a technical condition, never as thesis confirmation.

  const CONTRACT = "investment_research_case/v1";
  const LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, members: 20, sessions: 10, evidence: 50000, topics: 60, text: 1500, rowsShown: 8 });
  const TICKER_RE = /^[A-Z0-9]{2,10}$/;
  const SESSION_RE = /^\d{4}-\d{2}-\d{2}$/;
  const CASE_ID_RE = /^investment_case:[0-9a-f]{64}$/;
  const EVIDENCE_ID_RE = /^case_evidence:[0-9a-f]{64}$/;
  const SHA_RE = /^[0-9a-f]{64}$/;
  const RUN_RE = /^daily_producer_run:[0-9a-f]{64}$/;
  const FQ_CONTRACT = "case_financial_quality_research/v1";
  const FQ_EVIDENCE_ID_RE = /^case_financial_quality_evidence:[0-9a-f]{64}$/;
  const FQ_SOURCE_RE = /^market_wide_current_fundamental_research:[0-9a-f]{64}$/;
  const FQ_EXACT = "EXACT_CASE_RUN_SOURCE_PROJECTION";
  const NOTICE = "Hồ sơ này chỉ nằm trong tab trình duyệt hiện tại: không tải lên máy chủ, không lưu, không đưa vào liên kết và không công bố. Tải lại hoặc đóng trang là hồ sơ biến mất.";

  function h(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function str(value) { return typeof value === "string" ? value : ""; }
  function clip(value, max) {
    const s = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    const n = max || LIMITS.text;
    return s.length > n ? `${s.slice(0, n)}…` : s;
  }
  function own(table, key) { return typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key); }

  // ---------------------------------------------------------------------------------------
  // Labels. Each restates the Case Desk / Producer code; unknown codes stay visible verbatim.
  // ---------------------------------------------------------------------------------------
  const RELATIONS = Object.freeze({
    QUALIFIED_OBSERVATION: { label: "Số liệu nguồn đủ điều kiện", cls: "source" },
    PRODUCER_EARNINGS_QUALITY_CONTEXT: { label: "Bối cảnh chất lượng lợi nhuận (Producer)", cls: "source" },
    SUPPORTING_ARGUMENT: { label: "Lập luận ủng hộ của Producer", cls: "inference" },
    CHALLENGING_ARGUMENT: { label: "Lập luận phản bác của Producer", cls: "inference" },
    GROUNDED_COUNTER_ARGUMENT: { label: "Phản luận có căn cứ nguồn", cls: "inference" },
    TECHNICAL_CONTEXT: { label: "Bối cảnh kỹ thuật, không phải chất lượng đầu tư", cls: "inference" },
    PRODUCER_CONDITION_NOT_CONSUMER_OUTCOME: { label: "Điều kiện Producer nêu, chưa phải kết quả", cls: "conditional" },
    PRODUCER_RESEARCH_QUESTION_NOT_FACT: { label: "Câu hỏi cần kiểm chứng, không phải dữ kiện", cls: "gap" },
    SOURCE_CONFLICT: { label: "Mâu thuẫn trong nguồn", cls: "gap" },
    RELATED_INSUFFICIENT: { label: "Liên quan nhưng chưa đủ kết luận", cls: "gap" },
    CONSUMER_CLASSIFICATION_NOT_NEW_FACT: { label: "Phân loại của Consumer, không phải dữ kiện mới", cls: "research" },
  });
  const DOMAINS = Object.freeze({
    OPERATING: "Hoạt động kinh doanh", CASH_BALANCE: "Dòng tiền & bảng cân đối", VALUATION: "Định giá",
    BUSINESS_RISK: "Rủi ro kinh doanh", TECHNICAL: "Kỹ thuật", TEMPORAL: "Diễn biến theo thời gian", COMPARISON: "So sánh",
  });
  const CONDITION_KINDS = Object.freeze({
    TECHNICAL_TRIGGER: "Kích hoạt kỹ thuật của thẻ nghiên cứu",
    TECHNICAL_INVALIDATION: "Vô hiệu kỹ thuật của thẻ nghiên cứu",
    INTEGRATED_DECISION_TRIGGER: "Kích hoạt của quyết định tích hợp (kỹ thuật)",
    INTEGRATED_DECISION_INVALIDATION: "Vô hiệu của quyết định tích hợp",
    FUNDAMENTAL_INVALIDATION: "Vô hiệu nền tảng",
  });
  const STATE_STATUS = Object.freeze({
    PRODUCER_REPORTED_STATE: "Producer báo trạng thái",
    NO_PRODUCER_STATE_REPORTED: "Producer không báo trạng thái — không coi là đã hay chưa kích hoạt",
    NOT_ISSUED_IN_LATEST_SESSION: "Không được phát hành ở phiên mới nhất của hồ sơ",
  });
  const TRIGGER_STATES = Object.freeze({
    TRIGGERED: "Đã kích hoạt", APPROACHING: "Đang tiến gần mức kích hoạt", BELOW_TRIGGER: "Dưới mức kích hoạt",
    NOT_TRIGGERED: "Chưa kích hoạt", UNKNOWN: "Chưa xác định", NOT_AVAILABLE: "Không có",
  });
  const POSTURES = Object.freeze({
    AVOID: "Tránh", WAIT_FOR_CONFIRMATION: "Chờ xác nhận", HOLD_DO_NOT_ADD: "Giữ, không mua thêm", WATCH: "Theo dõi",
    BUY_ON_CONFIRMATION: "Mua khi có xác nhận (thẻ kỹ thuật)", REDUCE_RISK: "Giảm rủi ro", HOLD: "Giữ", WAIT: "Chờ",
    AVOID_NEW_ENTRY: "Tránh mở vị thế mới", MONITOR: "Theo dõi",
  });
  const STATUSES = Object.freeze({
    UNKNOWN: "Chưa xác định",
    NON_RECURRING_COMPONENT_PRESENT_OR_POSSIBLE: "Có hoặc có thể có khoản không thường xuyên",
    NO_NON_RECURRING_COMPONENT_IDENTIFIED: "Chưa nhận diện khoản không thường xuyên",
    NO_QUALIFIED_NON_RECURRING_LINE_EVIDENCE: "Chưa có dòng báo cáo về khoản không thường xuyên đủ điều kiện",
    EXPLICIT_REPORTED_PROVISION_CHARGE_OR_REVERSAL_ADJUSTMENT: "Có khoản trích lập/hoàn nhập dự phòng được báo cáo",
    COMPREHENSIVE_INCOME_NOT_SUPPLIED_BY_PRODUCER: "Producer không cung cấp thu nhập toàn diện (OCI)",
    NOT_SUPPLIED_BY_PRODUCER: "Producer không cung cấp",
    NOT_CALCULATED: "Không tính",
    UNAVAILABLE: "Không có",
    PEER_RELATIVE_RESEARCH_IN_INTEGRATED_DECISION: "Chỉ có định giá tương đối theo nhóm trong quyết định tích hợp",
    VALUATION_PEER_CONTEXT_UNAVAILABLE: "Không có bối cảnh định giá theo nhóm",
    INVESTIGATION_NOT_VERDICT: "Điều tra, không phải kết luận",
    SOURCE_GROUNDED_ARGUMENTS: "Lập luận có căn cứ nguồn",
    FIXED_CATEGORY_PRECEDENCE_NOT_A_STRENGTH_SCORE: "Chọn theo thứ tự nhóm cố định, không phải điểm mạnh yếu",
    SOURCE_INFERENCE_IS_ATTRIBUTED_ARGUMENT_NOT_CAUSAL_PROOF: "Suy luận của nguồn là lập luận được ghi nguồn, không phải bằng chứng nhân quả",
    SEPARATED_SOURCE_STATES_NOT_A_VERDICT_SCORE_OR_INSTRUCTION: "Các trạng thái nguồn được tách riêng, không phải kết luận, điểm hay lệnh",
    REPORTED_PROFIT_NOT_ESTABLISHED_AS_RECURRING_OR_COMPREHENSIVE_INCOME: "Lợi nhuận báo cáo chưa được xác lập là lợi nhuận thường xuyên hay thu nhập toàn diện",
    NOT_PERMITTED_EARNINGS_COMPONENT_CONTEXT: "Chỉ là bối cảnh, không được dùng để định giá",
    UNANSWERED_NO_AUTOMATIC_THESIS_CONFIRMATION: "Chưa trả lời; không tự động xác nhận luận điểm",
    HUMAN_FRAMING_NOT_VERIFIED_FACT: "Cách đặt vấn đề của nhà đầu tư, chưa được kiểm chứng",
    COMPLETE_COVERAGE: "Đủ dữ liệu cho mọi mã và phiên yêu cầu",
    PARTIAL_COVERAGE: "Thiếu dữ liệu ở một số mã hoặc phiên",
    corporate: "Doanh nghiệp", bank: "Ngân hàng", securities: "Công ty chứng khoán", insurance: "Bảo hiểm",
    CROSS_INDUSTRY_BUSINESS_ECONOMICS_DIFFER: "Khác ngành, mô hình kinh doanh khác nhau",
    ENTITY_CLASS_UNKNOWN_OR_CONFLICTING: "Loại hình doanh nghiệp chưa rõ hoặc mâu thuẫn",
    FINANCIAL_POSITION_BASIS_NOT_PROFITABILITY_OR_CASH: "Chỉ dựa trên tình hình tài chính, không phải lợi nhuận hay dòng tiền",
    // conclusion limits and narrative guards
    NO_STRENGTH_ORDERING_OF_POSTURES: "Không xếp hạng mạnh yếu giữa các tư thế",
    REVISION_CAVEAT_IS_NOT_PROOF_OF_REVISION_ONLY_CAUSE: "Lưu ý về điều chỉnh dữ liệu không chứng minh nguyên nhân",
    ABSENCE_IS_NOT_NEGATIVE_EVIDENCE: "Thiếu dữ liệu không phải bằng chứng bất lợi",
    HISTORICAL_GROWTH_IS_NOT_CURRENT_MOMENTUM: "Tăng trưởng quá khứ không phải đà hiện tại",
    PROFIT_IS_NOT_CASH_FLOW_OR_FREE_CASH_FLOW: "Lợi nhuận không phải dòng tiền hay dòng tiền tự do",
    CONDITIONS_ARE_NOT_VERIFIED_OUTCOMES: "Điều kiện không phải kết quả đã xảy ra",
    NO_PROSPECTIVE_OR_HISTORICAL_PIT_AUTHORITY_CREATED: "Không tạo thẩm quyền dự báo hay điểm-thời-gian",
    NO_FREE_CASH_FLOW_CLAIM: "Không khẳng định dòng tiền tự do",
    NO_PROFIT_AS_OPERATING_CASH_CLAIM: "Không coi lợi nhuận là dòng tiền kinh doanh",
    NO_POSITION_AS_EARNINGS_QUALITY_CLAIM: "Không coi tình hình tài chính là chất lượng lợi nhuận",
    NO_CASH_GENERATION_CONFIRMATION: "Không xác nhận khả năng tạo tiền",
    NO_BUSINESS_WIDE_IMPROVEMENT_CLAIM: "Không khẳng định cải thiện toàn doanh nghiệp",
    NO_TECHNICAL_AS_INVESTMENT_QUALITY_CLAIM: "Không coi tín hiệu kỹ thuật là chất lượng đầu tư",
    UNKNOWNS_MUST_BE_ACKNOWLEDGED: "Phải nêu rõ điều chưa biết",
    NO_MISSING_AS_NEGATIVE_EVIDENCE_CLAIM: "Không coi thiếu dữ liệu là bằng chứng bất lợi",
  });
  const ROLES = Object.freeze({
    SUPPLIED_HOLDING: "Vị thế do nhà đầu tư nêu (không phải dữ kiện nắm giữ)", ALTERNATIVE: "Phương án thay thế", COMPARISON_ONLY: "Chỉ để so sánh",
  });
  const IMPORT_ERRORS = Object.freeze({
    EMPTY: "Tệp trống.",
    FILE_TOO_LARGE: "Tệp vượt giới hạn 8 MB của trình xem hồ sơ.",
    NOT_JSON: "Tệp không phải JSON hợp lệ.",
    NOT_OBJECT: "Tệp không chứa một hồ sơ.",
    WRONG_CONTRACT: "Không phải hồ sơ Case Desk (cần investment_research_case/v1).",
    BAD_IDENTITY: "Mã định danh hồ sơ không hợp lệ.",
    AUTHORITY_BOUNDARY: "Hồ sơ không giữ ranh giới thẩm quyền: phải không hành động được và Producer là nguồn số liệu duy nhất.",
    BAD_MEMBERS: "Danh sách mã của hồ sơ không hợp lệ (1–20 mã, không trùng).",
    BAD_SESSIONS: "Danh sách phiên của hồ sơ không hợp lệ (1–10 phiên tăng dần, có định danh lần chạy).",
    SESSION_MISMATCH: "Các phiên trong hồ sơ không khớp nhau.",
    BAD_SECTION: "Thiếu hoặc sai cấu trúc một phần bắt buộc của hồ sơ.",
    BAD_EVIDENCE: "Danh mục bằng chứng của hồ sơ không hợp lệ.",
    BAD_FINANCIAL_QUALITY: "Phần chất lượng tài chính (financial-quality) của hồ sơ không hợp lệ hoặc không khớp phiên/lần chạy của hồ sơ; không mở hồ sơ này.",
  });

  // Consumer PR #13: optional Producer `research financial-quality` outputs inside a case.
  // A binding state is shown exactly as the case states it, and EXACT is re-checked against
  // the case's own session/run/bundle before it is believed. The page derives nothing.
  const FQ_BINDINGS = Object.freeze({
    EXACT_CASE_RUN_SOURCE_PROJECTION: "Đúng nguồn của lần chạy",
    SEPARATE_SAME_DATE_DIFFERENT_SOURCE_PROJECTION: "Cùng ngày nhưng khác nguồn dữ liệu của lần chạy",
    SEPARATE_SOURCE_SESSION_NOT_IN_CASE: "Phiên nguồn không thuộc hồ sơ",
    SEPARATE_CASE_RUN_FUNDAMENTAL_IDENTITY_UNAVAILABLE: "Lần chạy không ghi định danh nguồn cơ bản",
  });
  const FQ_RELATIONS = Object.freeze({
    FQ_SOURCE_FACT: { label: "Số liệu nguồn (Producer)", cls: "source" },
    FQ_REPORTED_COMPONENT: { label: "Khoản mục được nguồn ghi nhận", cls: "source" },
    FQ_CASH_MEASUREMENT: { label: "Phép đo một kỳ của Producer", cls: "source" },
    FQ_OBSERVED_SUPPORT: { label: "Quan sát của Producer", cls: "inference" },
    FQ_ACCOUNTING_CAUTION: { label: "Cảnh báo kế toán của Producer", cls: "conditional" },
    FQ_UNSUPPORTED_CONCLUSION: { label: "Kết luận chưa có căn cứ", cls: "gap" },
    FQ_THESIS_TEST: { label: "Kiểm định luận điểm của Producer", cls: "research" },
    FQ_REFUSED_OR_BLOCKED: { label: "Producer từ chối ghép/so sánh", cls: "gap" },
  });
  const FQ_CODES = Object.freeze({
    REPORTED_PROFIT_OBSERVED: "Lợi nhuận kế toán được báo cáo; chưa xác lập là lợi nhuận bền vững hay đã chuẩn hóa",
    REPORTED_PROFIT_NOT_QUALIFIED: "Không có lợi nhuận báo cáo đủ điều kiện cho một kết luận lợi nhuận",
    REPORTED_PROVISION_COMPONENT: "Khoản điều chỉnh dự phòng không phải tiền thu về, không phải khoản một lần đã xác nhận và không được cộng lại vào lợi nhuận",
    REPORTED_DISPOSAL_COMPONENT: "Khoản thanh lý có thể làm méo hệ số lợi nhuận; tính lặp lại và thuế chưa được chứng minh",
    POSITIVE_PROFIT_NEGATIVE_OPERATING_CASH: "Lợi nhuận dương nhưng dòng tiền kinh doanh âm trong một kỳ cùng cơ sở; một kỳ không chứng minh nguyên nhân",
    OPERATING_CASH_AT_OR_ABOVE_PROFIT: "Dòng tiền kinh doanh bằng hoặc cao hơn lợi nhuận trong một kỳ cùng cơ sở; một kỳ không chứng minh chuyển hóa tiền bền vững",
    CASH_CONVERSION_NOT_ESTABLISHED: "Chưa có cặp lợi nhuận/dòng tiền kinh doanh cùng tài liệu, cùng kỳ, cùng cơ sở",
    RECURRENCE_NOT_ESTABLISHED: "Khoản mục được báo cáo không phải lợi nhuận chuẩn hóa; không có khoản mục cũng không chứng minh lợi nhuận sạch",
    WORKING_CAPITAL_CAUSALITY_NOT_ESTABLISHED: "Chưa có thuyết minh vốn lưu động, thu hồi hay hạn thanh toán; chênh lệch tiền không chứng minh nguyên nhân",
    CASH_OBLIGATIONS_NOT_ESTABLISHED: "Số dư tiền không cho biết tiền khả dụng sau nợ đến hạn, thuế, cổ tức, cam kết vốn",
    OCI_NOT_ADMITTED: "Chưa có cầu nối OCI/thuế/phân bổ được chấp nhận; lợi nhuận sau thuế không phải thu nhập toàn diện",
    VALUATION_DENOMINATOR_NOT_QUALIFIED: "Chưa có EPS đủ điều kiện, cơ sở cổ phiếu tương thích hay mẫu số lợi nhuận lặp lại; P/E thấp tự nó không chứng minh giá hấp dẫn",
    FISCAL_COMPARABILITY_LIMIT: "Mỗi quan sát chỉ đúng trong kỳ, phạm vi, tiền tệ và mức đảm bảo của nó; nhãn lịch không chứng minh so sánh được",
    SOURCE_QUALIFICATION_GAP: "Khoảng trống đủ điều kiện của nguồn",
    CASH_PAIRING_REFUSED: "Producer từ chối ghép lợi nhuận với dòng tiền",
    COMPARISON_REFUSED: "Producer từ chối so sánh",
    NO_SAME_STATEMENT_SET_OPERATING_CASH_FLOW: "Không có dòng tiền kinh doanh trong cùng bộ báo cáo",
    OPERATING_CASH_FLOW_ONLY_FOR_OTHER_PERIODS: "Dòng tiền kinh doanh chỉ có cho kỳ khác",
    NO_SAME_STATEMENT_SET_QUALIFIED_PROFIT: "Không có lợi nhuận đủ điều kiện trong cùng bộ báo cáo",
  });
  const FQ_CLAIMS = Object.freeze({
    "Reported profit reflects sustainable earnings": "Lợi nhuận báo cáo phản ánh lợi nhuận bền vững",
    "Accounting profit is supported by operating cash": "Lợi nhuận kế toán được dòng tiền kinh doanh hỗ trợ",
    "A low reported multiple represents attractive value": "Hệ số định giá báo cáo thấp nghĩa là giá hấp dẫn",
  });
  const FQ_STATES = Object.freeze({
    REPORTED_PROFIT_OBSERVED: "Có lợi nhuận báo cáo", REPORTED_PROFIT_NOT_QUALIFIED: "Không có lợi nhuận đủ điều kiện",
    SOURCE_LABELLED_COMPONENTS_REPORTED: "Có khoản mục được nguồn ghi nhận", NO_ADMITTED_COMPONENT: "Không có khoản mục được chấp nhận",
    SAME_BASIS_ONE_PERIOD_MEASUREMENT_REPORTED: "Có phép đo cùng cơ sở trong một kỳ",
    NOT_COMPARABLE_ON_SUPPLIED_EVIDENCE: "Không so sánh được trên bằng chứng hiện có",
    INDUSTRIAL_CASH_CONVERSION_NOT_APPLICABLE: "Không áp dụng chuyển hóa tiền kiểu doanh nghiệp phi tài chính cho loại hình này",
    UNSUPPORTED: "Chưa được hỗ trợ", BOUNDED_MEASUREMENT_ONLY: "Chỉ có phép đo giới hạn", NOT_SUPPLIED: "Không được cung cấp",
    UNKNOWN: "Chưa xác định", NOT_CALCULATED: "Không tính",
    INCLUDED: "Có trong nguồn", NOT_IN_SUPPLIED_ARTIFACT: "Mã không có trong nguồn financial-quality",
    REFUSED_ENTITY_CLASS_CONFLICT: "Bị từ chối: loại hình doanh nghiệp mâu thuẫn với hồ sơ",
    CORPORATE_INDUSTRIAL_CASH_CONVERSION: "Doanh nghiệp phi tài chính",
    NOT_APPLICABLE_FINANCIAL_OR_UNRESOLVED_ENTITY: "Tổ chức tài chính hoặc loại hình chưa xác định",
  });

  function label(table, code) {
    const raw = typeof code === "string" ? code : code === null || code === undefined ? "" : String(code);
    if (!raw) return { raw: "", text: "Không có", known: false };
    return own(table, raw) ? { raw, text: table[raw], known: true } : { raw, text: raw, known: false };
  }
  function labelHtml(table, code) {
    const l = label(table, code);
    return l.known ? `<span title="${h(l.raw)}">${h(l.text)}</span>` : `<code class="cdr-code">${h(clip(l.text, 200))}</code>`;
  }
  function blockerHtml(code) {
    const raw = str(code);
    const m = /^DIFFERENT_ACCOUNTING_ECONOMICS:([a-z_]+)\|([a-z_]+)$/.exec(raw);
    if (m) return `<span title="${h(raw)}">Khác mô hình kế toán (${h(label(STATUSES, m[1]).text)} / ${h(label(STATUSES, m[2]).text)}) — không so sánh chỉ số</span>`;
    return labelHtml(STATUSES, raw);
  }

  // ---------------------------------------------------------------------------------------
  // Parsing and validation. A rejected file returns an error code and never a partial model.
  // ---------------------------------------------------------------------------------------
  function byteLength(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }
  function fail(error, detail) { return { ok: false, error, message: IMPORT_ERRORS[error] || error, detail: detail ? clip(detail, 200) : "" }; }

  function parseCase(text, opts) {
    const raw = typeof text === "string" ? text : "";
    const declared = opts && Number.isFinite(opts.bytes) ? opts.bytes : null;
    if (declared !== null && declared > LIMITS.bytes) return fail("FILE_TOO_LARGE");
    if (raw.length > LIMITS.bytes || byteLength(raw) > LIMITS.bytes) return fail("FILE_TOO_LARGE");
    if (!raw.trim()) return fail("EMPTY");
    let doc;
    try { doc = JSON.parse(raw); } catch (err) { return fail("NOT_JSON"); }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return fail("NOT_OBJECT");
    return validateCase(doc);
  }

  function validateCase(doc) {
    if (doc.contract_version !== CONTRACT) return fail("WRONG_CONTRACT", str(doc.contract_version));
    if (!CASE_ID_RE.test(str(doc.case_identity))) return fail("BAD_IDENTITY");
    const authority = obj(doc.authority_boundary);
    if (authority.is_actionable !== false || authority.producer_is_sole_factual_and_numerical_authority !== true) return fail("AUTHORITY_BOUNDARY");

    const request = obj(doc.request);
    const members = arr(request.members);
    if (!members.length || members.length > LIMITS.members) return fail("BAD_MEMBERS");
    const tickers = [];
    for (const m of members) {
      const t = str(obj(m).ticker);
      if (!TICKER_RE.test(t) || tickers.includes(t)) return fail("BAD_MEMBERS", t);
      tickers.push(t);
    }

    const basis = arr(doc.session_basis);
    if (!basis.length || basis.length > LIMITS.sessions) return fail("BAD_SESSIONS");
    const sessions = [];
    for (const b of basis) {
      const s = obj(b);
      if (!SESSION_RE.test(str(s.session)) || !RUN_RE.test(str(s.run_identity)) || !SHA_RE.test(str(s.bundle_sha256))) return fail("BAD_SESSIONS", str(s.session));
      if (sessions.length && sessions[sessions.length - 1].session >= s.session) return fail("BAD_SESSIONS", s.session);
      sessions.push({ session: s.session, run: s.run_identity, bundle: s.bundle_sha256, head: str(s.producer_head) });
    }
    const requested = arr(request.sessions).map((s) => str(obj(s).session));
    if (requested.length !== sessions.length || requested.some((s, i) => s !== sessions[i].session)) return fail("SESSION_MISMATCH", "request.sessions");
    arr(request.sessions).forEach((s, i) => { if (str(obj(s).expected_run_identity) && obj(s).expected_run_identity !== sessions[i].run) sessions[i].mismatch = true; });
    if (sessions.some((s) => s.mismatch)) return fail("SESSION_MISMATCH", "expected_run_identity");
    const latestSession = sessions[sessions.length - 1].session;

    for (const key of ["overview", "decision_distinctions", "thesis_challenges", "evidence_catalogue"]) {
      if (!Array.isArray(doc[key])) return fail("BAD_SECTION", key);
    }
    for (const key of ["overview", "decision_distinctions", "thesis_challenges"]) {
      const seen = new Set();
      for (const row of doc[key]) {
        const t = str(obj(row).ticker);
        if (!tickers.includes(t) || seen.has(t)) return fail("BAD_SECTION", `${key}:${t}`);
        seen.add(t);
      }
    }
    for (const row of doc.decision_distinctions) {
      if (!sessions.some((s) => s.session === obj(row).session)) return fail("SESSION_MISMATCH", `decision_distinctions:${str(obj(row).ticker)}`);
    }

    const catalogue = doc.evidence_catalogue;
    if (catalogue.length > LIMITS.evidence) return fail("BAD_EVIDENCE", "too many rows");
    const evidence = new Map();
    for (const e of catalogue) {
      const row = obj(e);
      const id = str(row.evidence_identity);
      const cit = obj(row.citation);
      if (!EVIDENCE_ID_RE.test(id) || evidence.has(id) || !str(row.relation) || !row.observation || typeof row.observation !== "object") return fail("BAD_EVIDENCE", id);
      if (!tickers.includes(str(cit.ticker)) || !sessions.some((s) => s.session === cit.session)) return fail("BAD_EVIDENCE", id);
      evidence.set(id, row);
    }
    if (arr(request.topics).length > LIMITS.topics) return fail("BAD_SECTION", "topics");
    const fq = validateFinancialQuality(doc, tickers, sessions);
    if (!fq.ok) return fq;
    return { ok: true, model: buildModel(doc, tickers, sessions, evidence, fq.value) };
  }

  function validateFinancialQuality(doc, tickers, sessions) {
    const bad = (detail) => fail("BAD_FINANCIAL_QUALITY", detail);
    const raw = doc.financial_quality_research;
    const pins = obj(doc.request).financial_quality_artifact_sha256;
    const bridges = doc.decision_distinctions.filter((d) => obj(d).financial_quality_bridge !== undefined);
    if (raw === undefined) return pins === undefined && !bridges.length ? { ok: true, value: null } : bad("financial_quality_research missing");
    const research = obj(raw);
    const artifacts = arr(research.artifacts);
    if (research.contract_version !== FQ_CONTRACT || !artifacts.length || artifacts.length > 10) return bad(str(research.contract_version) || "artifacts");
    const bySha = new Map();
    const blocks = {};
    let rows = 0;
    for (const a of artifacts) {
      const src = obj(obj(a).source);
      const sha = str(src.artifact_sha256);
      const day = str(src.source_session);
      const binding = obj(src.binding);
      if (!SHA_RE.test(sha) || bySha.has(sha) || !SESSION_RE.test(day) || [...bySha.values()].some((x) => x.source_session === day)
          || !FQ_SOURCE_RE.test(str(src.source_artifact_identity)) || !own(FQ_BINDINGS, binding.state)) return bad(sha || day);
      const run = sessions.find((x) => x.session === day);
      // EXACT is believed only when it names this case's own session, run and bundle.
      if (binding.state === FQ_EXACT && !(run && binding.session === day && binding.run_identity === run.run && binding.bundle_sha256 === run.bundle)) return bad(`binding:${day}`);
      if (binding.state === "SEPARATE_SOURCE_SESSION_NOT_IN_CASE" && run) return bad(`binding:${day}`);
      bySha.set(sha, src);
      const seen = new Set();
      for (const t of arr(obj(a).tickers)) {
        const block = obj(t);
        const ticker = str(block.ticker);
        if (!tickers.includes(ticker) || seen.has(ticker) || !str(block.status)) return bad(`ticker:${ticker}`);
        seen.add(ticker);
        const byId = new Map();
        for (const e of arr(block.evidence)) {
          const row = obj(e);
          const id = str(row.evidence_identity);
          const rs = obj(row.source);
          if (!FQ_EVIDENCE_ID_RE.test(id) || byId.has(id) || !str(row.relation) || !row.observation || typeof row.observation !== "object"
              || rs.ticker !== ticker || rs.artifact_sha256 !== sha || rs.binding_state !== binding.state) return bad(id || ticker);
          byId.set(id, row);
        }
        rows += byId.size;
        if (rows > LIMITS.evidence) return bad("too many rows");
        (blocks[ticker] = blocks[ticker] || []).push(Object.freeze({ source: src, block, rows: byId }));
      }
    }
    const shas = [...bySha.keys()].sort();
    if (!Array.isArray(pins) || pins.length !== shas.length || pins.some((p, i) => p !== shas[i])) return bad("request pins");
    for (const d of bridges) {
      for (const b of arr(obj(d).financial_quality_bridge)) {
        const src = bySha.get(str(obj(b).artifact_sha256));
        if (!src || obj(src.binding).state !== obj(b).binding_state || src.source_session !== obj(b).source_session) return bad(`bridge:${str(obj(d).ticker)}`);
      }
    }
    // Exact source binding first, then by source session.
    Object.keys(blocks).forEach((t) => blocks[t].sort((x, y) => (x.source.binding.state !== FQ_EXACT) - (y.source.binding.state !== FQ_EXACT)
      || (x.source.source_session < y.source.source_session ? -1 : x.source.source_session > y.source.source_session ? 1 : 0)));
    return { ok: true, value: Object.freeze({ blocks }) };
  }

  function byTicker(rows) {
    const out = {};
    arr(rows).forEach((r) => { out[r.ticker] = r; });
    return out;
  }

  function buildModel(doc, tickers, sessions, evidence, financialQuality) {
    const request = obj(doc.request);
    const roles = {};
    arr(request.members).forEach((m) => { roles[m.ticker] = str(m.research_role); });
    const topics = arr(request.topics).map((t) => ({
      id: str(obj(t).topic_identity), kind: str(obj(t).kind), text: clip(str(obj(t).text)), domains: arr(obj(t).domains).filter((d) => typeof d === "string"),
    }));
    const investigations = {};
    arr(doc.question_investigations).forEach((q) => { if (str(obj(q).topic_identity)) investigations[q.topic_identity] = q; });
    const latest = sessions[sessions.length - 1].session;
    const latestComparison = arr(doc.comparisons).find((c) => obj(c).session === latest);
    return Object.freeze({
      caseIdentity: doc.case_identity,
      status: str(doc.status),
      coverage: obj(doc.coverage),
      tickers,
      roles,
      topics,
      investigations,
      sessions,
      latestSession: latest,
      overview: byTicker(doc.overview),
      distinctions: byTicker(doc.decision_distinctions),
      challenges: byTicker(doc.thesis_challenges),
      profiles: byTicker(arr(doc.current_profiles).filter((p) => tickers.includes(str(obj(p).ticker)))),
      pairs: arr(obj(latestComparison).pairs).filter((p) => arr(obj(p).tickers).length === 2),
      gaps: arr(doc.grouped_next_investigation),
      conclusionLimits: arr(doc.conclusion_limits).filter((c) => typeof c === "string"),
      evidence,
      financialQuality: financialQuality || null,
    });
  }

  // ---------------------------------------------------------------------------------------
  // Case session versus the currently published Dashboard session.
  // ---------------------------------------------------------------------------------------
  function compareWithPublished(model, indexDoc, ticker) {
    const doc = obj(indexDoc);
    const published = SESSION_RE.test(str(doc.as_of_session)) ? doc.as_of_session : "";
    const card = obj(obj(doc.cards)[ticker]);
    const inPublished = Boolean(published && Object.keys(card).length);
    const overview = obj(model.overview[ticker]);
    const integrated = arr(obj(model.distinctions[ticker]).conditions).find((c) => obj(c).kind === "INTEGRATED_DECISION_TRIGGER");
    let state = "NO_PUBLISHED_SESSION";
    if (published) state = model.latestSession === published ? "SAME_DATE_RUN_NOT_VERIFIED" : model.latestSession < published ? "CASE_OLDER" : "CASE_NEWER";
    return {
      state,
      caseSession: model.latestSession,
      publishedSession: published,
      inPublished,
      casePosture: str(overview.latest_research_action_posture),
      caseTriggerState: integrated && obj(integrated).state_status === "PRODUCER_REPORTED_STATE" ? str(integrated.producer_state) : "",
      publishedPosture: inPublished ? str(card.research_action_posture) : "",
      publishedTriggerState: inPublished ? str(obj(card.reference_trigger).trigger_state) : "",
    };
  }
  const SESSION_STATES = Object.freeze({
    SAME_DATE_RUN_NOT_VERIFIED: "Cùng ngày phiên với dữ liệu đang công bố. Dashboard không công bố mã lần chạy Producer, nên trang không xác nhận được hai bên dùng cùng một lần chạy.",
    CASE_OLDER: "Hồ sơ là nghiên cứu cũ hơn dữ liệu đang công bố. Trạng thái hiện tại là cột “Đang công bố”; hồ sơ chỉ cho biết bối cảnh tại phiên của nó.",
    CASE_NEWER: "Hồ sơ mới hơn dữ liệu đang công bố trên Dashboard. Không coi dữ liệu Dashboard là trạng thái mới nhất của mã này.",
    NO_PUBLISHED_SESSION: "Chưa đọc được phiên dữ liệu đang công bố.",
  });

  // ---------------------------------------------------------------------------------------
  // Rendering. Every string from the file goes through h(); identities are pattern-checked.
  // ---------------------------------------------------------------------------------------
  function valueText(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("vi-VN", { maximumFractionDigits: 6 });
    if (typeof value === "string") return clip(value, 400);
    if (typeof value === "boolean") return value ? "có" : "không";
    if (value === null || value === undefined) return "—";
    if (Array.isArray(value)) return value.slice(0, 8).map(valueText).join(", ") + (value.length > 8 ? ` … (+${value.length - 8})` : "");
    return Object.keys(value).slice(0, 8).map((k) => `${k}: ${valueText(value[k])}`).join("; ");
  }
  function observationHtml(relation, o) {
    if (relation === "QUALIFIED_OBSERVATION") {
      return `<span class="wb-item-label"><b>${h(clip(o.metric, 80))}</b> · ${h(clip(o.reporting_period, 20))} · ${h(clip(o.statement_scope, 40))}: <span class="wb-item-value">${h(valueText(o.value))}</span> ${h(clip(o.currency, 8))}${o.unit_scale && o.unit_scale !== 1 ? ` ×${h(valueText(o.unit_scale))}` : ""}</span>`
        + `<div class="wb-item-meta">Đảm bảo: ${h(clip(o.assurance || "không rõ", 40))} · biết lúc ${h(clip(o.knowledge_available_at || "—", 40))} · ${h(clip(o.temporal_status || "", 60))}</div>`;
    }
    if (relation === "PRODUCER_EARNINGS_QUALITY_CONTEXT") return earningsContextHtml(o);
    if (relation === "TECHNICAL_CONTEXT") {
      return `<span class="wb-item-label">Tư thế ${labelHtml(POSTURES, o.research_action_posture)} · trạng thái ${h(clip(o.entry_state, 60))} · pha ${h(clip(o.tactical_phase, 60))}</span><div class="wb-item-meta">Nhãn kỹ thuật, không phải chất lượng đầu tư hay lệnh giao dịch.</div>`;
    }
    if (typeof o.text === "string") return `<span class="wb-item-label">${h(clip(o.text))}</span>`;
    if (o.text && typeof o.text === "object") return `<span class="wb-item-label">${h(valueText(o.text))}</span>`;
    if (typeof o.code === "string") {
      const value = o.source_value !== undefined ? valueText(o.source_value) : "";
      return `<span class="wb-item-label">${labelHtml(STATUSES, o.code)}${value ? `: ${h(value)}` : ""}</span>`;
    }
    const keys = Object.keys(o).filter((k) => k !== "evidence_ref").slice(0, 6);
    return `<span class="wb-item-label">${keys.map((k) => `${h(k)}: ${h(valueText(o[k]))}`).join(" · ") || "—"}</span>`;
  }
  function evidenceRowHtml(model, id) {
    const e = EVIDENCE_ID_RE.test(str(id)) ? model.evidence.get(id) : null;
    if (!e) return `<li class="wb-item wb-item-gap" data-case-evidence-missing="true"><span class="wb-item-label">Hồ sơ nhắc tới bằng chứng không có trong danh mục của tệp.</span></li>`;
    const rel = RELATIONS[e.relation] || { label: e.relation, cls: "gap" };
    const cit = obj(e.citation);
    return `<li class="wb-item" data-case-relation="${h(e.relation)}"><div class="wb-item-head"><span class="wb-kind wb-kind-${h(rel.cls)}">${h(clip(rel.label, 120))}</span>${observationHtml(e.relation, obj(e.observation))}</div>`
      + `<div class="wb-item-meta">${h(DOMAINS[e.domain] || clip(e.domain, 40))} · phiên ${h(clip(cit.session, 10))} · <code class="cdr-code">${h(clip(cit.evidence_ref, 160))}</code></div></li>`;
  }
  function evidenceListHtml(model, ids, emptyText) {
    const list = arr(ids).filter((x) => typeof x === "string");
    if (!list.length) return `<p class="cockpit-note">${h(emptyText || "Hồ sơ không có bằng chứng ở mục này.")}</p>`;
    const head = list.slice(0, LIMITS.rowsShown).map((id) => evidenceRowHtml(model, id)).join("");
    const rest = list.slice(LIMITS.rowsShown);
    return `<ul class="wb-items">${head}</ul>${rest.length ? `<details class="wb-more"><summary>Xem thêm ${rest.length} bằng chứng</summary><ul class="wb-items">${rest.map((id) => evidenceRowHtml(model, id)).join("")}</ul></details>` : ""}`;
  }
  function earningsContextHtml(o) {
    const comps = arr(o.components);
    return `<span class="wb-item-label">Chất lượng lợi nhuận: ${labelHtml(STATUSES, o.earnings_quality_status)} · lý do ${labelHtml(STATUSES, o.reason)}</span>`
      + (o.interpretation ? `<div class="wb-item-meta">${labelHtml(STATUSES, o.interpretation)}</div>` : "")
      + `<div class="wb-item-meta">Tính lặp lại: ${labelHtml(STATUSES, o.recurrence_assessment || "UNKNOWN")} · chuẩn hóa: ${labelHtml(STATUSES, o.normalization_status || "NOT_CALCULATED")} · OCI: ${labelHtml(STATUSES, o.comprehensive_income)}</div>`
      + (comps.length ? `<ul class="cdr-sublist">${comps.slice(0, 8).map((c) => `<li>${h(clip(c.canonical_metric, 80))} · dòng ${h(clip(c.line_code, 8))} · ${h(clip(c.reporting_period, 20))}: ${h(valueText(c.value))} ${h(clip(c.currency, 8))} · ${h(clip(c.audit_or_review_status, 30))} · ${labelHtml(STATUSES, c.valuation_use)}${c.extraction_method ? ` · trích xuất ${h(clip(c.extraction_method, 60))}` : ""}</li>`).join("")}</ul>` : "");
  }

  // ---------------------------------------------------------------------------------------
  // Financial quality (Consumer PR #13). Values are shown as the Producer output states them.
  // ---------------------------------------------------------------------------------------
  function fqCodeHtml(code) { return labelHtml(FQ_CODES, code); }
  function fqFactHtml(o) {
    return `<span class="wb-item-label"><b>${h(clip(o.canonical_metric, 80))}</b> · ${h(clip(o.reporting_period, 20))} (${h(clip(o.period_start, 10))} → ${h(clip(o.period_end, 10))}) · ${h(clip(o.statement_scope, 40))}: <span class="wb-item-value">${h(valueText(o.normalized_value))}</span> ${h(clip(o.currency, 8))}${o.unit_scale && o.unit_scale !== 1 ? ` ×${h(valueText(o.unit_scale))}` : ""}</span>`
      + `<div class="wb-item-meta">Đảm bảo: ${h(clip(o.audit_or_review_status || "không rõ", 40))} · dòng ${h(clip(o.line_code, 8))} trang ${h(valueText(o.source_page))} · biết lúc ${h(clip(o.knowledge_available_at || "—", 40))} · tài liệu <code class="cdr-code" title="${h(clip(o.document_sha256, 64))}">${h(clip(o.document_sha256, 12))}</code></div>`;
  }
  function fqRowHtml(entry, rows) {
    const e = entry || {};
    const rel = FQ_RELATIONS[e.relation] || { label: e.relation, cls: "gap" };
    const o = obj(e.observation);
    let body;
    if (e.relation === "FQ_SOURCE_FACT") body = fqFactHtml(o);
    else if (e.relation === "FQ_REPORTED_COMPONENT") body = `${fqFactHtml(o)}<div class="wb-item-meta">Tính lặp lại: ${labelHtml(FQ_STATES, o.recurrence_assessment || "UNKNOWN")} · chuẩn hóa: ${labelHtml(FQ_STATES, o.normalization_status || "NOT_CALCULATED")}</div>`;
    else if (e.relation === "FQ_CASH_MEASUREMENT") {
      body = `<span class="wb-item-label">${h(clip(arr(o.bounds)[0], 10))} → ${h(clip(arr(o.bounds)[1], 10))} · ${h(clip(o.statement_scope, 40))}: dòng tiền kinh doanh ${h(valueText(o.operating_cash_flow))} so với lợi nhuận ${h(valueText(o.profit))} ${h(clip(o.currency, 8))}</span>`
        + `<div class="wb-item-meta">Tỷ lệ do Producer báo cáo: ${h(valueText(o.conversion_ratio))} — một kỳ, mô tả, không chứng minh nguyên nhân hay tính bền vững.</div>`;
    } else if (e.relation === "FQ_THESIS_TEST") {
      body = `<span class="wb-item-label">${h(clip(own(FQ_CLAIMS, o.claim) ? FQ_CLAIMS[o.claim] : o.claim, 300))}: <b>${labelHtml(FQ_STATES, o.status)}</b></span>`
        + `<div class="wb-item-meta">Cần để xác nhận (nguyên văn Producer): ${h(clip(o.confirming_evidence_needed, 600))}</div><div class="wb-item-meta">Vô hiệu khi (nguyên văn Producer): ${h(clip(o.invalidation_condition, 600))}</div>`;
    } else if (e.relation === "FQ_REFUSED_OR_BLOCKED") {
      const span = arr(o.bounds).length === 2 ? `${h(clip(o.bounds[0], 10))} → ${h(clip(o.bounds[1], 10))}: ` : "";
      body = `<span class="wb-item-label">${span}${arr(o.reason_codes).slice(0, 8).map(fqCodeHtml).join("; ") || "—"}</span>`;
    } else {
      // Producer statements: Vietnamese label for known codes, Producer text verbatim beside it.
      const cited = arr(o.citation_ids).map((c) => [...rows.values()].find((r) => r.relation === "FQ_SOURCE_FACT" && obj(r.observation).citation_id === c)).filter(Boolean);
      body = `<span class="wb-item-label">${fqCodeHtml(o.code)}</span><div class="wb-item-meta">Producer: ${h(clip(o.text, 600))}</div>`
        + (cited.length ? `<ul class="cdr-sublist">${cited.slice(0, 4).map((r) => `<li>${fqFactHtml(obj(r.observation))}</li>`).join("")}</ul>` : "");
    }
    return `<li class="wb-item" data-fq-relation="${h(clip(e.relation, 60))}"><div class="wb-item-head"><span class="wb-kind wb-kind-${h(rel.cls)}">${h(clip(rel.label, 120))}</span>${body}</div></li>`;
  }
  function fqListHtml(rows, ids, emptyText) {
    const list = arr(ids).filter((x) => typeof x === "string");
    if (!list.length) return `<p class="cockpit-note">${h(emptyText || "Không có.")}</p>`;
    const item = (id) => (FQ_EVIDENCE_ID_RE.test(id) && rows.has(id) ? fqRowHtml(rows.get(id), rows)
      : '<li class="wb-item wb-item-gap" data-case-evidence-missing="true"><span class="wb-item-label">Hồ sơ nhắc tới bằng chứng không có trong nguồn financial-quality của tệp.</span></li>');
    const head = list.slice(0, LIMITS.rowsShown).map(item).join("");
    const rest = list.slice(LIMITS.rowsShown);
    return `<ul class="wb-items">${head}</ul>${rest.length ? `<details class="wb-more"><summary>Xem thêm ${rest.length} mục</summary><ul class="wb-items">${rest.map(item).join("")}</ul></details>` : ""}`;
  }
  function fqBindingHtml(model, src) {
    const b = obj(src.binding);
    const at = h(clip(src.consultation_cutoff, 40));
    const day = h(clip(src.source_session, 10));
    if (b.state === FQ_EXACT) {
      return `<div class="cockpit-note" role="note" data-fq-binding="${h(b.state)}"><b>${h(FQ_BINDINGS[b.state])} phiên ${day}</b>: số liệu lấy từ đúng nguồn dữ liệu cơ bản mà lần chạy <code class="cdr-code" title="${h(clip(b.run_identity, 90))}">${h(clip(b.run_identity, 30))}</code> của phiên này đã dùng (trang đã khớp mã lần chạy và bundle với hồ sơ). Phần giải thích được tra cứu sau, lúc ${at}: không phải kết luận đã có tại phiên ${day} và không phải thẻ Daily đã giao.${src.source_session !== model.latestSession ? ` Đây là phiên ${day}, không phải phiên mới nhất ${h(model.latestSession)} của hồ sơ.` : ""}</div>`;
    }
    return `<div class="vs-alert vs-alert-warning" role="note" data-fq-binding="${h(clip(b.state, 80))}"><b>Bối cảnh tra cứu sau / hiện tại — không thuộc thời điểm của bất kỳ phiên nào trong hồ sơ.</b> ${labelHtml(FQ_BINDINGS, b.state)} (phiên nguồn ${day}, tra cứu lúc ${at}). Cùng mã hay cùng ngày không chứng minh cùng lần chạy.</div>`;
  }
  function fqAnswersHtml(entry) {
    const t = entry.block;
    if (t.status !== "INCLUDED") return `<p class="cockpit-note" data-fq-status="${h(clip(t.status, 60))}">${labelHtml(FQ_STATES, t.status)}${t.status === "REFUSED_ENTITY_CLASS_CONFLICT" ? ` (hồ sơ: ${labelHtml(STATUSES, t.case_entity_class)}, nguồn: ${labelHtml(STATUSES, t.source_entity_class)})` : ""}.</p>`;
    const q = obj(t.investor_answers);
    const rows = entry.rows;
    const st = (code) => `<b>${labelHtml(FQ_STATES, code || "NOT_SUPPLIED")}</b>`;
    const profit = obj(q.reported_profit), comp = obj(q.unusual_or_provision_components), cash = obj(q.cash_vs_profit);
    const rec = obj(q.recurring_earnings), val = obj(q.valuation_denominator);
    const excluded = arr(t.excluded_after_source_cutoff_or_untimed).length;
    // Source figures no answer cites (for example equity) stay visible rather than dropped.
    const cited = new Set();
    const collect = (v) => { if (typeof v === "string") cited.add(v); else if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === "object") Object.values(v).forEach(collect); };
    collect(q);
    const other = [...rows.keys()].filter((id) => !cited.has(id) && rows.get(id).relation === "FQ_SOURCE_FACT");
    return `<p class="cockpit-note">Loại hình theo nguồn: ${labelHtml(STATUSES, t.source_entity_class)} · ${labelHtml(FQ_STATES, t.applicability)}</p>
      <h6>Lợi nhuận thực sự được báo cáo</h6><p>${st(profit.state)}</p>${fqListHtml(rows, profit.evidence)}
      <h6>Khoản bất thường / dự phòng có nguồn</h6><p>${st(comp.state)} · tính lặp lại: ${labelHtml(FQ_STATES, comp.recurrence_assessment || "UNKNOWN")} · chuẩn hóa: ${labelHtml(FQ_STATES, comp.normalization_status || "NOT_CALCULATED")}. Không có khoản mục không chứng minh lợi nhuận sạch.</p>${fqListHtml(rows, comp.evidence, "Không có khoản mục được chấp nhận.")}
      <h6>Dòng tiền kinh doanh có so được với lợi nhuận không</h6><p data-fq-cash="${h(clip(cash.state, 80))}">${st(cash.state)} · kiểm định của Producer: ${st(cash.producer_status)}</p>
      <div class="wb-two-col"><div><div class="wb-dim-head">Phép đo cùng cơ sở</div>${fqListHtml(rows, cash.measurements, "Không có phép đo: không ghép lợi nhuận và dòng tiền khác kỳ, khác phạm vi hay khác mức đảm bảo.")}<div class="wb-dim-head">Vì sao chưa so được</div>${fqListHtml(rows, cash.blockers, "Không có.")}</div>
        <div><div class="wb-dim-head">Quan sát tiền (có thể khác kỳ — không ghép)</div>${fqListHtml(rows, cash.cash_observations, "Không có số liệu tiền đủ điều kiện.")}<div class="wb-dim-head">Nguyên nhân còn mở</div>${fqListHtml(rows, cash.open_causes, "Không có.")}</div></div>
      <h6>Bằng chứng về lợi nhuận lặp lại</h6><p>Kiểm định của Producer: ${st(rec.producer_status)}</p>
      <div class="wb-two-col"><div><div class="wb-dim-head">Quan sát</div>${fqListHtml(rows, rec.supporting, "Không có lợi nhuận được quan sát.")}<div class="wb-dim-head">Cảnh báo</div>${fqListHtml(rows, rec.cautions, "Không có cảnh báo kế toán.")}</div><div><div class="wb-dim-head">Chưa biết</div>${fqListHtml(rows, rec.unknowns, "Không có.")}</div></div>
      <h6>Giới hạn của mẫu số định giá</h6><p>Kiểm định của Producer: ${st(val.producer_status)}. Trang không tính P/E, EPS hay hệ số nào.</p>${fqListHtml(rows, val.reasons, "Không có.")}
      <h6>Bằng chứng cần để xác nhận hoặc vô hiệu luận điểm tài chính</h6>${fqListHtml(rows, q.evidence_needed, "Không có kiểm định.")}
      ${other.length ? `<h6>Số liệu nguồn khác của Producer</h6><p class="cockpit-note">Quan sát hữu ích, không trả lời trực tiếp các câu hỏi trên và không đủ để kết luận về lợi nhuận hay dòng tiền.</p>${fqListHtml(rows, other)}` : ""}
      ${excluded ? `<p class="cockpit-note" data-fq-excluded="${excluded}">${excluded} số liệu bị loại vì biết sau thời điểm cắt của nguồn hoặc không rõ thời điểm.</p>` : ""}`;
  }
  function financialQualityHtml(model, ticker) {
    const blocks = arr(obj(obj(model.financialQuality).blocks)[ticker]);
    if (!blocks.length) return `<p class="cockpit-note">Nguồn financial-quality của hồ sơ không có ${h(ticker)}.</p>`;
    return `<p class="cockpit-note">Đầu ra offline, không biểu quyết của Producer <code>research financial-quality</code>, được người lập hồ sơ cung cấp riêng. Số liệu là của Producer; trang chỉ hiển thị lại, không tính lợi nhuận chuẩn hóa, EPS, hệ số định giá, điểm hay lệnh giao dịch. Mã băm chứng minh tệp không bị sửa, không chứng minh số liệu đúng.</p>`
      + blocks.map((entry) => `<article class="cdr-fq" data-fq-session="${h(clip(entry.source.source_session, 10))}">${fqBindingHtml(model, entry.source)}${fqAnswersHtml(entry)}</article>`).join("");
  }
  function fqDistinctionNoteHtml(dd) {
    const rows = arr(dd.financial_quality_bridge);
    if (!rows.length) return "";
    return `<p class="cockpit-note" data-fq-bridge="${rows.length}">Có ${rows.length} nguồn financial-quality bổ sung cho mã này: ${rows.map((r) => `phiên ${h(clip(obj(r).source_session, 10))} — ${labelHtml(FQ_BINDINGS, obj(r).binding_state)}`).join("; ")}. Xem mục “Chất lượng lợi nhuận và dòng tiền”. Các trạng thái ở trên vẫn là của thẻ Daily.</p>`;
  }

  function sectionHtml(id, title, count, body, open) {
    return `<details class="wb-section" id="${h(id)}"${open ? " open" : ""}><summary><span class="wb-section-title">${h(title)}</span>${count ? `<span class="wb-section-count">${h(count)}</span>` : ""}</summary><div class="wb-section-body">${body}</div></details>`;
  }

  function sessionCompareHtml(cmp, ticker) {
    const posture = (code) => (code ? labelHtml(POSTURES, code) : '<span class="cockpit-note">Không có</span>');
    const trig = (code) => (code ? labelHtml(TRIGGER_STATES, code) : '<span class="cockpit-note">Không báo</span>');
    return `<div class="cdr-compare" data-case-session-state="${h(cmp.state)}">
      <div class="${cmp.state === "SAME_DATE_RUN_NOT_VERIFIED" ? "cockpit-note" : "vs-alert vs-alert-warning"}" role="note">${h(SESSION_STATES[cmp.state])}</div>
      <table class="cockpit-table cdr-compare-table"><thead><tr><th></th><th>Hồ sơ Case Desk (nghiên cứu trước)</th><th>Đang công bố trên Dashboard</th></tr></thead><tbody>
        <tr><th scope="row">Phiên</th><td>${h(cmp.caseSession)}</td><td>${cmp.publishedSession ? h(cmp.publishedSession) : "—"}</td></tr>
        <tr><th scope="row">Tư thế nghiên cứu</th><td>${posture(cmp.casePosture)}</td><td>${cmp.inPublished ? posture(cmp.publishedPosture) : `<span class="cockpit-note">${h(ticker)} không có trong dữ liệu đang công bố</span>`}</td></tr>
        <tr><th scope="row">Kích hoạt kỹ thuật tích hợp</th><td>${trig(cmp.caseTriggerState)}</td><td>${cmp.inPublished ? trig(cmp.publishedTriggerState) : "—"}</td></tr>
      </tbody></table>
      <p class="cockpit-note">Tư thế và trạng thái kích hoạt là nhãn nghiên cứu của Producer, không phải lệnh mua/bán.</p>
    </div>`;
  }

  function conditionsHtml(dd, posture) {
    const rows = arr(dd.conditions);
    if (!rows.length) return '<p class="cockpit-note">Hồ sơ không có điều kiện cho mã này ở phiên mới nhất.</p>';
    const anyTriggered = rows.some((c) => c.state_status === "PRODUCER_REPORTED_STATE" && c.producer_state === "TRIGGERED");
    return `${anyTriggered ? `<div class="vs-alert vs-alert-warning" role="note" data-case-triggered="true"><b>Điều kiện kỹ thuật đã kích hoạt theo Producer.</b> Đây không xác nhận luận điểm cơ bản, không phải khuyến nghị mua và không thay tư thế nghiên cứu${posture ? ` (tư thế tại phiên hồ sơ: ${labelHtml(POSTURES, posture)})` : ""}.</div>` : ""}
      <table class="cockpit-table cdr-conditions"><thead><tr><th>Điều kiện</th><th>Trạng thái Producer</th><th>Qua các phiên</th></tr></thead><tbody>${rows.map((c) => {
        const reported = c.state_status === "PRODUCER_REPORTED_STATE";
        return `<tr data-condition-kind="${h(clip(c.kind, 60))}"><td>${labelHtml(CONDITION_KINDS, c.kind)}</td><td>${reported ? `<b>${labelHtml(TRIGGER_STATES, c.producer_state)}</b>` : labelHtml(STATE_STATUS, c.state_status)}${c.producer_trigger_type ? `<div class="wb-item-meta">${h(clip(c.producer_trigger_type, 80))}</div>` : ""}</td><td class="cockpit-note">${h(clip(c.outcome_across_sessions, 200))}</td></tr>`;
      }).join("")}</tbody></table>
      <p class="cockpit-note">Điều kiện không có trạng thái thì không được coi là đã hay chưa kích hoạt. Trạng thái kích hoạt không chứng minh kết quả kinh doanh.</p>`;
  }

  function distinctionsHtml(model, ticker) {
    const dd = obj(model.distinctions[ticker]);
    if (!Object.keys(dd).length) return '<p class="cockpit-note">Hồ sơ không có phần tách trạng thái cho mã này.</p>';
    const earnings = obj(dd.reported_vs_non_recurring_earnings);
    const oci = obj(dd.profit_vs_comprehensive_income);
    const cash = obj(dd.profit_vs_cash_conversion);
    const val = obj(dd.valuation_applicability);
    const inf = obj(dd.source_inference_vs_evidence);
    const refusals = arr(val.cross_economics_refusals);
    return `${dd.session !== model.latestSession ? `<div class="vs-alert vs-alert-warning" role="note" data-case-distinction-session="${h(clip(dd.session, 10))}">Phần này của ${h(ticker)} thuộc phiên ${h(clip(dd.session, 10))}, không phải phiên mới nhất ${h(model.latestSession)} của hồ sơ.</div>` : ""}
      <p class="cockpit-note">${labelHtml(STATUSES, dd.interpretation)} · phiên ${h(clip(dd.session, 10))}</p>
      <h6>Lợi nhuận báo cáo và khoản không thường xuyên</h6>
      <p>${labelHtml(STATUSES, earnings.status)} · tính lặp lại: ${labelHtml(STATUSES, earnings.recurrence_assessment || "UNKNOWN")}</p>
      ${evidenceListHtml(model, earnings.evidence, "Thẻ nghiên cứu không có phần chất lượng lợi nhuận.")}
      <h6>Lợi nhuận và thu nhập toàn diện (OCI)</h6>
      <p data-case-oci="${h(clip(oci.status, 80))}">${labelHtml(STATUSES, oci.status)}. Lợi nhuận báo cáo không được trình bày như thu nhập toàn diện hay lợi nhuận thường xuyên.</p>
      ${arr(oci.reported_income_lines).length ? `<ul class="cdr-sublist">${arr(oci.reported_income_lines).slice(0, 8).map((l) => `<li>${h(clip(l.metric, 60))} · dòng ${h(clip(l.line_code, 8))} · ${h(clip(l.reporting_period, 20))} · ${h(clip(l.statement_scope, 30))}</li>`).join("")}</ul>` : ""}
      <h6>Chuyển đổi lợi nhuận thành tiền</h6>
      <p>${labelHtml(STATUSES, cash.status)}</p>${fqDistinctionNoteHtml(dd)}
      ${evidenceListHtml(model, cash.evidence)}
      <h6>Định giá theo đúng loại hình</h6>
      <p>Loại hình: ${labelHtml(STATUSES, val.entity_class)} · định giá chặt: ${labelHtml(STATUSES, val.strict_valuation_status)} · định giá theo nhóm: ${labelHtml(STATUSES, val.peer_valuation_status)}</p>
      ${refusals.length ? `<ul class="cdr-sublist" data-case-refusals="${refusals.length}">${refusals.slice(0, 20).map((r) => `<li>${arr(r.tickers).filter((t) => TICKER_RE.test(t)).map(h).join(" ↔ ")}: ${arr(r.blockers).map(blockerHtml).join("; ")}</li>`).join("")}</ul>` : '<p class="cockpit-note">Không có cặp nào bị từ chối do khác mô hình kế toán.</p>'}
      <h6>Số liệu nguồn và suy luận của nguồn</h6>
      <p class="cockpit-note">${labelHtml(STATUSES, inf.rule)}</p>
      <div class="wb-two-col"><div><div class="wb-dim-head">Số liệu nguồn đủ điều kiện</div>${evidenceListHtml(model, inf.qualified_observations)}</div><div><div class="wb-dim-head">Suy luận được ghi nguồn</div>${evidenceListHtml(model, inf.attributed_source_inferences)}</div></div>
      <h6>Đã kích hoạt và chưa kích hoạt</h6>
      ${conditionsHtml(dd, str(obj(model.overview[ticker]).latest_research_action_posture))}`;
  }

  function challengeHtml(model, ticker) {
    const c = obj(model.challenges[ticker]);
    if (!Object.keys(c).length) return '<p class="cockpit-note">Hồ sơ không có phần thử thách luận điểm cho mã này.</p>';
    const counter = obj(c.strongest_grounded_counter_thesis);
    const quals = {};
    arr(c.support_qualifications).forEach((q) => { if (typeof q.evidence === "string") quals[q.evidence] = arr(q.qualifiers); });
    const support = arr(c.producer_support).filter((x) => typeof x === "string");
    return `<p class="cockpit-note">${labelHtml(STATUSES, c.status)}. Không cân đo hay loại bỏ lập luận nào.</p>
      <div class="wb-two-col"><div><div class="wb-dim-head">Producer ủng hộ</div>${evidenceListHtml(model, support.slice(0, LIMITS.rowsShown), "Không có lập luận ủng hộ.")}${support.length > LIMITS.rowsShown ? `<p class="cockpit-note">Còn ${support.length - LIMITS.rowsShown} lập luận ủng hộ khác trong tệp.</p>` : ""}
        ${Object.keys(quals).length ? `<div class="wb-dim-caveat">Lưu ý về lập luận ủng hộ:</div><ul class="cdr-sublist">${Object.keys(quals).slice(0, 12).map((id) => `<li>${quals[id].map((q) => (str(q).startsWith("CONTESTED_BY_PRODUCER_SOURCE_CONFLICT:") ? `Bị chính nguồn Producer phản bác: <code class="cdr-code">${h(clip(q.slice(38), 120))}</code>` : labelHtml(STATUSES, q))).join("; ")}</li>`).join("")}</ul>` : ""}</div>
      <div><div class="wb-dim-head">Phản luận mạnh nhất có căn cứ: ${labelHtml(DOMAINS, counter.category)}</div><p class="cockpit-note">${labelHtml(STATUSES, counter.selection_rule)}</p>${evidenceListHtml(model, counter.evidence, "Không có phản luận có căn cứ nguồn.")}</div></div>
      ${arr(c.financial_quality_tests).length ? `<h6>Kiểm định chất lượng tài chính của Producer</h6><p class="cockpit-note">Không phải phản luận được chọn hay kết luận.</p><ul class="cdr-sublist" data-fq-tests="${arr(c.financial_quality_tests).length}">${arr(c.financial_quality_tests).map((t) => `<li>Phiên nguồn ${h(clip(obj(t).source_session, 10))} · ${labelHtml(FQ_BINDINGS, obj(t).binding_state)}: ${arr(obj(t).thesis_tests).length} kiểm định, ${arr(obj(t).accounting_cautions).length} cảnh báo kế toán, ${arr(obj(t).unsupported_conclusions).length} kết luận chưa có căn cứ</li>`).join("")}</ul>
      ` : ""}<h6>Mâu thuẫn chưa giải quyết</h6>${evidenceListHtml(model, c.contradictions, "Không có mâu thuẫn được ghi nhận.")}
      <h6>Không được kết luận</h6><ul class="cdr-sublist">${arr(c.cannot_conclude).map((x) => `<li>${labelHtml(STATUSES, x)}</li>`).join("") || "<li>—</li>"}</ul>`;
  }

  function topicsHtml(model, ticker) {
    if (!model.topics.length) return '<p class="cockpit-note">Hồ sơ không có câu hỏi hay giả thuyết.</p>';
    return model.topics.map((t) => {
      const inv = obj(model.investigations[t.id]);
      const domains = obj(inv.investigation);
      const domainHtml = Object.keys(domains).filter((d) => own(DOMAINS, d)).map((d) => {
        const rel = obj(obj(domains[d]).evidence_by_relation);
        const ids = Object.keys(rel).flatMap((r) => arr(rel[r])).filter((id) => obj(obj(model.evidence.get(id)).citation).ticker === ticker);
        return `<div class="wb-dim"><div class="wb-dim-head">${h(DOMAINS[d])}</div><div class="wb-dim-caveat">Cần thêm: ${h(clip(obj(domains[d]).input_needed, 600))}</div>${evidenceListHtml(model, ids, `Hồ sơ không giao bằng chứng của ${ticker} cho phạm vi này.`)}</div>`;
      }).join("");
      return `<article class="cdr-topic" data-topic-kind="${h(clip(t.kind, 20))}"><div class="wb-item-head"><span class="wb-kind wb-kind-note">${t.kind === "HYPOTHESIS" ? "Giả thuyết của bạn" : "Câu hỏi của bạn"}</span><span class="cockpit-note">${labelHtml(STATUSES, "HUMAN_FRAMING_NOT_VERIFIED_FACT")}</span></div>
        <p class="cdr-topic-text">${h(t.text)}</p>${inv.verdict ? `<p class="cockpit-note">${labelHtml(STATUSES, inv.verdict)}</p>` : ""}${domainHtml || '<p class="cockpit-note">Chưa gắn phạm vi bằng chứng; cần tự điều tra.</p>'}</article>`;
    }).join("");
  }

  function gapsHtml(model, ticker) {
    const profile = obj(model.profiles[ticker]);
    const missing = arr(obj(profile.evidence_limits).missing_evidence);
    const pairs = model.pairs.filter((p) => arr(p.tickers).includes(ticker));
    return `${missing.length ? `<h6>Bằng chứng còn thiếu của ${h(ticker)}</h6><ul class="cdr-sublist">${missing.slice(0, 12).map((m) => `<li>${labelHtml(STATUSES, obj(m).code)}: ${h(valueText(obj(m).source_value))}</li>`).join("")}</ul>` : ""}
      <h6>Cần điều tra tiếp theo phạm vi</h6>
      <ul class="cdr-sublist">${model.gaps.map((g) => `<li><b>${labelHtml(DOMAINS, obj(g).domain)}</b>: ${h(clip(obj(g).input_needed, 600))}</li>`).join("") || "<li>—</li>"}</ul>
      ${pairs.length ? `<h6>So sánh với các mã khác trong hồ sơ</h6><ul class="cdr-sublist" data-case-pairs="${pairs.length}">${pairs.map((p) => `<li>${arr(p.tickers).filter((t) => TICKER_RE.test(t)).map(h).join(" ↔ ")}: ${[...arr(p.blockers).map(blockerHtml), ...arr(p.cautions).map((c) => labelHtml(STATUSES, c))].join("; ") || "không ghi chặn"}</li>`).join("")}</ul><p class="cockpit-note">Không có mã thắng, xếp hạng hay kết luận hơn kém.</p>` : ""}
      <h6>Giới hạn kết luận của toàn hồ sơ</h6><ul class="cdr-sublist">${model.conclusionLimits.map((c) => `<li>${labelHtml(STATUSES, c)}</li>`).join("") || "<li>—</li>"}</ul>`;
  }

  function emptyStateHtml(error) {
    return `<div class="wb-root cdr-root">
      <section class="cockpit-section card mb-4"><div class="card-header"><h2 id="cdr-heading" class="h5 mb-0" tabindex="-1">Xem hồ sơ Case Desk</h2></div><div class="card-body">
        <p class="cockpit-note">Mở một tệp <code>investment_research_case.json</code> do Case Desk (stocklookup-ai-research) tạo để đọc lại nghiên cứu đó cạnh dữ liệu đang công bố. ${h(NOTICE)}</p>
        ${importControlHtml()}
        ${error ? importErrorHtml(error) : ""}
      </div></section></div>`;
  }
  function importControlHtml() {
    return `<label class="btn btn-sm btn-outline-light mb-0">Mở tệp hồ sơ Case Desk<input type="file" accept="application/json,.json" data-case-import hidden></label>`;
  }
  function importErrorHtml(error) {
    return `<div class="vs-alert vs-alert-warning mt-2" role="alert" data-case-import-error="${h(error.error)}">Không mở được hồ sơ: ${h(error.message)}${error.detail ? ` <code class="cdr-code">${h(error.detail)}</code>` : ""}</div>`;
  }

  function caseViewHtml(model, opts) {
    const o = opts || {};
    const ticker = model.tickers.includes(o.ticker) ? o.ticker : model.tickers[0];
    const cmp = compareWithPublished(model, o.indexDoc, ticker);
    const ov = obj(model.overview[ticker]);
    const questions = model.topics.filter((t) => t.kind !== "HYPOTHESIS");
    return `<div class="wb-root cdr-root" data-case-identity="${h(model.caseIdentity)}">
      <section class="cockpit-section card mb-3"><div class="card-body">
        <div class="wb-overview-head"><div><div class="section-eyebrow">Hồ sơ Case Desk cục bộ</div><h2 id="cdr-heading" class="h5 mb-1" tabindex="-1">${h(questions.length ? clip(questions[0].text, 300) : `Hồ sơ ${model.tickers.join(", ")}`)}</h2>
          <div class="cockpit-note">${model.tickers.length} mã · ${model.sessions.length} phiên (${h(model.sessions[0].session)} → ${h(model.latestSession)}) · ${labelHtml(STATUSES, model.status)}</div></div>
          <div class="wb-actions">${importControlHtml()}<button type="button" class="btn btn-sm btn-outline-secondary" data-case-action="close">Đóng hồ sơ</button></div></div>
        <div class="vs-alert vs-alert-info mt-2" role="note">${h(NOTICE)} Mã hồ sơ <code class="cdr-code" title="${h(model.caseIdentity)}">${h(model.caseIdentity.slice(0, 31))}…</code> được hiển thị nguyên văn, trình duyệt không kiểm chứng lại.</div>
        ${o.error ? importErrorHtml(o.error) : ""}
        <div class="cdr-members" role="group" aria-label="Chọn mã trong hồ sơ">${model.tickers.map((t) => `<button type="button" class="cockpit-chip${t === ticker ? " active" : ""}" data-case-ticker="${h(t)}" aria-pressed="${t === ticker ? "true" : "false"}">${h(t)}</button>`).join("")}</div>
      </div></section>
      <section class="cockpit-section card mb-3"><div class="card-body">
        <div class="wb-overview-head"><h3 class="wb-dossier-title">${h(ticker)}${own(ROLES, model.roles[ticker]) ? ` <span>${h(ROLES[model.roles[ticker]])}</span>` : ""}</h3>
          ${cmp.inPublished ? `<button type="button" class="btn btn-sm btn-outline-light" data-case-action="open-dossier" data-ticker="${h(ticker)}">Mở hồ sơ điều tra hiện tại của ${h(ticker)}</button>` : ""}</div>
        ${sessionCompareHtml(cmp, ticker)}
        ${Object.keys(ov).length ? `<p class="cockpit-note">Trong hồ sơ: ${h(valueText(ov.delivered_sessions))}/${h(valueText(ov.supplied_sessions))} phiên có dữ liệu · ${h(valueText(ov.persisting_risks))} rủi ro kéo dài · ${h(valueText(ov.conditions_without_verified_outcome))} điều kiện chưa có kết quả được kiểm chứng.</p>` : ""}
      </div></section>
      ${sectionHtml("cdr-sec-distinctions", "Các trạng thái không được gộp", `phiên ${model.latestSession}`, distinctionsHtml(model, ticker), true)}
      ${model.financialQuality ? `${sectionHtml("cdr-sec-financial-quality", "Chất lượng lợi nhuận và dòng tiền (nguồn Producer bổ sung)", `${arr(model.financialQuality.blocks[ticker]).length} nguồn`, financialQualityHtml(model, ticker), true)}
      ` : ""}${sectionHtml("cdr-sec-challenge", "Ủng hộ và phản luận", "", challengeHtml(model, ticker), true)}
      ${sectionHtml("cdr-sec-topics", "Câu hỏi và giả thuyết của bạn", `${model.topics.length}`, topicsHtml(model, ticker), false)}
      ${sectionHtml("cdr-sec-gaps", "Khoảng trống bằng chứng và giới hạn", "", gapsHtml(model, ticker), false)}
    </div>`;
  }

  function dossierNoticeHtml(model, ticker, indexDoc) {
    if (!model || !model.tickers.includes(ticker)) return "";
    const cmp = compareWithPublished(model, indexDoc, ticker);
    return `<div class="vs-alert vs-alert-info cdr-dossier-notice" role="note" data-case-dossier-notice="${h(cmp.state)}">Bạn đang mở một hồ sơ Case Desk cục bộ có ${h(ticker)} (phiên ${h(model.latestSession)}; dữ liệu đang công bố: phiên ${h(cmp.publishedSession || "—")}). Hồ sơ là nghiên cứu riêng, không phải dữ liệu đang công bố. <button type="button" class="btn btn-sm btn-outline-light" data-case-action="view-ticker" data-ticker="${h(ticker)}">Xem trong hồ sơ Case Desk</button></div>`;
  }

  // ---------------------------------------------------------------------------------------
  // Browser state: one in-memory case per tab. Never persisted.
  // ---------------------------------------------------------------------------------------
  const UI = { ctx: null, bound: false, model: null, ticker: "", error: null, token: 0 };

  function currentModel() { return UI.model; }
  function render(focus) {
    const root = typeof document !== "undefined" ? document.getElementById("cdr-root") : null;
    if (!root) return;
    const indexDoc = UI.ctx && UI.ctx.getWorkspace ? UI.ctx.getWorkspace() : null;
    if (!UI.model) root.innerHTML = emptyStateHtml(UI.error);
    else {
      const selected = UI.ctx && UI.ctx.getSelectedTicker ? UI.ctx.getSelectedTicker() : "";
      if (!UI.model.tickers.includes(UI.ticker)) UI.ticker = UI.model.tickers.includes(selected) ? selected : UI.model.tickers[0];
      root.innerHTML = caseViewHtml(UI.model, { ticker: UI.ticker, indexDoc, error: UI.error });
    }
    if (focus) { const el = document.getElementById("cdr-heading"); if (el && el.focus) el.focus(); }
  }
  function acceptText(text, bytes) {
    const result = parseCase(text, { bytes });
    if (result.ok) { UI.model = result.model; UI.ticker = ""; UI.error = null; }
    else UI.error = result; // A failed import leaves the previously opened valid case in place.
    return result;
  }
  function focusTicker(ticker) {
    if (!UI.model || !UI.model.tickers.includes(ticker) || UI.ticker === ticker) return;
    UI.ticker = ticker;
    render(false);
  }
  function closeCase() { UI.token++; UI.model = null; UI.ticker = ""; UI.error = null; }
  function bind() {
    if (UI.bound) return;
    UI.bound = true;
    document.addEventListener("change", (e) => {
      const input = e.target.closest && e.target.closest("[data-case-import]");
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      const token = ++UI.token;
      input.value = "";
      if (file.size > LIMITS.bytes) { UI.error = fail("FILE_TOO_LARGE"); render(true); return; }
      const reader = new FileReader();
      reader.onload = () => { if (token !== UI.token) return; acceptText(String(reader.result || ""), file.size); render(true); };
      reader.onerror = () => { if (token !== UI.token) return; UI.error = fail("NOT_JSON"); render(true); };
      reader.readAsText(file);
    });
    document.addEventListener("click", (e) => {
      const pick = e.target.closest && e.target.closest("[data-case-ticker]");
      if (pick && UI.model) { e.preventDefault(); UI.ticker = pick.dataset.caseTicker; render(false); const b = document.querySelector(`[data-case-ticker="${UI.ticker}"]`); if (b) b.focus(); return; }
      const btn = e.target.closest && e.target.closest("[data-case-action]");
      if (!btn) return;
      e.preventDefault();
      const action = btn.dataset.caseAction;
      if (action === "close") { if (window.confirm("Đóng hồ sơ Case Desk đang xem? Trang không lưu bản nào.")) { closeCase(); render(true); } return; }
      const t = TICKER_RE.test(btn.dataset.ticker || "") ? btn.dataset.ticker : "";
      if (action === "open-dossier" && t && UI.ctx && UI.ctx.openDossier) UI.ctx.openDossier(t);
      if (action === "view-ticker" && t && UI.model) { UI.ticker = t; if (UI.ctx && UI.ctx.setView) UI.ctx.setView("case"); }
    });
  }
  function attach(ctx) {
    UI.ctx = ctx;
    if (typeof document !== "undefined") bind();
  }

  return {
    CONTRACT, LIMITS, NOTICE, IMPORT_ERRORS, RELATIONS, CONDITION_KINDS, TRIGGER_STATES, SESSION_STATES, FQ_BINDINGS,
    parseCase, validateCase, compareWithPublished, caseViewHtml, emptyStateHtml, dossierNoticeHtml,
    attach, render, acceptText, closeCase, currentModel, focusTicker,
  };
});
