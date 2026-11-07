"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const vf = require(path.join(root, "assets/js/value-format.js"));
const overview = require(path.join(root, "assets/js/dashboard-product-summary.js"));
const ws = require(path.join(root, "assets/js/investment-workspace.js"));
const signals = require(path.join(root, "assets/js/signals-product.js"));
const sm = require(path.join(root, "assets/js/screener-master.js"));

const dashboardHtml = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const workspaceHtml = fs.readFileSync(path.join(root, "investment-workspace.html"), "utf8");
const projection = JSON.parse(fs.readFileSync(path.join(root, "data/screener_master_projection.json"), "utf8"));
// DASHBOARD_PAYLOAD_COMPACTION_AND_INVESTOR_FIRST_IA_V1: `workspace` is the compact
// workspace_index/v1 document (thin cards); use fullWorkspaceCard(ticker) wherever a test needs
// the same full per-ticker card the drawer actually renders (its detail shard).
const workspace = JSON.parse(fs.readFileSync(path.join(root, "data/workspace_index.json"), "utf8"));
function fullWorkspaceCard(ticker) {
  const thin = workspace.cards[ticker];
  if (!thin) return null;
  const shard = JSON.parse(fs.readFileSync(
    path.join(root, "data/workspace_detail", `${thin.detail_shard}.json`), "utf8",
  ));
  return shard.tickers[ticker] || null;
}

function visibleText(html) {
  return String(html || "")
    .replace(/<pre[\s\S]*?<\/pre>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function primaryVisibleText(html) {
  const stripped = String(html || "").replace(/<details[\s\S]*?<\/details>/gi, (block) => {
    const match = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    return match ? ` ${match[1]} ` : " ";
  });
  return visibleText(stripped);
}

const REPORTED_RAW_ENUMS = [
  "NOT_AVAILABLE",
  "BELOW_MA20_MOMENTUM_NEGATIVE",
  "NEAR_MA20_NEUTRAL",
  "BELOW_MA20_MOMENTUM_POSITIVE",
  "QUALIFIED_CLASSIFICATION",
  "QUALIFIED_ENTITY_CLASS",
  "PROVIDER_DESCRIPTIVE_CLASSIFICATION",
  "TACTICAL_STATE_AWAITING_CONFIRMATION",
  "TECHNICAL_DETERIORATION",
  "PROFITABLE_FUNDAMENTAL",
  "FUTURE_CLOSE_GT_FUTURE_MA20",
  "EASING_TO_REVERSAL_UPGRADE",
  "RENEWED_BREAKDOWN_RISK",
  "COMPATIBLE_PROFITABILITY_QUALITY_DETERIORATION",
  "BREAKOUT_READY",
  "BASE_BUILDING",
  "EARLY_REVERSAL_CANDIDATE",
  "UPTREND_CONFIRMED",
  "SELLING_PRESSURE_EASING",
  "DISTRIBUTION_RISK",
  "BREAKDOWN_RISK",
  "WAIT_FOR_CONFIRMATION",
  "AVOID_NEW_ENTRY",
];

const STANCES = [
  "INITIATE_RESEARCH_CANDIDATE",
  "ACCUMULATE_RESEARCH_CANDIDATE",
  "WAIT_FOR_CONFIRMATION",
  "HIGH_RISK_SPECULATION_ONLY",
  "AVOID_NEW_ENTRY",
  "INSUFFICIENT_EVIDENCE",
];
const TACTICAL = [
  "DOWNTREND",
  "SELLING_PRESSURE_EASING",
  "UPTREND_CONFIRMED",
  "EARLY_REVERSAL_CANDIDATE",
  "BREAKDOWN_RISK",
  "SIDEWAYS_NEUTRAL",
  "DISTRIBUTION_RISK",
  "BASE_BUILDING",
  "BREAKOUT_READY",
];

test("all current stance enums are translated and raw values stay unchanged", () => {
  for (const stance of STANCES) {
    const formatted = vf.formatDomainState(stance, "research_stance");
    assert.equal(formatted.raw, stance);
    assert.ok(formatted.known, `missing translation for ${stance}`);
    assert.notEqual(formatted.label, stance);
    assert.doesNotMatch(formatted.label, /_/);
    assert.doesNotMatch(formatted.label, /Mua ngay|Nên mua/i);
  }
  assert.equal(vf.formatResearchStance("INITIATE_RESEARCH_CANDIDATE"), "Ứng viên nghiên cứu mở vị thế");
  assert.equal(vf.formatResearchStance("ACCUMULATE_RESEARCH_CANDIDATE"), "Ứng viên nghiên cứu tích lũy");
});

test("all nine current tactical states are translated", () => {
  for (const state of TACTICAL) {
    const formatted = vf.formatDomainState(state, "tactical_state");
    assert.equal(formatted.raw, state);
    assert.ok(formatted.known, `missing tactical translation for ${state}`);
    assert.equal(vf.formatTacticalState(state), formatted.label);
  }
  assert.equal(vf.formatTacticalState("SELLING_PRESSURE_EASING"), "Áp lực bán đang hạ nhiệt");
  assert.equal(vf.formatTacticalState("UPTREND_CONFIRMED"), "Xu hướng tăng đã xác nhận");
});

test("entity, data, and freshness states are translated without strengthening authority", () => {
  assert.equal(vf.formatEntityType("corporate"), "Doanh nghiệp");
  assert.equal(vf.formatEntityType("bank"), "Ngân hàng");
  assert.equal(vf.formatEntityType("securities"), "Chứng khoán");
  assert.equal(vf.formatEntityType("insurance"), "Bảo hiểm");
  assert.equal(vf.formatEntityType("finance_company"), "Công ty tài chính");
  assert.equal(vf.formatFreshness("CURRENT"), "Hiện tại");
  assert.equal(vf.formatFreshness("STALE_AXIS_PRESENT"), "Có trục dữ liệu đã cũ");
  assert.equal(vf.formatFreshness("STALE_BUT_RESEARCH_USABLE"), "Cũ nhưng còn dùng cho nghiên cứu");
  assert.equal(vf.formatLiquidityState("LIQUIDITY_RESEARCH_PROXY"), "Thanh khoản nghiên cứu");
  assert.equal(vf.formatLiquidityState("EXECUTION_CAPACITY_EXACT_BLOCKED"), "Chưa đủ dữ liệu cho năng lực thực hiện lệnh chính xác");
  assert.equal(vf.formatDomainState("RESEARCH_PROXY", "data_fitness").label, "Dữ liệu nghiên cứu");
  assert.equal(vf.formatDomainState("QUALIFIED_CLASSIFICATION", "data_fitness").label, "Phân loại đã xác nhận");
  assert.doesNotMatch(vf.formatConfirmationState("READY"), /Mua|Nên mua/i);
  assert.doesNotMatch(vf.formatLiquidityState("RESEARCH_PROXY"), /Chính xác/i);
});

test("Phân tích row renderer visible text has no raw stance/tactical enums", () => {
  const row = ws.analysisRecord(workspace.cards.HPG || Object.values(workspace.cards)[0]);
  const html = ws.analysisRowHtml(row);
  const visible = visibleText(html);
  for (const raw of STANCES.concat(TACTICAL)) {
    assert.doesNotMatch(visible, new RegExp(raw));
  }
  assert.match(html, /data-state="/);
  assert.equal(row.stance, workspace.cards[row.ticker].research_stance);
});

test("workspace renderer visible text has no raw primary enums", () => {
  // This is a presentation/localization contract, not a prediction about a live ticker's
  // daily research stance.  Read the retained value that the renderer actually receives.
  const card = fullWorkspaceCard("AAA");
  const html = ws.decisionCardHtml(card, { ticker: "AAA" });
  const visible = visibleText(html);
  const rawStance = card.research_stance;
  const localizedStance = vf.formatDomainState(rawStance, "research_stance").label;
  for (const raw of [rawStance, "DOWNTREND", "LIQUIDITY_RESEARCH_PROXY", "ATTRACTIVE_RELATIVE_RESEARCH", "STALE_AXIS_PRESENT"]) {
    assert.doesNotMatch(visible, new RegExp(raw));
  }
  assert.match(html, new RegExp(`data-state="${rawStance}"`));
  assert.match(html, new RegExp(localizedStance));
  assert.notEqual(localizedStance, rawStance);
  assert.match(html, /Không phải tín hiệu mua|Tư thế nghiên cứu/);
  assert.doesNotMatch(visible, /NOT A BUY SIGNAL/);
});

test("workspace filters still test raw enums and display Vietnamese labels", () => {
  // CURRENT_DECISION_SURFACE_CONVERGENCE_V1: the primary "initiate" filter reads the Producer
  // research_action_posture raw enum; the stance filter survives only as a secondary screen.
  const initiate = ws.FILTERS.find((item) => item.id === "initiate");
  assert.equal(initiate.group, "posture");
  assert.equal(initiate.test({ research_action_posture: "INITIATE_ON_BREAKOUT" }), true);
  assert.equal(initiate.test({ research_stance: "INITIATE_RESEARCH_CANDIDATE" }), false);
  assert.match(initiate.label, /mở vị thế/i);
  const screen = ws.FILTERS.find((item) => item.id === "screen_initiate");
  assert.equal(screen.group, "stance");
  assert.equal(screen.test({ research_stance: "INITIATE_RESEARCH_CANDIDATE" }), true);
  assert.doesNotMatch(JSON.stringify(ws.FILTERS.map((item) => item.label)), /INITIATE_RESEARCH_CANDIDATE|INITIATE_ON_BREAKOUT/);
});

test("missing metric is never rendered as numeric zero and legacy KPIs are gone", () => {
  assert.doesNotMatch(dashboardHtml, /Breadth\s*>\s*MA200/);
  assert.doesNotMatch(dashboardHtml, /% mã trên MA200 theo ngành/);
  assert.doesNotMatch(dashboardHtml, /Cấu trúc UP/);
  assert.doesNotMatch(dashboardHtml, /GTGD20\s*≥\s*50/);
  assert.doesNotMatch(dashboardHtml, /id="kpi-breadth"/);
  assert.doesNotMatch(dashboardHtml, /id="kpi-structure"/);
  assert.doesNotMatch(dashboardHtml, /id="kpi-liquidity"/);
  assert.doesNotMatch(dashboardHtml, /id="chart-structure"/);

  const empty = overview.summarizeScreenerOverview({ cards: {}, contract_version: overview.SCREENER_CONTRACT });
  assert.equal(empty.session_breadth.available, false);
  assert.equal(empty.session_breadth.up, 0);
  assert.equal(overview.coverageText(0, 0, false).text, "Chưa có dữ liệu hiện tại");
  assert.equal(overview.coverageText(0, 0, false).count, null);
  assert.ok(overview.missingMetricNeverZero({ available: false, count: null }));

  const noPrice = overview.summarizeScreenerOverview({
    contract_version: overview.SCREENER_CONTRACT,
    as_of_session: "2026-08-28",
    cards: {
      AAA: { research: { stance: "WAIT_FOR_CONFIRMATION" }, price: { change_pct_status: "UNKNOWN" }, tactical: { status: "UNKNOWN" }, liquidity: {}, sector: { status: "UNKNOWN" } },
    },
  });
  assert.equal(noPrice.session_breadth.available, false);
  assert.equal(noPrice.tactical.available, false);
  const summaryHtml = overview.renderDecisionSummaryHtml(noPrice);
  assert.doesNotMatch(visibleText(summaryHtml), /0 \/ 0/);
});

test("overview uses current projection facts with explicit denominators", () => {
  const summary = overview.summarizeScreenerOverview(projection);
  const cards = Object.values(projection.cards);
  const priced = cards.filter((card) => card.price?.change_pct_status === "AVAILABLE" && Number.isFinite(Number(card.price?.change_pct)));
  const priceAvailable = cards.filter((card) => card.price?.status === "PRICE_AVAILABLE");
  const tactical = cards.filter((card) => card.tactical?.status === "AVAILABLE" && card.tactical?.entry_state);
  const liquidityProxy = cards.filter((card) => card.liquidity?.fitness === "LIQUIDITY_RESEARCH_PROXY" || card.liquidity?.method === "LIQUIDITY_RESEARCH_PROXY");
  const financialAvailable = cards.filter((card) => card.financial_v2?.status === "AVAILABLE");
  const sectorAvailable = cards.filter((card) => card.sector?.status === "AVAILABLE");

  // Denominator and every published coverage counter must be internally coherent with the
  // projection's own card population -- these are release-integrity invariants the test owns,
  // not a frozen historical snapshot. Values are expected to change every Daily.
  assert.equal(projection.coverage.ticker_denominator, cards.length);
  assert.equal(summary.denominator, projection.coverage.ticker_denominator);
  assert.equal(projection.coverage.price_available_count, priceAvailable.length);
  assert.equal(projection.coverage.tactical_available_count, tactical.length);
  assert.equal(projection.coverage.financial_v2_available_count, financialAvailable.length);
  assert.equal(projection.coverage.sector_available_count, sectorAvailable.length);

  assert.equal(summary.session_breadth.available, true);
  assert.equal(summary.session_breadth.priced, priced.length);
  assert.equal(summary.session_breadth.up + summary.session_breadth.down + summary.session_breadth.flat, priced.length);
  assert.equal(summary.price_available_count, projection.coverage.price_available_count);
  assert.equal(summary.session_breadth.price_available, priceAvailable.length);
  assert.equal(summary.session_breadth.unpriced, summary.denominator - priceAvailable.length);
  assert.equal(summary.session_breadth.missing_session_return, priceAvailable.length - priced.length);
  assert.equal(summary.tactical.coverage, projection.coverage.tactical_available_count);
  assert.equal(summary.tactical.coverage, tactical.length);
  assert.equal(summary.liquidity.proxy_count, liquidityProxy.length);
  assert.equal(summary.liquidity.execution_exact_established, false);

  assert.ok(summary.sector.available);
  const totalSectorRowCount = summary.sector.rows.reduce((sum, row) => sum + row.count, 0);
  assert.equal(totalSectorRowCount, summary.sector.labeled);
  assert.ok(summary.sector.rows.length > 0);
  // Every rendered sector row must trace back to a real card sector label, never a synthesized
  // or entity-class value standing in for a sector.
  assert.ok(summary.sector.rows.every((row) => cards.some((card) => card.sector?.label === row.label)));
  assert.ok(!summary.sector.rows.some((row) => ["corporate", "bank", "securities"].includes(String(row.label).toLowerCase())));

  // Research stance distribution reconciles between the manifest's published breakdown and the
  // summary's own tally over the same cards.
  for (const stance of overview.STANCE_ORDER) {
    assert.equal(summary.research_stance.counts[stance], projection.coverage.research_stance_distribution[stance] || 0);
  }

  const html = overview.renderDecisionSummaryHtml(summary);
  // as_of_session must be a valid current retained session and the rendered HTML must use that
  // SAME value -- never a permanently fixed historical date.
  assert.match(projection.as_of_session, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(summary.as_of_session, projection.as_of_session);
  assert.match(html, new RegExp(`Quyết định nghiên cứu hiện tại|Phiên ${projection.as_of_session}`));
  assert.doesNotMatch(html, /Mở Cơ hội/);
  assert.doesNotMatch(html, /Khám phá cơ hội/);
  assert.doesNotMatch(html, /Tín hiệu kỹ thuật/);
  assert.doesNotMatch(html, /Xem Tactical V2/);

  // Visible labels stay localized: every stance card renders its Vietnamese label, and none of
  // the raw backend stance enums leak into normal visible text.
  const visible = visibleText(html);
  for (const stance of overview.STANCE_ORDER) {
    const label = vf.formatDomainState(stance, "research_stance").label;
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(visible, new RegExp(`\\b${stance}\\b`));
  }
});

test("research stance remains distinct from execution instruction", () => {
  assert.match(workspaceHtml, /không phải lệnh (thực hiện|giao dịch)/i);
  assert.match(dashboardHtml, /Rủi ro cần chú ý/);
  assert.doesNotMatch(vf.formatResearchStance("INITIATE_RESEARCH_CANDIDATE"), /Mua|Khuyến nghị mua/i);
  assert.doesNotMatch(overview.renderDecisionSummaryHtml(overview.summarizeScreenerOverview(projection)), /vs-btn-primary[^>]*>Mua/);
});

test("technical structure pills localize visible text and keep raw identity in data/title", () => {
  const cases = {
    BELOW_MA20_MOMENTUM_NEGATIVE: "Dưới MA20, động lượng tiêu cực",
    NEAR_MA20_NEUTRAL: "Gần MA20, trung tính",
    BELOW_MA20_MOMENTUM_POSITIVE: "Dưới MA20, động lượng tích cực",
    ABOVE_MA20_MOMENTUM_POSITIVE: "Trên MA20, động lượng tích cực",
    NOT_AVAILABLE: "Chưa có",
  };
  for (const [raw, label] of Object.entries(cases)) {
    const formatted = vf.formatDomainState(raw, "structure_state");
    assert.equal(formatted.raw, raw);
    assert.equal(formatted.label, label);
    const html = vf.formatStructureBadge(raw);
    assert.match(html, new RegExp(`data-structure="${raw}"`));
    assert.match(html, new RegExp(`title="${raw}"`));
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(primaryVisibleText(html), new RegExp(raw));
  }
});

test("rule-condition and Workspace readiness text are localized with raw identity retained", () => {
  assert.equal(vf.formatRuleCondition("TACTICAL_STATE_AWAITING_CONFIRMATION"), "Chưa có đủ tín hiệu xác nhận xu hướng");
  assert.equal(vf.formatRuleCondition("WAIT_FOR_CONFIRMATION"), "Chưa có đủ tín hiệu xác nhận xu hướng");
  assert.equal(vf.formatRuleCondition("PROFITABILITY_STATE_REVERSAL"), "Đảo chiều trạng thái lợi nhuận");
  assert.equal(vf.formatDomainState("UNKNOWN_MACHINE_RULE_XYZ", "rule_condition").label, "Điều kiện kỹ thuật");
  assert.equal(vf.formatDomainState("UNKNOWN_MACHINE_RULE_XYZ", "rule_condition").raw, "UNKNOWN_MACHINE_RULE_XYZ");
  const readinessCases = {
    RESEARCH_CONDITIONAL: "Nghiên cứu có điều kiện",
    RESEARCH_READY_CONDITIONAL: "Sẵn sàng nghiên cứu có điều kiện",
  };
  for (const [raw, label] of Object.entries(readinessCases)) {
    const formatted = vf.formatDomainState(raw, "research_readiness");
    assert.equal(formatted.raw, raw);
    assert.equal(formatted.label, label);
    const syntheticCard = {
      ticker: "RDX", research_stance: "WAIT_FOR_CONFIRMATION",
      research_stance_readiness: raw, entry_state: "DOWNTREND", why: {}, valuation: {},
      prospective_case: {}, lineage: { per_axis_freshness: {} }, confirmation: {},
      invalidation: {}, counter_thesis: {},
    };
    const readinessHtml = ws.decisionCardHtml(syntheticCard, { ticker: syntheticCard.ticker });
    assert.match(primaryVisibleText(readinessHtml), new RegExp(label));
    assert.doesNotMatch(primaryVisibleText(readinessHtml), new RegExp(raw));
    assert.match(readinessHtml, new RegExp(`data-state="${raw}"`));
  }
  const card = fullWorkspaceCard("HPG");
  const html = ws.decisionCardHtml(card, { ticker: "HPG", sourceArtifacts: workspace.source_artifacts });
  const visible = primaryVisibleText(html);
  // The retained current card must preserve its own governed readiness state. Tactical-currentness
  // remains an independent freshness assertion, not a dependency on an old HPG daily state.
  assert.ok(!(card.why?.deterministic_reasons || []).includes("TACTICAL_AXIS_NOT_CURRENT"));
  const currentReadiness = vf.formatDomainState(card.research_stance_readiness, "research_readiness");
  assert.equal(currentReadiness.raw, card.research_stance_readiness);
  assert.ok(currentReadiness.known, `current governed readiness must be localized: ${card.research_stance_readiness}`);
  assert.match(visible, new RegExp(currentReadiness.label));
  assert.doesNotMatch(visible, new RegExp(card.research_stance_readiness));
  assert.doesNotMatch(visible, /Trục kỹ thuật không thuộc phiên hiện tại/);
  // The always-visible "Cơ bản & định giá" summary badge renders whatever fundamental.state
  // currently is -- a real company's profitability can change day to day, so this asserts the
  // stable product contract (governed state is localized, label visible, raw enum never leaks),
  // not that HPG is forever PROFITABLE. See PROFITABLE_FUNDAMENTAL (the distinct rule-condition
  // enum) below, exercised with a synthetic card instead of depending on it appearing in HPG's
  // own daily-changing counterbalancing_context.
  const currentFundamentalState = vf.formatDomainState(card.fundamental?.state, "fundamental_state");
  assert.ok(currentFundamentalState.known, `current governed fundamental state must be localized: ${card.fundamental?.state}`);
  assert.match(visible, new RegExp(currentFundamentalState.label));
  assert.doesNotMatch(visible, new RegExp(card.fundamental?.state));
  assert.match(html, new RegExp(`data-state="${card.research_stance_readiness}"`));
  // PROFITABLE_FUNDAMENTAL / ADVERSE_TACTICAL_ENTRY_STATE / PROFITABILITY_STATE_REVERSAL are
  // real-but-not-guaranteed-visible rule-condition/counter-thesis/invalidation states: whether they
  // appear at all, and in which of a card's several reason lists, is today's daily-changing
  // research narrative, not a stable product contract. Exercise the render mechanism directly with
  // a synthetic card instead.
  assert.equal(vf.formatRuleCondition("PROFITABLE_FUNDAMENTAL"), "Nền tảng doanh nghiệp có lợi nhuận");
  const syntheticCard = {
    ticker: "ZZZ", research_stance: "WAIT_FOR_CONFIRMATION", entry_state: "DOWNTREND",
    why: { counterbalancing_context: ["PROFITABLE_FUNDAMENTAL"] },
    valuation: {}, prospective_case: {}, lineage: { per_axis_freshness: {} },
    counter_thesis: { key_counter_thesis: ["ADVERSE_TACTICAL_ENTRY_STATE"] },
    confirmation: {},
    invalidation: { fundamental: { boundary_type: "PROFITABILITY_STATE_REVERSAL", status: "CONDITIONAL" } },
  };
  const syntheticHtml = ws.decisionCardHtml(syntheticCard, { ticker: "ZZZ" });
  const syntheticVisible = primaryVisibleText(syntheticHtml);
  // Counter-thesis / fundamental-invalidation / counterbalancing-context rationale is deep
  // evidence, collapsed by design inside the drawer's ws-deep-evidence <details> (progressive
  // disclosure) -- it must still be localized wherever it renders, with the raw machine
  // identifier never leaking into that label.
  assert.match(syntheticHtml, /Trạng thái kỹ thuật bất lợi/);
  assert.match(syntheticHtml, /Đảo chiều trạng thái lợi nhuận/);
  assert.match(syntheticHtml, /Nền tảng doanh nghiệp có lợi nhuận/);
  assert.doesNotMatch(syntheticVisible, /ADVERSE_TACTICAL_ENTRY_STATE|PROFITABILITY_STATE_REVERSAL|PROFITABLE_FUNDAMENTAL/);
  assert.match(syntheticHtml, /data-condition="PROFITABILITY_STATE_REVERSAL"/);
  assert.match(syntheticHtml, /<details class="vs-tech-details">[\s\S]*PROFITABILITY_STATE_REVERSAL/);
  for (const raw of [
    ...Object.keys(readinessCases),
    "TACTICAL_AXIS_NOT_CURRENT",
    "PROFITABLE_FUNDAMENTAL",
    "PROFITABILITY_STATE_REVERSAL",
    "ADVERSE_TACTICAL_ENTRY_STATE",
  ]) {
    assert.doesNotMatch(visible, new RegExp(raw));
  }
});

test("provenance presentation uses a Vietnamese label and keeps the raw identifier in technical detail", () => {
  const qualified = vf.formatSectorLineage("QUALIFIED_CLASSIFICATION|QUALIFIED_ENTITY_CLASS|corporate");
  assert.equal(qualified.label, "Doanh nghiệp");
  assert.match(qualified.qualification, /Phân loại đã xác nhận/);
  assert.equal(qualified.raw, "QUALIFIED_CLASSIFICATION|QUALIFIED_ENTITY_CLASS|corporate");
  const provider = vf.formatSectorLineage("PROVIDER_DESCRIPTIVE_CLASSIFICATION|VCI.symbols_by_industries/retained-20260728|tài nguyên cơ bản");
  assert.equal(provider.label, "tài nguyên cơ bản");
  assert.equal(provider.qualification, "Phân loại mô tả từ nguồn");
  assert.equal(provider.identity, "VCI.symbols_by_industries/retained-20260728");
  const sectorHtml = vf.sectorLineageHtml("QUALIFIED_CLASSIFICATION|QUALIFIED_ENTITY_CLASS|corporate");
  assert.doesNotMatch(primaryVisibleText(sectorHtml), /QUALIFIED_CLASSIFICATION|QUALIFIED_ENTITY_CLASS/);
  assert.match(sectorHtml, /data-sector="QUALIFIED_CLASSIFICATION\|QUALIFIED_ENTITY_CLASS\|corporate"/);
  const provenance = vf.provenanceHtml("investment_decision_workspace_projection/v1:abc");
  assert.match(primaryVisibleText(provenance), /Chi tiết dữ liệu/);
  assert.doesNotMatch(primaryVisibleText(provenance), /investment_decision_workspace_projection/);
  assert.match(provenance, /Nguồn dữ liệu/);
  assert.match(provenance, /investment_decision_workspace_projection\/v1:abc/);
  const analysisRow = ws.analysisRowHtml(ws.analysisRecord(workspace.cards.HPG));
  assert.doesNotMatch(primaryVisibleText(analysisRow), /QUALIFIED_CLASSIFICATION|QUALIFIED_ENTITY_CLASS/);
  assert.match(analysisRow, /Doanh nghiệp/);
});

test("normal renderer output has no raw primary enums outside technical detail", () => {
  const card = fullWorkspaceCard("HPG");
  const workspaceHtml = ws.decisionCardHtml(card, { ticker: "HPG", sourceArtifacts: workspace.source_artifacts });
  const analysisHtmlRow = ws.analysisRowHtml(ws.analysisRecord(card));
  const signalHtml = signals.renderRowHtml(signals.records({ cards: { HPG: card } })[0]);
  const structureHtml = vf.formatStructureBadge("BELOW_MA20_MOMENTUM_NEGATIVE");
  const overviewHtml = overview.renderDecisionSummaryHtml(overview.summarizeScreenerOverview(projection));
  for (const html of [workspaceHtml, analysisHtmlRow, signalHtml, structureHtml, overviewHtml]) {
    const visible = primaryVisibleText(html);
    for (const raw of REPORTED_RAW_ENUMS.concat(STANCES, TACTICAL)) {
      assert.doesNotMatch(visible, new RegExp(`\\b${raw}\\b`));
    }
  }
});

test("filters and screener predicates operate on the raw backend enum", () => {
  const wait = ws.FILTERS.find((item) => item.id === "wait");
  assert.equal(wait.test({ research_action_posture: "WAIT_FOR_CONFIRMATION" }), true);
  assert.equal(wait.test({ research_stance: "WAIT_FOR_CONFIRMATION" }), false);
  assert.equal(sm.matchesScreenerFilters({
    ticker: "HPG", display_exchange: "HSX", research: { stance: "WAIT_FOR_CONFIRMATION" },
    tactical: { entry_state: "SELLING_PRESSURE_EASING" }, sector: { status: "AVAILABLE", label: "Thép" },
    financial_v2: { status: "AVAILABLE" }, liquidity: { method: "LIQUIDITY_RESEARCH_PROXY" },
    freshness: { row: "CURRENT" },
  }, { stance: "WAIT_FOR_CONFIRMATION", tactical: "SELLING_PRESSURE_EASING" }), true);
});

test("screener financial and status formatters stay localized without changing predicates", () => {
  assert.equal(sm.formatFinancial({ status: "ABSENT" }).text, "Chưa có dữ liệu tài chính");
  assert.equal(sm.formatFinancial({ status: "AVAILABLE", profitability_state: "PROFITABLE" }).text, "Có lợi nhuận");
  assert.equal(sm.translateStatus("READY"), "Sẵn sàng nghiên cứu");
  assert.equal(sm.translateStatus("QUALIFIED_CLASSIFICATION"), "Phân loại đã xác nhận");
  const row = {
    ticker: "HPG", display_exchange: "HSX", research: { stance: "WAIT_FOR_CONFIRMATION" },
    tactical: { entry_state: "DOWNTREND" }, sector: { status: "AVAILABLE", label: "Thép" },
    financial_v2: { status: "AVAILABLE" }, liquidity: { method: "LIQUIDITY_RESEARCH_PROXY" },
    freshness: { row: "CURRENT" },
  };
  assert.equal(sm.matchesScreenerFilters(row, { tactical: "DOWNTREND" }), true);
  assert.equal(sm.matchesScreenerFilters(row, { tactical: "BREAKOUT_READY" }), false);
});
