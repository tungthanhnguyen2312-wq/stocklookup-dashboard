const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ws = require("../assets/js/investment-workspace.js");

const html = fs.readFileSync(path.join(__dirname, "..", "investment-workspace.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "investment-workspace.js"), "utf8");

function card(overrides) {
  return Object.assign({
    ticker: "AAA", sector: "STEEL", research_stance: "INITIATE_RESEARCH_CANDIDATE",
    research_action_posture: "INITIATE_ON_BREAKOUT", evidence_currency: "CURRENT_SESSION",
    position_context: { status: "NOT_SUPPLIED", position_state: "UNKNOWN_POSITION_NOT_SUPPLIED" },
    action_presentation: { position_conditional: false, condition: null },
    opportunity_priority: { status: "AVAILABLE", research_priority_tier: "PRIORITY_NOW" },
    research_stance_readiness: "RESEARCH_READY_CONDITIONAL", entry_state: "BREAKOUT_READY", entry_action: "BUY_ON_CONFIRMATION",
    setup_tags: ["BREAKOUT_CONFIRMED_BY_RULE"],
    fundamental: { state: "PROFITABLE", trajectory: "PROFIT_GROWTH" },
    valuation: { relative_research_state: "ATTRACTIVE_RELATIVE_RESEARCH", usable_relative_method_count: 2, market_cap_semantic_guard_applied: false, share_basis: "CURRENT_SHARE_RESEARCH_PROXY", supporting_methods: [{ method: "P/E", percentile: 0.1, peer_count: 6, premium_or_discount_to_peer_median: -0.4 }] },
    tactical: { primary_entry_state: "BREAKOUT_READY" },
    catalyst: { status: "WATCH_FOR_EXECUTION" },
    liquidity: { readiness: "LIQUIDITY_RESEARCH_PROXY", exact_execution_capacity_status: "EXECUTION_CAPACITY_EXACT_BLOCKED" },
    confirmation: { status: "READY", confirmation_trigger_state: "NOT_AVAILABLE" },
    invalidation: { technical: { status: "READY", semantic: "THESIS_INVALIDATION" }, fundamental: { status: "UNAVAILABLE" } },
    counter_thesis: { warnings: [], key_counter_thesis: [], unavailable_dimensions: [] },
    why: { deterministic_reasons: [], counterbalancing_context: [] },
    portfolio: { evaluated: false, status: "NOT_EVALUATED" },
    prospective_case: { status: "NO_RETAINED_CURRENT_CASES", forward_outcome_status: "PENDING_NOT_ENOUGH_FUTURE_SESSIONS" },
    lineage: { per_axis_freshness: { tactical: "CURRENT", fundamental: "STALE_BUT_RESEARCH_USABLE" }, per_axis_source_session: {}, per_axis_proxy_or_qualified_state: {}, blockers: [], deep_evidence_availability: "DEEP_EVIDENCE_ARTIFACT_NOT_MATERIALIZED_LOCALLY" },
    as_of_session: "2026-08-28",
  }, overrides);
}

function primaryVisibleText(markup) {
  return String(markup || "")
    .replace(/<details[\s\S]*?<\/details>/gi, (block) => {
      const summary = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
      return summary ? ` ${summary[1]} ` : " ";
    })
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("page declares the opportunity list, filters, five investor-facing decision-card sections, and no-execution boundary", () => {
  for (const label of ["Bộ lọc", "Danh sách cơ hội", "Thẻ quyết định"]) assert.match(html, new RegExp(label));
  // PHASE 14 (DASHBOARD_PAYLOAD_COMPACTION_AND_INVESTOR_FIRST_IA_V1): the primary ticker detail
  // is organized around exactly these 5 investor-facing sections, never backend engine names.
  for (const label of ["Giá &amp; xu hướng", "Tín hiệu &amp; động lượng", "Dòng tiền", "Cơ bản &amp; định giá", "Kịch bản &amp; mốc quan trọng"]) {
    assert.match(script, new RegExp(`ws-section-title">${label}`));
  }
  // Deeper diagnostics (Quyết định, Doanh nghiệp, ...) live once, inside a single merged
  // "Dữ liệu &amp; phương pháp" progressive-disclosure area, not as always-visible plain h6 sections.
  for (const label of ["Quyết định", "Doanh nghiệp", "Định giá", "Kỹ thuật", "Kích hoạt / Vô hiệu", "Danh mục", "Dữ liệu"]) {
    assert.match(script, new RegExp(`<h6>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
  assert.match(script, /<details class="ws-deep-evidence"><summary>Dữ liệu &amp; phương pháp<\/summary>/);
  assert.doesNotMatch(script, /<details class="mt-3">/, "the old second details must be merged into the one ws-deep-evidence disclosure");
  assert.match(html, /CHỈ MANG TÍNH NGHIÊN CỨU/);
  assert.match(html, /không phải lệnh (thực hiện|giao dịch)/i);
  assert.doesNotMatch(html + script, /execute trade|place order|sell order/i);
});

test("decision card renderer is reusable without changing stance semantics", () => {
  const html = ws.decisionCardHtml(card(), { ticker: "AAA" });
  assert.match(html, /data-decision-ticker="AAA"/);
  assert.match(html, /data-state="INITIATE_RESEARCH_CANDIDATE"/);
  assert.match(html, /Ứng viên nghiên cứu mở vị thế/);
  assert.match(html, /<h6>Quyết định/);
  assert.doesNotMatch(html, /BUY NOW|place order/i);
  const missing = ws.decisionCardHtml(null, { ticker: "AAA" });
  assert.match(missing, /Không có thẻ Cơ hội cho AAA/);
  assert.doesNotMatch(missing, /HPG/);
});

// ---------------------------------------------------------------------------
// DASHBOARD_INVESTOR_FIRST_PRESENTATION_SIMPLIFICATION_V1: the investor metrics grid
// bridges card.display_metrics (Producer's indicator_metric_display_state/v1) into
// stable, never-disappearing metric slots.
// ---------------------------------------------------------------------------

const DISPLAY_METRIC_CATALOG = {
  ebitda: { label: "EBITDA", family: "VALUATION" },
  ev_ebitda: { label: "EV/EBITDA", family: "VALUATION" },
  pe_ttm: { label: "P/E", family: "VALUATION" },
  gross_margin: { label: "Biên lợi nhuận gộp", family: "FUNDAMENTALS" },
  roe: { label: "ROE", family: "FUNDAMENTALS" },
  foreign_flow_state: { label: "Dòng ngoại", family: "FLOW" },
  technical_trend_entry_state: { label: "Xu hướng / trạng thái kỹ thuật", family: "PRICE_TECHNICAL" },
};

function displayMetricsCard(overrides) {
  return card({
    display_metrics: Object.assign({
      ebitda: { display_state: "TEMPORARILY_UNAVAILABLE", value: null },
      ev_ebitda: { display_state: "NOT_APPLICABLE", value: null },
      pe_ttm: { display_state: "AVAILABLE", value: 12.4 },
      gross_margin: { display_state: "AVAILABLE", value: 0.2185 },
      roe: { display_state: "BUILDING_HISTORY", value: null },
      foreign_flow_state: { display_state: "NOT_TRACKED", value: null },
      technical_trend_entry_state: { display_state: "AVAILABLE", value: "UPTREND_CONFIRMED" },
    }, overrides),
  });
}

test("important metric does not disappear when its value is missing", () => {
  const out = ws.investorMetricsGridHtml(displayMetricsCard(), { displayMetricCatalog: DISPLAY_METRIC_CATALOG }, ["ebitda"], "Định giá");
  assert.match(out, /data-metric-id="ebitda"/);
  assert.match(out, /EBITDA/);
});

test("EBITDA missing shows Chưa đủ dữ liệu / Tạm chưa có dữ liệu, never omitted or N\\/A", () => {
  const out = ws.metricSlotHtml(displayMetricsCard().display_metrics, DISPLAY_METRIC_CATALOG, "ebitda");
  assert.match(out, /Tạm chưa có dữ liệu/);
  const visible = primaryVisibleText(out);
  assert.doesNotMatch(visible, /\bN\/A\b/);
  // The raw state is allowed in data-metric-state (debugging/QA only, per the codebase's
  // established data-state/title convention) but must never appear in the visible text.
  assert.doesNotMatch(visible, /TEMPORARILY_UNAVAILABLE/);
});

test("NOT_APPLICABLE renders Không áp dụng", () => {
  const out = ws.metricSlotHtml(displayMetricsCard().display_metrics, DISPLAY_METRIC_CATALOG, "ev_ebitda");
  assert.match(out, /Không áp dụng/);
});

test("NOT_TRACKED flow renders a neutral Chưa theo dõi, not an error", () => {
  const out = ws.metricSlotHtml(displayMetricsCard().display_metrics, DISPLAY_METRIC_CATALOG, "foreign_flow_state");
  assert.match(out, /Chưa theo dõi/);
  assert.doesNotMatch(out, /error|Error|lỗi/);
});

test("BUILDING_HISTORY renders Đang tích lũy chuỗi phiên", () => {
  const out = ws.metricSlotHtml(displayMetricsCard().display_metrics, DISPLAY_METRIC_CATALOG, "roe");
  assert.match(out, /Đang tích lũy chuỗi phiên/);
});

test("available numeric metric formats as a percent or multiple, never a raw fraction", () => {
  assert.match(ws.metricValueHtml("gross_margin", 0.2185), /%$/);
  assert.doesNotMatch(ws.metricValueHtml("gross_margin", 0.2185), /^0\.2185$/);
  assert.match(ws.metricValueHtml("pe_ttm", 12.4), /x$/);
});

test("available enum-valued metric routes through the governed domain table, not raw text", () => {
  const out = ws.metricSlotHtml(displayMetricsCard().display_metrics, DISPLAY_METRIC_CATALOG, "technical_trend_entry_state");
  assert.doesNotMatch(out, /UPTREND_CONFIRMED/);
});

test("flow persistence available value routes through the flow_persistence domain, never raw text", () => {
  const catalog = Object.assign({}, DISPLAY_METRIC_CATALOG, { flow_persistence_5session: { label: "Độ bền dòng ngoại (5 phiên)", family: "FLOW" } });
  const metrics = Object.assign({}, displayMetricsCard().display_metrics, {
    flow_persistence_5session: { display_state: "AVAILABLE", value: "INSUFFICIENT_HISTORY" },
  });
  const out = ws.metricSlotHtml(metrics, catalog, "flow_persistence_5session");
  assert.doesNotMatch(out, /\bINSUFFICIENT_HISTORY\b/);
  assert.match(out, /Chưa đủ lịch sử được giữ lại/);
});

test("no forbidden engineering/backend language visible in a rendered metric slot", () => {
  const out = ws.metricSlotHtml(displayMetricsCard().display_metrics, DISPLAY_METRIC_CATALOG, "ebitda");
  const visible = primaryVisibleText(out);
  for (const term of ["backend", "pipeline", "contract", "artifact", "reason_code", "PIT", "runtime", "projection", "cohort", "shadow"]) {
    assert.doesNotMatch(visible, new RegExp(term, "i"));
  }
});

test("missing catalog degrades to an empty string, never a crash", () => {
  assert.doesNotThrow(() => ws.investorMetricsGridHtml(displayMetricsCard(), {}, ["ebitda"], "Định giá"));
  assert.equal(ws.investorMetricsGridHtml(displayMetricsCard(), {}, ["ebitda"], "Định giá"), "");
});

test("unavailableText never leaks the raw English UNAVAILABLE sentinel into visible text", () => {
  assert.equal(ws.unavailableText(null), "Chưa có dữ liệu");
  assert.equal(ws.unavailableText(undefined), "Chưa có dữ liệu");
  assert.equal(ws.unavailableText(""), "Chưa có dữ liệu");
  assert.equal(ws.unavailableText(5), 5);
  assert.notEqual(ws.unavailableText(null), "UNAVAILABLE");
});

test("Signal Velocity deep card never shows the raw UNAVAILABLE sentinel for a missing observation count", () => {
  const withoutVelocity = card({ signal_velocity: {} });
  const out = ws.decisionCardHtml(withoutVelocity, { ticker: "AAA" });
  assert.doesNotMatch(primaryVisibleText(out), /\bUNAVAILABLE\b/);
});

test("missing != zero: an unavailable numeric metric never renders 0", () => {
  const out = ws.metricSlotHtml(displayMetricsCard().display_metrics, DISPLAY_METRIC_CATALOG, "ebitda");
  assert.doesNotMatch(out, />\s*0\s*<\/span>/);
});

test("evidence quality is qualitative, explained, and never a probability claim", () => {
  const current = ws.evidenceQuality(card(), "tactical");
  assert.deepEqual(current, {
    label: "Hiện hành",
    tone: "constructive",
    why: "Trạng thái kỹ thuật được giữ lại cho phiên dữ liệu hiện tại.",
  });
  const missing = ws.evidenceQuality(card({ entry_state: "", valuation: { relative_research_state: "UNAVAILABLE" } }), "tactical");
  assert.equal(missing.label, "Chưa đủ dữ liệu");

  const markup = ws.evidenceSummaryHtml(card());
  assert.match(markup, /Mức độ tin cậy của bằng chứng/);
  assert.match(markup, /data-help=/);
  assert.match(markup, /không phải xác suất giá sẽ tăng/i);
  assert.doesNotMatch(markup, /xác suất\s*\d+|dự báo\s*\d+|\d+%/i);
});

test("cssEscapeSelector is selector-safe and never throws when the CSS.escape browser global is unavailable", () => {
  assert.equal(typeof CSS, "undefined", "this test's Node environment must lack the CSS global to exercise the fallback path");
  assert.equal(ws.cssEscapeSelector("HPG"), "HPG");
  assert.doesNotThrow(() => ws.cssEscapeSelector('A"B'));
  assert.equal(ws.cssEscapeSelector('A"B'), 'A\\"B');
});

test("drawer shows each principal stance/tactical concept exactly once before deep-evidence disclosure", () => {
  const testCard = card();
  const html = ws.decisionCardHtml(testCard, { ticker: "AAA" });
  const [primary] = html.split('<details class="ws-deep-evidence">');
  assert.ok(primary && primary.length, "expected content before the deep-evidence boundary");
  const countOf = (value) => (primary.match(new RegExp(`data-state="${value}"`, "g")) || []).length;
  // CURRENT_DECISION_SURFACE_CONVERGENCE_V1: the action posture is the drawer's headline badge;
  // research_stance is still shown exactly once, but only as the secondary research screen.
  assert.equal((primary.match(/data-action-posture="INITIATE_ON_BREAKOUT"/g) || []).length, 1, "posture must headline the drawer exactly once");
  assert.equal((primary.match(/data-research-stance="INITIATE_RESEARCH_CANDIDATE"/g) || []).length, 1, "research_stance must appear exactly once above the fold, as secondary context");
  assert.equal(countOf(testCard.research_stance), 0, "research_stance must not be rendered as a primary state pill above the fold");
  assert.equal(countOf(testCard.entry_state), 1, "entry_state must appear exactly once above the fold");
  assert.equal(countOf(testCard.research_stance_readiness), 1, "research_stance_readiness must appear exactly once above the fold");
  assert.equal(countOf(testCard.entry_action), 1, "entry_action must appear exactly once above the fold");
  // The old always-visible KPI grid that repeated these fields was removed; the unique field it
  // carried (research_stance_readiness) now lives in the overview keyline instead.
  assert.doesNotMatch(html, /cockpit-grid mb-3/);
  assert.match(html, /data-decision-ticker="AAA"/, "data-decision-ticker must survive relocation onto the overview section");
});

test("drawer keeps concise localized conditions primary and raw identity in progressive detail", () => {
  const html = ws.decisionCardHtml(card({
    confirmation: {
      status: "READY",
      confirmation_trigger_state: "NOT_AVAILABLE",
      boundary_type: "EASING_TO_REVERSAL_UPGRADE",
      comparison_operator: "FUTURE_CLOSE_GT_FUTURE_MA20",
    },
    invalidation: {
      technical: { status: "CONDITIONAL", semantic: "THESIS_INVALIDATION", boundary_type: "RENEWED_BREAKDOWN_RISK" },
      fundamental: { status: "CONDITIONAL", trigger_type: "COMPATIBLE_PROFITABILITY_QUALITY_DETERIORATION" },
    },
    why: { deterministic_reasons: ["TACTICAL_STATE_AWAITING_CONFIRMATION", "TECHNICAL_DETERIORATION"], counterbalancing_context: [] },
  }), { ticker: "AAA", sourceArtifacts: { producer_artifact_identity: "workspace/v1:test" } });
  const primary = html.split('<details class="ws-deep-evidence">')[0].replace(/<[^>]+>/g, " ");
  assert.match(primary, /Rủi ro phá vỡ hỗ trợ tái diễn/);
  assert.match(primary, /Chờ xác nhận điều kiện kỹ thuật/);
  assert.doesNotMatch(primary, /EASING_TO_REVERSAL_UPGRADE|FUTURE_CLOSE_GT_FUTURE_MA20|RENEWED_BREAKDOWN_RISK|COMPATIBLE_PROFITABILITY_QUALITY_DETERIORATION|TACTICAL_STATE_AWAITING_CONFIRMATION/);
  assert.match(html, /Điều kiện nâng cấp sang đảo chiều/);
  assert.match(html, /Suy giảm chất lượng lợi nhuận/);
  assert.match(html, /Chi tiết kỹ thuật/);
  assert.match(html, /Chi tiết dữ liệu/);
  assert.match(html, /Nguồn dữ liệu/);
  assert.match(html, /data-condition="EASING_TO_REVERSAL_UPGRADE"/);
  assert.match(html, /FUTURE_CLOSE_GT_FUTURE_MA20/);
});

test("page declares the compact index data source path and portfolio editor link", () => {
  assert.match(script, /data\/workspace_index\.json/);
  assert.doesNotMatch(script, /data\/investment_decision_workspace\.json/);
  assert.match(html, /portfolio\.html/);
  assert.match(script, /stocklookup\.portfolio-research\.v1/);
});

// DASHBOARD_PAYLOAD_COMPACTION_AND_INVESTOR_FIRST_IA_V1 PHASE 12: the filter chip wall is
// collapsed behind one on-demand "Bộ lọc" disclosure, not permanently visible.
test("filters live behind a collapsed on-demand disclosure, not a permanently visible panel", () => {
  assert.match(html, /<details class="card mb-4" id="ws-filter-disclosure">/);
  assert.match(html, /<summary class="card-header[^"]*"[^>]*>\s*<h5 class="mb-0">Bộ lọc<\/h5>/);
  assert.match(html, /id="filter-summary-badge"/);
});

// PHASE 13: compact opportunity rows surface Signal Velocity and Flow-Price state -- fields the
// pre-compaction table never showed at all.
test("compact ticker rows surface signal velocity and flow-price state", () => {
  assert.match(html, /<th>Xu hướng tín hiệu<\/th>/);
  assert.match(html, /<th>Dòng ngoại – giá<\/th>/);
  assert.equal(ws.rowSignalVelocityHtml({ signal_velocity: { overall_transition_state: "MIXED_TRANSITION" } }).includes("—"), false);
  assert.match(ws.rowSignalVelocityHtml({}), /—/);
  assert.match(ws.rowFlowPriceHtml({ flow_price: { cohort_membership: "OUTSIDE_CURRENT_FLOW_RESEARCH_COHORT" } }), /Chưa theo dõi/);
  assert.match(ws.rowFlowPriceHtml({}), /—/);
});

test("useful filters cover stance, tactical, fundamental, valuation, liquidity, and catalyst", () => {
  const ids = ws.FILTERS.map((f) => f.id);
  for (const id of ["initiate", "accumulate", "wait", "avoid", "breakout_ready", "base_building", "early_reversal", "profitable", "turnaround", "valuation_available", "attractive", "expensive", "liquidity_available", "catalyst_available", "stale_evidence"]) {
    assert.ok(ids.includes(id), `missing filter ${id}`);
  }
  assert.doesNotMatch(JSON.stringify(ws.FILTERS.map((f) => f.label)), /score|rank|probability|target/i);
});

test("filters are pure predicates that do not mutate the source card", () => {
  const c = card();
  const before = JSON.stringify(c);
  ws.matchesFilters(c, ["initiate", "breakout_ready", "profitable"]);
  assert.equal(JSON.stringify(c), before);
  assert.equal(ws.matchesFilters(c, ["initiate", "breakout_ready", "profitable"]), true);
  assert.equal(ws.matchesFilters(c, ["avoid"]), false);
  assert.equal(ws.matchesFilters(c, []), true);
});

test("market-cap-only tickers are not labeled attractive/expensive by the attractive/expensive filter", () => {
  const guarded = card({ valuation: { relative_research_state: "UNAVAILABLE", usable_relative_method_count: 0, market_cap_semantic_guard_applied: true } });
  assert.equal(ws.matchesFilters(guarded, ["attractive"]), false);
  assert.equal(ws.matchesFilters(guarded, ["expensive"]), false);
});

test("stale evidence filter detects a non-current axis without flattening freshness", () => {
  const c = card();
  assert.equal(ws.hasStaleAxis(c), true); // fundamental is STALE_BUT_RESEARCH_USABLE in the fixture
  const allCurrent = card({ lineage: { ...c.lineage, per_axis_freshness: { tactical: "CURRENT", fundamental: "CURRENT" } } });
  assert.equal(ws.hasStaleAxis(allCurrent), false);
});

test("search matches ticker or sector, case-insensitively", () => {
  const c = card({ ticker: "HPG", sector: "STEEL" });
  assert.equal(ws.matchesSearch("HPG", c, "hpg"), true);
  assert.equal(ws.matchesSearch("HPG", c, "steel"), true);
  assert.equal(ws.matchesSearch("HPG", c, "oil"), false);
  assert.equal(ws.matchesSearch("HPG", c, ""), true);
});

test("portfolio join never mutates security research stance and flags policy breaches", () => {
  const c = card();
  const portfolioResearch = {
    portfolio_id: "demo", as_of_session: "2026-08-28", normalized_positions: [],
    user_limit_breaches: [{ reason: "MAX_SECTOR_WEIGHT", sector: "STEEL" }],
    sector_concentration: { STEEL: 0.6 }, tactical_concentration: {},
    selected_joint_risk_horizon: "L60", joint_risk_status: "READY", pairwise_correlation_status: "AVAILABLE_SEPARATELY_FROM_JOINT_MATRIX",
  };
  const fit = ws.joinPortfolioResearch(c.ticker, c.sector, portfolioResearch);
  assert.equal(fit.status, "EXCEEDS_USER_POLICY_LIMIT");
  assert.equal(c.research_stance, "INITIATE_RESEARCH_CANDIDATE");
});

test("portfolio join reports NOT_EVALUATED when nothing is supplied, and never computes correlation/volatility", () => {
  const fit = ws.joinPortfolioResearch("AAA", "STEEL", null);
  assert.equal(fit.evaluated, false);
  assert.equal(fit.status, "NOT_EVALUATED");
  assert.doesNotMatch(script, /Math\.sqrt.*cov|corrcoef|covariance\s*=/i);
});

test("t0 export is a bounded, non-authoritative candidate snapshot, never a retained case", () => {
  const c = card();
  const payload = ws.buildT0Export("AAA", c, "investment_decision_workspace_projection/v1:abc");
  assert.equal(payload.schema_version, "t0_candidate_export/v1");
  assert.equal(payload.ticker, "AAA");
  assert.equal(payload.authority_boundary.is_actionable, false);
  assert.match(payload.note, /not yet a retained prospective case/i);
  assert.ok(!("mfe" in payload) && !("t_plus_5" in payload));
});

test("liquidity readiness and exact execution capacity are distinct, separately labeled states", () => {
  assert.match(script, /exact_execution_capacity_status/);
  const c = card();
  assert.notEqual(c.liquidity.readiness, c.liquidity.exact_execution_capacity_status);
  assert.equal(c.liquidity.readiness, "LIQUIDITY_RESEARCH_PROXY");
  assert.equal(c.liquidity.exact_execution_capacity_status, "EXECUTION_CAPACITY_EXACT_BLOCKED");
});

test("prospective case PENDING state is rendered, not silently blocking the card", () => {
  const c = card({ prospective_case: { status: "PENDING_NOT_ENOUGH_FUTURE_SESSIONS", forward_outcome_status: "PENDING_NOT_ENOUGH_FUTURE_SESSIONS", thesis_lifecycle_state: "INITIAL_OBSERVATION" } });
  assert.equal(c.prospective_case.status, "PENDING_NOT_ENOUGH_FUTURE_SESSIONS");
  assert.match(script, /prospective_case/);
  assert.match(script, /forward_outcome_status/);
});

test("readLocalPortfolioHoldings tolerates missing/invalid storage and reads the shared editor key", () => {
  const fakeStorageMissing = { getItem: () => null };
  assert.equal(ws.readLocalPortfolioHoldings(fakeStorageMissing), null);
  const fakeStorageInvalid = { getItem: () => "not json" };
  assert.equal(ws.readLocalPortfolioHoldings(fakeStorageInvalid), null);
  const model = { portfolio_id: "local-portfolio", cash: 0, positions: [{ ticker: "HPG", quantity: 100 }] };
  const fakeStorageValid = { getItem: (key) => (key === ws.PORTFOLIO_STORAGE_KEY ? JSON.stringify(model) : null) };
  const loaded = ws.readLocalPortfolioHoldings(fakeStorageValid);
  assert.deepEqual(loaded, model);
  assert.equal(ws.localHoldingFor("hpg", loaded).ticker, "HPG");
  assert.equal(ws.localHoldingFor("VNM", loaded), null);
});

// ---------------------------------------------------------------------------
// Decision-quality corrective pass: research-stance vs. tactical-entry-readiness presentation,
// confirmation trigger-state exposure, and stance-reconsideration labeling.
// ---------------------------------------------------------------------------

test("entry_action is labeled Mức sẵn sàng kỹ thuật, never bare 'Entry readiness'", () => {
  assert.match(script, /Mức sẵn sàng kỹ thuật/);
  assert.doesNotMatch(script, /Entry readiness/);
});

test("veto research stances never present tactical entry readiness as a buy signal", () => {
  for (const stance of ["HIGH_RISK_SPECULATION_ONLY", "AVOID_NEW_ENTRY"]) {
    assert.ok(ws.VETO_RESEARCH_STANCES.has(stance));
    const guidance = ws.stanceEntryGuidance(stance, "EARLY_ENTRY");
    assert.match(guidance, /tránh mở vị thế mới/);
    assert.match(guidance, /không phải tín hiệu mua/i);
    // After M1 the research stance is never described as the primary conclusion.
    assert.doesNotMatch(guidance, /kết luận nghiên cứu chính/);
    assert.match(guidance, /Sàng lọc nghiên cứu \(phụ\)/);
  }
});

test("accumulate/initiate stance with a non-actionable tactical readiness explains the pairing", () => {
  const guidance = ws.stanceEntryGuidance("ACCUMULATE_RESEARCH_CANDIDATE", "WAIT");
  assert.match(guidance, /Sàng lọc nghiên cứu \(phụ\)/);
  assert.match(guidance, /không phải quyết định hành động/);
  assert.match(guidance, /Chờ|WAIT/);
  const guidance2 = ws.stanceEntryGuidance("INITIATE_RESEARCH_CANDIDATE", "AVOID");
  assert.match(guidance2, /Sàng lọc nghiên cứu \(phụ\)/);
  assert.doesNotMatch(guidance + guidance2, /kết luận nghiên cứu chính/);
});

test("no guidance banner when tactical entry readiness is already actionable or the stance is neutral", () => {
  assert.equal(ws.stanceEntryGuidance("INITIATE_RESEARCH_CANDIDATE", "BUY_ON_CONFIRMATION"), "");
  assert.equal(ws.stanceEntryGuidance("WAIT_FOR_CONFIRMATION", "WAIT"), "");
  assert.equal(ws.stanceEntryGuidance("INSUFFICIENT_EVIDENCE", null), "");
});

test("page exposes confirmation boundary status and actual trigger state as distinct fields", () => {
  assert.match(script, /Trạng thái biên/);
  assert.match(script, /Trạng thái kích hoạt thực tế/);
  assert.match(script, /confirmation_trigger_state/);
  assert.match(script, /không phải bằng chứng điều kiện đã kích hoạt/i);
});

test("page relabels an AVOID_NEW_ENTRY technical-invalidation boundary as a reconsideration watch", () => {
  assert.match(script, /STANCE_RECONSIDERATION_WATCH/);
  assert.match(script, /đáng xem xét lại/i);
});

test("why section surfaces counterbalancing context distinctly from deterministic reasons", () => {
  assert.match(script, /Bối cảnh đối trọng/);
  assert.match(script, /why\.counterbalancing_context/);
});

// ---------------------------------------------------------------------------
// Diagnostic-transparency workspace contract.  These fixtures model the additive
// Producer fields; no browser-side valuation/peer/trigger computation is involved.
// ---------------------------------------------------------------------------

function diagnosticCard(overrides) {
  return card(Object.assign({
    valuation: {
      relative_research_state: "ABSOLUTE_RESEARCH_ONLY",
      valuation_summary: {
        valuation_display_state: "RESEARCH_METHODS_AVAILABLE_NOT_PEER_QUALIFIED",
        available_method_count: 2,
        qualified_relative_method_count: 0,
        reference_only_method_count: 1,
        missing_method_count: 1,
        not_intrinsic_fair_value: true,
        not_dcf_or_target_price: true,
      },
      method_diagnostics: {
        "P/E TTM": {
          status: "RESEARCH_USABLE", value: 11.2, availability_state: "AVAILABLE_REFERENCE_ONLY",
          period_basis: "TTM", share_basis: "EXACT_OR_QUALIFIED",
          peer_relative: { status: "INSUFFICIENT_PEER_COUNT", peer_count: 1 },
        },
        "EV/EBITDA": {
          status: "INPUT_BLOCKED", value: null, availability_state: "NOT_AVAILABLE",
          blocker_reason_codes: ["MISSING_DEBT_OR_CASH_INPUTS"],
        },
        "P/B": {
          status: "RESEARCH_USABLE", value: 1.4, availability_state: "AVAILABLE_QUALIFIED",
          peer_relative: { status: "READY_RESEARCH_ONLY", peer_count: 7, peer_median: 1.8 },
        },
      },
    },
    reference_trigger: {
      trigger_level_exists: true, trigger_level: 27500, trigger_type: "BREAKOUT_CONFIRMATION",
      trigger_condition_attached: true, trigger_condition_satisfied: false,
      entry_authority: false, status: "AVAILABLE",
    },
    fundamental: {
      state: "PROFITABLE", trajectory: "INSUFFICIENT_DATA", research_fitness: "READY_RESEARCH_PROXY",
      freshness_status: "STALE_BUT_RESEARCH_USABLE", warnings_blockers: ["MISSING_DEBT_OR_CASH_INPUTS"],
      current_features: { debt: { value: null, blocker_reason_codes: ["MISSING_DEBT_OR_CASH_INPUTS"] } },
    },
    catalyst: {
      status: "WATCH_FOR_EXECUTION", pending_watch_items: [{ label: "Sự kiện đang theo dõi" }],
      adverse_events: [{ label: "Sự kiện bất lợi được giữ lại" }], freshness_status: "CURRENT",
    },
    liquidity: {
      readiness: "LIQUIDITY_RESEARCH_PROXY", current_session_volume: 1234567,
      descriptive_research_state: "CURRENT_SESSION_DESCRIPTIVE_ELIGIBLE",
      exact_execution_capacity_status: "EXECUTION_CAPACITY_EXACT_BLOCKED", authority_boundary: { entry_authority: false },
    },
    market_sector: {
      sector_relative_context: { leadership_state: "LEADING", market_relative_momentum_bucket: "UPPER_MIDDLE", sector_relative_momentum_bucket: "LOWER_MIDDLE" },
      sector_diagnostic: {
        breadth_support_state: "SUPPORTIVE",
        market_relative_momentum: { status: "AVAILABLE", momentum_percentile_descriptive: 0.8, valid_observation_count: 20 },
      },
    },
  }, overrides || {}));
}

test("method diagnostics show qualified and reference-only retained multiples without promoting authority", () => {
  const html = ws.decisionCardHtml(diagnosticCard(), { ticker: "AAA" });
  const visible = primaryVisibleText(html);
  assert.match(html, /data-method="P\/E TTM"/);
  assert.match(html, /data-method="P\/B"/);
  assert.match(html, /11,2/);
  assert.match(visible, /Tham khảo/);
  assert.match(visible, /Đủ điều kiện nghiên cứu/);
  assert.match(visible, /Chưa đủ số đối sánh cùng cơ sở/);
  assert.match(html, /data-state="AVAILABLE_REFERENCE_ONLY"/);
  assert.match(html, /data-state="AVAILABLE_QUALIFIED"/);
  assert.doesNotMatch(visible, /AVAILABLE_REFERENCE_ONLY|AVAILABLE_QUALIFIED/);
});

test("blocked and unavailable valuation methods never fabricate a value", () => {
  const html = ws.decisionCardHtml(diagnosticCard(), { ticker: "AAA" });
  const blocked = html.match(/<article class="ws-valuation-method" data-method="EV\/EBITDA">[\s\S]*?<\/article>/);
  assert.ok(blocked);
  assert.match(blocked[0], /Bị chặn/);
  assert.match(blocked[0], /Chưa có dữ liệu/);
  assert.match(blocked[0], /MISSING_DEBT_OR_CASH_INPUTS/);
  assert.doesNotMatch(blocked[0], /data-retained-value="true"/);
});

test("valuation summary uses Producer counts and never calls research multiples absolute or intrinsic models", () => {
  const html = ws.decisionCardHtml(diagnosticCard(), { ticker: "AAA" });
  const visible = primaryVisibleText(html);
  assert.match(visible, /2 phương pháp định giá có dữ liệu nghiên cứu/);
  assert.match(visible, /Chưa có phương pháp đủ điều kiện tạo kết luận định giá tương đối/);
  assert.doesNotMatch(visible, /2 phương pháp định giá tuyệt đối|absolute valuation|DCF|fair value|target price|giá mục tiêu/i);
});

test("reference trigger level stays separate from trigger activation and entry authority", () => {
  const html = ws.decisionCardHtml(diagnosticCard(), { ticker: "AAA" });
  const visible = primaryVisibleText(html);
  assert.match(visible, /Mức kích hoạt tham chiếu/);
  assert.match(visible, /27\.500/);
  assert.match(visible, /Điều kiện kích hoạt: Đã gắn/);
  assert.match(visible, /Trạng thái: Chưa kích hoạt/);
  assert.match(visible, /Quyền mở vị thế: Chưa được xác lập/);
  assert.doesNotMatch(visible, /Điểm mua|mua đã xác nhận/i);
  assert.match(html, /data-diagnostic="trigger_condition_satisfied"/);
  assert.match(html, /data-diagnostic="entry_authority"/);
});

test("fundamental partial state, retained catalyst/liquidity diagnostics, and market states are readable", () => {
  const html = ws.decisionCardHtml(diagnosticCard(), { ticker: "AAA" });
  const visible = html.replace(/<[^>]+>/g, " ");
  const primary = primaryVisibleText(html);
  assert.match(visible, /Có lợi nhuận/);
  assert.match(visible, /Xu hướng lợi nhuận:\s*Chưa đủ dữ liệu/);
  assert.match(visible, /Thiếu dữ liệu nợ hoặc tiền mặt đủ điều kiện/);
  assert.match(visible, /Sự kiện đang theo dõi/);
  assert.match(visible, /Sự kiện bất lợi được giữ lại/);
  assert.match(visible, /Khối lượng phiên hiện tại\s*:\s*1\.234\.567/);
  assert.match(visible, /Thanh khoản nghiên cứu không xác lập quy mô lệnh thực hiện/);
  assert.match(visible, /Dẫn dắt ngành:\s*Dẫn dắt/);
  assert.match(visible, /Động lượng so với thị trường:\s*Trên trung bình/);
  // Raw identity codes remain available only in collapsed diagnostic detail.
  assert.doesNotMatch(primary, /LEADING|UPPER_MIDDLE|MISSING_DEBT_OR_CASH_INPUTS/);
});

test("selected candlestick and SMC evidence is exact-session only and uses centralized labels", () => {
  const candleApi = {
    smcInfo: (key) => key === "ob_bull" ? { vi: "Khối lệnh tăng", abbr: "OB Bull", tooltip: "Giải thích" } : null,
    directionLabel: () => "Tăng giá",
  };
  const snapshot = { scan_date: "2026-09-18", watchlist: [{ ticker: "AAA", patterns: ["hammer"], smc: ["ob_bull", "unsupported"] }] };
  const registry = { hammer: { key: "hammer", name_vi: "Nến búa", name: "Hammer", direction: "bullish" } };
  const current = ws.selectedSignalEvidenceHtml(snapshot, "AAA", "2026-09-18", registry, candleApi);
  assert.match(current, /Nến búa[\s\S]*Hammer/);
  assert.match(current, /Khối lệnh tăng[\s\S]*OB Bull/);
  assert.doesNotMatch(current, /unsupported/);
  const stale = ws.selectedSignalEvidenceHtml(snapshot, "AAA", "2026-09-19", registry, candleApi);
  assert.match(stale, /Chưa có mẫu hình nến hoặc cấu trúc dòng tiền \(SMC\) hiện hành/);
});

test("proxy or blocked metrics are not labeled ready", () => {
  const proxyCard = diagnosticCard({
    valuation: {
      method_diagnostics: {
        "P/E_TTM": {
          status: "READY_RESEARCH_PROXY", value: 9.5, availability_state: "AVAILABLE_QUALIFIED",
          share_basis: "CURRENT_SHARE_RESEARCH_PROXY", period_basis: "TTM_SUM",
        },
        "P/B_CURRENT_RESEARCH": {
          status: "INPUT_BLOCKED", value: null, availability_state: "NOT_AVAILABLE",
          blocker_reason_codes: ["SHARE_BASIS_UNAVAILABLE"],
        },
        "EV/EBITDA": {
          status: "NOT_APPLICABLE", value: null, availability_state: "NOT_AVAILABLE",
        },
      },
    },
    display_metrics: {
      pe_ttm: { display_state: "AVAILABLE", value: 9.5 },
      roa: { display_state: "AVAILABLE", value: 0.042 },
    },
    fundamental: {
      current_features: {
        roa_eop_proxy: {
          status: "READY_RESEARCH_PROXY", value: 0.042, method: "ending_balance_proxy",
          input_periods: ["2026-H1"], blocker_reason_codes: [],
        },
      },
    },
  });
  const html = ws.decisionCardHtml(proxyCard, {
    ticker: "AAA",
    displayMetricCatalog: { pe_ttm: { label: "P/E" }, roa: { label: "ROA" } },
  });
  const pe = html.match(/<article class="ws-valuation-method" data-method="P\/E_TTM">[\s\S]*?<\/article>/);
  assert.ok(pe);
  assert.match(pe[0], /P\/E · 12 tháng gần nhất/);
  assert.match(pe[0], /Proxy nghiên cứu/);
  assert.doesNotMatch(pe[0], /Sẵn sàng/);
  const blocked = html.match(/<article class="ws-valuation-method" data-method="P\/B_CURRENT_RESEARCH">[\s\S]*?<\/article>/);
  assert.match(blocked[0], /P\/B · nghiên cứu hiện tại/);
  assert.match(blocked[0], /Bị chặn/);
  assert.doesNotMatch(blocked[0], /Sẵn sàng|READY/);
  const ev = html.match(/<article class="ws-valuation-method" data-method="EV\/EBITDA">[\s\S]*?<\/article>/);
  assert.match(ev[0], /Không áp dụng/);
  const slot = ws.metricSlotHtml(proxyCard.display_metrics, { pe_ttm: { label: "P/E" }, roa: { label: "ROA" } }, "roa", proxyCard.fundamental.current_features.roa_eop_proxy);
  assert.match(slot, /Proxy nghiên cứu/);
  assert.doesNotMatch(slot, /Sẵn sàng|\bREADY\b/);
});

test("five-name readiness and conditional cases stay free of a target price", () => {
  const card = diagnosticCard({
    valuation: {
      research_readiness: {
        normalized_earnings: { readiness: "BLOCKED", reason_code: "NORMALIZED_EARNINGS_CONTRACT_NOT_ADMITTED" },
        intrinsic_value: { readiness: "BLOCKED", reason_code: "INTRINSIC_VALUE_METHOD_NOT_ADMITTED" },
        share_or_corporate_action_blockers: ["CURRENT_COMMON_OUTSTANDING_COVERAGE_NOT_PROVEN_THROUGH_PRICE_SESSION", "PLANNED_OR_UNEXECUTED_ACTION_IS_NOT_SHARES_OUTSTANDING"],
        probability_status: "NOT_EMITTED",
        official_target_price_status: "NOT_EMITTED",
      },
      method_diagnostics: {
        "P/B": {
          status: "INPUT_BLOCKED",
          value: null,
          availability_state: "NOT_AVAILABLE",
          blocker_reason_codes: [
            "CURRENT_COMMON_OUTSTANDING_COVERAGE_NOT_PROVEN_THROUGH_PRICE_SESSION",
            "PLANNED_OR_UNEXECUTED_ACTION_IS_NOT_SHARES_OUTSTANDING",
            "OFFICIAL_QUALIFIED_FINANCIAL_INPUT_UNAVAILABLE",
          ],
        },
      },
    },
    conditional_scenarios: {
      bear: { case_status: "CONDITIONAL", reason_code: "NO_QUALIFIED_INVALIDATION_OR_ADVERSE_EVIDENCE" },
      base: { case_status: "OBSERVED_REFERENCE", reason_code: "CONTINUATION" },
      bull: { case_status: "NOT_ADMITTED", reason_code: "NO_QUALIFIED_ENTRY_TRIGGER" },
      probability_status: "NOT_EMITTED",
      official_target_price_status: "NOT_EMITTED",
    },
  });
  const html = ws.decisionCardHtml(card, { ticker: "SSI" });
  assert.match(html, /NORMALIZED_EARNINGS_CONTRACT_NOT_ADMITTED/);
  assert.match(html, /INTRINSIC_VALUE_METHOD_NOT_ADMITTED/);
  assert.match(html, /CURRENT_COMMON_OUTSTANDING_COVERAGE_NOT_PROVEN_THROUGH_PRICE_SESSION/);
  assert.match(html, /PLANNED_OR_UNEXECUTED_ACTION_IS_NOT_SHARES_OUTSTANDING/);
  assert.match(html, /OFFICIAL_QUALIFIED_FINANCIAL_INPUT_UNAVAILABLE/);
  assert.match(html, /data-case="BEAR"/);
  assert.match(html, /data-case="BASE"/);
  assert.match(html, /data-case="BULL"/);
  assert.match(html, /Không phải xác suất và không phải giá mục tiêu/);
  assert.doesNotMatch(html, /target_price|xác suất \d|giá mục tiêu \d/i);
});

test("research P/B is not rendered as an official exact multiple", () => {
  const card = diagnosticCard({
    valuation: {
      method_diagnostics: {
        "P/B_CURRENT_RESEARCH": {
          status: "RESEARCH_USABLE",
          value: 1.27446,
          availability_state: "AVAILABLE_REFERENCE_ONLY",
          share_basis: "CURRENT_SHARE_RESEARCH_PROXY",
          limitations: ["RESEARCH_PROXY_NOT_OFFICIAL_EXACT_PB"],
        },
      },
    },
  });
  const html = ws.decisionCardHtml(card, { ticker: "HPG" });
  const block = html.match(/<article class="ws-valuation-method" data-method="P\/B_CURRENT_RESEARCH">[\s\S]*?<\/article>/);
  assert.ok(block);
  assert.match(block[0], /P\/B · nghiên cứu hiện tại/);
  assert.match(block[0], /1\.27446/);
  assert.doesNotMatch(block[0], /P\/B chính thức|official exact|EXACT_METHOD_VALUE/);
});

test("H1 ending-assets ROA stays distinct from annualized and average-assets ROA", () => {
  const html = ws.returnBalanceMetricsHtml({
    current_features: {
      roa_eop_proxy: {
        status: "READY_RESEARCH_PROXY", value: 0.042, method: "ENDING_BALANCE_PROXY=earnings/ending_balance",
        input_periods: ["2026-H1"],
      },
      same_provider_roa_avg_assets: {
        status: "RESEARCH_USABLE", value: 0.08,
        method: "same_provider_standalone_flow_average_of_period_boundary_balances/v1",
        input_periods: ["2025"],
      },
      roa_annualized: {
        status: "DERIVED_PROXY", value: 0.11, method: "annualized_run_rate_research_proxy",
        input_periods: ["2026-H1"],
      },
    },
  });
  const ending = html.match(/data-metric-id="roa_eop_proxy"[\s\S]*?<\/article>/);
  const average = html.match(/data-metric-id="same_provider_roa_avg_assets"[\s\S]*?<\/article>/);
  const annualized = html.match(/data-metric-id="roa_annualized"[\s\S]*?<\/article>/);
  assert.match(ending[0], /data-balance="ending-assets"/);
  assert.match(ending[0], /tài sản cuối kỳ/);
  assert.match(ending[0], /2026-H1/);
  assert.match(ending[0], /Proxy nghiên cứu/);
  assert.doesNotMatch(ending[0], /bình quân|quy năm|Sẵn sàng/);
  assert.match(average[0], /data-balance="average-assets"/);
  assert.match(average[0], /tài sản bình quân/);
  assert.doesNotMatch(average[0], /cuối kỳ|quy năm/);
  assert.match(annualized[0], /data-balance="annualized"/);
  assert.match(annualized[0], /đã quy năm/);
  assert.doesNotMatch(annualized[0], /cuối kỳ|bình quân/);
  assert.match(ending[0], /4,2%/);
  assert.equal(ws.returnBalanceMetricsHtml({ current_features: {} }), "");
  assert.equal(ws.returnBalanceMetricsHtml({}), "");
});

test("an unpublished return metric is not calculated in the browser", () => {
  const html = ws.returnBalanceMetricsHtml({
    current_features: {
      roa_eop_proxy: { status: "BLOCKED", value: null, method: "blocked_feature_contract/v1", input_periods: [], blocker_reason_codes: ["CROSS_PROVIDER_OR_DURATION_INCOMPATIBLE"] },
    },
  });
  assert.match(html, /data-balance="ending-assets"/);
  assert.match(html, /Bị chặn/);
  assert.match(html, /Khác nguồn hoặc khác độ dài kỳ/);
  assert.match(html, /Chưa có số liệu được công bố/);
  assert.doesNotMatch(html, /data-retained-value="true"/);
  assert.doesNotMatch(html, /data-metric-id="same_provider_roa_avg_assets"|data-balance="annualized"/);
});

test("decision surfaces share one rendered card", () => {
  const card = diagnosticCard();
  const drawer = { innerHTML: "" };
  const printCopy = { innerHTML: "" };
  const html = ws.renderDecisionCardSurfaces(card, [drawer, printCopy], { ticker: "AAA" });
  assert.equal(drawer.innerHTML, html);
  assert.equal(printCopy.innerHTML, html);
});

test("legacy valuation artifacts remain safe while HPG-like old summaries do not claim absolute valuation methods", () => {
  const legacy = diagnosticCard({
    valuation: { relative_research_state: "ABSOLUTE_RESEARCH_ONLY", usable_relative_method_count: 4, supporting_methods: [] },
  });
  const html = ws.decisionCardHtml(legacy, { ticker: "HPG" });
  const visible = primaryVisibleText(html);
  assert.match(visible, /4 phương pháp định giá có dữ liệu nghiên cứu/);
  assert.match(visible, /Chi tiết từng phương pháp chưa được giữ lại/);
  assert.doesNotMatch(visible, /4 phương pháp định giá tuyệt đối/);
  assert.doesNotMatch(visible, /DCF|fair value|target price|giá mục tiêu/i);
});
