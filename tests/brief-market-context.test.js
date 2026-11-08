const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dc = require("../assets/js/decision-cockpit.js");

function cockpit(block) {
  return { session: "2026-11-02", schema_version: "current_decision_cockpit_projection/v2", ...(block ? { brief_market_context_v1: block } : {}) };
}

const PARTICIPATION = {
  status: "AVAILABLE", rule: "matched_cohort_session_change/v1", previous_session: "2026-10-26",
  adjacency: "NON_ADJACENT_SESSION_GAP_4",
  cohort: { matched: 742, matched_with_ma20_side_both_sessions: 742, current_only: 119, previous_only: 116 },
  changes: { advance_ratio_pp: -12.67, decline_ratio_pp: 10.1, above_ma20_share_pp: -30.73, positive_momentum_share_pp: -8.5 },
  ma20_crossings: { crossed_above: 20, crossed_below: 248, net: -228 },
  participation_character: "NARROWING",
  market_close_condition_evaluation: { "Participation improves": "REFUTED" },
};
const GATED = [{ ticker: "MCP", security_setup: "FIRED_BREAKOUT_TRIGGER_QUALIFIED_AT_SECURITY_LEVEL",
  market_environment: "ADVERSE_MARKET_REGIME_HOLDS_FRESH_ENTRY", market_regime: "DETERIORATING_BREADTH",
  security_invalidation: { invalidation_level: 9.0 } }];
const BLOCK = { contract_version: "brief_market_context/v1", session: "2026-11-02",
  market_participation_change: PARTICIPATION, market_gated_entries: GATED, market_gated_count: 1 };

test("absent, foreign-contract or other-session block renders nothing", () => {
  assert.equal(dc.renderBriefMarketContextHtml(cockpit(null)), "");
  assert.equal(dc.renderBriefMarketContextHtml(cockpit({ ...BLOCK, contract_version: "x/v9" })), "");
  assert.equal(dc.renderBriefMarketContextHtml(cockpit({ ...BLOCK, session: "2026-11-03" })), "");
});

test("participation change shows matched-cohort deltas, churn, gap warning and the evaluated condition", () => {
  const html = dc.renderBriefMarketContextHtml(cockpit(BLOCK));
  assert.match(html, /Thu hẹp/);
  assert.match(html, /-12\.67 điểm %/);
  assert.match(html, /-30\.73 điểm %/);
  assert.match(html, /-228/);
  assert.match(html, /cùng 742 mã/);
  assert.match(html, /119 mã chỉ có ở phiên này/);
  assert.match(html, /NON_ADJACENT_SESSION_GAP_4/);
  assert.match(html, /độ rộng cải thiện.*: <strong>Không xảy ra<\/strong>/);
  assert.doesNotMatch(html, /Participation improves/);
});

test("market-gated rows keep the security setup and the market environment apart and give no order wording", () => {
  const html = dc.renderBriefMarketContextHtml(cockpit(BLOCK));
  assert.match(html, /data-ticker="MCP"/);
  assert.match(html, /Setup của mã đã kích hoạt/);
  assert.match(html, /Độ rộng suy yếu/);
  assert.match(html, /Mức vô hiệu của mã: 9/);
  assert.match(html, /Đây không phải khuyến nghị mua/);
  for (const forbidden of [/khối lượng/i, /giá mục tiêu/i, /xác suất/i, /điểm số/i, /mua ngay/i]) {
    assert.doesNotMatch(html, forbidden);
  }
});

test("refused comparison shows its reason; only-gated block still renders", () => {
  const refused = { ...BLOCK, market_participation_change: { status: "UNAVAILABLE", reason_codes: ["NO_PREVIOUS_PARTICIPATION_SNAPSHOT"] } };
  assert.match(dc.renderBriefMarketContextHtml(cockpit(refused)), /NO_PREVIOUS_PARTICIPATION_SNAPSHOT/);
  const onlyGated = { contract_version: BLOCK.contract_version, session: BLOCK.session, market_gated_entries: GATED, market_gated_count: 1 };
  const html = dc.renderBriefMarketContextHtml(cockpit(onlyGated));
  assert.doesNotMatch(html, /Độ rộng so với phiên trước/);
  assert.match(html, /bị thị trường giữ lại/);
});

test("values from the projection are escaped", () => {
  const evil = { ...BLOCK, market_gated_entries: [{ ...GATED[0], ticker: "<img src=x onerror=alert(1)>" }] };
  assert.doesNotMatch(dc.renderBriefMarketContextHtml(cockpit(evil)), /<img/);
});

test("workspace page hosts a hidden section and clears it on a session mismatch", () => {
  const html = fs.readFileSync(path.join(root, "investment-workspace.html"), "utf8");
  assert.match(html, /id="section-brief-market-context" hidden/);
  assert.match(html, /id="cockpit-brief-market-context"/);
  const js = fs.readFileSync(path.join(root, "assets", "js", "investment-workspace.js"), "utf8");
  assert.match(js, /renderBriefMarketContextHtml\(cockpit\)/);
  const mismatch = js.slice(js.indexOf("Session Coherence Gate"), js.indexOf("Real contract rendering"));
  assert.match(mismatch, /section-brief-market-context[\s\S]*hidden = true/);
});
