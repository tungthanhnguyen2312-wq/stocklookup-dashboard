(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VSInvestmentWorkspace = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // DASHBOARD_PAYLOAD_COMPACTION_AND_INVESTOR_FIRST_IA_V1: DATA_URL now points at the compact
  // workspace_index/v1 document (list/filter/search fields for every ticker); a selected
  // ticker's full detail is fetched lazily, one shard at a time, via workspace-read-model.js.
  // WORKSPACE.cards therefore holds "thin cards" everywhere in this module EXCEPT inside an
  // already-resolved detail render (decisionCardHtml is always called with a full shard card).
  const DATA_URL = "data/workspace_index.json";
  const SCHEMA_VERSION = "1.0.0";
  const CONTRACT_VERSION = "workspace_index/v1";
  const PORTFOLIO_STORAGE_KEY = "stocklookup.portfolio-research.v1";
  const RELATIVE_VALUATION_LABELS = ["ATTRACTIVE_RELATIVE_RESEARCH", "EXPENSIVE_RELATIVE_RESEARCH"];

  function getProductScopeFormat() {
    if (typeof window !== "undefined" && window.VSProductScopeFormat) return window.VSProductScopeFormat;
    if (typeof require === "function") {
      try { return require("./product-scope-format.js"); } catch (err) { return null; }
    }
    return null;
  }

  function getWorkspaceReadModel() {
    if (typeof window !== "undefined" && window.VSWorkspaceReadModel) return window.VSWorkspaceReadModel;
    if (typeof require === "function") {
      try { return require("./workspace-read-model.js"); } catch (err) { return null; }
    }
    return null;
  }

  function getInvestigationWorkbench() {
    if (typeof window !== "undefined" && window.VSInvestigationWorkbench) return window.VSInvestigationWorkbench;
    return null;
  }

  function getCaseDeskReview() {
    if (typeof window !== "undefined" && window.VSCaseDeskReview) return window.VSCaseDeskReview;
    return null;
  }

  function getWorkspaceCardPresentation() {
    if (typeof window !== "undefined" && window.VSWorkspaceCardPresentation) return window.VSWorkspaceCardPresentation;
    if (typeof require === "function") {
      try { return require("./workspace-card-presentation.js"); } catch (err) { return null; }
    }
    return null;
  }

  const {
    POSITION_CONDITIONAL_POSTURES,
    CONSTRUCTIVE_POSTURES,
    POSTURE_UNAVAILABLE_TEXT,
    escHtml,
    formatWorkspaceState,
    evidenceCurrencyClass,
    evidenceCurrencyLabel,
    evidenceCurrencyHtml,
    actionPostureLabel,
    actionPostureHtml,
    notableTickers,
    compactReasons,
  } = getWorkspaceCardPresentation();

  function validateWorkspaceContract(workspace) {
    return Boolean(
      workspace &&
      workspace.schema_version === SCHEMA_VERSION &&
      workspace.contract_version === CONTRACT_VERSION &&
      workspace.cards &&
      typeof workspace.cards === "object" &&
      !Array.isArray(workspace.cards) &&
      Object.keys(workspace.cards).length
    );
  }

  // ---------------------------------------------------------------------
  // Pure logic -- no DOM, unit-tested directly by tests/investment-workspace.test.js
  // ---------------------------------------------------------------------

  // CURRENT_DECISION_SURFACE_CONVERGENCE_V1: the primary decision filters read the Producer's
  // research_action_posture (Integrated Decision). research_stance is kept only as a clearly
  // secondary research-screen/candidate filter group. Opportunity priority is its own inspection
  // axis and never changes the posture label or color.
  const FILTER_GROUP_LABELS = {
    posture: "Quyết định hành động",
    evidence: "Độ mới bằng chứng",
    priority: "Ưu tiên xem xét",
    stance: "Sàng lọc nghiên cứu (phụ)",
    tactical: "Trạng thái kỹ thuật",
    fundamental: "Nền tảng doanh nghiệp",
    valuation: "Định giá",
    liquidity: "Thanh khoản",
    catalyst: "Chất xúc tác",
    freshness: "Độ mới dữ liệu",
  };
  const FILTERS = [
    { id: "initiate", label: "Mở vị thế khi bứt phá", group: "posture", test: (c) => c.research_action_posture === "INITIATE_ON_BREAKOUT" },
    { id: "accumulate", label: "Tích lũy khi kiểm định lại", group: "posture", test: (c) => c.research_action_posture === "ACCUMULATE_ON_RETEST" },
    { id: "early_watch", label: "Theo dõi sớm", group: "posture", test: (c) => c.research_action_posture === "EARLY_WATCH" },
    { id: "wait", label: "Chờ xác nhận", group: "posture", test: (c) => c.research_action_posture === "WAIT_FOR_CONFIRMATION" },
    { id: "hold", label: "Nắm giữ (nếu đang nắm giữ)", group: "posture", test: (c) => c.research_action_posture === "HOLD" || c.research_action_posture === "HOLD_DO_NOT_ADD" },
    { id: "avoid", label: "Tránh / giảm tỷ trọng", group: "posture", test: (c) => c.research_action_posture === "AVOID" || c.research_action_posture === "REDUCE" },
    { id: "insufficient", label: "Chưa đủ bằng chứng hiện tại", group: "posture", test: (c) => c.research_action_posture === "INSUFFICIENT_CURRENT_RESEARCH" },
    { id: "evidence_current", label: "Dữ liệu phiên hiện tại", group: "evidence", test: (c) => evidenceCurrencyClass(c.evidence_currency) === "CURRENT_SESSION" },
    { id: "evidence_stale", label: "Dữ liệu đã cũ", group: "evidence", test: (c) => evidenceCurrencyClass(c.evidence_currency) === "LAST_TRADE_AS_OF" },
    { id: "evidence_none", label: "Không có bằng chứng hiện tại", group: "evidence", test: (c) => evidenceCurrencyClass(c.evidence_currency) === "NO_CURRENT_EVIDENCE" },
    { id: "priority_now", label: "Ưu tiên xem ngay", group: "priority", test: (c) => ((c.opportunity_priority || {}).research_priority_tier) === "PRIORITY_NOW" },
    { id: "screen_initiate", label: "Sàng lọc: ứng viên mở vị thế", group: "stance", test: (c) => c.research_stance === "INITIATE_RESEARCH_CANDIDATE" },
    { id: "screen_accumulate", label: "Sàng lọc: ứng viên tích lũy", group: "stance", test: (c) => c.research_stance === "ACCUMULATE_RESEARCH_CANDIDATE" },
    { id: "screen_avoid", label: "Sàng lọc: tránh mở vị thế mới", group: "stance", test: (c) => c.research_stance === "AVOID_NEW_ENTRY" },
    { id: "breakout_ready", label: "Sẵn sàng bứt phá", group: "tactical", test: (c) => c.entry_state === "BREAKOUT_READY" },
    { id: "base_building", label: "Đang tạo nền", group: "tactical", test: (c) => c.entry_state === "BASE_BUILDING" },
    { id: "early_reversal", label: "Ứng viên đảo chiều sớm", group: "tactical", test: (c) => c.entry_state === "EARLY_REVERSAL_CANDIDATE" },
    { id: "profitable", label: "Có lợi nhuận", group: "fundamental", test: (c) => (c.fundamental || {}).state === "PROFITABLE" },
    { id: "turnaround", label: "Chuyển biến lợi nhuận", group: "fundamental", test: (c) => (c.fundamental || {}).trajectory === "TURNED_TO_LOSS" || (c.valuation || {}).earnings_state === "TURNAROUND_CONTEXT" },
    { id: "valuation_available", label: "Có dữ liệu định giá", group: "valuation", test: (c) => !!(c.valuation || {}).relative_research_state && (c.valuation || {}).relative_research_state !== "UNAVAILABLE" },
    { id: "attractive", label: "Hấp dẫn tương đối", group: "valuation", test: (c) => (c.valuation || {}).relative_research_state === "ATTRACTIVE_RELATIVE_RESEARCH" },
    { id: "expensive", label: "Đắt tương đối", group: "valuation", test: (c) => (c.valuation || {}).relative_research_state === "EXPENSIVE_RELATIVE_RESEARCH" },
    { id: "liquidity_available", label: "Có dữ liệu thanh khoản nghiên cứu", group: "liquidity", test: (c) => (c.liquidity || {}).readiness === "LIQUIDITY_RESEARCH_PROXY" },
    { id: "catalyst_available", label: "Có chất xúc tác", group: "catalyst", test: (c) => !!(c.catalyst || {}).status && (c.catalyst || {}).status !== "UNAVAILABLE" },
    { id: "stale_evidence", label: "Có bằng chứng đã cũ", group: "freshness", test: (c) => hasStaleAxis(c) },
  ];

  function hasStaleAxis(card) {
    const freshness = ((card || {}).lineage || {}).per_axis_freshness || {};
    return Object.values(freshness).some((v) => v && v !== "CURRENT");
  }

  function matchesFilters(card, activeIds) {
    if (!activeIds || !activeIds.length) return true;
    const byId = {};
    FILTERS.forEach((f) => { byId[f.id] = f; });
    return activeIds.every((id) => byId[id] && byId[id].test(card));
  }

  function matchesSearch(ticker, card, query) {
    if (!query) return true;
    const q = String(query).trim().toUpperCase();
    if (!q) return true;
    return ticker.toUpperCase().includes(q) || String(card.sector || "").toUpperCase().includes(q);
  }

  // No ticker requested -> deterministic default (HPG if present, else the first ticker).
  // Ticker requested and known -> that ticker.
  // Ticker requested but unknown -> null. Never silently substitutes another ticker: the caller
  // is responsible for surfacing an explicit not-found state instead of opening a different card.
  function selectedTickerForDeepLink(tickers, requestedTicker) {
    const normalized = String(requestedTicker || "").trim().toUpperCase();
    if (!normalized) return tickers.includes("HPG") ? "HPG" : (tickers[0] || null);
    if (tickers.includes(normalized)) return normalized;
    return null;
  }

  // CURRENT_DECISION_SURFACE_CONVERGENCE_V1: research_action_posture (Producer Integrated
  // Decision) is the single action decision. research_stance is a secondary research-screen /
  // candidate dimension only and may legitimately disagree with the posture; entry_action
  // (Tactical Entry Readiness) is underlying tactical context only. Every value stays verbatim
  // from the Producer -- nothing here re-derives or overrides a decision.
  const VETO_RESEARCH_STANCES = new Set(["HIGH_RISK_SPECULATION_ONLY", "AVOID_NEW_ENTRY"]);
  const TACTICAL_ACTIONABLE_ENTRY_READINESS = new Set(["EARLY_ENTRY", "BUY_ON_CONFIRMATION", "ACCUMULATE_IN_BASE"]);
  // Rolling-deploy compatibility: a pre-M1 Workspace card has no research_action_posture. The
  // primary decision then reads as explicitly unavailable -- never the legacy research_stance.
  // Posture, evidence-currency, and notable-ticker presentation live in
  // workspace-card-presentation.js so Home does not parse this module.

  function stanceEntryGuidance(researchStance, entryAction) {
    if (VETO_RESEARCH_STANCES.has(researchStance)) {
      return "Sàng lọc nghiên cứu (phụ) xếp mã này vào nhóm tránh mở vị thế mới. Đây chỉ là bối cảnh sàng lọc; quyết định hành động là mục Quyết định hành động ở trên. Mức sẵn sàng kỹ thuật chỉ là bối cảnh kỹ thuật — không phải tín hiệu mua.";
    }
    if ((researchStance === "ACCUMULATE_RESEARCH_CANDIDATE" || researchStance === "INITIATE_RESEARCH_CANDIDATE")
        && entryAction && !TACTICAL_ACTIONABLE_ENTRY_READINESS.has(entryAction)) {
      const kind = researchStance === "ACCUMULATE_RESEARCH_CANDIDATE" ? "tích lũy" : "mở vị thế";
      const actionLabel = formatWorkspaceState(entryAction, "entry_action");
      return `Sàng lọc nghiên cứu (phụ): ứng viên nghiên cứu ${kind}. Đây không phải quyết định hành động; mức sẵn sàng kỹ thuật (${actionLabel}) chỉ phản ánh trạng thái xác nhận kỹ thuật hiện tại, không phải quyền được mở vị thế.`;
    }
    return "";
  }

  // Orthogonal inspection-order axis, rendered separately; never alters the posture label/color.
  function opportunityPriorityHtml(card) {
    const tier = ((card || {}).opportunity_priority || {}).research_priority_tier || "UNAVAILABLE";
    return `<span class="ws-priority-note cockpit-note" data-opportunity-priority="${escHtml(tier)}">Ưu tiên xem xét: ${escHtml(formatWorkspaceState(tier, "opportunity_priority"))}</span>`;
  }
  // Secondary screen label. With NO_CURRENT_EVIDENCE a legacy WAIT screen is never worded as
  // "Chờ xác nhận" anywhere on the card; the raw value stays in the data attribute.
  function researchScreenLabel(card) {
    const c = card || {};
    if (c.research_stance === "WAIT_FOR_CONFIRMATION" && evidenceCurrencyClass(c.evidence_currency) === "NO_CURRENT_EVIDENCE") {
      return "không áp dụng khi không có bằng chứng hiện tại";
    }
    return formatWorkspaceState(c.research_stance, "research_stance");
  }
  function researchScreenHtml(card) {
    return `<span class="ws-research-screen cockpit-note" data-research-stance="${escHtml((card || {}).research_stance || "")}">Sàng lọc nghiên cứu (phụ): ${escHtml(researchScreenLabel(card))}</span>`;
  }

  // Client-side portfolio-fit join -- mirrors investment_decision_workspace_projection.py's
  // _portfolio_view() exactly (ticker lookup, breach match, sector-concentration lookup). No
  // covariance/volatility/correlation is computed here; every number it displays was already
  // computed by the Producer and simply re-labelled per candidate ticker.
  function joinPortfolioResearch(ticker, sector, portfolioResearch) {
    if (!portfolioResearch || !portfolioResearch.portfolio_id) {
      return { evaluated: false, status: "NOT_EVALUATED", reason: "NO_PORTFOLIO_RESEARCH_CONTEXT_SUPPLIED" };
    }
    const positions = {};
    (portfolioResearch.normalized_positions || []).forEach((p) => { if (p && p.ticker) positions[p.ticker] = p; });
    const holding = positions[ticker];
    const breaches = (portfolioResearch.user_limit_breaches || []).filter(
      (b) => b && (b.ticker === ticker || b.sector === sector)
    );
    const sectorConcentration = portfolioResearch.sector_concentration || {};
    const sectorWeight = sectorConcentration[sector];
    const addsSectorConcentration = !holding && typeof sectorWeight === "number" && sectorWeight > 0;
    let status;
    if (breaches.length) status = "EXCEEDS_USER_POLICY_LIMIT";
    else if (holding) status = "ALREADY_HELD";
    else if (addsSectorConcentration) status = "ADDS_SECTOR_CONCENTRATION";
    else status = "NO_CONCENTRATION_FLAGGED";
    return {
      evaluated: true, status,
      portfolio_id: portfolioResearch.portfolio_id, as_of_session: portfolioResearch.as_of_session,
      holding_status: holding ? "HELD" : "NOT_HELD", weight: holding ? holding.weight : null,
      sector: (holding && holding.sector) || sector, existing_sector_concentration_weight: sectorWeight,
      sector_concentration: sectorConcentration, tactical_concentration: portfolioResearch.tactical_concentration || {},
      selected_joint_risk_horizon: portfolioResearch.selected_joint_risk_horizon,
      joint_risk_status: portfolioResearch.joint_risk_status,
      pairwise_correlation_status: portfolioResearch.pairwise_correlation_status,
      user_limit_breaches: breaches,
      liquidity_research_context: holding ? holding.liquidity_research_context : null,
      exact_execution_capacity_status: holding ? holding.exact_execution_capacity_status : null,
      volatility: holding ? holding.volatility : null, cash_weight: portfolioResearch.cash_weight,
      warnings: portfolioResearch.warnings || [],
    };
  }

  function readLocalPortfolioHoldings(storage) {
    try {
      const store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
      if (!store) return null;
      const raw = store.getItem(PORTFOLIO_STORAGE_KEY);
      if (!raw) return null;
      const model = JSON.parse(raw);
      if (!model || !Array.isArray(model.positions)) return null;
      return model;
    } catch (err) {
      return null;
    }
  }

  function localHoldingFor(ticker, model) {
    if (!model || !Array.isArray(model.positions)) return null;
    return model.positions.find((p) => p && String(p.ticker || "").toUpperCase() === ticker.toUpperCase()) || null;
  }

  // Bounded, client-side T0 capture (section 11): a small versioned candidate export the Producer
  // can later validate through durable_prospective_research_case_store.py's own persist_case()
  // contract. This is NOT a retained prospective case -- no DB write, no authority claimed here.
  function buildT0Export(ticker, card, sourceArtifactIdentity) {
    return {
      schema_version: "t0_candidate_export/v1",
      ticker, as_of_session: card.as_of_session,
      // Canonical action decision + its evidence currency (Producer Integrated Decision, verbatim).
      research_action_posture: card.research_action_posture || null,
      evidence_currency: card.evidence_currency || null,
      position_context: (card.position_context || {}).position_state || null,
      decision_authority: "research_action_posture",
      // Secondary research-screen context only.
      research_stance: card.research_stance,
      research_stance_role: "SECONDARY_RESEARCH_SCREEN_CONTEXT",
      research_stance_readiness: card.research_stance_readiness, entry_state: card.entry_state,
      entry_action: card.entry_action, setup_tags: card.setup_tags || [],
      confirmation: card.confirmation, technical_invalidation: (card.invalidation || {}).technical,
      fundamental_invalidation: (card.invalidation || {}).fundamental,
      source_workspace_artifact_identity: sourceArtifactIdentity || null,
      exported_at: new Date().toISOString(),
      note: "Not yet a retained prospective case. Must be validated through the Producer's durable_prospective_research_case_store contract before retention. No production/runtime database write occurred.",
      authority_boundary: { is_actionable: false, retained_case_authority: "NOT_ESTABLISHED_BY_THIS_EXPORT" },
    };
  }

  // Phân tích (analysis) view row shaping -- pure, no DOM. Mirrors the retired
  // assets/js/analysis-product.js record() shape. Support/counter fields are genuine Producer
  // evidence (why.deterministic_reasons / counter_thesis.key_counter_thesis) passed through
  // verbatim -- never a client-synthesized combined-conflict category.
  function analysisRecord(card) {
    return {
      ticker: card.ticker, sector: card.sector || "UNKNOWN",
      posture: card.research_action_posture || "UNAVAILABLE",
      evidence_currency: card.evidence_currency || null,
      position_context: card.position_context || null,
      stance: card.research_stance || "UNAVAILABLE",
      tactical: card.entry_state || (card.tactical || {}).primary_entry_state || "UNAVAILABLE",
      fundamental: (card.fundamental || {}).state || "UNAVAILABLE",
      valuation: (card.valuation || {}).relative_research_state || "UNAVAILABLE",
      support: (card.why || {}).deterministic_reasons || [],
      counter: (card.counter_thesis || {}).key_counter_thesis || [],
    };
  }
  function analysisRows(workspace) {
    const cards = (workspace || {}).cards || {};
    return Object.keys(cards).sort().map((t) => analysisRecord(cards[t]));
  }
  function analysisEvidenceHtml(rec) {
    const support = (rec.support || []).slice(0, 1).map((r) => formatWorkspaceState(r, "rule_condition"));
    const counter = (rec.counter || []).slice(0, 1).map((r) => formatWorkspaceState(r, "rule_condition"));
    if (!support.length && !counter.length) return '<span class="cockpit-note">Chưa có bằng chứng được ghi nhận</span>';
    return [
      support.length ? `<div>${escHtml(support.join(", "))}</div>` : "",
      counter.length ? `<div class="cockpit-note">Phản luận: ${escHtml(counter.join(", "))}</div>` : "",
    ].join("");
  }
  function analysisRowHtml(rec) {
    return `<tr data-ticker="${escHtml(rec.ticker)}" style="cursor: pointer;"><td class="sticky-col"><button type="button" class="btn btn-link p-0 ws-ticker-link fw-bold font-monospace text-start" data-select-ticker="${escHtml(rec.ticker)}">${escHtml(rec.ticker)}</button><div class="cockpit-note">${sectorDisplayHtml(rec.sector)}</div></td><td>${actionPostureHtml({ research_action_posture: rec.posture === "UNAVAILABLE" ? null : rec.posture, evidence_currency: rec.evidence_currency, position_context: rec.position_context })}<div>${evidenceCurrencyHtml(rec.evidence_currency)}</div><div>${researchScreenHtml({ research_stance: rec.stance, evidence_currency: rec.evidence_currency })}</div></td><td>${pill(rec.fundamental, "fundamental_state")}</td><td>${pill(rec.valuation, "valuation_state")}</td><td>${pill(rec.tactical, "tactical_state")}</td><td>${analysisEvidenceHtml(rec)}</td></tr>`;
  }
  function analysisKpi(label, value) {
    return `<div class="cockpit-kpi"><div class="label">${escHtml(label)}</div><div class="value">${escHtml(value)}</div></div>`;
  }

  function getValueFormat() {
    if (typeof window !== "undefined" && window.VSValueFormat) return window.VSValueFormat;
    if (typeof require === "function") {
      try { return require("./value-format.js"); } catch (err) { return null; }
    }
    return null;
  }
  function sectorDisplayHtml(value) {
    const vf = getValueFormat();
    if (vf && typeof vf.formatSectorLineage === "function") return `<span data-sector="${escHtml(value || "")}">${escHtml(vf.formatSectorLineage(value).label)}</span>`;
    return escHtml(value);
  }
  function sectorDisplayLabel(value) {
    const vf = getValueFormat();
    if (vf && typeof vf.formatSectorLineage === "function") return vf.formatSectorLineage(value).label;
    return String(value || "Chưa phân loại ngành");
  }
  function axisDisplayLabel(axis) {
    const vf = getValueFormat();
    if (vf && typeof vf.formatAxisLabel === "function") return vf.formatAxisLabel(axis) || axis;
    return axis;
  }
  function detailsHtml(payload, summary) {
    const vf = getValueFormat();
    if (vf && typeof vf.technicalDetailsHtml === "function") return vf.technicalDetailsHtml(payload, summary);
    return `<details class="vs-tech-details"><summary>${escHtml(summary || "Chi tiết kỹ thuật")}</summary><pre class="cockpit-code">${escHtml(JSON.stringify(payload ?? {}, null, 2))}</pre></details>`;
  }
  function provenanceBlock(identity) {
    const vf = getValueFormat();
    if (vf && typeof vf.provenanceHtml === "function") return vf.provenanceHtml(identity);
    return identity ? detailsHtml(identity, "Chi tiết dữ liệu") : "";
  }
  function conditionHeadline(obj) {
    if (!obj || typeof obj !== "object") {
      return { raw: "", label: formatWorkspaceState("", "rule_condition") };
    }
    const candidates = [obj.boundary_type, obj.trigger_type, obj.comparison_operator];
    const vf = getValueFormat();
    for (let i = 0; i < candidates.length; i++) {
      const raw = candidates[i];
      if (!raw) continue;
      if (vf && typeof vf.formatDomainState === "function") {
        const formatted = vf.formatDomainState(raw, "rule_condition");
        if (formatted.known) return formatted;
      }
    }
    return {
      raw: obj.boundary_type || obj.trigger_type || obj.comparison_operator || "",
      label: formatWorkspaceState(obj.boundary_type || obj.trigger_type || "", "rule_condition"),
    };
  }
  function conditionVisibleHtml(obj) {
    if (!obj || typeof obj !== "object" || !Object.keys(obj).length) {
      return '<span class="cockpit-note">Chưa có dữ liệu / không có mục được giữ lại</span>';
    }
    const headline = conditionHeadline(obj);
    const operator = obj.comparison_operator ? formatWorkspaceState(obj.comparison_operator, "rule_condition") : "";
    const direction = obj.direction ? formatWorkspaceState(obj.direction, "rule_condition") : "";
    const extra = [];
    if (operator && operator !== headline.label) extra.push(operator);
    if (direction && direction !== headline.label && direction !== operator) extra.push(direction);
    return `<div class="cockpit-condition" data-condition="${escHtml(headline.raw)}" title="${escHtml(headline.raw)}"><div>${escHtml(headline.label)}</div>${
      extra.map((line) => `<div class="cockpit-note">${escHtml(line)}</div>`).join("")
    }</div>${detailsHtml(obj, "Chi tiết kỹ thuật")}`;
  }
  function marketContextHtml(ctx) {
    if (!ctx || typeof ctx !== "object" || !Object.keys(ctx).length) {
      return '<span class="cockpit-note">Chưa có dữ liệu</span>';
    }
    const fieldLabels = {
      leadership_state: "Dẫn dắt ngành",
      market_relative_momentum_bucket: "Động lượng so với thị trường",
      sector_relative_momentum_bucket: "Động lượng so với ngành",
    };
    const lines = Object.entries(ctx).map(([key, value]) => {
      const field = fieldLabels[key] || key;
      const label = formatWorkspaceState(value, "data_fitness");
      return `<div class="cockpit-note">${escHtml(field)}: <span data-state="${escHtml(value)}" title="${escHtml(value)}">${escHtml(label)}</span></div>`;
    });
    return `${lines.join("")}${detailsHtml(ctx, "Chi tiết dữ liệu")}`;
  }
  // CSS.escape is a browser global, absent in this project's Node test harness (and in older
  // browsers) -- selector construction must not crash or fall back to unescaped interpolation
  // just because that global is missing. The fallback backslash-escapes every character outside
  // [a-zA-Z0-9_-] the same way CSS.escape does for attribute-selector-safe values like tickers.
  function cssEscapeSelector(v) {
    const s = String(v ?? "");
    if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }
  function unavailableLabel(v) {
    return (v === null || v === undefined || v === "" ? "UNAVAILABLE" : v);
  }
  // Vietnamese-safe variant for values interpolated DIRECTLY into visible text (a count, a
  // session date) rather than routed through pill()/formatWorkspaceState's domain lookup --
  // unavailableLabel's "UNAVAILABLE" sentinel is correct there (every domain table maps it),
  // but shown raw here it would leak English (DASHBOARD_INVESTOR_FIRST_PRESENTATION_
  // SIMPLIFICATION_V1 Phase 21).
  function unavailableText(v) {
    return (v === null || v === undefined || v === "") ? "Chưa có dữ liệu" : v;
  }
  // Domain-aware tone contract (value-format.js DOMAIN_SPECIFIC_TONES / getSemanticTone) is the
  // single source of truth for pill color -- a raw keyword bucket here would re-introduce the
  // cross-domain collisions it was built to fix (e.g. TRIGGERED reading adverse in every domain,
  // when it is constructive for confirmation_state and adverse for invalidation_state).
  function pill(v, domain) {
    const raw = unavailableLabel(v);
    const label = domain ? formatWorkspaceState(raw, domain) : raw;
    const vf = getValueFormat();
    const tone = (vf && typeof vf.getSemanticTone === "function") ? vf.getSemanticTone(raw, domain) : "neutral";
    return `<span class="cockpit-state tone-${tone}" data-state="${escHtml(raw)}" data-tone="${tone}" title="${escHtml(raw)}">${escHtml(label)}</span>`;
  }
  function listHtml(values, domain) {
    return (Array.isArray(values) && values.length
      ? `<ul class="cockpit-list">${values.map((x) => {
          if (typeof x === "string") {
            if (!domain) return `<li>${escHtml(x)}</li>`;
            return `<li><span data-state="${escHtml(x)}" title="${escHtml(x)}">${escHtml(formatWorkspaceState(x, domain))}</span></li>`;
          }
          const raw = (x && (x.value || x.metric_or_state || x.source_dimension)) || "";
          const label = raw ? formatWorkspaceState(String(raw), domain || "rule_condition") : formatWorkspaceState("", "rule_condition");
          return `<li><span data-state="${escHtml(raw)}" title="${escHtml(raw)}">${escHtml(label)}</span>${detailsHtml(x, "Chi tiết kỹ thuật")}</li>`;
        }).join("")}</ul>`
      : '<span class="cockpit-note">Chưa có dữ liệu / không có mục được giữ lại</span>');
  }
  function kpiHtml(label, value, domain) {
    const inner = typeof value === "string" && value.indexOf("<span") === 0
      ? value
      : (typeof value === "string" ? pill(value, domain) : escHtml(unavailableLabel(value)));
    return `<div class="cockpit-kpi"><div class="label">${escHtml(label)}</div><div class="value">${inner}</div></div>`;
  }
  function supportingMethodsHtml(methods) {
    if (!methods || !methods.length) return '<span class="cockpit-note">Chưa có phương pháp định giá tương đối sẵn sàng hỗ trợ nhãn này.</span>';
    return `<table class="cockpit-table"><thead><tr><th>Phương pháp</th><th>Phân vị</th><th>Số đối sánh</th><th>Phần bù/chiết khấu so với trung vị nhóm</th></tr></thead><tbody>${
      methods.map((m) => `<tr><td>${escHtml(m.method)}</td><td>${escHtml(m.percentile)}</td><td>${escHtml(m.peer_count)}</td><td>${escHtml(m.premium_or_discount_to_peer_median)}</td></tr>`).join("")
    }</tbody></table>`;
  }

  // Diagnostic values are display-only Producer truth.  The helpers below intentionally do
  // not derive a valuation, peer cohort, trigger, or any authority: they only shape retained
  // additive fields for an owner-readable card.
  function hasRetainedValue(value) {
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.trim() !== "";
    return false;
  }
  function formatDiagnosticNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 }).format(value);
    }
    return String(value);
  }
  function diagnosticPill(raw, label, tone) {
    const vf = getValueFormat();
    const effectiveTone = tone || (vf && typeof vf.getSemanticTone === "function" ? vf.getSemanticTone(raw, "availability_state") : "neutral");
    return `<span class="cockpit-state tone-${escHtml(effectiveTone)}" data-state="${escHtml(raw)}" data-tone="${escHtml(effectiveTone)}" title="${escHtml(raw)}">${escHtml(label)}</span>`;
  }
  function diagnosticReasonLabel(raw) {
    const vf = getValueFormat();
    if (vf && typeof vf.formatDiagnosticReason === "function") return vf.formatDiagnosticReason(raw);
    return formatWorkspaceState(raw, "diagnostic_reason");
  }
  function diagnosticReasonHtml(raw) {
    return `<span data-state="${escHtml(raw)}" title="${escHtml(raw)}">${escHtml(diagnosticReasonLabel(raw))}</span>`;
  }
  function diagnosticValueHtml(method) {
    if (hasRetainedValue(method && method.value)) {
      return `<strong class="ws-diagnostic-value" data-retained-value="true">${escHtml(formatDiagnosticNumber(method.value))}</strong>`;
    }
    const state = (method || {}).earnings_state || ((method || {}).status === "PE_NOT_MEANINGFUL" ? "PE_NOT_MEANINGFUL" : "");
    if (state) {
      return `<span class="ws-diagnostic-value" data-state="${escHtml(state)}" title="${escHtml(state)}">${escHtml(formatWorkspaceState(state, state === "PE_NOT_MEANINGFUL" ? "valuation_state" : "earnings_state"))}</span>`;
    }
    return '<span class="cockpit-note ws-diagnostic-value">Chưa có dữ liệu</span>';
  }
  function recordStatusBlob(record) {
    const source = record || {};
    return [
      source.status, source.fitness, source.research_fitness, source.share_basis, source.method,
      source.availability_state, source.display_state, source.evidence_fitness, source.freshness_status,
    ].filter((part) => part !== null && part !== undefined && part !== "").join(" ").toUpperCase();
  }

  // Producer status stays the visible status. A proxy or blocked label never becomes READY.
  function financialStatusLabel(record) {
    const source = record || {};
    const tokens = [source.status, source.display_state, source.availability_state]
      .filter((part) => part !== null && part !== undefined && part !== "")
      .map((part) => String(part).toUpperCase());
    if (tokens.includes("NOT_APPLICABLE")) return { label: "Không áp dụng", tone: "neutral", kind: "not_applicable" };
    if (tokens.some((token) => token === "BLOCKED" || token === "INPUT_BLOCKED" || token.includes("BLOCKED"))) {
      return { label: "Bị chặn", tone: "adverse", kind: "blocked" };
    }
    const blob = recordStatusBlob(source);
    if (blob.includes("PROXY")) return { label: "Proxy nghiên cứu", tone: "info", kind: "proxy" };
    if (blob.includes("STALE")) return { label: "Đã cũ", tone: "watch", kind: "stale" };
    if (tokens.includes("TEMPORARILY_UNAVAILABLE")) return { label: "Tạm chưa có dữ liệu", tone: "neutral", kind: "unavailable" };
    if (tokens.some((token) => token === "UNAVAILABLE" || token === "NOT_AVAILABLE" || token === "MISSING")) {
      return { label: "Chưa có dữ liệu", tone: "neutral", kind: "unavailable" };
    }
    if (tokens.includes("INSUFFICIENT_DATA")) return { label: "Chưa đủ dữ liệu", tone: "neutral", kind: "insufficient" };
    return { label: "", tone: "neutral", kind: "published" };
  }

  function valuationAvailabilityHtml(method) {
    const classified = financialStatusLabel(method);
    if (classified.label) {
      const raw = (method && (method.status || method.availability_state || method.display_state)) || classified.kind;
      return diagnosticPill(raw, classified.label, classified.tone);
    }
    const availability = (method || {}).availability_state || "NOT_AVAILABLE";
    const blockers = (method || {}).blocker_reason_codes || [];
    const isBlockedWithoutValue = availability === "NOT_AVAILABLE" && !hasRetainedValue((method || {}).value)
      && (blockers.length || ["INPUT_BLOCKED", "BLOCKED", "NOT_APPLICABLE"].includes((method || {}).status));
    if (isBlockedWithoutValue) return diagnosticPill(availability, "Bị chặn", "adverse");
    if (availability === "AVAILABLE_QUALIFIED") return diagnosticPill(availability, formatWorkspaceState(availability, "availability_state"), "constructive");
    if (availability === "AVAILABLE_REFERENCE_ONLY") return diagnosticPill(availability, formatWorkspaceState(availability, "availability_state"), "watch");
    return diagnosticPill(availability, formatWorkspaceState(availability, "availability_state"), "neutral");
  }
  function diagnosticText(value, domain) {
    if (value === null || value === undefined || value === "") return "";
    const formatted = formatWorkspaceState(value, domain || "data_fitness");
    return `<span data-state="${escHtml(value)}" title="${escHtml(value)}">${escHtml(formatted)}</span>`;
  }
  function valuationPeerContextHtml(peer) {
    if (!peer || typeof peer !== "object" || !Object.keys(peer).length) return "";
    const status = peer.status;
    const details = [];
    if (peer.peer_count != null) details.push(`Số đối sánh: ${formatDiagnosticNumber(peer.peer_count)}`);
    if (hasRetainedValue(peer.peer_median)) details.push(`Trung vị nhóm: ${formatDiagnosticNumber(peer.peer_median)}`);
    if (hasRetainedValue(peer.premium_or_discount_to_peer_median)) details.push(`Chênh lệch so với trung vị: ${formatDiagnosticNumber(peer.premium_or_discount_to_peer_median)}`);
    return `<div class="cockpit-note ws-diagnostic-context">Bối cảnh đối sánh: ${status ? diagnosticReasonHtml(status) : "Chưa có dữ liệu"}${details.length ? `<br>${escHtml(details.join(" · "))}` : ""}</div>`;
  }
  const VALUATION_METHOD_LABELS = Object.freeze({
    "P/E": "P/E",
    "P/E_TTM": "P/E · 12 tháng gần nhất",
    "P/E_REPORTED_PERIOD": "P/E · kỳ báo cáo · chỉ nghiên cứu",
    "P/S": "P/S",
    "P/S_TTM": "P/S · 12 tháng gần nhất",
    "P/S_REPORTED_PERIOD": "P/S · kỳ báo cáo · chỉ nghiên cứu",
    "P/B": "P/B",
    "P/B_CURRENT_RESEARCH": "P/B · nghiên cứu hiện tại",
    "P/B_OFFICIAL_RESEARCH": "P/B · nghiên cứu chính thức",
    "EV/EBITDA": "EV/EBITDA",
    "EV/EBITDA_CALC_READY": "EV/EBITDA · khả năng tính đã công bố",
    "EV/Sales": "EV/Doanh thu",
    "market_cap": "Vốn hóa",
  });

  function valuationMethodLabel(methodId) {
    return VALUATION_METHOD_LABELS[methodId] || methodId;
  }

  function valuationMethodHtml(methodId, method) {
    const detail = method || {};
    const blockers = Array.isArray(detail.blocker_reason_codes) ? detail.blocker_reason_codes : [];
    const context = [];
    if (detail.period_basis) context.push(`Kỳ: ${formatWorkspaceState(detail.period_basis, "data_fitness")}`);
    if (detail.share_basis) context.push(`Cơ sở: ${formatWorkspaceState(detail.share_basis, "data_fitness")}`);
    if (detail.denominator_period_semantics) context.push(`Mẫu số: ${formatWorkspaceState(detail.denominator_period_semantics, "data_fitness")}`);
    const reporting = detail.reporting_basis;
    if (reporting && typeof reporting === "object" && reporting.time_basis) {
      context.push(`Cơ sở kỳ: ${formatWorkspaceState(reporting.time_basis, "data_fitness")}`);
    }
    return `<article class="ws-valuation-method" data-method="${escHtml(methodId)}">
      <div class="ws-valuation-method-head"><strong>${escHtml(valuationMethodLabel(methodId))}</strong>${valuationAvailabilityHtml(detail)}</div>
      <div class="ws-valuation-method-value">${diagnosticValueHtml(detail)}</div>
      ${valuationPeerContextHtml(detail.peer_relative)}
      ${context.length ? `<div class="cockpit-note ws-diagnostic-context">${escHtml(context.join(" · "))}</div>` : ""}
      ${blockers.length ? `<div class="cockpit-note ws-diagnostic-blocker">Thiếu/giới hạn: ${blockers.map(diagnosticReasonHtml).join(" · ")}</div>` : ""}
      ${detailsHtml(detail, "Chi tiết kỹ thuật phương pháp")}
    </article>`;
  }
  function valuationSummaryHtml(valuation) {
    const val = valuation || {};
    const summary = val.valuation_summary;
    if (summary && typeof summary === "object") {
      const available = Number(summary.available_method_count) || 0;
      const qualified = Number(summary.qualified_relative_method_count) || 0;
      const displayState = summary.valuation_display_state || "";
      let copy;
      if (available > 0) {
        copy = `${available} phương pháp định giá có dữ liệu nghiên cứu.`;
        copy += qualified > 0
          ? ` ${qualified} phương pháp đủ điều kiện cho bối cảnh định giá tương đối.`
          : " Chưa có phương pháp đủ điều kiện tạo kết luận định giá tương đối.";
      } else {
        copy = "Chưa có phương pháp định giá có dữ liệu nghiên cứu.";
      }
      return `<div class="ws-valuation-summary"${displayState ? ` data-state="${escHtml(displayState)}" title="${escHtml(displayState)}"` : ""}>${escHtml(copy)}</div>${detailsHtml(summary, "Chi tiết kỹ thuật định giá")}`;
    }
    // Older artifacts have only a count, not a retained method/value map.  Preserve that
    // limited fact without calling the methods intrinsic or inventing their identities.
    const legacyCount = Number(val.usable_relative_method_count) || 0;
    if (legacyCount > 0) {
      return `<div class="ws-valuation-summary">${escHtml(`${legacyCount} phương pháp định giá có dữ liệu nghiên cứu.`)}<div class="cockpit-note">Chi tiết từng phương pháp chưa được giữ lại cho phiên này.</div></div>`;
    }
    return '<div class="ws-valuation-summary">Chưa có phương pháp định giá có dữ liệu nghiên cứu.</div>';
  }
  function valuationReadinessHtml(valuation) {
    const ready = (valuation || {}).research_readiness;
    if (!ready || typeof ready !== "object") return "";
    const lines = [];
    const earnings = ready.normalized_earnings;
    const intrinsic = ready.intrinsic_value;
    if (earnings && earnings.readiness) lines.push(`EPS bình thường hóa: ${earnings.readiness}${earnings.reason_code ? ` · ${earnings.reason_code}` : ""}`);
    if (intrinsic && intrinsic.readiness) lines.push(`Giá trị nội tại: ${intrinsic.readiness}${intrinsic.reason_code ? ` · ${intrinsic.reason_code}` : ""}`);
    const share = Array.isArray(ready.share_or_corporate_action_blockers) ? ready.share_or_corporate_action_blockers : [];
    if (share.length) lines.push(`Cổ phiếu/sự kiện: ${share.join(" · ")}`);
    if (!lines.length) return "";
    return `<div class="ws-valuation-readiness" data-probability="NOT_EMITTED" data-target-price="NOT_EMITTED">${lines.map((line) => `<div class="cockpit-note">${escHtml(line)}</div>`).join("")}</div>`;
  }
  function conditionalScenarioHtml(card) {
    const block = (card || {}).conditional_scenarios;
    if (!block) return '<div class="cockpit-note">Chưa có kịch bản có điều kiện từ hợp đồng hiện có cho phiên này.</div>';
    const row = (label, item) => `<div data-case="${escHtml(label)}"><b>${escHtml(label)}</b> ${escHtml((item && item.case_status) || "Chưa có")} <span class="cockpit-note">${escHtml((item && item.reason_code) || "")}</span></div>`;
    return `<div class="ws-conditional-scenarios" data-probability="NOT_EMITTED" data-target-price="NOT_EMITTED">${row("BEAR", block.bear)}${row("BASE", block.base)}${row("BULL", block.bull)}<div class="cockpit-note">Kịch bản có điều kiện. Không phải xác suất và không phải giá mục tiêu.</div></div>`;
  }
  function valuationDiagnosticsHtml(valuation) {
    const val = valuation || {};
    const diagnostics = val.method_diagnostics && typeof val.method_diagnostics === "object" ? val.method_diagnostics : {};
    const methods = Object.entries(diagnostics);
    return `${valuationReadinessHtml(val)}${valuationSummaryHtml(val)}${methods.length
      ? `<div class="ws-valuation-methods" aria-label="Chi tiết phương pháp định giá">${methods.map(([id, method]) => valuationMethodHtml(id, method)).join("")}</div>`
      : (val.supporting_methods && val.supporting_methods.length ? supportingMethodsHtml(val.supporting_methods) : "")}`;
  }
  function fundamentalDiagnosticsHtml(fundamental) {
    const data = fundamental || {};
    const warnings = Array.isArray(data.warnings_blockers) ? data.warnings_blockers : [];
    const state = data.state;
    const fitness = data.research_fitness || data.readiness;
    return `<div class="ws-axis-diagnostic">
      <div><b>Nền tảng doanh nghiệp</b> ${pill(state, "fundamental_state")}</div>
      ${data.trajectory ? `<div class="cockpit-note">Xu hướng lợi nhuận: ${diagnosticText(data.trajectory, "fundamental_trajectory")}</div>` : ""}
      ${fitness ? `<div class="cockpit-note">Chất lượng dữ liệu: ${pill(fitness, "data_fitness")}</div>` : ""}
      ${data.freshness_status ? `<div class="cockpit-note">Độ mới: ${pill(data.freshness_status, "freshness")}</div>` : ""}
      ${warnings.length ? `<div class="ws-diagnostic-blocker">Thiếu/giới hạn:<ul class="cockpit-list">${warnings.slice(0, 3).map((reason) => `<li>${diagnosticReasonHtml(reason)}</li>`).join("")}</ul></div>` : ""}
      ${(data.financial_health || data.current_features || data.peer_relative) ? detailsHtml({ financial_health: data.financial_health, current_features: data.current_features, peer_relative: data.peer_relative, warnings_blockers: warnings }, "Chi tiết kỹ thuật nền tảng") : ""}
    </div>`;
  }
  function retainedItemLabel(item) {
    if (typeof item === "string") {
      const looksLikeEnum = /^[A-Z][A-Z0-9_]+$/.test(item);
      return looksLikeEnum ? diagnosticReasonLabel(item) : item;
    }
    if (!item || typeof item !== "object") return "Chưa có dữ liệu";
    const candidate = item.label || item.title || item.headline || item.summary || item.event_type || item.classification || item.status || item.reason;
    if (candidate === undefined || candidate === null || candidate === "") return "Có dữ liệu được giữ lại";
    return typeof candidate === "string" && /^[A-Z][A-Z0-9_]+$/.test(candidate) ? diagnosticReasonLabel(candidate) : String(candidate);
  }
  function retainedItemsHtml(label, items) {
    if (!Array.isArray(items) || !items.length) return "";
    return `<div class="mt-2"><b>${escHtml(label)}</b><ul class="cockpit-list">${items.slice(0, 3).map((item) => `<li>${escHtml(retainedItemLabel(item))}${typeof item === "object" && item ? detailsHtml(item, "Chi tiết kỹ thuật") : ""}</li>`).join("")}</ul></div>`;
  }
  function catalystDiagnosticsHtml(catalyst) {
    const data = catalyst || {};
    const retained = ["qualified_current_catalysts", "pending_watch_items", "adverse_events", "event_classifications"].some((key) => Array.isArray(data[key]) && data[key].length);
    return `<div class="ws-axis-diagnostic"><b>Chất xúc tác</b> ${pill(data.status, "evidence_state")}
      ${!retained && data.status === "UNAVAILABLE" ? '<div class="cockpit-note">Chưa có dữ liệu chất xúc tác được giữ lại.</div>' : ""}
      ${retainedItemsHtml("Đã ghi nhận", data.qualified_current_catalysts)}
      ${retainedItemsHtml("Nội dung đang theo dõi", data.pending_watch_items)}
      ${retainedItemsHtml("Bối cảnh bất lợi", data.adverse_events)}
      ${retainedItemsHtml("Phân loại sự kiện", data.event_classifications)}
      ${data.freshness_status ? `<div class="cockpit-note">Độ mới: ${pill(data.freshness_status, "freshness")}</div>` : ""}</div>`;
  }
  function liquidityDiagnosticsHtml(liquidity) {
    const data = liquidity || {};
    return `<div class="ws-axis-diagnostic"><b>Thanh khoản nghiên cứu</b> ${pill(data.readiness, "liquidity_state")}
      ${hasRetainedValue(data.current_session_volume) ? `<div class="mt-2"><b>Khối lượng phiên hiện tại</b>: <span data-retained-value="true">${escHtml(formatDiagnosticNumber(data.current_session_volume))}</span></div>` : ""}
      ${data.descriptive_research_state ? `<div class="cockpit-note">Bối cảnh phiên: ${diagnosticText(data.descriptive_research_state, "liquidity_state")}</div>` : ""}
      <div class="mt-2"><b>Năng lực thực hiện lệnh chính xác</b> ${pill(data.exact_execution_capacity_status, "liquidity_state")}</div>
      <div class="cockpit-note">Thanh khoản nghiên cứu không xác lập quy mô lệnh thực hiện.</div>
      ${data.authority_boundary ? detailsHtml(data.authority_boundary, "Chi tiết thẩm quyền thanh khoản") : ""}</div>`;
  }
  function sectorDiagnosticHtml(market) {
    const data = market || {};
    const diagnostic = data.sector_diagnostic || {};
    const context = data.sector_relative_context || {};
    const rows = [];
    if (diagnostic.breadth_support_state) rows.push(`<div class="cockpit-note">Hỗ trợ độ rộng: ${diagnosticText(diagnostic.breadth_support_state, "data_fitness")}</div>`);
    [
      ["Động lượng so với thị trường", diagnostic.market_relative_momentum],
      ["Động lượng so với ngành", diagnostic.sector_relative_momentum],
    ].forEach(([label, metric]) => {
      if (!metric || typeof metric !== "object") return;
      const parts = [];
      if (metric.status) parts.push(diagnosticReasonHtml(metric.status));
      if (hasRetainedValue(metric.momentum_percentile_descriptive)) parts.push(`Phân vị: ${formatDiagnosticNumber(metric.momentum_percentile_descriptive)}`);
      if (hasRetainedValue(metric.peer_median_momentum_20d)) parts.push(`Trung vị: ${formatDiagnosticNumber(metric.peer_median_momentum_20d)}`);
      if (parts.length) rows.push(`<div class="cockpit-note">${escHtml(label)}: ${parts.join(" · ")}</div>`);
    });
    return `${marketContextHtml(context)}${rows.join("")}${Object.keys(diagnostic).length ? detailsHtml(diagnostic, "Chi tiết kỹ thuật thị trường/ngành") : ""}`;
  }
  function booleanDiagnosticHtml(value, yes, no, key) {
    const raw = value === true ? "true" : "false";
    return `<span data-state="${raw}" data-diagnostic="${escHtml(key)}" title="${raw}">${escHtml(value ? yes : no)}</span>`;
  }
  function referenceTriggerHtml(referenceTrigger) {
    const trigger = referenceTrigger || {};
    if (!trigger.trigger_level_exists || !hasRetainedValue(trigger.trigger_level)) {
      return '<div class="cockpit-note">Chưa có mức kích hoạt tham chiếu được giữ lại.</div>';
    }
    return `<div class="ws-reference-trigger" data-trigger-state="${escHtml(trigger.trigger_state || trigger.status || "")}">
      <div><b>Mức kích hoạt tham chiếu</b>: <strong data-retained-value="true">${escHtml(formatDiagnosticNumber(trigger.trigger_level))}</strong></div>
      <div class="cockpit-note">Điều kiện kích hoạt: ${booleanDiagnosticHtml(trigger.trigger_condition_attached, "Đã gắn", "Chưa gắn", "trigger_condition_attached")}</div>
      <div class="cockpit-note">Trạng thái: ${booleanDiagnosticHtml(trigger.trigger_condition_satisfied, "Đã kích hoạt", "Chưa kích hoạt", "trigger_condition_satisfied")}</div>
      <div class="cockpit-note">Quyền mở vị thế: ${booleanDiagnosticHtml(trigger.entry_authority, "Đã được xác lập", "Chưa được xác lập", "entry_authority")}</div>
      <div class="cockpit-note">Mức tham chiếu không tự xác lập quyền mở vị thế.</div>
      ${detailsHtml(trigger, "Chi tiết kỹ thuật mức kích hoạt")}
    </div>`;
  }

  function retainedPrice(card) {
    const candidates = [card && card.current_price, (card || {}).price, ((card || {}).tactical || {}).current_price];
    return candidates.find(hasRetainedValue);
  }
  // PHASE 13 -- compact row cell for "Xu hướng tín hiệu" (Signal Velocity). A ticker with no
  // retained Signal Velocity record reads as a clean "—", never a raw enum or a system error.
  function rowSignalVelocityHtml(card) {
    const state = ((card || {}).signal_velocity || {}).overall_transition_state;
    return hasRetainedValue(state) ? pill(state, "signal_velocity_state") : '<span class="cockpit-note">—</span>';
  }
  // PHASE 13/17 -- compact row cell for "Dòng ngoại – giá". A ticker outside the current flow
  // research cohort reads as "Chưa theo dõi" (a scope fact), never like the flow system failed.
  function rowFlowPriceHtml(card) {
    const flow = (card || {}).flow_price || {};
    if (flow.cohort_membership === "OUTSIDE_CURRENT_FLOW_RESEARCH_COHORT") {
      return '<span class="cockpit-note">Chưa theo dõi</span>';
    }
    return hasRetainedValue(flow.relationship) ? pill(flow.relationship, "flow_price_relationship") : '<span class="cockpit-note">—</span>';
  }
  const MICRO_EXPLANATIONS = {
    "Pha kỹ thuật": "Mô tả bối cảnh giá theo dữ liệu được giữ lại. Đây là bằng chứng nghiên cứu, không phải lệnh mua hoặc bán.",
    "Mức sẵn sàng kỹ thuật": "Cho biết trạng thái thiết lập kỹ thuật hiện có; trạng thái này tách biệt với tư thế nghiên cứu và xác nhận thực tế.",
    "Dấu hiệu": "Các đặc điểm kỹ thuật được giữ lại để hỗ trợ diễn giải, không tạo thẩm quyền giao dịch độc lập.",
    "Khối lượng phiên": "Khối lượng của phiên được giữ lại; không tự xác lập năng lực thực hiện lệnh hoặc thanh khoản đầy đủ.",
    "Định giá": "Định giá tương đối cần được đọc cùng kỳ dữ liệu, nhóm so sánh và các giới hạn được công bố.",
    "Nền tảng": "Tóm tắt trạng thái nền tảng doanh nghiệp theo dữ liệu nghiên cứu được giữ lại.",
    "Mức độ tin cậy của bằng chứng": "Mô tả độ mới và mức đầy đủ của dữ liệu, không phải xác suất giá sẽ tăng hay một điểm dự báo.",
    "Xu hướng tín hiệu": "Cho biết bằng chứng kỹ thuật đang thay đổi thế nào qua nhiều phiên được giữ lại. Đây là xu hướng của bằng chứng, không phải xác suất giá sẽ tăng.",
    "Quan hệ dòng ngoại – giá": "So sánh dòng vốn ngoại ròng (theo VALUE đã xác nhận) với diễn biến giá/cấu trúc kỹ thuật trong cùng phiên. Đây là quan hệ mô tả, không xác định ai đang mua/bán hay vì sao.",
  };
  // PHASE 5 -- state-specific meaning copy for Signal Velocity, distinct from the generic
  // MICRO_EXPLANATIONS hover text above. Only the three states the milestone specifies verbatim
  // copy for are hand-written; every other state falls back to a short generic sentence built
  // from the governed Vietnamese label so nothing is ever left blank.
  const SIGNAL_VELOCITY_STATE_COPY = {
    PERSISTENT_IMPROVEMENT: "Các lớp kỹ thuật đã cải thiện nhất quán qua nhiều quan sát được lưu giữ. Đây là xu hướng của bằng chứng, không phải xác suất giá tăng.",
    EARLY_IMPROVEMENT: "Một hoặc nhiều lớp kỹ thuật vừa cải thiện nhưng chưa đủ chuỗi quan sát để gọi là cải thiện bền bỉ.",
    DETERIORATING: "Nhiều bằng chứng kỹ thuật đang suy yếu hoặc có trạng thái bất lợi.",
  };
  function signalVelocityStateCopy(state) {
    return SIGNAL_VELOCITY_STATE_COPY[state] || `Trạng thái xu hướng tín hiệu: ${formatWorkspaceState(state, "signal_velocity_state")}.`;
  }
  function researchEvidenceQuality(state, why) {
    const label = formatWorkspaceState(state, "research_evidence_completeness");
    const toneMap = { COMPLETE_RETAINED_EVIDENCE: "constructive", PARTIAL_RETAINED_EVIDENCE: "caution", LIMITED_STALE_FLOW_CONTEXT: "caution", INSUFFICIENT_RETAINED_EVIDENCE: "neutral" };
    return { label, tone: toneMap[state] || "neutral", why: why || "Mô tả độ đầy đủ của dữ liệu được giữ lại, không phải xác suất kết quả." };
  }
  function signalVelocitySummaryHtml(card) {
    const velocity = (card || {}).signal_velocity || {};
    const quality = researchEvidenceQuality(velocity.evidence_quality);
    const value = formatWorkspaceState(velocity.overall_transition_state, "signal_velocity_state");
    return `<div class="ws-evidence-summary-item"><div>${helpLabelHtml("Xu hướng tín hiệu")}${evidenceQualityHtml(quality)}</div><strong>${escHtml(value)}</strong><p>${escHtml(signalVelocityStateCopy(velocity.overall_transition_state))}</p></div>`;
  }
  // PHASE 10 -- cohort scope is read from the Producer's own cohort_membership field (never
  // inferred client-side): a ticker outside the configured current-flow research cohort must
  // never read like the flow system failed for it.
  function flowPriceSummaryHtml(card) {
    const flow = (card || {}).flow_price || {};
    const quality = researchEvidenceQuality(flow.evidence_quality);
    const value = formatWorkspaceState(flow.relationship, "flow_price_relationship");
    let description;
    if (flow.cohort_membership === "OUTSIDE_CURRENT_FLOW_RESEARCH_COHORT") {
      description = "Chưa nằm trong phạm vi dữ liệu dòng ngoại hiện hành.";
    } else if (flow.relationship === "FLOW_UNAVAILABLE") {
      description = "Trong nhóm theo dõi dòng ngoại, nhưng dữ liệu phiên hiện tại chưa được ghi nhận.";
    } else {
      description = `Quan hệ dòng ngoại – giá: ${value}.`;
    }
    return `<div class="ws-evidence-summary-item"><div>${helpLabelHtml("Quan hệ dòng ngoại – giá")}${evidenceQualityHtml(quality)}</div><strong>${escHtml(value)}</strong><p>${escHtml(description)}</p></div>`;
  }
  function helpLabelHtml(label) {
    const explanation = MICRO_EXPLANATIONS[label];
    if (!explanation) return escHtml(label);
    return `<span class="ws-help" tabindex="0" data-help="${escHtml(explanation)}" aria-label="${escHtml(label)}. ${escHtml(explanation)}">${escHtml(label)}</span>`;
  }
  function evidenceQuality(card, axis) {
    const lineage = (card && card.lineage) || {};
    const freshness = (lineage.per_axis_freshness || {})[axis];
    const val = (card && card.valuation) || {};
    const fundamental = (card && card.fundamental) || {};
    if (axis === "valuation") {
      if (!val.relative_research_state || val.relative_research_state === "UNAVAILABLE") return { label: "Chưa đủ dữ liệu", tone: "neutral", why: "Chưa có dữ liệu định giá tương đối được giữ lại." };
      if (Number(val.qualified_relative_method_count || 0) > 0) return { label: "Khá", tone: "constructive", why: "Có phương pháp định giá tương đối đủ điều kiện nghiên cứu." };
      return { label: "Hạn chế", tone: "caution", why: "Dữ liệu định giá chỉ dùng làm tham khảo hoặc chưa đủ điều kiện đối sánh." };
    }
    if (axis === "fundamental") {
      if (!fundamental.state || fundamental.state === "UNAVAILABLE") return { label: "Chưa đủ dữ liệu", tone: "neutral", why: "Chưa có nền tảng doanh nghiệp đủ để diễn giải." };
      if (freshness === "CURRENT") return { label: "Hiện hành", tone: "constructive", why: "Nền tảng doanh nghiệp có dữ liệu cùng phiên dữ liệu." };
      return { label: "Hạn chế", tone: "caution", why: "Nền tảng doanh nghiệp không thuộc phiên hiện tại hoặc có giới hạn được giữ lại." };
    }
    if (!card || !card.entry_state) return { label: "Chưa đủ dữ liệu", tone: "neutral", why: "Chưa có trạng thái kỹ thuật được giữ lại." };
    if (freshness === "CURRENT") return { label: "Hiện hành", tone: "constructive", why: "Trạng thái kỹ thuật được giữ lại cho phiên dữ liệu hiện tại." };
    return { label: "Hạn chế", tone: "caution", why: "Trạng thái kỹ thuật không thuộc phiên hiện tại hoặc có giới hạn độ mới." };
  }
  function evidenceQualityHtml(quality) {
    return `<span class="ws-evidence-quality tone-${escHtml(quality.tone)}" tabindex="0" data-help="${escHtml(quality.why)}" aria-label="Mức độ tin cậy của bằng chứng: ${escHtml(quality.label)}. ${escHtml(quality.why)}">${escHtml(quality.label)}</span>`;
  }
  function valuationEvidenceSummaryHtml(val) {
    const methods = (val && val.supporting_methods) || [];
    const method = methods.find((item) => item && hasRetainedValue(item.value));
    const summary = (val && val.valuation_summary) || {};
    const count = Number(summary.available_method_count || (val && val.usable_relative_method_count)) || 0;
    const value = method ? `${method.method}: ${formatDiagnosticNumber(method.value)}×` : (count ? `${count} phương pháp có dữ liệu` : "Chưa có chỉ số được giữ lại");
    return `<div class="ws-evidence-summary-item"><div>${helpLabelHtml("Định giá")}${evidenceQualityHtml(evidenceQuality({ valuation: val }, "valuation"))}</div><strong>${escHtml(value)}</strong><p>${escHtml(formatWorkspaceState((val || {}).relative_research_state, "valuation_state"))}</p></div>`;
  }
  function evidenceSummaryHtml(card) {
    const fundamental = (card && card.fundamental) || {};
    const technical = evidenceQuality(card, "tactical");
    const foundation = evidenceQuality(card, "fundamental");
    return `<section class="ws-evidence-summary" aria-label="Tóm tắt bằng chứng">
      <div class="ws-evidence-summary-item"><div>${helpLabelHtml("Nền tảng")}${evidenceQualityHtml(foundation)}</div><strong>${escHtml(formatWorkspaceState(fundamental.state, "fundamental_state"))}</strong><p>${escHtml(formatWorkspaceState(fundamental.trajectory, "fundamental_trajectory"))}</p></div>
      ${valuationEvidenceSummaryHtml((card || {}).valuation || {})}
      <div class="ws-evidence-summary-item"><div>${helpLabelHtml("Mức độ tin cậy của bằng chứng")}${evidenceQualityHtml(technical)}</div><strong>${escHtml(formatWorkspaceState((card || {}).entry_state, "tactical_state"))}</strong><p>${escHtml(technical.why)}</p></div>
      ${signalVelocitySummaryHtml(card)}
      ${flowPriceSummaryHtml(card)}
    </section>`;
  }
  function technicalSnapshotHtml(card) {
    const tactical = (card || {}).tactical || {};
    const liquidity = (card || {}).liquidity || {};
    const rows = [];
    if (tactical.primary_entry_state || card.entry_state) rows.push(["Pha kỹ thuật", formatWorkspaceState(tactical.primary_entry_state || card.entry_state, "tactical_state")]);
    if (card.entry_action) rows.push(["Mức sẵn sàng kỹ thuật", formatWorkspaceState(card.entry_action, "entry_action")]);
    if (Array.isArray(card.setup_tags) && card.setup_tags.length) rows.push(["Dấu hiệu", card.setup_tags.slice(0, 2).map((item) => formatWorkspaceState(item, "setup_tag")).join(" · ")]);
    if (hasRetainedValue(liquidity.current_session_volume)) rows.push(["Khối lượng phiên", formatDiagnosticNumber(liquidity.current_session_volume)]);
    return rows.length ? `<div class="ws-technical-snapshot">${rows.map(([label, value]) => `<div><span>${helpLabelHtml(label)}</span><strong>${escHtml(value)}</strong></div>`).join("")}</div>` : '<p class="cockpit-note">Chưa có chỉ báo kỹ thuật hiện hành được giữ lại.</p>';
  }
  function selectedSignalEvidenceHtml(snapshot, ticker, session, registry, candleApi) {
    if (!snapshot || snapshot.scan_date !== session) {
      return '<p class="ws-signal-unavailable">Chưa có mẫu hình nến hoặc cấu trúc dòng tiền (SMC) hiện hành.</p>';
    }
    const row = ((snapshot.watchlist || []).find((item) => String(item.ticker || "").toUpperCase() === String(ticker || "").toUpperCase()));
    if (!row || (!(row.patterns || []).length && !(row.smc || []).length)) {
      return '<p class="ws-signal-unavailable">Chưa có mẫu hình nến hoặc cấu trúc dòng tiền (SMC) hiện hành.</p>';
    }
    const patterns = (row.patterns || []).map((key) => (registry || {})[key]).filter(Boolean);
    const smc = (row.smc || []).map((key) => ({ key, info: candleApi && candleApi.smcInfo ? candleApi.smcInfo(key) : null })).filter((item) => item.info);
    return `<section class="ws-signal-evidence" data-signal-session="${escHtml(snapshot.scan_date)}">
      <h6>Mẫu hình nến hiện tại</h6>
      ${patterns.length ? `<div class="ws-signal-chip-row">${patterns.map((pattern) => `<span class="ws-signal-chip"><b>${escHtml(pattern.name_vi || "Mẫu hình nến")}</b> <small>(${escHtml(pattern.name || pattern.key)})</small><em>${escHtml(candleApi && candleApi.directionLabel ? candleApi.directionLabel(pattern.direction, false) : pattern.direction || "")}</em></span>`).join("")}</div>` : '<p class="cockpit-note">Chưa có mẫu hình nến hiện hành được gắn nhãn.</p>'}
      <h6 class="mt-3">SMC hiện hành</h6>
      ${smc.length ? `<div class="ws-signal-chip-row">${smc.map((item) => `<span class="ws-signal-chip" title="${escHtml(item.info.tooltip)}"><b>${escHtml(item.info.vi)}</b> <small>(${escHtml(item.info.abbr)})</small></span>`).join("")}</div>` : '<p class="cockpit-note">Chưa có SMC hiện hành trong tập khái niệm được hỗ trợ.</p>'}
      <p class="cockpit-note mt-2">Bằng chứng hỗ trợ kỹ thuật, không phải thẩm quyền mua/bán độc lập.</p>
    </section>`;
  }

  // PHASE 6 -- deep evidence detail for Signal Velocity. acceleration_state is always
  // NOT_EVALUABLE_CATEGORICAL_ONLY on the retained contract; it is rendered only here (never in
  // the primary compact row) as a fixed sentence, never the raw enum.
  function axisListHtml(axes) {
    return Array.isArray(axes) && axes.length
      ? `<ul class="cockpit-list">${axes.map((a) => `<li>${escHtml(axisDisplayLabel(a))}</li>`).join("")}</ul>`
      : '<span class="cockpit-note">Chưa có trục nào được ghi nhận</span>';
  }
  function signalVelocityDeepHtml(card) {
    const velocity = (card || {}).signal_velocity || {};
    const span = velocity.retained_session_span || {};
    return `
      <div class="cockpit-grid mb-2">
        ${kpiHtml("Xu hướng tín hiệu", formatWorkspaceState(velocity.overall_transition_state, "signal_velocity_state"))}
        ${kpiHtml("Mức độ tin cậy của bằng chứng", formatWorkspaceState(velocity.evidence_quality, "research_evidence_completeness"))}
      </div>
      <div class="cockpit-note mb-2">${escHtml(signalVelocityStateCopy(velocity.overall_transition_state))}</div>
      <div class="mt-1"><b>Số quan sát hợp lệ</b> ${escHtml(unavailableText(velocity.valid_observation_count))}</div>
      <div class="mt-1"><b>Khoảng phiên được lưu giữ</b> ${hasRetainedValue(span.first) || hasRetainedValue(span.last) ? `${escHtml(unavailableText(span.first))} → ${escHtml(unavailableText(span.last))}` : "Chưa có dữ liệu"}</div>
      <div class="mt-1"><b>Tính liên tục</b> ${pill(velocity.continuity_state, "continuity_state")}</div>
      <div class="mt-1"><b>Chuyển trạng thái gần nhất</b> ${pill(velocity.latest_transition, "transition_direction")}</div>
      <div class="mt-1"><b>Độ bền của xu hướng</b> ${pill(velocity.persistence, "trajectory_persistence")}</div>
      <div class="mt-2"><b>Trục ủng hộ độc lập</b>${axisListHtml(velocity.independent_supporting_axes)}</div>
      <div class="mt-2"><b>Trục mâu thuẫn</b>${axisListHtml(velocity.contradicting_axes)}</div>
      <div class="mt-2 cockpit-note">Gia tốc: chưa thể đánh giá từ dữ liệu phân loại.</div>
      <div class="mt-2 cockpit-note">Xu hướng của bằng chứng được lưu giữ, không phải xác suất giá tăng hay dự báo.</div>`;
  }
  // PHASE 6/10/21 -- deep evidence detail for Flow-Price Divergence, including the cohort-scope
  // explanation that must never read like the flow acquisition system failed for an out-of-scope
  // ticker.
  function flowPriceDeepHtml(card) {
    const flow = (card || {}).flow_price || {};
    const freshness = flow.flow_freshness || {};
    const outsideCohort = flow.cohort_membership === "OUTSIDE_CURRENT_FLOW_RESEARCH_COHORT";
    return `
      <div class="cockpit-grid mb-2">
        ${kpiHtml("Quan hệ dòng ngoại – giá", formatWorkspaceState(flow.relationship, "flow_price_relationship"))}
        ${kpiHtml("Mức độ tin cậy của bằng chứng", formatWorkspaceState(flow.evidence_quality, "research_evidence_completeness"))}
      </div>
      <div class="mt-1"><b>Phạm vi theo dõi dòng ngoại</b> ${pill(flow.cohort_membership, "flow_cohort_membership")}</div>
      <div class="cockpit-note mb-2">${outsideCohort
        ? "Dòng ngoại hiện được thu thập cho nhóm theo dõi nghiên cứu đã xác định trước phiên. Mã này chưa nằm trong nhóm đó."
        : "Mã này thuộc nhóm theo dõi dòng ngoại hiện hành."}</div>
      <div class="mt-1"><b>Phiên tham chiếu</b> ${escHtml(unavailableText(flow.reference_session))}</div>
      <div class="mt-1"><b>Trạng thái dòng ngoại ròng</b> ${pill(flow.foreign_flow_state, "foreign_flow_state")}</div>
      <div class="mt-1"><b>Độ bền dòng ngoại</b> ${pill(flow.flow_persistence, "flow_persistence")}</div>
      <div class="mt-1"><b>Phiên dòng ngoại đủ điều kiện gần nhất</b> ${escHtml(unavailableText(flow.latest_qualified_flow_session))} ${freshness.status ? `· ${pill(freshness.status, "freshness")}` : ""}</div>
      <div class="mt-1"><b>Trạng thái giá/xu hướng tín hiệu</b> ${pill(flow.price_velocity_state, "signal_velocity_state")}</div>
      <div class="mt-1"><b>Bối cảnh xác nhận</b> ${pill(flow.participation_context, "flow_participation_context")}</div>
      <div class="mt-1"><b>Thị trường hỗ trợ</b> ${pill(flow.market_support, "market_sector_support_state")} · <b>Ngành hỗ trợ</b> ${pill(flow.sector_support, "market_sector_support_state")}</div>
      <div class="mt-2"><b>Giới hạn</b>${listHtml(flow.limitations, "rule_condition")}</div>
      <div class="cockpit-note mt-2">Quan hệ mô tả giữa dòng vốn ngoại ròng theo VALUE và giá/cấu trúc kỹ thuật — không xác định ai đang mua/bán hay vì sao, và không phải khuyến nghị mua/bán.</div>`;
  }

  // DASHBOARD_INVESTOR_FIRST_PRESENTATION_SIMPLIFICATION_V1: renders one slot from the
  // Producer's indicator_metric_display_state/v1 bridge (card.display_metrics, labelled via
  // the workspace artifact's own display_metric_catalog). An important metric never
  // disappears merely because its value is unavailable -- it renders its governed state
  // text instead (see METRIC_DISPLAY_STATE_MAP in value-format.js).
  const METRIC_VALUE_DOMAIN = Object.freeze({
    technical_trend_entry_state: "tactical_state",
    technical_invalidation: "invalidation_state",
    signal_velocity_state: "signal_velocity_state",
    foreign_flow_state: "foreign_flow_state",
    flow_price_relationship: "flow_price_relationship",
    flow_persistence_5session: "flow_persistence",
  });
  const METRIC_PERCENT_IDS = new Set(["gross_margin", "net_margin", "roe", "roa", "revenue_growth_yoy", "net_income_growth_yoy"]);
  const METRIC_MULTIPLE_IDS = new Set(["pe_ttm", "pb", "ps_ttm", "ev_sales", "ev_ebitda", "debt_to_equity", "cash_to_assets"]);

  function metricValueHtml(metricId, value) {
    if (METRIC_VALUE_DOMAIN[metricId]) return escHtml(formatWorkspaceState(value, METRIC_VALUE_DOMAIN[metricId]));
    if (typeof value === "number" && Number.isFinite(value)) {
      if (METRIC_PERCENT_IDS.has(metricId)) return `${escHtml(new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value * 100))}%`;
      if (METRIC_MULTIPLE_IDS.has(metricId)) return `${escHtml(formatDiagnosticNumber(value))}x`;
      return escHtml(formatDiagnosticNumber(value));
    }
    return escHtml(String(value ?? ""));
  }

  function sourceRecordForMetric(card, metricId) {
    const features = ((card || {}).fundamental || {}).current_features || {};
    const methods = ((card || {}).valuation || {}).method_diagnostics || {};
    const published = {
      pe_ttm: methods["P/E_TTM"],
      ps_ttm: methods["P/S_TTM"],
      pb: methods["P/B"],
      ev_sales: methods["EV/Sales"],
      ev_ebitda: methods["EV/EBITDA"],
      roa: features.roa_eop_proxy || features.return_on_assets,
      roe: features.roe_eop_proxy || features.return_on_equity,
    };
    return published[metricId] || null;
  }

  function metricSlotHtml(displayMetrics, catalog, metricId, sourceRecord) {
    const record = (displayMetrics || {})[metricId];
    if (!record) return "";
    const label = ((catalog || {})[metricId] || {}).label || metricId;
    const sourceClassified = sourceRecord ? financialStatusLabel(sourceRecord) : { label: "", kind: "published" };
    const displayClassified = financialStatusLabel(record);
    const guard = sourceClassified.kind !== "published" ? sourceClassified : displayClassified;
    const isAvailable = record.display_state === "AVAILABLE" && guard.kind === "published";
    let valueHtml;
    if (isAvailable) {
      valueHtml = metricValueHtml(metricId, record.value);
    } else if (guard.label) {
      const reason = sourceRecord && Array.isArray(sourceRecord.blocker_reason_codes) && sourceRecord.blocker_reason_codes[0]
        ? ` · ${diagnosticReasonLabel(sourceRecord.blocker_reason_codes[0])}`
        : "";
      const retainedSource = sourceRecord && hasRetainedValue(sourceRecord.value) ? sourceRecord.value : null;
      const retainedDisplay = guard.kind === "proxy" && hasRetainedValue(record.value) ? record.value : null;
      const retained = retainedSource !== null ? retainedSource : retainedDisplay;
      const retainedHtml = retained !== null ? ` · ${metricValueHtml(metricId, retained)}` : "";
      valueHtml = `<span class="cockpit-note">${escHtml(`${guard.label}${reason}`)}</span>${retainedHtml}`;
    } else {
      valueHtml = `<span class="cockpit-note">${escHtml(formatWorkspaceState(record.display_state, "metric_display_state"))}</span>`;
    }
    const stateAttr = guard.kind === "published" ? record.display_state : ((sourceRecord && sourceRecord.status) || record.display_state);
    return `<div class="ws-metric-slot" data-metric-id="${escHtml(metricId)}" data-metric-state="${escHtml(stateAttr)}">`
      + `<span class="ws-metric-label">${escHtml(label)}</span><span class="ws-metric-value">${valueHtml}</span></div>`;
  }

  // Every id in metricIds always renders a slot as long as the Producer bridge supplied a
  // record for it -- an unavailable metric shows its governed state, it is never dropped
  // from the grid (the milestone's "ABSOLUTE RULE": capability existence and current value
  // availability are separate concepts). Returns "" only when the bridge itself is entirely
  // absent (an older artifact/fixture without display_metrics), never for a partial result.
  function investorMetricsGridHtml(card, options, metricIds, groupLabel) {
    const displayMetrics = (card || {}).display_metrics;
    const catalog = (options || {}).displayMetricCatalog;
    if (!displayMetrics || !catalog) return "";
    const rows = metricIds.map((id) => metricSlotHtml(displayMetrics, catalog, id, sourceRecordForMetric(card, id))).join("");
    return `<div class="ws-metric-group"><h6>${escHtml(groupLabel)}</h6><div class="ws-metric-grid">${rows}</div></div>`;
  }

  function returnBalanceKind(featureId, feature) {
    const method = String((feature && feature.method) || "");
    const warnings = Array.isArray(feature && feature.warnings) ? feature.warnings.join(" ") : "";
    const blob = `${featureId} ${method} ${warnings}`.toLowerCase();
    const equity = /(^|_)roe($|_)|return_on_equity/.test(featureId) && !/roa|return_on_assets|asset/.test(featureId);
    const name = /roa|return_on_assets/.test(featureId) || (!equity && /asset/.test(blob) && /roa|return/.test(featureId))
      ? "ROA"
      : (equity || /roe|return_on_equity/.test(featureId) ? "ROE" : null);
    if (!name) return null;
    if (/annual/.test(blob)) return { name, balance: "annualized", phrase: "đã quy năm" };
    if (/average|avg_/.test(blob)) {
      return { name, balance: equity ? "average-equity" : "average-assets", phrase: equity ? "vốn bình quân" : "tài sản bình quân" };
    }
    if (/eop|ending|end_of_period|ending_balance/.test(blob)) {
      return { name, balance: equity ? "ending-equity" : "ending-assets", phrase: equity ? "vốn cuối kỳ" : "tài sản cuối kỳ" };
    }
    return { name, balance: "unspecified", phrase: "phương pháp mẫu số chưa được công bố" };
  }

  function reportedPeriodText(feature) {
    const periods = Array.isArray(feature && feature.input_periods) ? feature.input_periods.filter((period) => period !== null && period !== undefined && period !== "") : [];
    if (periods.length) return periods.join(", ");
    if (feature && feature.period_basis) return String(feature.period_basis);
    if (feature && feature.reporting_period) return String(feature.reporting_period);
    return "";
  }

  function returnBalanceMetricsHtml(fundamental) {
    const features = fundamental && fundamental.current_features;
    if (!features || typeof features !== "object" || Array.isArray(features)) return "";
    const preferred = [
      "roa_eop_proxy", "roe_eop_proxy", "same_provider_roa", "same_provider_roe",
      "same_provider_roa_eop_proxy", "same_provider_roe_eop_proxy",
      "same_provider_roa_avg_assets", "same_provider_roe_avg_equity",
      "roa_annualized", "roe_annualized", "return_on_assets", "return_on_equity",
    ];
    const ids = [];
    preferred.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(features, id)) ids.push(id);
    });
    Object.keys(features).sort().forEach((id) => {
      if (!ids.includes(id) && /roa|roe|return_on_assets|return_on_equity/i.test(id)) ids.push(id);
    });
    const rows = ids.map((id) => {
      const feature = features[id] || {};
      const kind = returnBalanceKind(id, feature);
      if (!kind) return "";
      const classified = financialStatusLabel(feature);
      const statusLabel = classified.label || "Có dữ liệu nghiên cứu";
      const period = reportedPeriodText(feature);
      const reason = Array.isArray(feature.blocker_reason_codes) && feature.blocker_reason_codes[0]
        ? diagnosticReasonLabel(feature.blocker_reason_codes[0])
        : "";
      const metricId = kind.name === "ROE" ? "roe" : "roa";
      const valueHtml = hasRetainedValue(feature.value)
        ? `<strong class="ws-diagnostic-value" data-retained-value="true">${metricValueHtml(metricId, feature.value)}</strong>`
        : `<span class="cockpit-note ws-diagnostic-value">Chưa có số liệu được công bố</span>`;
      return `<article class="ws-valuation-method ws-return-metric" data-metric-id="${escHtml(id)}" data-balance="${escHtml(kind.balance)}" data-return-name="${escHtml(kind.name)}">
        <div class="ws-valuation-method-head"><strong>${escHtml(kind.name)}</strong>${diagnosticPill(feature.status || classified.kind, statusLabel, classified.tone || "neutral")}</div>
        <div class="ws-valuation-method-value">${valueHtml}</div>
        <div class="cockpit-note ws-diagnostic-context">${escHtml(kind.phrase)}${period ? ` · Kỳ ${escHtml(period)}` : ""}</div>
        ${reason ? `<div class="cockpit-note ws-diagnostic-blocker">${escHtml(reason)}</div>` : ""}
      </article>`;
    }).join("");
    return rows ? `<div class="ws-valuation-methods" aria-label="ROA và ROE theo phương pháp đã công bố">${rows}</div>` : "";
  }

  function decisionCardHtml(card, options) {
    const opts = options || {};
    const ticker = String((opts.ticker || (card && card.ticker) || "")).trim().toUpperCase();
    if (!card) {
      return `<div class="cockpit-note" data-drawer-unavailable="true">Không có thẻ Cơ hội cho ${escHtml(ticker) || "UNKNOWN"}. Không chọn mã thay thế.</div>`;
    }
    const portfolio = opts.portfolio || card.portfolio || { evaluated: false, status: "NOT_EVALUATED" };
    const val = card.valuation || {};
    const why = card.why || {};
    const fundamental = card.fundamental || why.fundamental_evidence || {};
    const catalyst = card.catalyst || why.catalyst_evidence || {};
    const liquidity = card.liquidity || {};
    const marketSector = card.market_sector || why.market_sector_evidence || {};
    const referenceTrigger = card.reference_trigger || (card.tactical || {}).reference_trigger || (why.tactical_evidence || {}).reference_trigger || {};
    const sourceArtifacts = opts.sourceArtifacts || {};
    const price = retainedPrice(card);
    const invalidation = ((card.invalidation || {}).technical || {});
    const technicalQuality = evidenceQuality(card, "tactical");
    const foundationQuality = evidenceQuality(card, "fundamental");
    // PHASE 14 (DASHBOARD_PAYLOAD_COMPACTION_AND_INVESTOR_FIRST_IA_V1): the primary (always
    // visible) detail is organized around exactly 5 investor-facing sections -- never around
    // backend engine/module names -- with every deeper diagnostic collapsed into ONE "Chi tiết
    // phân tích" disclosure below them (merging what used to be two separate <details>).
    return `
          <section class="ws-drawer-overview" aria-label="Tóm tắt quyết định" data-decision-ticker="${escHtml(ticker)}">
            <div class="ws-drawer-overview-head"><div><div class="section-eyebrow">Tóm tắt nghiên cứu</div><h4>${escHtml(ticker)} <span>${sectorDisplayHtml(card.sector)}</span></h4></div>${actionPostureHtml(card)}</div>
            <div class="ws-drawer-keyline">${evidenceCurrencyHtml(card.evidence_currency)} · ${opportunityPriorityHtml(card)}</div>
            <div class="ws-drawer-keyline">${pill(card.entry_state, "tactical_state")} · ${pill(card.research_stance_readiness, "research_readiness")} · ${pill(card.entry_action, "entry_action")} · ${researchScreenHtml(card)}</div>
            <div class="ws-drawer-facts">${hasRetainedValue(price) ? `<span>Giá hiện tại <b>${escHtml(formatDiagnosticNumber(price))}</b></span>` : ""}${hasRetainedValue(referenceTrigger.trigger_level) ? `<span>Kích hoạt tham chiếu <b>${escHtml(formatDiagnosticNumber(referenceTrigger.trigger_level))}</b></span>` : ""}${invalidation.boundary_type ? `<span>Vô hiệu <b>${escHtml(conditionHeadline(invalidation).label)}</b></span>` : ""}</div>
            <p>${escHtml(`Quyết định hành động: ${actionPostureLabel(card)} (${evidenceCurrencyLabel(card.evidence_currency)}).`)}</p>
            <ul>${compactReasons(card, 3).map((reason) => `<li>${escHtml(reason)}</li>`).join("")}</ul>
          </section>

          <section class="ws-section" aria-labelledby="ws-section-price-${escHtml(ticker)}">
            <h5 id="ws-section-price-${escHtml(ticker)}" class="ws-section-title">Giá &amp; xu hướng</h5>
            ${technicalSnapshotHtml(card)}
            <div class="ws-evidence-summary-item"><div>${helpLabelHtml("Mức độ tin cậy của bằng chứng")}${evidenceQualityHtml(technicalQuality)}</div><strong>${escHtml(formatWorkspaceState(card.entry_state, "tactical_state"))}</strong><p>${escHtml(technicalQuality.why)}</p></div>
            <div class="ws-selected-signal" data-selected-signal-for="${escHtml(ticker)}"><p class="cockpit-note">Đang kiểm tra mẫu hình nến và cấu trúc dòng tiền (SMC)…</p></div>
          </section>

          <section class="ws-section" aria-labelledby="ws-section-signal-${escHtml(ticker)}">
            <h5 id="ws-section-signal-${escHtml(ticker)}" class="ws-section-title">Tín hiệu &amp; động lượng</h5>
            ${signalVelocitySummaryHtml(card)}
          </section>

          <section class="ws-section" aria-labelledby="ws-section-flow-${escHtml(ticker)}">
            <h5 id="ws-section-flow-${escHtml(ticker)}" class="ws-section-title">Dòng tiền</h5>
            ${flowPriceSummaryHtml(card)}
            ${investorMetricsGridHtml(card, opts, ["foreign_flow_state", "flow_price_relationship", "flow_persistence_5session"], "Chi tiết")}
          </section>

          <section class="ws-section" aria-labelledby="ws-section-fundamentals-${escHtml(ticker)}">
            <h5 id="ws-section-fundamentals-${escHtml(ticker)}" class="ws-section-title">Cơ bản &amp; định giá</h5>
            <div class="ws-evidence-summary-item"><div>${helpLabelHtml("Nền tảng")}${evidenceQualityHtml(foundationQuality)}</div><strong>${escHtml(formatWorkspaceState(fundamental.state, "fundamental_state"))}</strong><p>${escHtml(formatWorkspaceState(fundamental.trajectory, "fundamental_trajectory"))}</p></div>
            ${valuationEvidenceSummaryHtml(val)}
            ${investorMetricsGridHtml(card, opts, ["gross_margin", "net_margin", "revenue_growth_yoy", "net_income_growth_yoy", "operating_cash_flow_sign", "roe", "roa", "debt_to_equity", "ebitda"], "Cơ bản")}
            ${returnBalanceMetricsHtml(fundamental)}
            ${investorMetricsGridHtml(card, opts, ["pe_ttm", "pb", "ps_ttm", "ev_sales", "ev_ebitda"], "Định giá")}
          </section>

          <section class="ws-section" aria-labelledby="ws-section-scenario-${escHtml(ticker)}">
            <h5 id="ws-section-scenario-${escHtml(ticker)}" class="ws-section-title">Kịch bản &amp; mốc quan trọng</h5>
            ${conditionalScenarioHtml(card)}
            <div class="cockpit-grid mb-2">
              ${kpiHtml("Mức kích hoạt tham chiếu", hasRetainedValue(referenceTrigger.trigger_level) ? formatDiagnosticNumber(referenceTrigger.trigger_level) : "Chưa có dữ liệu")}
              ${kpiHtml("Trạng thái kích hoạt", pill(referenceTrigger.trigger_state || referenceTrigger.status, "confirmation_state"))}
            </div>
            <div class="mt-1"><b>Vô hiệu kỹ thuật</b> ${pill(((card.invalidation || {}).technical || {}).status, "invalidation_state")}</div>
            <div class="mt-1"><b>Vô hiệu nền tảng doanh nghiệp</b> ${pill(((card.invalidation || {}).fundamental || {}).status, "invalidation_state")}</div>
            <div class="cockpit-note mt-2">Mức tham chiếu không tự xác lập quyền mở vị thế — chỉ trạng thái đã kích hoạt mới có thể nâng tư thế nghiên cứu.</div>
            <div class="mt-2 cockpit-note">Hồ sơ nghiên cứu dự kiến: ${pill((card.prospective_case || {}).status, "prospective_case")} · vòng đời luận điểm: ${escHtml(formatWorkspaceState((card.prospective_case || {}).thesis_lifecycle_state, "prospective_case"))}</div>
          </section>

          <details class="ws-deep-evidence"><summary>Dữ liệu &amp; phương pháp</summary><div class="cockpit-detail-grid">
            <div class="card"><div class="card-header"><h6>Quyết định</h6></div><div class="card-body">
              <b>Mã</b> ${escHtml(ticker)} · <b>Ngành</b> ${sectorDisplayHtml(card.sector)}<br>
              <div class="mt-1"><b>Phạm vi nghiên cứu chính thức</b> ${card.official_research_scope ? pill(card.official_research_scope.scope_bucket, "official_scope") : pill(null, "official_scope")}${
                card.official_research_scope && card.official_research_scope.current_research_scope_reason
                  ? ` <span class="cockpit-note">${escHtml(card.official_research_scope.current_research_scope_reason)}</span>` : ""
              }</div>
              <div class="mt-1"><b>Quyết định hành động</b> ${actionPostureHtml(card)} ${evidenceCurrencyHtml(card.evidence_currency)} <span class="cockpit-note">(quyết định chính, từ Quyết định tích hợp)</span></div>
              <div class="mt-1"><b>Vị thế</b> ${pill(((card.position_context || {}).position_state) || "UNKNOWN_POSITION_NOT_SUPPLIED", "position_context")} · ${opportunityPriorityHtml(card)}</div>
              <div class="mt-1"><b>Sàng lọc nghiên cứu (phụ)</b> ${researchScreenLabel(card) === formatWorkspaceState(card.research_stance, "research_stance") ? pill(card.research_stance, "research_stance") : researchScreenHtml(card)} <span class="cockpit-note">(bối cảnh sàng lọc/ứng viên, không phải quyết định hành động)</span></div>
              <div class="mt-1"><b>Mức sẵn sàng kỹ thuật</b> ${pill(card.entry_action, "entry_action")} <span class="cockpit-note">thiết lập kỹ thuật: ${pill(card.entry_state, "tactical_state")}</span>${VETO_RESEARCH_STANCES.has(card.research_stance) ? ' <span class="cockpit-state blocked">Không phải tín hiệu mua</span>' : ""}</div>
              ${stanceEntryGuidance(card.research_stance, card.entry_action) ? `<div class="cockpit-note mt-2">${escHtml(stanceEntryGuidance(card.research_stance, card.entry_action))}</div>` : ""}
              <div class="mt-2"><b>Lý do xác định (bằng chứng ủng hộ)</b>${listHtml(why.deterministic_reasons, "rule_condition")}</div>
              <div class="mt-2"><b>Bối cảnh đối trọng</b>${listHtml(why.counterbalancing_context, "rule_condition")}</div>
              <div class="mt-2"><b>Cảnh báo</b>${listHtml((card.counter_thesis || {}).warnings, "rule_condition")}</div>
              <div class="mt-2"><b>Phản luận chính</b>${listHtml((card.counter_thesis || {}).key_counter_thesis, "rule_condition")}</div>
              <div class="mt-2"><b>Trục chưa có dữ liệu</b>${listHtml((card.counter_thesis || {}).unavailable_dimensions, "rule_condition")}</div>
              <div class="mt-2 cockpit-note">kết quả phía trước: ${pill((card.prospective_case || {}).forward_outcome_status, "prospective_case")}</div>
            </div></div>
            <div class="card"><div class="card-header"><h6>Doanh nghiệp</h6></div><div class="card-body">
              ${fundamentalDiagnosticsHtml(fundamental)}
            </div></div>
            <div class="card"><div class="card-header"><h6>Định giá</h6></div><div class="card-body">
              <div class="mb-2"><b>Trạng thái định giá tương đối</b> ${pill(val.relative_research_state, "valuation_state")}</div>
              ${valuationDiagnosticsHtml(val)}
            </div></div>
            <div class="card"><div class="card-header"><h6>Kỹ thuật</h6></div><div class="card-body">
              <b>Kỹ thuật</b> ${pill((why.tactical_evidence || {}).primary_entry_state, "tactical_state")}<br>
              <div class="mt-2"><b>Nhãn thiết lập</b>${listHtml(card.setup_tags, "setup_tag")}</div>
              <div class="mt-2"><b>Thị trường/ngành</b> ${sectorDiagnosticHtml(marketSector)}</div>
            </div></div>
            <div class="card"><div class="card-header"><h6>Xu hướng tín hiệu</h6></div><div class="card-body">
              ${signalVelocityDeepHtml(card)}
            </div></div>
            <div class="card"><div class="card-header"><h6>Kích hoạt / Vô hiệu</h6></div><div class="card-body">
              <div class="cockpit-grid mb-2">${kpiHtml("Trạng thái biên", pill((card.confirmation || {}).status, "confirmation_state"))}${kpiHtml("Trạng thái kích hoạt thực tế", pill((card.confirmation || {}).confirmation_trigger_state, "confirmation_state"))}</div>
              <div class="cockpit-note mb-2">Trạng thái biên cho biết điều kiện kích hoạt đã được gắn (có giá trị/toán tử cơ sở) — không phải bằng chứng điều kiện đã kích hoạt. Chỉ trạng thái đã kích hoạt mới có thể nâng tư thế nghiên cứu lên ứng viên mở vị thế.</div>
              ${conditionVisibleHtml(card.confirmation || {})}
              <hr class="my-3">
              <b>Mức kích hoạt tham chiếu</b>
              ${referenceTriggerHtml(referenceTrigger)}
              <hr class="my-3">
              <b>${((card.invalidation || {}).technical || {}).semantic === "STANCE_RECONSIDERATION_WATCH" ? "Điều gì sẽ làm tư thế này đáng xem xét lại" : "Kỹ thuật (vô hiệu luận điểm)"}</b> ${pill(((card.invalidation || {}).technical || {}).status, "invalidation_state")}
              ${((card.invalidation || {}).technical || {}).semantic === "STANCE_RECONSIDERATION_WATCH" ? '<div class="cockpit-note mb-1">Tư thế này là điều kiện cấm mở vị thế mới, không có luận điểm dài hạn để vô hiệu — biên này cho biết khi nào lệnh cấm đáng được xem xét lại, không phải điều kiện vô hiệu luận điểm.</div>' : ""}
              ${conditionVisibleHtml((card.invalidation || {}).technical || {})}
              <b>Nền tảng doanh nghiệp</b> ${pill(((card.invalidation || {}).fundamental || {}).status, "invalidation_state")}
              ${conditionVisibleHtml((card.invalidation || {}).fundamental || {})}
            </div></div>
            <div class="card"><div class="card-header"><h6>Chất xúc tác</h6></div><div class="card-body">
              ${catalystDiagnosticsHtml(catalyst)}
            </div></div>
            <div class="card"><div class="card-header"><h6>Thanh khoản</h6></div><div class="card-body">
              ${liquidityDiagnosticsHtml(liquidity)}
            </div></div>
            <div class="card"><div class="card-header"><h6>Quan hệ dòng ngoại – giá</h6></div><div class="card-body">
              ${flowPriceDeepHtml(card)}
            </div></div>
            <div class="card"><div class="card-header"><h6>Danh mục</h6></div><div class="card-body">
              ${portfolio && portfolio.evaluated ? `
                ${pill(portfolio.status, "portfolio_state")} · Nắm giữ: ${pill(portfolio.holding_status, "portfolio_state")} ${portfolio.weight != null ? `(${escHtml(portfolio.weight)})` : ""}<br>
                <b>Tập trung ngành (hiện có)</b> ${escHtml(portfolio.existing_sector_concentration_weight)}<br>
                <b>Tập trung kỹ thuật</b>${listHtml(Object.entries(portfolio.tactical_concentration || {}).map(([k, v]) => `${k}: ${v}`))}
                <b>Chân trời rủi ro chung</b> ${escHtml(portfolio.selected_joint_risk_horizon)} · ${pill(portfolio.joint_risk_status, "data_fitness")}<br>
                <b>Tương quan cặp</b> ${pill(portfolio.pairwise_correlation_status, "data_fitness")}<br>
                <b>Vi phạm hạn mức người dùng</b>${listHtml((portfolio.user_limit_breaches || []).map((b) => JSON.stringify(b)))}
                <b>Thanh khoản (vị thế đang nắm)</b> ${pill(portfolio.liquidity_research_context, "liquidity_state")} · Lệnh chính xác: ${pill(portfolio.exact_execution_capacity_status, "liquidity_state")}
              ` : `${pill("NOT_EVALUATED", "portfolio_state")}<div class="cockpit-note mt-1">${escHtml(formatWorkspaceState((portfolio || {}).reason, "portfolio_state") || "Chưa có bối cảnh danh mục. Tải một tệp bên trên, hoặc mở Trình soạn danh mục.")}</div>`}
              <div class="cockpit-note mt-2">Tư thế nghiên cứu của mã độc lập với mức phù hợp danh mục và không bị danh mục làm thay đổi.</div>
              <div class="mt-2"><a href="portfolio.html" class="cockpit-note">Mở Trình soạn danh mục &rarr;</a></div>
            </div></div>
            <div class="card"><div class="card-header"><h6>Dữ liệu</h6></div><div class="card-body">
              <div class="table-responsive"><table class="cockpit-table"><thead><tr><th>Trục</th><th>Độ mới dữ liệu</th><th>Phiên/kỳ nguồn</th><th>Proxy / đã xác nhận</th></tr></thead><tbody>
                ${Object.keys((card.lineage || {}).per_axis_freshness || {}).sort().map((axis) => `<tr><td>${escHtml(axisDisplayLabel(axis))}</td><td>${pill((card.lineage.per_axis_freshness || {})[axis], "freshness")}</td><td>${escHtml(unavailableText((card.lineage.per_axis_source_session || {})[axis]))}</td><td>${pill((card.lineage.per_axis_proxy_or_qualified_state || {})[axis], "data_fitness")}</td></tr>`).join("")}
              </tbody></table></div>
              <div class="cockpit-note mt-2">Bằng chứng sâu: ${pill(card.lineage && card.lineage.deep_evidence_availability, "data_fitness")}</div>
              <b>Điều kiện chặn</b>${listHtml(((card.lineage || {}).blockers || []).map((b) => `${axisDisplayLabel(b.axis)}: ${formatWorkspaceState(b.readiness, "research_readiness")} (${formatWorkspaceState(b.freshness_status, "freshness")})`))}
              <div class="mt-2">${provenanceBlock(sourceArtifacts && Object.keys(sourceArtifacts).length ? JSON.stringify(sourceArtifacts, null, 2) : "")}</div>
            </div></div>
          </div></details>`;
  }

  function renderDecisionCard(card, container, options) {
    const html = decisionCardHtml(card, options);
    if (container) container.innerHTML = html;
    return html;
  }

  function renderDecisionCardSurfaces(card, containers, options) {
    const html = decisionCardHtml(card, options);
    (containers || []).forEach((container) => {
      if (container) container.innerHTML = html;
    });
    return html;
  }

  // ---------------------------------------------------------------------
  // Browser-only rendering
  // ---------------------------------------------------------------------
  if (typeof document !== "undefined" && document.body && document.body.dataset.page === "investment-workspace") {
    (function renderInBrowser() {
      // Aliases only -- tone/pill computation lives once, at module scope (see pill() above),
      // routed through value-format.js's domain-aware tone contract.
      const esc = escHtml;
      const unavailable = unavailableLabel;

      let WORKSPACE = null;
      let ACTIVE_FILTERS = [];
      let SEARCH_QUERY = "";
      let PORTFOLIO_OVERRIDE = null;
      let SELECTED_TICKER = null;
      let WORKSPACE_VIEW = "opportunities";
      let SIGNAL_SNAPSHOT_PROMISE = null;
      const VALID_VIEWS = ["opportunities", "portfolio", "watchlist", "explore", "technical"];
      // INVESTOR_EVIDENCE_INVESTIGATION_WORKBENCH_V1: dossier / compare / journal share the same
      // index fetch and selected-ticker state; investigation-workbench.js renders their panels.
      // INVESTOR_CASE_DESK_LOCAL_REVIEW_INTEGRATION_V1: "case" shows one browser-local Consumer
      // Case Desk case next to the published session; case-desk-review.js owns that panel.
      const WORKBENCH_VIEWS = ["dossier", "compare", "journal", "case"];
      const ALL_VIEWS = VALID_VIEWS.concat(WORKBENCH_VIEWS);

      function effectivePortfolio(ticker, card) {
        if (PORTFOLIO_OVERRIDE) return joinPortfolioResearch(ticker, card.sector, PORTFOLIO_OVERRIDE);
        return card.portfolio;
      }

      function renderFilterChips() {
        const groups = {};
        FILTERS.forEach((f) => { (groups[f.group] = groups[f.group] || []).push(f); });
        document.getElementById("filter-chips").innerHTML = Object.entries(groups).map(([group, items]) => `
          <div class="ws-filter-group"><span class="cockpit-note ws-filter-group-label">${esc(FILTER_GROUP_LABELS[group] || group)}</span>
            ${items.map((f) => `<button type="button" class="cockpit-chip ws-filter-chip${ACTIVE_FILTERS.includes(f.id) ? " active" : ""}" data-filter="${f.id}">${esc(f.label)}</button>`).join("")}
          </div>`).join("");
      }

      function filteredTickers() {
        const cards = WORKSPACE.cards;
        return Object.keys(cards).filter((t) => matchesFilters(cards[t], ACTIVE_FILTERS) && matchesSearch(t, cards[t], SEARCH_QUERY)).sort();
      }

      function renderRow(ticker) {
        const card = WORKSPACE.cards[ticker];
        const isSelected = ticker === SELECTED_TICKER;
        const trigger = card.reference_trigger || (card.tactical || {}).reference_trigger || {};
        const invalidation = ((card.invalidation || {}).technical || {});
        const price = retainedPrice(card);
        return `<tr data-row-ticker="${esc(ticker)}" class="${isSelected ? "ws-row-selected" : ""}" style="cursor: pointer;">
          <td class="sticky-col">
            <button type="button" class="btn btn-link p-0 ws-ticker-link fw-bold font-monospace text-start" data-select-ticker="${esc(ticker)}">${esc(ticker)}</button>
          </td>
          <td>${pill(card.entry_state, "tactical_state")}<div class="cockpit-note">${sectorDisplayHtml(card.sector)}</div></td>
          <td>${hasRetainedValue(price) ? `<b>${esc(formatDiagnosticNumber(price))}</b>` : '<span class="cockpit-note">—</span>'}</td>
          <td>${rowSignalVelocityHtml(card)}</td>
          <td>${rowFlowPriceHtml(card)}</td>
          <td data-label="Kích hoạt tham chiếu">${hasRetainedValue(trigger.trigger_level) ? esc(formatDiagnosticNumber(trigger.trigger_level)) : '<span class="cockpit-note">Chưa có mức kích hoạt</span>'}</td>
          <td data-label="Vô hiệu">${invalidation.boundary_type ? esc(conditionHeadline(invalidation).label) : '<span class="cockpit-note">Chưa đủ dữ liệu vô hiệu</span>'}</td>
          <td>${actionPostureHtml(card)}<div>${evidenceCurrencyHtml(card.evidence_currency)}</div></td>
          <td class="cockpit-note" data-label="Điểm cần xem">${esc(compactReasons(card, 1)[0])}</td>
          <td><button type="button" class="btn btn-sm btn-outline-light" data-select-ticker="${esc(ticker)}">Chi tiết</button></td>
        </tr>`;
      }

      function focusTickers() { return notableTickers(WORKSPACE.cards); }
      function renderDecisionFocus() {
        const root = document.getElementById("decision-focus");
        if (!root) return;
        root.innerHTML = focusTickers().map((ticker) => {
          const card = WORKSPACE.cards[ticker];
          const trigger = card.reference_trigger || (card.tactical || {}).reference_trigger || {};
          return `<article class="ws-focus-card" data-focus-ticker="${esc(ticker)}"><div class="ws-focus-card-head"><strong>${esc(ticker)}</strong>${pill(card.entry_state, "tactical_state")}</div><div class="cockpit-note">${sectorDisplayHtml(card.sector)}</div><div class="ws-focus-action">${actionPostureHtml(card)} ${evidenceCurrencyHtml(card.evidence_currency)}</div>${hasRetainedValue(trigger.trigger_level) ? `<div class="cockpit-note">Kích hoạt tham chiếu: ${esc(formatDiagnosticNumber(trigger.trigger_level))}</div>` : ""}<ul>${compactReasons(card, 2).map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul><button type="button" class="btn btn-sm btn-outline-light" data-select-ticker="${esc(ticker)}">Xem luận điểm</button></article>`;
        }).join("") || '<p class="cockpit-note">Chưa có nhóm cần chú ý theo trạng thái nghiên cứu hiện tại.</p>';
      }

      function renderList() {
        const tickers = filteredTickers();
        document.getElementById("opportunity-rows").innerHTML = tickers.map(renderRow).join("");
        document.getElementById("row-count").textContent = `${tickers.length} / ${Object.keys(WORKSPACE.cards).length}`;
        document.getElementById("filter-count").textContent = ACTIVE_FILTERS.length ? `${ACTIVE_FILTERS.length} bộ lọc đang bật` : "";
        // PHASE 12 -- visible on the collapsed "Bộ lọc" control itself, so the reader can see a
        // filter is active without opening the panel.
        const badge = document.getElementById("filter-summary-badge");
        if (badge) {
          badge.textContent = ACTIVE_FILTERS.length ? String(ACTIVE_FILTERS.length) : "";
          badge.hidden = !ACTIVE_FILTERS.length;
        }
      }

      // Phân tích (analysis) view: shares WORKSPACE.cards, ACTIVE_FILTERS and SEARCH_QUERY with
      // the Cơ hội view. analysisEvidenceHtml/analysisRowHtml/analysisKpi are pure and live at
      // module scope (see above) so they're directly unit-testable, same as decisionCardHtml.
      function renderAnalysisView() {
        if (!WORKSPACE) return;
        const rows = filteredTickers().map((t) => analysisRecord(WORKSPACE.cards[t]));
        document.getElementById("analysis-rows").innerHTML = rows.map(analysisRowHtml).join("");
        document.getElementById("analysis-row-count").textContent = `${rows.length} / ${Object.keys(WORKSPACE.cards).length}`;
        const cov = WORKSPACE.coverage || {};
        const total = Object.keys(WORKSPACE.cards).length;
        const scope = getProductScopeFormat();
        document.getElementById("analysis-summary").innerHTML = [
          analysisKpi("Phạm vi sản phẩm", scope ? `${scope.formatCount(total)} thẻ quyết định` : `${total.toLocaleString("vi-VN")} thẻ quyết định`),
          analysisKpi("Quyết định hành động", cov.research_action_posture_distribution
            ? `${Object.keys(cov.research_action_posture_distribution).length} nhóm quyết định`
            : POSTURE_UNAVAILABLE_TEXT),
          analysisKpi("Trạng thái kỹ thuật", `${Object.keys(cov.entry_state_distribution || {}).length} trạng thái được giữ lại`),
          analysisKpi("Trục dữ liệu đã cũ", `${cov.stale_axis_present_count != null ? cov.stale_axis_present_count.toLocaleString("vi-VN") : "—"} nêu rõ, không ép về hiện tại`),
        ].join("");
      }

      function renderPortfolioView() {
        const root = document.getElementById("workspace-portfolio-summary");
        if (!root) return;
        const held = PORTFOLIO_OVERRIDE && Array.isArray(PORTFOLIO_OVERRIDE.normalized_positions) ? PORTFOLIO_OVERRIDE.normalized_positions.length : 0;
        root.innerHTML = [
          analysisKpi("Trạng thái", PORTFOLIO_OVERRIDE ? "Đã nạp bối cảnh danh mục" : "Chưa nạp bối cảnh danh mục"),
          analysisKpi("Vị thế được giữ lại", PORTFOLIO_OVERRIDE ? String(held) : "—"),
          analysisKpi("Nguyên tắc", "Không thay đổi tư thế nghiên cứu của mã"),
        ].join("");
      }

      function renderTechnicalView() {
        const root = document.getElementById("workspace-technical-selected");
        if (!root) return;
        root.innerHTML = SELECTED_TICKER ? '<p class="cockpit-note">Đang kiểm tra bằng chứng kỹ thuật hiện hành…</p>' : '<p class="cockpit-note">Chọn một mã để xem tín hiệu kỹ thuật.</p>';
        if (SELECTED_TICKER) renderSelectedSignalEvidence(SELECTED_TICKER);
      }

      // ---- View switcher: internal views share one data fetch, one cards
      // universe and one selected-ticker state -- only the visible container changes.
      function setView(view, opts) {
        const next = ALL_VIEWS.includes(view) ? view : "opportunities";
        WORKSPACE_VIEW = next;
        const focusSection = document.getElementById("decision-focus-section");
        if (focusSection) focusSection.hidden = next !== "opportunities";
        document.querySelectorAll("[data-ws-view]").forEach((el) => { el.hidden = el.id !== `ws-view-${next}`; });
        document.querySelectorAll(".ws-view-tab").forEach((tab) => {
          const active = tab.dataset.view === next;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", active ? "true" : "false");
          tab.tabIndex = active ? 0 : -1;
        });
        if (next === "explore") renderAnalysisView();
        if (next === "portfolio") renderPortfolioView();
        if (next === "technical") renderTechnicalView();
        const workbench = getInvestigationWorkbench();
        if (workbench) workbench.renderView(next, { focus: Boolean(opts && opts.focus) });
        const caseDesk = getCaseDeskReview();
        if (caseDesk && next === "case") caseDesk.render(Boolean(opts && opts.focus));
        try {
          const url = new URL(window.location.href);
          const currentParam = url.searchParams.get("view") || "opportunities";
          if (next !== "compare" && (url.searchParams.has("tickers") || url.searchParams.has("session"))) {
            // Comparison deep-link state belongs to the comparison view only.
            url.searchParams.delete("tickers");
            url.searchParams.delete("session");
            if (currentParam === next) window.history.replaceState({ view: next }, "", url.toString());
          }
          if (currentParam !== next) {
            if (next === "opportunities") url.searchParams.delete("view"); else url.searchParams.set("view", next);
            window.history.replaceState({ view: next }, "", url.toString());
          }
        } catch (_) {}
      }

      async function renderSelectedSignalEvidence(ticker) {
        const targets = document.querySelectorAll(`[data-selected-signal-for="${cssEscapeSelector(ticker)}"], #workspace-technical-selected`);
        const write = (html) => targets.forEach((el) => { el.innerHTML = html; });
        try {
          if (!SIGNAL_SNAPSHOT_PROMISE) SIGNAL_SNAPSHOT_PROMISE = fetch("data/candle_signals.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null);
          const snapshot = await SIGNAL_SNAPSHOT_PROMISE;
          if (!snapshot || snapshot.scan_date !== WORKSPACE.as_of_session) {
            write(selectedSignalEvidenceHtml(snapshot, ticker, WORKSPACE.as_of_session, {}, null));
            return;
          }
          const api = window.VSCandlestickPatterns;
          const patternsPayload = api && api.loadSnapshot ? await api.loadSnapshot() : null;
          write(selectedSignalEvidenceHtml(snapshot, ticker, WORKSPACE.as_of_session, (patternsPayload || {}).registry, api));
        } catch (_) {
          write('<p class="ws-signal-unavailable">Chưa có mẫu hình nến hoặc cấu trúc dòng tiền (SMC) hiện hành.</p>');
        }
      }

      function renderSupportingMethods(methods) {
        if (!methods || !methods.length) return '<span class="cockpit-note">Chưa có phương pháp định giá tương đối sẵn sàng hỗ trợ nhãn này.</span>';
        return `<table class="cockpit-table"><thead><tr><th>Phương pháp</th><th>Phân vị</th><th>Số đối sánh</th><th>Phần bù/chiết khấu so với trung vị nhóm</th></tr></thead><tbody>${
          methods.map((m) => `<tr><td>${esc(m.method)}</td><td>${esc(m.percentile)}</td><td>${esc(m.peer_count)}</td><td>${esc(m.premium_or_discount_to_peer_median)}</td></tr>`).join("")
        }</tbody></table>`;
      }

      let lastFocusedElement = null;

      function openDrawer(ticker) {
        const backdrop = document.getElementById("decision-drawer-backdrop");
        const drawer = document.getElementById("decision-drawer");
        if (!backdrop || !drawer) return;
        lastFocusedElement = document.activeElement;
        // The full card (a 10-18 MB detail shard) is fetched only when it is actually shown.
        if (ticker && WORKSPACE && WORKSPACE.cards[ticker] && DETAIL_LOADED_FOR !== ticker) showDecisionCard(ticker);
        backdrop.hidden = false;
        drawer.hidden = false;
        requestAnimationFrame(() => {
          backdrop.classList.add("is-open");
          drawer.classList.add("is-open");
          const closeBtn = document.getElementById("decision-drawer-close");
          if (closeBtn) closeBtn.focus();
        });
      }

      function closeDrawer() {
        const backdrop = document.getElementById("decision-drawer-backdrop");
        const drawer = document.getElementById("decision-drawer");
        if (!backdrop || !drawer) return;
        backdrop.classList.remove("is-open");
        drawer.classList.remove("is-open");
        setTimeout(() => {
          backdrop.hidden = true;
          drawer.hidden = true;
          if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
            lastFocusedElement.focus();
          }
          lastFocusedElement = null;
        }, 250);
      }

      // Monotonically increasing token: if the reader picks a different ticker while a shard
      // fetch for the previous one is still in flight, the stale response must never overwrite
      // what is now on screen for the newly-selected ticker.
      let DECISION_CARD_REQUEST_TOKEN = 0;
      // Which ticker's full card has been requested into the drawer/print surfaces. Selecting a
      // ticker without opening its details only updates the header and links: a plain visit to
      // Cơ hội must not download a multi-megabyte detail shard nobody asked to see.
      let DETAIL_LOADED_FOR = null;

      function showDecisionCard(ticker, opts) {
        const thin = WORKSPACE.cards[ticker];
        const inPageEl = document.getElementById("decision-card");
        const drawerEl = document.getElementById("decision-drawer-body");
        if (!thin) {
          const err = '<div class="cockpit-note">Không tìm thấy mã.</div>';
          if (drawerEl) drawerEl.innerHTML = err;
          if (inPageEl) inPageEl.innerHTML = err;
          return;
        }
        const drawerTicker = document.getElementById("decision-drawer-ticker");
        if (drawerTicker) drawerTicker.textContent = ticker;
        const drawerBadge = document.getElementById("decision-drawer-badge");
        if (drawerBadge) drawerBadge.innerHTML = actionPostureHtml(thin);
        const dossierLink = document.getElementById("drawer-dossier-link");
        if (dossierLink) dossierLink.href = `investment-workspace.html?view=dossier&ticker=${encodeURIComponent(ticker)}`;
        const exploreLink = document.getElementById("drawer-screener-link");
        if (exploreLink) {
          exploreLink.href = `investment-workspace.html?view=explore&ticker=${encodeURIComponent(ticker)}`;
          if (typeof exploreLink.removeAttribute === "function") exploreLink.removeAttribute("aria-disabled");
        }
        if (opts && opts.deferDetail) {
          DETAIL_LOADED_FOR = null;
          DECISION_CARD_REQUEST_TOKEN++;
          const deferredHtml = '<div class="cockpit-note" data-detail-deferred="true">Mở chi tiết mã để tải thẻ đầy đủ.</div>';
          if (drawerEl) drawerEl.innerHTML = deferredHtml;
          if (inPageEl) inPageEl.innerHTML = deferredHtml;
          return;
        }
        DETAIL_LOADED_FOR = ticker;
        const loadingHtml = '<div class="cockpit-note">Đang tải chi tiết…</div>';
        if (drawerEl) drawerEl.innerHTML = loadingHtml;
        if (inPageEl) inPageEl.innerHTML = loadingHtml;

        const readModel = getWorkspaceReadModel();
        const requestToken = ++DECISION_CARD_REQUEST_TOKEN;
        const resolveDetail = readModel
          ? readModel.getTickerDetail(ticker, WORKSPACE)
          : Promise.resolve({ status: "unavailable", reason: "READ_MODEL_UNAVAILABLE" });
        resolveDetail.then((result) => {
          if (requestToken !== DECISION_CARD_REQUEST_TOKEN) return; // superseded by a newer selection
          if (result.status !== "ok") {
            const message = '<div class="cockpit-note" data-drawer-unavailable="true">Tạm chưa có dữ liệu chi tiết.</div>';
            if (drawerEl) drawerEl.innerHTML = message;
            if (inPageEl) inPageEl.innerHTML = message;
            return;
          }
          const card = result.card;
          const cardOpts = {
            ticker,
            portfolio: effectivePortfolio(ticker, card),
            sourceArtifacts: WORKSPACE.source_artifacts,
            displayMetricCatalog: WORKSPACE.display_metric_catalog,
          };
          // The drawer is the on-screen surface. The in-page node is print-only. Both receive
          // the same HTML string from one decisionCardHtml call.
          renderDecisionCardSurfaces(card, [drawerEl, inPageEl], cardOpts);
          if (drawerBadge) drawerBadge.innerHTML = actionPostureHtml(card);
          renderSelectedSignalEvidence(ticker);
        });
      }

      // Explicit not-found state for a requested ticker/hash that does not resolve to a real card.
      // Never falls back to rendering a different ticker's decision card.
      function showTickerNotFound(requestedTicker) {
        SELECTED_TICKER = null;
        const select = document.getElementById("ticker-select");
        if (select) {
          select.selectedIndex = -1;
          select.setAttribute("aria-invalid", "true");
        }
        const inPageEl = document.getElementById("decision-card");
        const drawerEl = document.getElementById("decision-drawer-body");
        const err = `<div class="cockpit-note" data-drawer-unavailable="true">Không tìm thấy mã "${escHtml(requestedTicker)}". Không chọn mã thay thế.</div>`;
        if (drawerEl) drawerEl.innerHTML = err;
        if (inPageEl) inPageEl.innerHTML = err;
        const drawerTicker = document.getElementById("decision-drawer-ticker");
        if (drawerTicker) drawerTicker.textContent = requestedTicker || "—";
        const drawerBadge = document.getElementById("decision-drawer-badge");
        if (drawerBadge) drawerBadge.innerHTML = "";
        const exploreLink = document.getElementById("drawer-screener-link");
        if (exploreLink) {
          if (typeof exploreLink.removeAttribute === "function") exploreLink.removeAttribute("href");
          exploreLink.setAttribute("aria-disabled", "true");
        }
      }

      function selectTicker(ticker, opts) {
        if (!WORKSPACE.cards[ticker]) return;
        SELECTED_TICKER = ticker;
        const select = document.getElementById("ticker-select");
        if (select) select.value = ticker;
        if (select && typeof select.removeAttribute === "function") select.removeAttribute("aria-invalid");
        showDecisionCard(ticker, { deferDetail: !(opts && opts.openDrawer) });
        // Selection changes only a row class. Rebuilding the hidden 1,683-row
        // table and unchanged focus cards here dominated rapid dossier navigation.
        document.querySelectorAll("[data-row-ticker]").forEach((row) => {
          row.classList.toggle("ws-row-selected", row.dataset.rowTicker === ticker);
        });
        if (WORKSPACE_VIEW === "technical") renderTechnicalView();
        const workbench = getInvestigationWorkbench();
        if (workbench && WORKSPACE_VIEW === "dossier") workbench.renderView("dossier", { focus: Boolean(opts && opts.focusDossier) });
        const caseDesk = getCaseDeskReview();
        if (caseDesk && WORKSPACE_VIEW === "case") caseDesk.focusTicker(ticker);

        try {
          const url = new URL(window.location.href);
          if (url.searchParams.get("ticker") !== ticker) {
            url.searchParams.set("ticker", ticker);
            window.history.replaceState({ ticker }, "", url.toString());
          }
        } catch (_) {}

        if (opts && opts.openDrawer) {
          openDrawer(ticker);
        }
        if (opts && opts.scrollIntoView) {
          const sec = document.getElementById("decision-card-section");
          if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }

      function render(data) {
        WORKSPACE = data;
        document.getElementById("workspace").hidden = false;
        const sc = window.VSSessionCoherence;
        const coherence = sc ? sc.classify(data.as_of_session, sc.currentReleaseSession()) : null;
        const sessionLabel = (sc && coherence ? sc.sessionLabelText(coherence) : null) || data.as_of_session;
        const staleBanner = sc && coherence && sc.isConfirmedStale(coherence)
          ? sc.staleBannerHtml("Cơ hội", coherence, "INVESTMENT_DECISION_WORKSPACE_STALE")
          : "";
        const scope = getProductScopeFormat();
        const referenceScope = scope
          ? scope.formatProductScope(Object.keys(data.cards).length)
          : `Phạm vi sản phẩm: ${Object.keys(data.cards).length.toLocaleString("vi-VN")} mã`;
        document.getElementById("session-line").innerHTML = `${staleBanner}Phiên ${esc(sessionLabel)} · ${esc(referenceScope)}`;
        const systemDetail = document.getElementById("ws-system-status-detail");
        if (systemDetail) systemDetail.innerHTML = coherence && sc && sc.isConfirmedStale(coherence)
          ? "Dữ liệu không còn cùng phiên với bản phát hành; xem trạng thái độ mới ở từng trục."
          : `Dữ liệu cùng phiên ${sessionLabel}. Chi tiết nguồn gốc có trong Dữ liệu & phương pháp.${provenanceBlock(data.producer_artifact_identity)}`;
        renderFilterChips();
        renderList();
        renderDecisionFocus();
        const workbench = getInvestigationWorkbench();
        const caseDesk = getCaseDeskReview();
        const openDossier = (t) => {
          if (!WORKSPACE.cards[t]) return;
          closeDrawer();
          SELECTED_TICKER = t;
          setView("dossier");
          selectTicker(t, { focusDossier: true });
        };
        if (caseDesk) {
          caseDesk.attach({
            getWorkspace: () => WORKSPACE,
            getSelectedTicker: () => SELECTED_TICKER,
            setView: (view) => setView(view, { focus: true }),
            openDossier,
          });
        }
        if (workbench) {
          workbench.attach({
            getWorkspace: () => WORKSPACE,
            readModel: getWorkspaceReadModel(),
            getSelectedTicker: () => SELECTED_TICKER,
            getView: () => WORKSPACE_VIEW,
            setView: (view) => setView(view, { focus: true }),
            openDrawer: (t) => selectTicker(t, { openDrawer: true }),
            openDossier,
            localCaseNoticeHtml: (t) => (caseDesk ? caseDesk.dossierNoticeHtml(caseDesk.currentModel(), t, WORKSPACE) : ""),
          });
        }
        const queryView = new URLSearchParams(window.location.search).get("view");
        const workbenchDeepLink = WORKBENCH_VIEWS.includes(queryView);
        if (workbenchDeepLink) {
          // A dossier deep link names its ticker; select it before the view renders so the
          // dossier opens on that ticker instead of the default one, without the drawer.
          const linkTicker = selectedTickerForDeepLink(Object.keys(data.cards), new URLSearchParams(window.location.search).get("ticker"));
          if (queryView === "dossier" && new URLSearchParams(window.location.search).get("ticker") && linkTicker) SELECTED_TICKER = linkTicker;
        }
        setView(queryView === "analysis" ? "explore" : queryView);
        const select = document.getElementById("ticker-select");
        const tickers = Object.keys(data.cards).sort();
        select.innerHTML = tickers.map((t) => `<option>${esc(t)}</option>`).join("");
        const queryTicker = new URLSearchParams(window.location.search).get("ticker");
        const rawHash = window.location.hash.replace(/^#/, "");
        // Legacy compatibility hashes from the pre-convergence Cockpit page name a page section,
        // not a ticker -- e.g. #lineage must not be parsed as a request for ticker "LINEAGE".
        const COMPAT_SECTION_HASHES = { lineage: "section-data-methodology", "market-overview": "section-market-overview", "ticker-research": null };
        const hashKey = rawHash.toLowerCase();
        const isCompatHash = Object.prototype.hasOwnProperty.call(COMPAT_SECTION_HASHES, hashKey);
        if (isCompatHash) {
          const sectionId = COMPAT_SECTION_HASHES[hashKey];
          const sectionEl = sectionId && document.getElementById(sectionId);
          if (sectionEl) {
            sectionEl.open = true;
            const disclosure = sectionEl.closest("details");
            if (disclosure) disclosure.open = true;
            if (typeof sectionEl.scrollIntoView === "function") sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
        const hashTicker = isCompatHash ? "" : rawHash;
        const requestedTicker = queryTicker || hashTicker;
        const targetTicker = selectedTickerForDeepLink(tickers, requestedTicker);
        if (targetTicker) {
          selectTicker(targetTicker, { openDrawer: !workbenchDeepLink && Boolean(queryTicker || hashTicker), scrollIntoView: false });
        } else if (requestedTicker) {
          showTickerNotFound(requestedTicker);
          // The dossier view renders its own explicit not-found state; it never opens the drawer.
          if (!workbenchDeepLink) openDrawer();
        }

        document.getElementById("filter-chips").addEventListener("click", (e) => {
          const btn = e.target.closest("[data-filter]");
          if (!btn) return;
          const id = btn.dataset.filter;
          ACTIVE_FILTERS = ACTIVE_FILTERS.includes(id) ? ACTIVE_FILTERS.filter((x) => x !== id) : ACTIVE_FILTERS.concat(id);
          renderFilterChips();
          renderList();
        });
        document.getElementById("filters-reset").addEventListener("click", () => {
          ACTIVE_FILTERS = []; SEARCH_QUERY = ""; document.getElementById("ticker-search").value = "";
          renderFilterChips(); renderList();
        });
        document.getElementById("ticker-search").addEventListener("input", (e) => { SEARCH_QUERY = e.target.value; renderList(); });

        document.getElementById("opportunity-rows").addEventListener("click", (e) => {
          const row = e.target.closest("tr[data-row-ticker]");
          if (!row) return;
          const ticker = row.dataset.rowTicker;
          selectTicker(ticker, { openDrawer: true });
        });

        document.getElementById("decision-focus").addEventListener("click", (e) => {
          const button = e.target.closest("[data-select-ticker]");
          if (button) selectTicker(button.dataset.selectTicker, { openDrawer: true });
        });

        document.getElementById("analysis-rows").addEventListener("click", (e) => {
          const row = e.target.closest("tr[data-ticker]");
          if (!row) return;
          selectTicker(row.dataset.ticker, { openDrawer: true });
        });

        document.querySelectorAll(".ws-view-tab").forEach((tab) => {
          tab.addEventListener("click", () => setView(tab.dataset.view, { focus: false }));
          tab.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const tabs = Array.from(document.querySelectorAll(".ws-view-tab"));
            const current = tabs.indexOf(tab);
            const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
              : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
            setView(tabs[index].dataset.view);
            tabs[index].focus();
          });
        });

        select.addEventListener("change", () => selectTicker(select.value, { openDrawer: !WORKBENCH_VIEWS.includes(WORKSPACE_VIEW) }));

        const drawerDossierLink = document.getElementById("drawer-dossier-link");
        if (drawerDossierLink) {
          drawerDossierLink.addEventListener("click", (e) => {
            if (!SELECTED_TICKER || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
            e.preventDefault();
            closeDrawer();
            setView("dossier", { focus: true });
          });
        }

        const openSelectedBtn = document.getElementById("ws-open-selected-drawer");
        if (openSelectedBtn) {
          openSelectedBtn.addEventListener("click", () => {
            if (SELECTED_TICKER) openDrawer(SELECTED_TICKER);
          });
        }

        const closeBtn = document.getElementById("decision-drawer-close");
        if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
        const backdrop = document.getElementById("decision-drawer-backdrop");
        if (backdrop) backdrop.addEventListener("click", closeDrawer);

        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            const drawer = document.getElementById("decision-drawer");
            if (drawer && drawer.classList.contains("is-open")) {
              closeDrawer();
            }
          }
        });

        // The print-only card needs the selected ticker's detail; fetch it if it was deferred.
        window.addEventListener("beforeprint", () => {
          if (SELECTED_TICKER && DETAIL_LOADED_FOR !== SELECTED_TICKER) showDecisionCard(SELECTED_TICKER);
        });

        window.addEventListener("popstate", () => {
          const qTicker = new URLSearchParams(window.location.search).get("ticker");
          if (qTicker && WORKSPACE && WORKSPACE.cards[qTicker]) {
            selectTicker(qTicker, { openDrawer: true });
          } else if (!qTicker) {
            closeDrawer();
          }
        });

        function triggerExport(t) {
          // The drawer must already be open (and its shard fetched/cached) for `t` before the
          // export button is reachable, so this resolves instantly from cache -- never a fresh
          // network round-trip triggered by clicking "Xuất T0".
          const readModel = getWorkspaceReadModel();
          const resolveDetail = readModel
            ? readModel.getTickerDetail(t, WORKSPACE)
            : Promise.resolve({ status: "unavailable" });
          resolveDetail.then((result) => {
            const card = result.status === "ok" ? result.card : WORKSPACE.cards[t];
            const payload = buildT0Export(t, card, WORKSPACE.source_artifact_identity);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
            a.download = `t0-candidate-${t}.json`;
            a.click();
          });
        }

        const drawerExport = document.getElementById("drawer-export-t0");
        if (drawerExport) {
          drawerExport.addEventListener("click", () => {
            if (SELECTED_TICKER) triggerExport(SELECTED_TICKER);
          });
        }

        document.getElementById("import-portfolio-research").addEventListener("change", (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const payload = JSON.parse(reader.result);
              PORTFOLIO_OVERRIDE = payload.portfolio_research_context || payload;
              if (!PORTFOLIO_OVERRIDE || !PORTFOLIO_OVERRIDE.portfolio_id) throw new Error("missing portfolio_id");
              renderList();
              renderDecisionFocus();
              renderPortfolioView();
              if (SELECTED_TICKER && DETAIL_LOADED_FOR === SELECTED_TICKER) showDecisionCard(SELECTED_TICKER);
            } catch (err) {
              alert("Tệp dữ liệu danh mục không hợp lệ");
            }
          };
          reader.readAsText(file);
        });

        // Enrich with current_decision_cockpit.json data (strictly guarded by session coherence)
        fetch("data/current_decision_cockpit.json", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((cockpit) => {
            if (!cockpit) return;
            const dc = (typeof window !== "undefined" && window.VSDecisionCockpit)
              ? window.VSDecisionCockpit
              : (typeof require === "function" ? require("./decision-cockpit.js") : null);

            const wsSession = (WORKSPACE && WORKSPACE.as_of_session) || null;
            const cpSession = (cockpit && cockpit.session) || null;

            // Session Coherence Gate: require exact session match before merging Cockpit values
            if (!wsSession || !cpSession || wsSession !== cpSession) {
              const mismatchHtml = (dc && dc.renderSessionMismatchHtml)
                ? dc.renderSessionMismatchHtml(wsSession, cpSession, "SESSION_MISMATCH")
                : `<p class="cockpit-note mb-0">Thông tin bổ sung chưa đồng bộ với phiên hiện tại.</p>`;
              // Every element populated only from the Cockpit artifact must clear on mismatch --
              // an incomplete list here lets a stale Cockpit-sourced value survive next to an
              // explicit "not synced" warning, which is worse than showing nothing.
              const containerIds = [
                "cockpit-market-overview",
                "cockpit-market-warnings",
                "cockpit-watchlist",
                "cockpit-portfolio-risk",
                "cockpit-gaps",
                "cockpit-verify-next",
                "cockpit-lineage-content",
              ];
              containerIds.forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = id === "cockpit-watchlist" ? `<tr><td colspan="6">${mismatchHtml}</td></tr>` : mismatchHtml;
              });
              const watchCountEl = document.getElementById("cockpit-watch-count");
              if (watchCountEl) watchCountEl.textContent = "—";
              return;
            }

            // Real contract rendering via pure helpers
            const moEl = document.getElementById("cockpit-market-overview");
            if (moEl && dc && dc.renderMarketOverviewHtml) {
              moEl.innerHTML = dc.renderMarketOverviewHtml(cockpit);
            }
            const mwEl = document.getElementById("cockpit-market-warnings");
            if (mwEl && dc && dc.renderMarketWarningsHtml) {
              mwEl.innerHTML = dc.renderMarketWarningsHtml(cockpit);
            }

            const wlEl = document.getElementById("cockpit-watchlist");
            const wlCountEl = document.getElementById("cockpit-watch-count");
            if (wlEl && dc && dc.renderOwnerFocusHtml) {
              const tickers = (cockpit.owner_focus && Array.isArray(cockpit.owner_focus.tickers) && cockpit.owner_focus.tickers.length ? cockpit.owner_focus.tickers : (cockpit.watchlist?.tickers || [])).slice().sort();
              if (wlCountEl) wlCountEl.textContent = `${tickers.length} mã`;
              wlEl.innerHTML = dc.renderOwnerFocusHtml(cockpit, WORKSPACE ? WORKSPACE.cards : null, tickers);
              wlEl.addEventListener("click", (e) => {
                const btn = e.target.closest("[data-ticker]");
                if (btn) selectTicker(btn.dataset.ticker, { openDrawer: true });
              });
            }

            const prEl = document.getElementById("cockpit-portfolio-risk");
            if (prEl && dc && dc.renderPortfolioRiskHtml) {
              prEl.innerHTML = dc.renderPortfolioRiskHtml(cockpit);
            }

            const gapsEl = document.getElementById("cockpit-gaps");
            if (gapsEl && dc && dc.renderDataGapsHtml) {
              gapsEl.innerHTML = dc.renderDataGapsHtml(cockpit);
            }

            const vnEl = document.getElementById("cockpit-verify-next");
            if (vnEl && dc && dc.renderVerifyNextHtml) {
              vnEl.innerHTML = dc.renderVerifyNextHtml(cockpit);
            }

            const linEl = document.getElementById("cockpit-lineage-content");
            if (linEl && dc && dc.renderLineageHtml) {
              linEl.innerHTML = dc.renderLineageHtml(cockpit);
            }
          })
          .catch(() => {});
      }

      fetch(DATA_URL, { cache: "no-store" })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((data) => {
          if (!validateWorkspaceContract(data)) throw new Error("unsupported workspace contract");
          render(data);
        })
        .catch((err) => {
          const e = document.getElementById("workspace-error");
          e.hidden = false;
          e.textContent = `Chưa thể tải Cơ hội lúc này. Vui lòng thử tải lại trang.`;
        });
    })();
  }

  return {
    DATA_URL, SCHEMA_VERSION, CONTRACT_VERSION, validateWorkspaceContract, PORTFOLIO_STORAGE_KEY, RELATIVE_VALUATION_LABELS, FILTERS, FILTER_GROUP_LABELS,
    matchesFilters, matchesSearch, selectedTickerForDeepLink, hasStaleAxis, joinPortfolioResearch,
    readLocalPortfolioHoldings, localHoldingFor, buildT0Export,
    VETO_RESEARCH_STANCES, TACTICAL_ACTIONABLE_ENTRY_READINESS, stanceEntryGuidance,
    actionPostureLabel, actionPostureHtml, evidenceCurrencyClass, evidenceCurrencyHtml, opportunityPriorityHtml,
    researchScreenHtml, researchScreenLabel, POSITION_CONDITIONAL_POSTURES, POSTURE_UNAVAILABLE_TEXT,
    decisionCardHtml, renderDecisionCard, renderDecisionCardSurfaces, technicalSnapshotHtml, selectedSignalEvidenceHtml, retainedPrice, compactReasons, notableTickers,
    financialStatusLabel, returnBalanceMetricsHtml, valuationMethodLabel,
    evidenceQuality, evidenceSummaryHtml,
    cssEscapeSelector,
    analysisRecord, analysisRows, analysisRowHtml, analysisEvidenceHtml,
    rowSignalVelocityHtml, rowFlowPriceHtml,
    metricSlotHtml, investorMetricsGridHtml, metricValueHtml, unavailableText,
  };
});
