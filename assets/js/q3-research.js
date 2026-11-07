(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VSQ3Research = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const escHtml = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const CLAIM_LABEL = {
    FACT: "Việc đã đọc",
    DERIVATION: "Suy từ số đã đọc",
    INFERENCE: "Nhận định nghiên cứu",
    UNKNOWN: "Chưa có chứng cứ",
    CONDITION: "Đổi nhận định khi",
  };

  function claimList(items) {
    return `<ul class="q3-claim-list">${items.map((item) => (
      `<li data-claim-class="${item.class}"><b>${CLAIM_LABEL[item.class]}.</b> ${item.text}</li>`
    )).join("")}</ul>`;
  }

  function observationValue(record, metric, period) {
    const row = (record.observations || []).find((item) => item.metric === metric && item.period === period);
    return row && Number.isSafeInteger(row.value) ? row.value : null;
  }

  function panDurabilityClaims(record, number) {
    const ocf = observationValue(record, "operating_cash_flow", "2026-9M");
    const disposal = observationValue(record, "pretax_disposal_gain", "2026-9M");
    const parentCash = observationValue(record, "holding_cash_and_equivalents", "2026-09-30");
    const q3Net = observationValue(record, "net_income", "2026-Q3");
    const q3Parent = observationValue(record, "attributable_net_income", "2026-Q3");
    const claims = [];
    if (ocf != null && disposal != null && parentCash != null) {
      claims.push({
        class: "FACT",
        text: `Dòng tiền kinh doanh 9 tháng 2026 là ${number(ocf)} đồng. Lãi thanh lý công ty con trước thuế 9 tháng là ${number(disposal)} đồng. Tiền công ty mẹ tại 30/09/2026 là ${number(parentCash)} đồng trên BCTC riêng.`,
      });
    }
    if (q3Net != null && q3Parent != null) {
      claims.push({
        class: "DERIVATION",
        text: `Quý 3/2026, phần lợi nhuận sau thuế không thuộc cổ đông mẹ bằng ${number(q3Net)} trừ ${number(q3Parent)}, còn ${number(q3Net - q3Parent)} đồng. Đây là phép trừ hai dòng đã in, không phải một dòng thuyết minh riêng.`,
      });
    }
    claims.push({
      class: "INFERENCE",
      text: ocf != null && ocf < 0
        ? "Lãi thanh lý không lặp theo hoạt động thường xuyên. Dòng tiền kinh doanh 9 tháng âm, cùng phải thu và tồn kho hút tiền, chưa cho thấy lợi nhuận đã thành tiền."
        : "Lãi thanh lý không lặp theo hoạt động thường xuyên. Chưa đủ dòng tiền kinh doanh âm để nói lợi nhuận đã không thành tiền.",
    });
    claims.push({
      class: "UNKNOWN",
      text: "Chưa có số dư tiền hợp nhất cùng ngày, nên chưa đo chênh lệch thanh khoản hợp nhất với công ty mẹ. Cột lợi nhuận 9 tháng bị loại vì lệch 1 đồng. Nợ vay ngắn hạn công ty mẹ chưa đọc được.",
    });
    claims.push({
      class: "CONDITION",
      text: "Nhận định đổi khi cột 9 tháng khớp cộng ngang, khi có tiền hợp nhất cùng ngày với tiền công ty mẹ, hoặc khi báo cáo soát xét tách lãi thanh lý khỏi kết quả hoạt động.",
    });
    return claims;
  }

  function powDurabilityClaims(record, number) {
    const ocf = observationValue(record, "operating_cash_flow", "2026-9M");
    const payable = observationValue(record, "trade_payable_pv_gas", "2026-09-30");
    const accrual = observationValue(record, "accrued_uninvoiced_gas_purchase", "2026-09-30");
    const claims = [];
    if (ocf != null) {
      claims.push({ class: "FACT", text: `Dòng tiền kinh doanh 9 tháng 2026 là ${number(ocf)} đồng. Đây không phải lợi nhuận.` });
    }
    if (payable != null && accrual != null) {
      claims.push({
        class: "FACT",
        text: `Phải trả PV GAS cuối kỳ ${number(payable)} đồng và chi phí khí chưa hóa đơn ${number(accrual)} đồng là hai số dư riêng. Không cộng và không gọi là tiền đã thu.`,
      });
    }
    if (Number.isFinite(record.operating_cash_flow_yoy_pct)) {
      claims.push({
        class: "DERIVATION",
        text: `Dòng tiền kinh doanh 9 tháng thay đổi ${number(record.operating_cash_flow_yoy_pct)}% so với cùng kỳ. Phép này không dùng cột lợi nhuận bị loại.`,
      });
    }
    claims.push({
      class: "UNKNOWN",
      text: "Cột lợi nhuận quý 3 và 9 tháng 2026 bị loại vì lệch 1 đồng, nên chưa có tỷ lệ chuyển lợi nhuận thành tiền cho kỳ hiện hành.",
    });
    claims.push({
      class: "INFERENCE",
      text: "Khả năng tạo tiền trong kỳ này được đọc từ dòng tiền kinh doanh và, khi có, từ số dư khí. Không đọc từ lợi nhuận đã bị loại.",
    });
    claims.push({
      class: "CONDITION",
      text: "Nhận định về chuyển lợi nhuận thành tiền đổi khi cột lợi nhuận hiện hành khớp cộng ngang. Khớp cột đó vẫn không biến số dư khí thành tiền đã thu.",
    });
    return claims;
  }

  function evfDurabilityClaims(record, number) {
    const net = record.net_income_yoy_pct;
    const pre = record.pre_provision_profit_yoy_pct;
    const provision = record.credit_loss_provision_yoy_pct;
    return [
      {
        class: "FACT",
        text: `Kỳ soát xét là 9 tháng, đơn vị triệu đồng, không có cột quý riêng. Lợi nhuận sau thuế ${number(net)}%, lợi nhuận trước dự phòng ${number(pre)}% và chi phí dự phòng rủi ro tín dụng ${number(provision)}% so với cùng kỳ.`,
      },
      {
        class: "DERIVATION",
        text: net > 0 && pre < 0
          ? "Lợi nhuận sau thuế tăng trong khi lợi nhuận trước dự phòng giảm. Hai hướng này lấy từ các tỷ lệ đã tính, không từ một cột quý được chế ra."
          : "Hướng lợi nhuận sau thuế và lợi nhuận trước dự phòng được giữ riêng vì chưa đủ điều kiện để nói chúng ngược nhau.",
      },
      {
        class: "UNKNOWN",
        text: "Chưa có dư nợ, nợ xấu hoặc tỷ lệ bao phủ. Chất lượng tín dụng chưa được đo ngoài chi phí dự phòng đã in.",
      },
      {
        class: "INFERENCE",
        text: "Phần tăng lợi nhuận sau thuế không phải bằng chứng lợi nhuận cốt lõi mạnh hơn khi lợi nhuận trước dự phòng không tăng. Công ty tài chính không được đọc như ngân hàng thương mại.",
      },
      {
        class: "CONDITION",
        text: "Nhận định đổi khi thuyết minh tín dụng có dư nợ và nợ xấu cùng kỳ, hoặc khi có cột quý riêng đã soát xét.",
      },
    ];
  }

  function ssiDurabilityClaims(record, number) {
    const brokerage = observationValue(record, "brokerage_revenue", "2026-Q3");
    const marginIncome = observationValue(record, "loan_and_receivable_interest", "2026-Q3");
    const funding = observationValue(record, "interest_expense", "2026-Q3");
    const fvtpl = observationValue(record, "fvtpl_gain", "2026-Q3");
    const claims = [];
    if ([brokerage, marginIncome, funding, fvtpl].every((value) => value != null)) {
      claims.push({
        class: "FACT",
        text: `Quý 3/2026 có doanh thu môi giới ${number(brokerage)} đồng, lãi cho vay và phải thu ${number(marginIncome)} đồng, chi phí lãi vay ${number(funding)} đồng và lãi FVTPL ${number(fvtpl)} đồng.`,
      });
    }
    if (Number.isFinite(record.brokerage_revenue_yoy_pct)) {
      claims.push({
        class: "DERIVATION",
        text: `Doanh thu môi giới quý 3 thay đổi ${number(record.brokerage_revenue_yoy_pct)}% so với cùng kỳ. Lợi nhuận quý khớp theo cầu thuế và cầu phân chia đã kiểm.`,
      });
    }
    claims.push({
      class: "UNKNOWN",
      text: "Chưa có dòng tiền kinh doanh, nên chưa so lợi nhuận với tiền. Lợi nhuận sau thuế 9 tháng chưa phát hành vì một chữ số mơ hồ. Dư nợ margin và vay ngắn hạn chưa đọc lại.",
    });
    claims.push({
      class: "INFERENCE",
      text: "Môi giới và lãi cho vay là nghiệp vụ chứng khoán đang lặp. Lãi FVTPL có thể đổi mà không kèm tiền. Chưa kết luận lợi nhuận quý đã thành tiền.",
    });
    claims.push({
      class: "CONDITION",
      text: "Nhận định đổi khi đọc được dòng tiền kinh doanh, khi chữ số lợi nhuận 9 tháng hết mơ hồ, hoặc khi dư nợ margin được đọc từ trang đã chỉ định.",
    });
    return claims;
  }

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
      segment_agri_external_revenue: "Doanh thu ngoài nông nghiệp",
      segment_seafood_external_revenue: "Doanh thu ngoài thủy sản",
      segment_packaged_food_external_revenue: "Doanh thu ngoài thực phẩm đóng gói",
      segment_other_external_revenue: "Doanh thu ngoài bộ phận khác",
      segment_external_revenue_total: "Tổng doanh thu ngoài các bộ phận",
      holding_cash_and_equivalents: "Tiền và tương đương tiền của công ty mẹ",
    };
    const number = (value) => value.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
    const lines = observations.filter((row) => Object.hasOwn(label, row.metric)
      && Number.isSafeInteger(row.value) && ["VND", "shares"].includes(row.unit)
      && Number.isInteger(row.pdf_page)).map((row) => {
      const period = row.period === "2026-9M" ? "9 tháng 2026" : row.period;
      const unit = row.unit === "shares" ? "cổ phiếu" : "đồng";
      const scope = row.statement_scope === "separate"
        ? " · BCTC riêng"
        : (row.statement_scope === "consolidated_segment" ? " · thuyết minh bộ phận" : "");
      return `<li>${label[row.metric]} · ${escHtml(period)} · ${number(row.value)} ${unit} (trang PDF ${row.pdf_page}${scope})</li>`;
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
        Doanh thu ngoài của nông nghiệp, thủy sản và thực phẩm đóng gói lấy từ thuyết minh bộ phận. Tiền công ty mẹ, khi có, lấy từ BCTC riêng và không phải tiền hợp nhất.
        Nợ vay ngắn hạn công ty mẹ chưa được phát hành vì chữ số OCR còn mơ hồ. Cột lợi nhuận 9 tháng vẫn bị loại vì lệch 1 đồng.
        Phần đọc bên dưới tách việc đã đọc, suy ra, nhận định và chỗ chưa có chứng cứ. EPS chuẩn hóa chưa được tính.</p>
      ${claimList(panDurabilityClaims(record, number))}
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
      trade_payable_pv_gas: "Phải trả người bán Tổng công ty Khí Việt Nam - CTCP",
      accrued_uninvoiced_gas_purchase: "Chi phí khí chưa có hóa đơn cho NT1, NT2, NT3&4",
    };
    const periodLabel = {
      "2026-Q3": "quý 3/2026",
      "2025-Q3": "quý 3/2025",
      "2026-9M": "9 tháng 2026 (không phải quý riêng)",
      "2025-9M": "9 tháng 2025 (không phải quý riêng)",
      "2026-09-30": "số dư 30/09/2026",
      "2026-01-01": "số dư đầu năm 01/01/2026",
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
        Phải trả thương mại PV GAS và chi phí khí chưa lập hóa đơn là số dư. Không cộng hai khoản đó và không gọi phần chênh lệch là tiền đã thu.
        Chưa soát xét. Không phải fact chính thức. Không tính P/B, nợ vay thuần hay EPS chuẩn hóa.</p>
      ${claimList(powDurabilityClaims(record, number))}
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
      ${claimList(evfDurabilityClaims(record, number))}
      <details><summary>Đối chiếu số liệu và nguồn</summary><ul>${lines.join("")}</ul>
        ${source} · công bố ${escHtml(record.issuer_disclosure_date || "")} · soát xét ${escHtml(record.review_standard || "")} · SHA-256 ${escHtml(record.sha256 || "")}.
      </details>
    </div>`;
  }

  function q3SecuritiesHtml(record) {
    const observations = record.observations;
    if (record.research_kind !== "UNREVIEWED_CONSOLIDATED_SECURITIES"
        || record.entity_class !== "securities" || record.commercial_bank !== false
        || record.industrial_ratios !== "NOT_APPLICABLE" || record.normalized_eps !== "NOT_COMPUTED"
        || record.audit_or_review_status !== "unreviewed" || record.statement_scope !== "consolidated"
        || !Array.isArray(observations) || !observations.length
        || record.official_fact_admitted !== false || record.valuation_use !== "CLOSED"
        || record.session_binding !== "NOT_A_SEALED_SESSION_FACT"
        || record.common_shareholder_pb !== "UNAVAILABLE"
        || record.official_store_adoption !== "REFUSED") return "";
    const label = {
      pretax_profit: "Lợi nhuận kế toán trước thuế",
      income_tax: "Chi phí thuế thu nhập doanh nghiệp",
      net_income: "Lợi nhuận sau thuế",
      attributable_net_income: "Lợi nhuận sau thuế của chủ sở hữu",
      noncontrolling_interest_profit: "Lợi nhuận sau thuế của cổ đông không kiểm soát",
      unrealized_pretax_profit: "Lợi nhuận chưa thực hiện",
      interest_expense: "Chi phí lãi vay",
      fvtpl_gain: "Lãi FVTPL",
      fvtpl_coupon_dividend: "Cổ tức và lãi từ tài sản FVTPL",
      htm_interest: "Lãi HTM",
      loan_and_receivable_interest: "Lãi cho vay và phải thu",
      brokerage_revenue: "Doanh thu nghiệp vụ môi giới",
    };
    const periodLabel = {
      "2026-Q3": "quý 3/2026",
      "2025-Q3": "quý 3/2025",
      "2026-9M": "9 tháng 2026 (không phải quý riêng)",
    };
    const number = (value) => value.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
    const lines = observations.filter((row) => Object.hasOwn(label, row.metric)
      && Object.hasOwn(periodLabel, row.period) && Number.isSafeInteger(row.value)
      && row.unit === "VND" && Number.isInteger(row.pdf_page)).map((row) => (
      `<li>${label[row.metric]} · ${periodLabel[row.period]} · ${number(row.value)} đồng (trang PDF ${row.pdf_page})</li>`
    ));
    if (lines.length !== observations.length || !Number.isFinite(record.brokerage_revenue_yoy_pct)) return "";
    const url = String(record.source_url || "");
    const source = /^https:\/\/www\.ssi\.com\.vn\/upload\/files\/IR\/[A-Za-z0-9%._-]+\.pdf$/.test(url)
      ? `<a href="${escHtml(url)}">PDF trên trang IR của SSI</a>` : "PDF trên trang IR của SSI";
    return `<div class="ws-q3-successor cockpit-note mt-1" data-official-fact="false" data-session-binding="NOT_A_SEALED_SESSION_FACT" data-valuation-use="CLOSED" data-research-kind="UNREVIEWED_CONSOLIDATED_SECURITIES" data-entity-class="securities">
      <b>BCTC hợp nhất Q3/2026 · công ty chứng khoán · chưa soát xét</b>
      <p>Lợi nhuận quý 3 khớp giữa lợi nhuận trước thuế trừ thuế và phần chia chủ sở hữu cộng cổ đông không kiểm soát. Doanh thu môi giới quý 3 thay đổi ${number(record.brokerage_revenue_yoy_pct)}% so với cùng kỳ.
        Lợi nhuận sau thuế 9 tháng chưa được đưa vào vì một chữ số trên trang còn mơ hồ. Đây là công ty chứng khoán. Không tính P/B, EV/EBITDA hay EPS chuẩn hóa. Host IR chưa được admit thành fact chính thức.</p>
      ${claimList(ssiDurabilityClaims(record, number))}
      <details><summary>Đối chiếu số liệu và nguồn</summary><ul>${lines.join("")}</ul>
        ${source} · công bố ${escHtml(record.issuer_disclosure_date || "")} · hợp nhất · chưa soát xét · SHA-256 ${escHtml(record.sha256 || "")}.
      </details>
    </div>`;
  }

  function q3SuccessorHtml(record) {
    if (!record) return "";
    if (record.research_kind === "UNREVIEWED_CONSOLIDATED_SECURITIES") return q3SecuritiesHtml(record);
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
        ${record.alternate_document && record.alternate_document.retained_source_replaced === false
          ? "Một PDF 36 trang ngày 29/10 có SHA khác; dòng doanh thu gộp và giảm trừ trên trang 6 trùng bản đang giữ. Nguồn đã retained không bị thay."
          : ""}
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
