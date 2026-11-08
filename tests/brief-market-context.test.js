// brief_market_context/v1 rendering, driven by the Engine-generated contract fixture.
// tests/fixtures/brief_market_context_contract_v1.json is a byte copy of stocklookup-engine's
// tests/fixtures/brief_market_context_contract_v1.json, produced by its real
// snapshot -> session_change -> Brief -> delivery path; Dashboard CI compares the copy with
// the Engine main branch, so a changed Engine shape fails here instead of going stale.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dc = require("../assets/js/decision-cockpit.js");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "brief_market_context_contract_v1.json"), "utf8"));
const cockpitOf = (name) => JSON.parse(JSON.stringify(FIXTURE.cases[name].cockpit));
const html = (name) => dc.renderBriefMarketContextHtml(cockpitOf(name));
const pcOf = (name) => cockpitOf(name).brief_market_context_v1.market_participation_change;

test("fixture is the Engine contract and its case digest is intact", () => {
  assert.equal(FIXTURE.contract_version, "brief_market_context_contract_fixture/v1");
  assert.equal(FIXTURE.projection_contract, "brief_market_context/v1");
  assert.match(FIXTURE.generated_by, /^stocklookup-engine:tools\/build_brief_market_context_contract_fixture\.py$/);
  // The digest is Python's canonical JSON (floats keep ".0"), so it is not recomputed in JS; byte
  // equality with the Engine file is enforced by the Dashboard CI contract-sync step instead.
  assert.match(FIXTURE.cases_sha256, /^[0-9a-f]{64}$/);
  const expected = ["adjacent_broadening_confirmed_with_churn", "asymmetric_missing_momentum", "cohort_reconciliation_mismatch",
    "different_ma20_eligibility", "indeterminate_condition", "market_gated_entries", "missing_previous_snapshot",
    "older_brief_without_new_fields", "refuted_condition", "registry_adjacent_calendar_separated", "registry_gap_unverified_adjacency"];
  assert.deepEqual(Object.keys(FIXTURE.cases).sort(), expected);
});

test("every displayed number is the Engine's own value", () => {
  for (const name of Object.keys(FIXTURE.cases)) {
    const block = cockpitOf(name).brief_market_context_v1;
    const pc = block && block.market_participation_change;
    if (!pc || pc.status !== "AVAILABLE") continue;
    const out = html(name);
    for (const key of ["advance_ratio_pp", "above_ma20_share_pp", "positive_momentum_share_pp"]) {
      const v = pc.changes[key];
      const shown = v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)} điểm %`;
      assert.ok(out.includes(shown), `${name}: ${key} ${shown}`);
    }
    assert.ok(out.includes(`cùng ${pc.cohort.matched} mã`), name);
    assert.ok(out.includes(`${pc.ma20_crossings.net > 0 ? "+" : ""}${pc.ma20_crossings.net} (lên ${pc.ma20_crossings.crossed_above} / xuống ${pc.ma20_crossings.crossed_below})`), name);
  }
});

test("condition object renders its hypothesis and Engine state, never condition_source", () => {
  const cases = { adjacent_broadening_confirmed_with_churn: "Đã xác nhận", refuted_condition: "Bị bác bỏ",
    indeterminate_condition: "Chưa xác nhận cũng chưa bị bác bỏ" };
  for (const [name, label] of Object.entries(cases)) {
    const cond = pcOf(name).market_close_condition_evaluation;
    const out = html(name);
    assert.match(out, new RegExp(`data-condition-state="${cond.state}">Điều kiện &quot;độ rộng cải thiện&quot; của bản tin đóng cửa: <strong>${label}</strong>`));
    assert.ok(!out.includes(cond.condition_source), name);
    assert.doesNotMatch(out, /hypothesis|condition_source|state:/);
  }
});

test("malformed or unknown condition data is handled without reinterpretation", () => {
  const c = cockpitOf("refuted_condition");
  const pc = c.brief_market_context_v1.market_participation_change;
  pc.market_close_condition_evaluation = { hypothesis: "Participation improves", state: "MAYBE", condition_source: "x" };
  assert.match(dc.renderBriefMarketContextHtml(c), /<strong>Chưa xác định<\/strong>/);
  for (const bad of [null, "CONFIRMED", ["CONFIRMED"], { "Participation improves": "CONFIRMED" }]) {
    pc.market_close_condition_evaluation = bad;
    const out = dc.renderBriefMarketContextHtml(c);
    assert.doesNotMatch(out, /data-condition-state/);
    assert.doesNotMatch(out, /Đã xác nhận/);
  }
});

test("asymmetric momentum shows the both-sessions denominator", () => {
  const pc = pcOf("asymmetric_missing_momentum");
  assert.equal(pc.cohort.matched_with_momentum_both_sessions, 3);
  const out = html("asymmetric_missing_momentum");
  assert.match(out, /\+33\.33 điểm %/);
  assert.match(out, /Động lượng tính trên 3 mã có dữ liệu động lượng ở cả hai phiên/);
});

test("different MA20 eligibility and churn are stated", () => {
  assert.match(html("different_ma20_eligibility"), /MA20 tính trên 3 mã biết vị trí MA20 ở cả hai phiên/);
  assert.match(html("adjacent_broadening_confirmed_with_churn"), /1 mã chỉ có ở phiên này và 1 mã chỉ có ở phiên trước/);
});

test("registry-adjacent but calendar-separated pair carries the multi-session warning", () => {
  const pc = pcOf("registry_adjacent_calendar_separated");
  assert.equal(pc.adjacency, "REGISTRY_IMMEDIATE_PREVIOUS_COMPLETED_SESSION");
  assert.equal(pc.span.may_span_multiple_trading_sessions, true);
  const out = html("registry_adjacent_calendar_separated");
  assert.match(out, /data-multi-session="true"/);
  assert.match(out, /Giữa hai phiên có 4 ngày làm việc/);
  assert.match(out, /có thể gộp nhiều phiên giao dịch/);
  assert.match(out, /không phải lịch giao dịch chính thức/);
  const adjacent = html("adjacent_broadening_confirmed_with_churn");
  assert.match(adjacent, /data-multi-session="false"/);
  assert.doesNotMatch(adjacent, /data-span-warning/);
  const gap = html("registry_gap_unverified_adjacency");
  assert.match(gap, /chưa được xác nhận là phiên hoàn tất liền trước/);
});

test("refusals show their reason and no numbers", () => {
  for (const [name, reason] of [["missing_previous_snapshot", "NO_PREVIOUS_PARTICIPATION_SNAPSHOT"],
    ["cohort_reconciliation_mismatch", "CURRENT_PARTICIPATION_COHORT_DIFFERS_FROM_MARKET_BREADTH"]]) {
    const out = html(name);
    assert.ok(out.includes(reason), name);
    assert.doesNotMatch(out, /điểm %/);
  }
});

test("older Brief, wrong session and foreign contract render nothing", () => {
  assert.equal(html("older_brief_without_new_fields"), "");
  const wrong = cockpitOf("adjacent_broadening_confirmed_with_churn");
  wrong.brief_market_context_v1.session = "2026-11-05";
  assert.equal(dc.renderBriefMarketContextHtml(wrong), "");
  const foreign = cockpitOf("adjacent_broadening_confirmed_with_churn");
  foreign.brief_market_context_v1.contract_version = "brief_market_context/v2";
  assert.equal(dc.renderBriefMarketContextHtml(foreign), "");
});

test("market-gated rows keep security setup and market environment apart with no order wording", () => {
  const block = cockpitOf("market_gated_entries").brief_market_context_v1;
  const out = html("market_gated_entries");
  assert.match(out, /data-ticker="MCP"/);
  assert.match(out, /Setup của mã đã kích hoạt/);
  assert.match(out, /Độ rộng suy yếu/);
  assert.match(out, new RegExp(`Mức vô hiệu của mã: ${block.market_gated_entries[0].security_invalidation.invalidation_level}`));
  assert.match(out, /Đây không phải khuyến nghị mua/);
  for (const forbidden of [/khối lượng/i, /giá mục tiêu/i, /xác suất/i, /điểm số/i, /mua ngay/i]) {
    assert.doesNotMatch(out, forbidden);
  }
});

test("values from the projection are escaped", () => {
  const c = cockpitOf("market_gated_entries");
  const b = c.brief_market_context_v1;
  b.market_gated_entries[0].ticker = "<img src=x onerror=alert(1)>";
  b.market_gated_entries[0].security_setup = "<script>alert(1)</script>";
  b.market_participation_change.previous_session = "<b>x</b>";
  b.market_participation_change.span.calendar_weekdays_between = "<i>4</i>";
  const out = dc.renderBriefMarketContextHtml(c);
  assert.doesNotMatch(out, /<img|<script|<b>x|<i>4/);
});

test("workspace page hosts a hidden section and clears it on a session mismatch", () => {
  const page = fs.readFileSync(path.join(root, "investment-workspace.html"), "utf8");
  assert.match(page, /id="section-brief-market-context" hidden/);
  assert.match(page, /id="cockpit-brief-market-context"/);
  const js = fs.readFileSync(path.join(root, "assets", "js", "investment-workspace.js"), "utf8");
  assert.match(js, /renderBriefMarketContextHtml\(cockpit\)/);
  const mismatch = js.slice(js.indexOf("Session Coherence Gate"), js.indexOf("Real contract rendering"));
  assert.match(mismatch, /section-brief-market-context[\s\S]*hidden = true/);
});
