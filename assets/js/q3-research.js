(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VSQ3Research = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const escHtml = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const Q3_METRIC_LABELS = {
    revenue: "Doanh thu thuần",
    net_income: "Lợi nhuận sau thuế",
    attributable_net_income: "Lợi nhuận sau thuế của cổ đông công ty mẹ",
  };

  function q3SuccessorFor(options, ticker) {
    const artifact = options && options.q3Successor;
    if (!artifact || artifact.contract_version !== "q3_2026_successor_research/v1") return null;
    if (artifact.session_binding !== "NOT_A_SEALED_SESSION_FACT" || artifact.official_fact_admitted_count !== 0) return null;
    return (artifact.issuers || {})[String(ticker || "").toUpperCase()] || null;
  }

  function q3ObservationHtml(record) {
    const observations = record.observations;
    const book = record.book_sensitivity || {};
    if (!Array.isArray(observations) || !observations.length || record.official_fact_admitted !== false
        || record.valuation_use !== "CLOSED" || record.session_binding !== "NOT_A_SEALED_SESSION_FACT"
        || book.kind !== "CROSS_DATE_ILLUSTRATION" || record.common_shareholder_pb !== "UNAVAILABLE") return "";
    const label = {
      ...Q3_METRIC_LABELS,
      total_equity: "Tổng vốn chủ sở hữu",
      noncontrolling_interest: "Lợi ích cổ đông không kiểm soát",
      issued_shares: "Cổ phiếu đã phát hành",
      treasury_shares: "Cổ phiếu quỹ",
      outstanding_shares: "Cổ phiếu đang lưu hành",
      net_inventory: "Tồn kho thuần",
      operating_cash_flow: "Dòng tiền kinh doanh",
      receivables_cash_movement: "Biến động phải thu trong dòng tiền kinh doanh",
      inventory_cash_movement: "Biến động tồn kho trong dòng tiền kinh doanh",
      pretax_disposal_gain: "Lãi thanh lý công ty con trước thuế",
    };
    const number = (value) => value.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
    const lines = observations.filter((row) => Object.hasOwn(label, row.metric)
      && Number.isSafeInteger(row.value) && ["VND", "shares"].includes(row.unit)
      && Number.isInteger(row.pdf_page)).map((row) => {
      const period = row.period === "2026-9M" ? "9 tháng 2026" : row.period;
      const unit = row.unit === "shares" ? "cổ phiếu" : "đồng";
      return `<li>${label[row.metric]} · ${escHtml(period)} · ${number(row.value)} ${unit} (trang PDF ${row.pdf_page})</li>`;
    });
    if (!lines.length || ![book.illustrative_multiple, book.reference_price_vnd, book.derived_equity_excluding_nci_vnd,
      book.quarter_end_shares, record.revenue_yoy_pct, record.parent_profit_yoy_pct].every(Number.isFinite)) return "";
    const url = String(record.source_url || "");
    const source = /^https:\/\/staticfile\.hsx\.vn\/Uploads\/UploadDocuments\/[0-9]+\/[A-Za-z0-9%._-]+\.pdf$/.test(url)
      ? `<a href="${escHtml(url)}">PDF công bố qua HOSE</a>` : "PDF công bố qua HOSE";
    return `<div class="ws-q3-successor cockpit-note mt-1" data-official-fact="false" data-session-binding="NOT_A_SEALED_SESSION_FACT" data-valuation-use="CLOSED">
      <b>BCTC hợp nhất Q3/2026 · Nghiên cứu sau Daily</b>
      <p>Doanh thu thuần ${number(record.revenue_yoy_pct)}% và lợi nhuận cổ đông công ty mẹ ${number(record.parent_profit_yoy_pct)}% so với cùng kỳ.
        Dòng tiền kinh doanh 9 tháng âm, trong khi phải thu và tồn kho hút tiền. Lãi thanh lý công ty con trước thuế là khoản bất thường của 9 tháng.
        Tồn kho tăng và dòng tiền yếu làm tăng rủi ro bẫy giá trị. EPS chuẩn hóa chưa được tính.</p>
      <p><b>P/B minh họa khác ngày ${number(book.illustrative_multiple)}×.</b> Giá tham chiếu đã điều chỉnh hồi tố
        ${number(book.reference_price_vnd)} đồng ngày ${escHtml(book.reference_price_session)} và ${number(book.quarter_end_shares)} cổ phiếu cuối kỳ.
        Vốn chủ quy về cổ đông mẹ ${number(book.derived_equity_excluding_nci_vnd)} đồng bằng tổng vốn chủ trừ lợi ích không kiểm soát tại ${escHtml(book.book_date)}.
        P/B cổ đông phổ thông chưa đủ điều kiện do chưa xác minh biến động cổ phiếu đến phiên giá, giá gốc và phương pháp vốn chủ.</p>
      <details><summary>Đối chiếu số liệu và nguồn</summary><ul>${lines.join("")}</ul>
        ${record.rejected_income_columns && record.rejected_income_columns["2026-9M"] ? "<p>Cột kết quả kinh doanh 9 tháng không qua kiểm tra cộng ngang.</p>" : ""}
        ${source} · công bố ${escHtml(record.issuer_disclosure_date || "")} · chưa soát xét · SHA-256 ${escHtml(record.sha256 || "")}.
      </details>
    </div>`;
  }


  function q3IndependentObservationHtml(record) {
    const observations = record.observations;
    if (record.research_kind !== "COMPARATIVE_INCOME_AND_OPERATING_CASH_FLOW"
        || !Array.isArray(observations) || !observations.length
        || record.official_fact_admitted !== false || record.valuation_use !== "CLOSED"
        || record.session_binding !== "NOT_A_SEALED_SESSION_FACT"
        || record.common_shareholder_pb !== "UNAVAILABLE" || record.book_sensitivity) return "";
    const label = {
      revenue: "Doanh thu thuần",
      net_income: "Lợi nhuận sau thuế",
      attributable_net_income: "Lợi nhuận sau thuế của cổ đông công ty mẹ",
      operating_cash_flow: "Dòng tiền kinh doanh",
    };
    const periodLabel = {
      "2026-Q3": "quý 3/2026",
      "2025-Q3": "quý 3/2025",
      "2026-9M": "9 tháng 2026 (không phải quý riêng)",
      "2025-9M": "9 tháng 2025 (không phải quý riêng)",
    };
    const number = (value) => value.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
    const lines = observations.filter((row) => Object.hasOwn(label, row.metric)
      && Object.hasOwn(periodLabel, row.period) && Number.isSafeInteger(row.value)
      && row.unit === "VND" && Number.isInteger(row.pdf_page)).map((row) => (
      `<li>${label[row.metric]} · ${periodLabel[row.period]} · ${number(row.value)} đồng (trang PDF ${row.pdf_page})</li>`
    ));
    if (lines.length !== observations.length) return "";
    const rejected = record.rejected_income_columns || {};
    const currentRejected = rejected["2026-Q3"] && rejected["2026-9M"];
    if (!currentRejected) return "";
    const url = String(record.source_url || "");
    const source = /^https:\/\/staticfile\.hsx\.vn\/Uploads\/UploadDocuments\/[0-9]+\/[A-Za-z0-9%._-]+\.pdf$/.test(url)
      ? `<a href="${escHtml(url)}">PDF công bố qua HOSE</a>` : "PDF công bố qua HOSE";
    const yoy = Number.isFinite(record.operating_cash_flow_yoy_pct)
      ? ` Dòng tiền kinh doanh 9 tháng thay đổi ${number(record.operating_cash_flow_yoy_pct)}% so với cùng kỳ.` : "";
    return `<div class="ws-q3-successor cockpit-note mt-1" data-official-fact="false" data-session-binding="NOT_A_SEALED_SESSION_FACT" data-valuation-use="CLOSED" data-research-kind="COMPARATIVE_INCOME_AND_OPERATING_CASH_FLOW">
      <b>BCTC hợp nhất Q3/2026 · Nghiên cứu sau Daily</b>
      <p>Cột kết quả quý 3/2026 lệch 1 đồng giữa lợi nhuận sau thuế và phần chia cổ đông. Cột 9 tháng 2026 lệch 1 đồng ở cầu thuế. Cả hai cột hiện hành bị loại và không được sửa số để ép khớp.
        Số so sánh 2025 và dòng tiền kinh doanh 9 tháng đối chiếu trên trang riêng, không lấy từ cột bị loại.${yoy}
        Chưa soát xét. Không phải fact chính thức. Không tính P/B, nợ vay thuần hay EPS chuẩn hóa.</p>
      <details><summary>Đối chiếu số liệu và nguồn</summary><ul>${lines.join("")}</ul>
        ${source} · công bố ${escHtml(record.issuer_disclosure_date || "")} · hợp nhất · chưa soát xét · SHA-256 ${escHtml(record.sha256 || "")}.
      </details>
    </div>`;
  }

  function q3FinanceCompanyHtml(record) {
    const observations = record.observations;
    if (record.research_kind !== "REVIEWED_NINE_MONTH_FINANCE_COMPANY"
        || record.entity_class !== "finance_company" || record.commercial_bank !== false
        || record.statement_scope !== "separate" || record.audit_or_review_status !== "reviewed"
        || record.standalone_quarter_column !== false || record.unit !== "MILLION_VND"
        || !Array.isArray(observations) || observations.length !== 16
        || record.official_fact_admitted !== false || record.valuation_use !== "CLOSED"
        || record.session_binding !== "NOT_A_SEALED_SESSION_FACT"
        || record.common_shareholder_pb !== "UNAVAILABLE") return "";
    const label = {
      interest_income: "Thu nhập lãi",
      interest_expense: "Chi phí lãi",
      net_interest_income: "Thu nhập lãi thuần",
      pre_provision_profit: "Lợi nhuận trước dự phòng rủi ro tín dụng",
      credit_loss_provision: "Chi phí dự phòng rủi ro tín dụng",
      pretax_profit: "Lợi nhuận trước thuế",
      tax: "Chi phí thuế thu nhập doanh nghiệp",
      net_income: "Lợi nhuận sau thuế",
    };
    const periodLabel = {
      "2026-9M": "9 tháng 2026 (không phải quý riêng)",
      "2025-9M": "9 tháng 2025 (không phải quý riêng)",
    };
    const number = (value) => value.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
    const lines = observations.filter((row) => Object.hasOwn(label, row.metric)
      && Object.hasOwn(periodLabel, row.period) && Number.isSafeInteger(row.value)
      && row.unit === "MILLION_VND" && row.pdf_page === 11).map((row) => (
      `<li>${label[row.metric]} · ${periodLabel[row.period]} · ${number(row.value)} triệu đồng</li>`
    ));
    if (lines.length !== 16) return "";
    if (![record.net_income_yoy_pct, record.pre_provision_profit_yoy_pct, record.credit_loss_provision_yoy_pct]
      .every(Number.isFinite)) return "";
    const url = String(record.source_url || "");
    const source = /^https:\/\/www\.evnfc\.vn\/storage\/app\/media\/[A-Za-z0-9%._/-]+\.pdf$/.test(url)
      ? `<a href="${escHtml(url)}">PDF trên trang nhà phát hành</a>` : "PDF trên trang nhà phát hành";
    return `<div class="ws-q3-successor cockpit-note mt-1" data-official-fact="false" data-session-binding="NOT_A_SEALED_SESSION_FACT" data-valuation-use="CLOSED" data-research-kind="REVIEWED_NINE_MONTH_FINANCE_COMPANY" data-entity-class="finance_company">
      <b>BCTC giữa niên độ 9 tháng · công ty tài chính · đã soát xét</b>
      <p>Phạm vi soát xét là bảng cân đối tại 30/09/2026 và kỳ từ 01/01/2026 đến 30/09/2026. Không có cột quý III riêng. Đơn vị triệu đồng.
        Lợi nhuận sau thuế ${number(record.net_income_yoy_pct)}%, trong khi lợi nhuận trước dự phòng ${number(record.pre_provision_profit_yoy_pct)}% và chi phí dự phòng rủi ro tín dụng ${number(record.credit_loss_provision_yoy_pct)}% so với cùng kỳ.
        Đây là công ty tài chính, không phải ngân hàng thương mại. Không tính P/B, NIM dùng để định giá, EV/EBITDA hay EPS chuẩn hóa. Host IR chưa được admit thành fact chính thức.</p>
      <details><summary>Đối chiếu số liệu và nguồn</summary><ul>${lines.join("")}</ul>
        ${source} · công bố ${escHtml(record.issuer_disclosure_date || "")} · soát xét ${escHtml(record.review_standard || "")} · SHA-256 ${escHtml(record.sha256 || "")}.
      </details>
    </div>`;
  }

  function q3SuccessorHtml(record) {
    if (!record) return "";
    if (record.research_kind === "REVIEWED_NINE_MONTH_FINANCE_COMPANY") return q3FinanceCompanyHtml(record);
    if (record.research_kind === "COMPARATIVE_INCOME_AND_OPERATING_CASH_FLOW") return q3IndependentObservationHtml(record);
    if (Array.isArray(record.observations)) return q3ObservationHtml(record);
    if (Array.isArray(record.shadow_rows) && record.official_fact_admitted === false) {
      const lines = record.shadow_rows.map((row) => {
        const period = row.reporting_period === "2026-9M" ? "9 tháng 2026 (không phải quý riêng)" : row.reporting_period;
        const label = Q3_METRIC_LABELS[row.canonical_metric] || row.canonical_metric;
        return `${label}, ${period}: ${Number(row.value_vnd).toLocaleString("vi-VN")} đồng`;
      });
      return `<div class="ws-q3-successor cockpit-note mt-1" data-official-fact="false" data-session-binding="NOT_A_SEALED_SESSION_FACT" data-valuation-use="CLOSED">
        <b>BCTC hợp nhất Q3/2026, tầng nghiên cứu:</b> ${escHtml(lines.join("; "))}.
        Chưa soát xét, không phải fact chính thức, không thuộc Daily đã niêm phong, không dùng để tính P/E, P/B hay EPS chuẩn hóa.
        Nguồn ${escHtml(record.host || "")}, SHA-256 ${escHtml(record.sha256 || "")}. Lớp chữ PDF không trung thành; số là đọc trang đã cộng ngang.
      </div>`;
    }
    const reasons = record.reason_codes || record.missing || [];
    const quality = (record.earnings_quality && record.earnings_quality.reason_codes) || [];
    if (!reasons.length && !quality.length) return "";
    return `<div class="ws-q3-successor cockpit-note mt-1" data-official-fact="false" data-q3-status="BLOCKED">
      <b>Q3/2026 chưa thành fact:</b> ${escHtml(reasons.join(", "))}.
      ${quality.length ? `Chất lượng lợi nhuận chưa đánh giá được (${escHtml(quality.join(", "))}). ` : ""}
      EPS chuẩn hóa và giá mục tiêu không được suy ra.
    </div>`;
  }

  let artifactPromise;
  function load() {
    if (!artifactPromise) {
      artifactPromise = fetch("data/q3_successor_research.json", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null).catch(() => null);
    }
    return artifactPromise;
  }

  return { q3SuccessorFor, q3SuccessorHtml, load };
});
