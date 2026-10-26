"use strict";
// INVESTOR_CASE_DESK_LOCAL_REVIEW_INTEGRATION_V1, financial-quality closeout: the Case Desk viewer
// shows Consumer PR #13 `financial_quality_research` with its source binding and time boundary.
// Fixtures are sanitized excerpts of real PR #13 cases (tests/fixtures/case_desk/build_case_desk_review_fixtures.py):
// the excerpt case (both outputs bound to the case runs), the same request with three sessions
// (October 23 output stays separate) and the full retained-bundle cross-sector case.
// Every mutation below is labelled SYNTHETIC.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const cdr = require("../assets/js/case-desk-review.js");

const index = JSON.parse(read("data/workspace_index.json"));
const FIXTURES = {
  exact: read("tests/fixtures/case_desk/case_fq_exact.json"),
  separate: read("tests/fixtures/case_desk/case_fq_separate.json"),
  cross: read("tests/fixtures/case_desk/case_fq_cross_sector.json"),
  hpg: read("tests/fixtures/case_desk/case_hpg.json"),
  mixed: read("tests/fixtures/case_desk/case_mixed_basis.json"),
};
const doc = (name) => JSON.parse(FIXTURES[name]);
const open = (name) => {
  const r = cdr.parseCase(FIXTURES[name]);
  assert.equal(r.ok, true, `${name}: ${r.error} ${r.detail}`);
  return r.model;
};
const parse = (value) => cdr.parseCase(JSON.stringify(value));
const visible = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");
const section = (html) => {
  const start = html.indexOf('id="cdr-sec-financial-quality"');
  return start < 0 ? "" : html.slice(start, html.indexOf('id="cdr-sec-challenge"'));
};
const fqText = (name, ticker) => visible(section(cdr.caseViewHtml(open(name), { ticker, indexDoc: index })));

test("fixtures are the Consumer PR #13 cases (identities from its acceptance receipt)", () => {
  assert.equal(open("exact").caseIdentity, "investment_case:072006a31d3650a481dfd272763dcef0a827716834872a8c0f4b0a2f6a7e73b7");
  assert.equal(open("cross").caseIdentity, "investment_case:9931937180aae77c8d76f0f242d63a7919538c13d9f261dac153905275a6e72c");
  assert.equal(open("separate").caseIdentity, "investment_case:2210347c2ebd48cff1f7ea99aa2dc096b84c7cfd4ff595f2ce4f2eeb3e3bf793");
  assert.deepEqual(open("cross").tickers, ["FPT", "HPG", "PNJ", "POW", "QNS", "VCI", "VNM"]);
  for (const name of ["exact", "separate", "cross"]) {
    assert.doesNotMatch(FIXTURES[name], /[A-Za-z]:\\\\|[A-Za-z]:\/|\/Users\//, `${name} must carry no local filesystem path`);
  }
});

test("PR #12 cases without the optional block render no financial-quality section", () => {
  for (const name of ["hpg", "mixed"]) {
    const m = open(name);
    assert.equal(m.financialQuality, null);
    for (const t of m.tickers) {
      const html = cdr.caseViewHtml(m, { ticker: t, indexDoc: index });
      assert.doesNotMatch(html, /cdr-sec-financial-quality|data-fq-/);
    }
  }
});

test("PNJ: H1 profit and provision are shown apart from FY2025 operating cash, which is never paired", () => {
  const text = fqText("exact", "PNJ");
  assert.match(text, /net_income · 2026-H1 \(2026-01-01 → 2026-06-30\) · consolidated: 728\.386\.009\.054 VND/);
  assert.match(text, /provision_charge_or_reversal_adjustment · 2026-H1 .*2\.667\.248\.523\.366 VND/);
  assert.match(text, /không phải tiền thu về/);
  assert.match(text, /Không so sánh được trên bằng chứng hiện có/);
  assert.match(text, /Dòng tiền kinh doanh chỉ có cho kỳ khác/);
  assert.match(text, /Quan sát tiền \(có thể khác kỳ — không ghép\).*operating_cash_flow · 2025 \(2025-01-01 → 2025-12-31\) · consolidated: 18\.890\.403\.841 VND/);
  assert.match(text, /Không có phép đo: không ghép lợi nhuận và dòng tiền khác kỳ/);
  assert.match(text, /Tính lặp lại: Chưa xác định · chuẩn hóa: Không tính/);
});

test("HPG: FY2025 headline profit is not H1 earnings; no disposal adjustment is invented", () => {
  const text = fqText("exact", "HPG");
  assert.match(text, /net_income · 2025 \(2025-01-01 → 2025-12-31\) · consolidated: 15\.514\.931\.571\.606 VND Đảm bảo: audited/);
  assert.doesNotMatch(text, /net_income · 2026-H1/);
  assert.match(text, /Không có khoản mục được chấp nhận/);
  assert.match(text, /Giới hạn của mẫu số định giá Kiểm định của Producer: Chưa được hỗ trợ/);
  assert.match(text, /Chưa có EPS đủ điều kiện/);
});

test("FPT: a historical provision is not current non-recurring proof", () => {
  const text = fqText("exact", "FPT");
  assert.match(text, /provision_charge_or_reversal_adjustment · 2025 .*651\.406\.282\.654 VND/);
  assert.match(text, /Lợi nhuận thực sự được báo cáo Không có lợi nhuận đủ điều kiện/);
  assert.match(text, /Bằng chứng về lợi nhuận lặp lại Kiểm định của Producer: Chưa được hỗ trợ/);
});

test("cross-sector full bundles: four exact bindings; QNS/VNM kept; POW/VCI gaps explicit", () => {
  const m = open("cross");
  assert.deepEqual(m.financialQuality.blocks.PNJ.map((b) => [b.source.source_session, b.source.binding.state]), [
    ["2026-10-20", "EXACT_CASE_RUN_SOURCE_PROJECTION"], ["2026-10-21", "EXACT_CASE_RUN_SOURCE_PROJECTION"],
    ["2026-10-22", "EXACT_CASE_RUN_SOURCE_PROJECTION"], ["2026-10-23", "EXACT_CASE_RUN_SOURCE_PROJECTION"]]);
  assert.match(fqText("cross", "QNS"), /shareholders_equity · 2026-H1 .*10\.647\.823\.148\.609 VND/);
  assert.match(fqText("cross", "VNM"), /cash_and_equivalents · 2026-H1 .*4\.535\.672\.366\.831 VND/);
  const vci = fqText("cross", "VCI");
  assert.match(vci, /Công ty chứng khoán · Tổ chức tài chính hoặc loại hình chưa xác định/);
  assert.match(vci, /Không áp dụng chuyển hóa tiền kiểu doanh nghiệp phi tài chính/);
  assert.match(vci, /Chưa có cầu nối OCI/);
  for (const t of ["POW", "VCI"]) {
    assert.doesNotMatch(fqText("cross", t), /Số liệu nguồn \(Producer\)/, `${t} has no admitted figure`);
    assert.match(fqText("cross", t), /Không có lợi nhuận đủ điều kiện/);
  }
  // VCI is never delivered as a Daily card; the page still renders and says so via the session compare.
  assert.doesNotThrow(() => cdr.caseViewHtml(m, { ticker: "VCI", indexDoc: index }));
});

test("exact binding is labelled as later consultation, never an original T0 conclusion", () => {
  const html = cdr.caseViewHtml(open("exact"), { ticker: "PNJ", indexDoc: index });
  const text = visible(section(html));
  assert.equal((section(html).match(/data-fq-binding="EXACT_CASE_RUN_SOURCE_PROJECTION"/g) || []).length, 2);
  assert.match(text, /Phần giải thích được tra cứu sau, lúc 2026-10-26T09:00:00\+07:00: không phải kết luận đã có tại phiên 2026-10-23 và không phải thẻ Daily đã giao/);
  assert.match(text, /Đây là phiên 2026-10-22, không phải phiên mới nhất 2026-10-23 của hồ sơ/);
  // Daily-card states stay in their own section and only point at the added source.
  assert.match(visible(html), /Có 2 nguồn financial-quality bổ sung cho mã này: phiên 2026-10-22 — Đúng nguồn của lần chạy ; phiên 2026-10-23 — Đúng nguồn của lần chạy \. .*Các trạng thái ở trên vẫn là của thẻ Daily/);
  assert.match(visible(html), /Kiểm định chất lượng tài chính của Producer Không phải phản luận được chọn hay kết luận/);
});

test("a later output for a session outside the case stays separate context", () => {
  const html = cdr.caseViewHtml(open("separate"), { ticker: "PNJ", indexDoc: index });
  assert.match(section(html), /data-fq-binding="SEPARATE_SOURCE_SESSION_NOT_IN_CASE"/);
  const text = visible(section(html));
  assert.match(text, /Bối cảnh tra cứu sau \/ hiện tại — không thuộc thời điểm của bất kỳ phiên nào trong hồ sơ/);
  assert.match(text, /Cùng mã hay cùng ngày không chứng minh cùng lần chạy/);
  assert.doesNotMatch(text, /Đúng nguồn của lần chạy/);
});

test("every figure shown in the section is a Producer value from the file; nothing is derived", () => {
  for (const [name, ticker] of [["exact", "PNJ"], ["exact", "HPG"], ["cross", "VNM"]]) {
    const d = doc(name);
    const allowed = new Set();
    for (const a of d.financial_quality_research.artifacts) for (const t of a.tickers) for (const e of t.evidence || []) {
      for (const k of ["normalized_value", "operating_cash_flow", "profit"]) {
        if (typeof e.observation[k] === "number") allowed.add(e.observation[k].toLocaleString("vi-VN", { maximumFractionDigits: 6 }));
      }
    }
    const shown = fqText(name, ticker).match(/\b\d{1,3}(?:\.\d{3}){2,}\b/g) || [];
    assert.ok(shown.length > 0);
    for (const n of shown) assert.ok(allowed.has(n), `${name}/${ticker}: ${n} is not a value in the file`);
  }
});

function tampered(mutate) {
  const d = doc("exact");
  mutate(d);
  return parse(d);
}

test("SYNTHETIC: a binding that does not name the case's own run is refused, not relabelled", () => {
  const cases = [
    (d) => { d.financial_quality_research.artifacts[0].source.binding.run_identity = `daily_producer_run:${"0".repeat(64)}`; },
    (d) => { d.financial_quality_research.artifacts[0].source.binding.bundle_sha256 = "0".repeat(64); },
    (d) => { const s = d.financial_quality_research.artifacts[0].source; s.source_session = "2026-10-24"; s.binding.session = "2026-10-24"; },
    (d) => { d.financial_quality_research.artifacts[0].source.binding.state = "SEPARATE_SOURCE_SESSION_NOT_IN_CASE"; },
    (d) => { d.financial_quality_research.artifacts[0].source.binding.state = "MAYBE_BOUND"; },
    (d) => { d.request.financial_quality_artifact_sha256 = ["f".repeat(64), "e".repeat(64)]; },
    (d) => { delete d.financial_quality_research; },
    (d) => { d.decision_distinctions[0].financial_quality_bridge[0].binding_state = "SEPARATE_SOURCE_SESSION_NOT_IN_CASE"; },
    (d) => { d.financial_quality_research.artifacts[1] = d.financial_quality_research.artifacts[0]; },
    (d) => { d.financial_quality_research.artifacts[0].tickers[0].ticker = "NVL"; },
    (d) => { d.financial_quality_research.artifacts[0].tickers[0].evidence[0].source.ticker = "ZZZ"; },
    (d) => { d.financial_quality_research.artifacts[0].tickers[0].evidence[0].evidence_identity = "case_evidence:x"; },
    (d) => { d.financial_quality_research.contract_version = "case_financial_quality_research/v2"; },
    (d) => { d.financial_quality_research.artifacts = "not a list"; },
    (d) => { d.financial_quality_research.artifacts[0].tickers[0].evidence = "nope"; d.financial_quality_research.artifacts[0].tickers[0].status = ""; },
    (d) => { d.financial_quality_research = null; },
  ];
  for (const [i, mutate] of cases.entries()) {
    const r = tampered(mutate);
    assert.equal(r.ok, false, `mutation ${i}`);
    assert.equal(r.error, "BAD_FINANCIAL_QUALITY", `mutation ${i}`);
  }
});

test("SYNTHETIC: malformed answers inside a valid block degrade to placeholders without throwing", () => {
  const d = doc("exact");
  const block = d.financial_quality_research.artifacts[0].tickers.find((t) => t.ticker === "PNJ");
  block.investor_answers = { reported_profit: "x", cash_vs_profit: { state: 7, measurements: [42, null, "case_financial_quality_evidence:" + "a".repeat(64)], blockers: {} },
    recurring_earnings: null, valuation_denominator: [], evidence_needed: "all" };
  block.evidence[0].observation = { canonical_metric: { nested: true }, normalized_value: "1e9", bounds: "no", reason_codes: "x", citation_ids: 5 };
  const r = parse(d);
  assert.equal(r.ok, true, r.detail);
  let html;
  assert.doesNotThrow(() => { html = cdr.caseViewHtml(r.model, { ticker: "PNJ", indexDoc: index }); });
  assert.match(html, /data-case-evidence-missing="true"/);
  assert.match(visible(section(html)), /Không được cung cấp/);
});

test("SYNTHETIC: hostile Producer text is escaped everywhere in the section", () => {
  const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const d = doc("exact");
  const a = d.financial_quality_research.artifacts[0];
  a.source.consultation_cutoff = evil;
  const block = a.tickers.find((t) => t.ticker === "PNJ");
  for (const e of block.evidence) {
    const o = e.observation;
    for (const k of ["text", "claim", "confirming_evidence_needed", "invalidation_condition", "canonical_metric", "currency", "line_code", "code"]) if (k in o) o[k] = evil;
    if (Array.isArray(o.reason_codes)) o.reason_codes = [evil];
  }
  block.status = "INCLUDED";
  const r = parse(d);
  assert.equal(r.ok, true, r.detail);
  const html = cdr.caseViewHtml(r.model, { ticker: "PNJ", indexDoc: index });
  assert.doesNotMatch(html, /<img|<script|onerror="/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("SYNTHETIC: a malformed financial-quality file keeps the open case in place", () => {
  cdr.closeCase();
  assert.equal(cdr.acceptText(FIXTURES.exact).ok, true);
  const first = cdr.currentModel();
  const bad = doc("cross");
  bad.financial_quality_research.artifacts[0].source.binding.run_identity = `daily_producer_run:${"1".repeat(64)}`;
  const r = cdr.acceptText(JSON.stringify(bad));
  assert.equal(r.error, "BAD_FINANCIAL_QUALITY");
  assert.equal(cdr.currentModel(), first);
  assert.match(cdr.IMPORT_ERRORS.BAD_FINANCIAL_QUALITY, /không mở hồ sơ này/);
  cdr.closeCase();
});

test("current dossier versus historical case distinction is unchanged by the added section", () => {
  const m = open("exact");
  const html = cdr.caseViewHtml(m, { ticker: "PNJ", indexDoc: index });
  const cmp = cdr.compareWithPublished(m, index, "PNJ");
  assert.match(html, new RegExp(`data-case-session-state="${cmp.state}"`));
  assert.match(visible(html), /Hồ sơ Case Desk \(nghiên cứu trước\)/);
  assert.ok(html.indexOf('id="cdr-sec-distinctions"') < html.indexOf('id="cdr-sec-financial-quality"'));
  assert.ok(html.indexOf('id="cdr-sec-financial-quality"') < html.indexOf('id="cdr-sec-challenge"'));
});
