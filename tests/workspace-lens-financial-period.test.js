const test = require("node:test");
const assert = require("node:assert/strict");
const ws = require("../assets/js/investment-workspace.js");

const evf = {
  ticker: "EVF", research_action_posture: "AVOID", posture_condition_class: "BEARISH_STRUCTURE_ADVERSE",
  entry_state: "BREAKOUT_READY", entry_action: "BUY_ON_CONFIRMATION", research_stance: "INSUFFICIENT_EVIDENCE",
  reference_trigger: { trigger_level: 11.8, trigger_state: "APPROACHING", trigger_condition_satisfied: false, status: "AVAILABLE" },
  confirmation: { boundary_type: "BREAKOUT_EXTENSION_CONFIRMATION" },
  invalidation: { technical: { boundary_type: "BREAKOUT_LEVEL_FAILURE" } },
  why: { financial_analysis: { compact: { as_of_financial_period: null } } },
};

test("constructive tactical label under a non-constructive posture states which lens decides", () => {
  const html = ws.lensReconciliationHtml(evf);
  assert.match(html, /Hai lăng kính khác nhau — không phải tín hiệu mua/);
  assert.match(html, /Quyết định tích hợp \(quyết định chính\)/);
  assert.match(html, /11[.,]8/);
  assert.match(html, /chưa thỏa điều kiện/);
  assert.match(html, /data-lens-conflict="AVOID\|BUY_ON_CONFIRMATION"/);
});

test("no reconciliation note when lenses agree or tactical is not constructive", () => {
  assert.equal(ws.lensReconciliationHtml({ ...evf, research_action_posture: "INITIATE_ON_BREAKOUT" }), "");
  assert.equal(ws.lensReconciliationHtml({ ...evf, entry_action: "AVOID" }), "");
  assert.equal(ws.lensReconciliationHtml({ ...evf, research_action_posture: undefined }), "");
  assert.equal(ws.lensReconciliationHtml(null), "");
});

test("financial period is always shown and authority is not presented as recency", () => {
  const pan = { why: { financial_analysis: { compact: { as_of_financial_period: "2026-Q1" } } }, valuation: {} };
  const html = ws.financialPeriodHtml(pan);
  assert.match(html, /Kỳ BCTC dùng trong phân tích:<\/b> 2026-Q1/);
  assert.match(html, /không có nghĩa là dữ liệu quý mới nhất/);
  assert.match(html, /Chưa có kỳ BCTC chính thức mới hơn được chấp nhận/);
  assert.match(ws.financialPeriodHtml({}), /chưa xác định/);
});

test("later admitted official periods are listed as context only", () => {
  const hpg = {
    why: { financial_analysis: { compact: { as_of_financial_period: "2026-Q1" } } },
    valuation: { official_financial_context: [
      { temporal_status: "CURRENT_OFFICIAL_FACT", reporting_period: "2026-H1", canonical_metric: "revenue" },
      { temporal_status: "CURRENT_OFFICIAL_FACT", reporting_period: "2026-H1", canonical_metric: "net_income" },
      { temporal_status: "HISTORICAL_OFFICIAL_FACT", reporting_period: "2025", canonical_metric: "revenue" },
    ] },
  };
  const html = ws.financialPeriodHtml(hpg);
  assert.match(html, /2026-H1 — 2 chỉ tiêu/);
  assert.match(html, /không dùng cho định giá\/TTM/);
});

test("decision card renders both corrections", () => {
  const html = ws.decisionCardHtml({ ...evf, valuation: {} }, { ticker: "EVF" });
  assert.match(html, /ws-lens-reconciliation/);
  assert.match(html, /ws-financial-period/);
  assert.match(html, /Không phải tín hiệu mua/);
});

test("P/B research proxy shows its NCI denominator and book period", () => {
  const val = { method_diagnostics: { "P/B_CURRENT_RESEARCH": { value: 0.4397, equity_definition: "TOTAL_OWNERS_EQUITY_AS_REPORTED_INCLUDES_NCI_WHERE_PRESENT", book_period: "2026-Q1", book_period_lag_quarters: 3 } } };
  const html = ws.bookBasisNoteHtml(val);
  assert.match(html, /gồm lợi ích cổ đông không kiểm soát/);
  assert.match(html, /kỳ sổ sách 2026-Q1, trễ 3 quý/);
  assert.match(html, /không phải P\/B trên vốn cổ đông công ty mẹ/);
  assert.equal(ws.bookBasisNoteHtml({}), "");
  const compared = { method_diagnostics: { "P/B_CURRENT_RESEARCH": { value: 0.4397, equity_definition: "TOTAL_OWNERS_EQUITY_AS_REPORTED_INCLUDES_NCI_WHERE_PRESENT", book_period: "2026-Q1", common_shareholder_comparison: { label: "COMMON_SHAREHOLDER_RESEARCH", periods_comparable: false, common_shareholder_pb: { status: "UNAVAILABLE", reason_codes: ["PARENT_EQUITY_NOT_ADMITTED"] } } } } };
  assert.match(ws.bookBasisNoteHtml(compared), /COMMON_SHAREHOLDER_RESEARCH/);
  assert.match(ws.bookBasisNoteHtml(compared), /PARENT_EQUITY_NOT_ADMITTED/);
});
