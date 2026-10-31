(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VSDashboardOverview = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function getSessionCoherence() {
    if (typeof window !== "undefined" && window.VSSessionCoherence) return window.VSSessionCoherence;
    if (typeof require === "function") {
      try { return require("./session-coherence.js"); } catch (err) { return null; }
    }
    return null;
  }

  const SCREENER_URL = "data/screener_master_projection.json";
  const SCREENER_CONTRACT = "screener_master_projection/v1";
  // DASHBOARD_HOME_SUMMARY_AND_CACHE_BUSTING_V1: Home's aggregate boot fetches this
  // small Producer summary, never screener_master_projection.json. The four opportunity
  // cards still read workspace_index.json until summary.notable_cards is published.
  // SCREENER_URL and summarizeScreenerOverview() stay exported for callers that need them.
  const HOME_SUMMARY_URL = "data/dashboard_home_summary.json";
  const HOME_SUMMARY_CONTRACT = "dashboard_home_summary/v1";
  const BUILD_INFO_URL = "data/build_info.json";
  const WORKSPACE_INDEX_URL = "data/workspace_index.json";
  const WORKSPACE_INDEX_CONTRACT = "workspace_index/v1";
  // Optional nested block. Absent on published dashboard_home_summary/v1 today.
  // Home renders it only when Producer has bound the same four pass-through cards
  // the full index would have selected. It does not choose or invent them.
  const NOTABLE_CARDS_CONTRACT = "dashboard_home_notable_cards/v1";
  const NOTABLE_SELECTION = "PUBLISHED_INSERTION_ORDER_NOTABLE_MEMBERSHIP_V1";
  const NOTABLE_SELECTION_LIMIT = 4;
  const ENTITY_CLASS_VOCABULARY = ["corporate", "bank", "securities", "insurance", "finance_company"];
  const STANCE_ORDER = [
    "INITIATE_RESEARCH_CANDIDATE",
    "ACCUMULATE_RESEARCH_CANDIDATE",
    "WAIT_FOR_CONFIRMATION",
    "HIGH_RISK_SPECULATION_ONLY",
    "AVOID_NEW_ENTRY",
    "INSUFFICIENT_EVIDENCE",
  ];
  // CURRENT_DECISION_SURFACE_CONVERGENCE_V1: the primary Home decision summary is the Producer
  // research_action_posture (Integrated Decision) counts, published by dashboard_home_summary.py
  // from the same Workspace/Screener lineage. research_stance is a secondary research screen only.
  const POSTURE_ORDER = [
    "INITIATE_ON_BREAKOUT",
    "ACCUMULATE_ON_RETEST",
    "EARLY_WATCH",
    "WAIT_FOR_CONFIRMATION",
    "HOLD",
    "HOLD_DO_NOT_ADD",
    "REDUCE",
    "AVOID",
    "INSUFFICIENT_CURRENT_RESEARCH",
  ];
  const POSTURE_TONE = {
    INITIATE_ON_BREAKOUT: "constructive",
    ACCUMULATE_ON_RETEST: "constructive",
    EARLY_WATCH: "wait",
    WAIT_FOR_CONFIRMATION: "wait",
    HOLD: "neutral",
    HOLD_DO_NOT_ADD: "neutral",
    REDUCE: "risk",
    AVOID: "risk",
    INSUFFICIENT_CURRENT_RESEARCH: "neutral",
  };
  const POSTURE_UNAVAILABLE_TEXT = "Chưa có tư thế hành động chuẩn hóa cho phiên dữ liệu này";
  const EVIDENCE_CURRENCY_ORDER = ["CURRENT_SESSION", "LAST_TRADE_AS_OF", "NO_CURRENT_EVIDENCE", "UNKNOWN"];
  const EVIDENCE_CURRENCY_LABELS = {
    CURRENT_SESSION: "dữ liệu phiên hiện tại",
    LAST_TRADE_AS_OF: "dữ liệu đã cũ",
    NO_CURRENT_EVIDENCE: "không có bằng chứng hiện tại",
    UNKNOWN: "chưa xác định",
  };
  function evidenceCurrencyClass(value) {
    const raw = String(value || "");
    if (raw.indexOf("LAST_TRADE_AS_OF:") === 0) return "LAST_TRADE_AS_OF";
    return (raw === "CURRENT_SESSION" || raw === "NO_CURRENT_EVIDENCE") ? raw : "UNKNOWN";
  }
  const TACTICAL_ORDER = [
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
  const STANCE_TONE = {
    INITIATE_RESEARCH_CANDIDATE: "constructive",
    ACCUMULATE_RESEARCH_CANDIDATE: "constructive",
    WAIT_FOR_CONFIRMATION: "wait",
    HIGH_RISK_SPECULATION_ONLY: "risk",
    AVOID_NEW_ENTRY: "risk",
    INSUFFICIENT_EVIDENCE: "neutral",
  };

  function getValueFormat() {
    if (typeof window !== "undefined" && window.VSValueFormat) return window.VSValueFormat;
    if (typeof require === "function") {
      try { return require("./value-format.js"); } catch (err) { return null; }
    }
    return null;
  }

  function getProductScopeFormat() {
    if (typeof window !== "undefined" && window.VSProductScopeFormat) return window.VSProductScopeFormat;
    if (typeof require === "function") {
      try { return require("./product-scope-format.js"); } catch (err) { return null; }
    }
    return null;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function formatLabel(value, domain) {
    const vf = getValueFormat();
    if (vf && typeof vf.formatDomainState === "function") {
      return vf.formatDomainState(value, domain).label;
    }
    return String(value ?? "Chưa xác định");
  }

  function coverageText(count, denominator, available) {
    if (!available) return { text: "Chưa có dữ liệu hiện tại", available: false, count: null, denominator: denominator || null };
    return {
      text: `${Number(count).toLocaleString("vi-VN")} / ${Number(denominator).toLocaleString("vi-VN")}`,
      available: true,
      count,
      denominator,
    };
  }

  function isPriced(card) {
    const price = card && card.price;
    if (!price || price.change_pct_status !== "AVAILABLE") return false;
    const n = Number(price.change_pct);
    return Number.isFinite(n);
  }

  function hasCurrentPrice(card) {
    return Boolean(card && card.price && card.price.status === "PRICE_AVAILABLE");
  }

  function isTacticalAvailable(card) {
    const tactical = card && card.tactical;
    return Boolean(tactical && tactical.status === "AVAILABLE" && tactical.entry_state);
  }

  function isLiquidityProxy(card) {
    const liquidity = card && card.liquidity;
    return Boolean(
      liquidity &&
      (liquidity.fitness === "LIQUIDITY_RESEARCH_PROXY" || liquidity.method === "LIQUIDITY_RESEARCH_PROXY")
    );
  }

  function sectorLabel(card) {
    const sector = card && card.sector;
    if (!sector || sector.status !== "AVAILABLE") return null;
    const label = typeof sector.label === "string" ? sector.label.trim() : "";
    if (!label) return null;
    if (ENTITY_CLASS_VOCABULARY.includes(label.toLowerCase())) return null;
    return label;
  }

  function summarizeScreenerOverview(projection) {
    const cards = Object.values((projection && projection.cards) || {});
    const denominator = cards.length;
    const priceAvailable = cards.filter(hasCurrentPrice);
    const priced = cards.filter(isPriced);
    const up = priced.filter((card) => Number(card.price.change_pct) > 0).length;
    const down = priced.filter((card) => Number(card.price.change_pct) < 0).length;
    const flat = priced.filter((card) => Number(card.price.change_pct) === 0).length;
    const tactical = cards.filter(isTacticalAvailable);
    const tacticalCounts = {};
    TACTICAL_ORDER.forEach((state) => { tacticalCounts[state] = 0; });
    tactical.forEach((card) => {
      const state = card.tactical.entry_state;
      tacticalCounts[state] = (tacticalCounts[state] || 0) + 1;
    });
    const postureCounts = {};
    POSTURE_ORDER.forEach((posture) => { postureCounts[posture] = 0; });
    const currencyCounts = {};
    EVIDENCE_CURRENCY_ORDER.forEach((name) => { currencyCounts[name] = 0; });
    let postureAvailable = 0;
    let positionConditional = 0;
    // Rolling-deploy compatibility: a pre-M1 projection has no per-card decision view at all.
    // Its summary then carries no posture/currency blocks (rendered as unavailable), rather than
    // an all-zero posture distribution or an all-UNKNOWN currency count.
    const hasDecisionView = cards.some((card) => card && card.decision && typeof card.decision === "object");
    cards.forEach((card) => {
      const decision = card.decision || {};
      if (decision.research_action_posture) {
        postureAvailable += 1;
        postureCounts[decision.research_action_posture] = (postureCounts[decision.research_action_posture] || 0) + 1;
      }
      const cls = evidenceCurrencyClass(decision.evidence_currency);
      currencyCounts[cls] = (currencyCounts[cls] || 0) + 1;
      if (decision.position_conditional === true) positionConditional += 1;
    });
    const stanceCounts = {};
    STANCE_ORDER.forEach((stance) => { stanceCounts[stance] = 0; });
    cards.forEach((card) => {
      const stance = card.research && card.research.stance;
      if (stance) stanceCounts[stance] = (stanceCounts[stance] || 0) + 1;
    });
    const officialScope = (projection && projection.official_scope_coverage) || null;
    const officialScopeCoherent = Boolean(
      officialScope && officialScope.temporally_eligible &&
      officialScope.research_session === (projection && projection.as_of_session)
    );
    const liquidityProxy = cards.filter(isLiquidityProxy).length;
    const executionExactReady = cards.filter((card) =>
      card.execution && card.execution.capacity_exact_status === "EXECUTION_CAPACITY_EXACT_READY"
    ).length;
    const sectors = {};
    let sectorLabeled = 0;
    cards.forEach((card) => {
      const label = sectorLabel(card);
      if (!label) return;
      sectorLabeled += 1;
      sectors[label] = (sectors[label] || 0) + 1;
    });
    const sectorRows = Object.entries(sectors)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi"));

    return {
      as_of_session: (projection && projection.as_of_session) || null,
      denominator,
      reference_ticker_count: denominator,
      current_research_scope_count: officialScopeCoherent ? officialScope.current_official_research_scope_count : null,
      outside_current_official_scope_count: officialScopeCoherent ? officialScope.outside_current_official_scope_count : null,
      official_scope_observed_at: officialScopeCoherent ? officialScope.official_snapshot_observed_at : null,
      price_available_count: priceAvailable.length,
      price_unavailable_count: denominator - priceAvailable.length,
      tactical_available_count: tactical.length,
      tactical_unavailable_count: denominator - tactical.length,
      session_breadth: {
        available: priced.length > 0,
        priced: priced.length,
        up,
        down,
        flat,
        price_available: priceAvailable.length,
        unpriced: denominator - priceAvailable.length,
        missing_session_return: priceAvailable.length - priced.length,
        label: "Độ rộng phiên trong số mã có biến động giá đúng phiên",
      },
      primary_decision_field: "research_action_posture",
      research_action_posture: hasDecisionView ? {
        available: postureAvailable > 0,
        coverage: postureAvailable,
        counts: postureCounts,
        order: POSTURE_ORDER,
        position_conditional_count: positionConditional,
      } : undefined,
      evidence_currency: hasDecisionView ? {
        counts: currencyCounts,
        order: EVIDENCE_CURRENCY_ORDER,
      } : undefined,
      research_stance: {
        role: "SECONDARY_RESEARCH_SCREEN_DIAGNOSTIC",
        available: denominator > 0,
        counts: stanceCounts,
        order: STANCE_ORDER,
      },
      tactical: {
        available: tactical.length > 0,
        coverage: tactical.length,
        counts: tacticalCounts,
        order: TACTICAL_ORDER,
      },
      liquidity: {
        proxy_available: liquidityProxy > 0 || denominator > 0,
        proxy_count: liquidityProxy,
        execution_exact_ready: executionExactReady,
        execution_exact_established: executionExactReady > 0,
      },
      sector: {
        available: sectorLabeled > 0,
        labeled: sectorLabeled,
        rows: sectorRows,
      },
      unsupported: {
        ma200: false,
        gtgd20: false,
        structure_up: false,
      },
    };
  }

  function missingMetricNeverZero(metric) {
    if (!metric || metric.available === false) {
      return metric && Object.prototype.hasOwnProperty.call(metric, "count")
        ? metric.count === null
        : true;
    }
    return true;
  }

  function renderDecisionSummaryHtml(summary, releaseSession) {
    if (!summary || !summary.denominator) {
      // Ordinary missing data for this session -- a quiet note, not a system warning box
      // (DASHBOARD_INVESTOR_FIRST_PRESENTATION_SIMPLIFICATION_V1 Phase 5); no pipeline
      // status code or contract name shown to the user.
      return `<p class="cockpit-note mb-0">Tạm chưa có dữ liệu tóm tắt cho phiên hiện tại.</p>`;
    }
    const sc = getSessionCoherence();
    const coherence = sc ? sc.classify(summary.as_of_session, releaseSession) : null;
    const staleBanner = sc && coherence && sc.isConfirmedStale(coherence)
      ? sc.staleBannerHtml("Tóm tắt quyết định hành động", coherence, "SCREENER_MASTER_PROJECTION_STALE")
      : "";
    const session = (sc ? sc.sessionLabelText(coherence) : null) || summary.as_of_session || "chưa xác định";
    const scope = getProductScopeFormat();
    const referenceScope = scope
      ? scope.formatReferenceScope(summary.reference_ticker_count)
      : `Phạm vi tham chiếu: ${summary.denominator.toLocaleString("vi-VN")} mã`;
    const priceCoverage = scope
      ? scope.formatCoverage({ available: summary.price_available_count, reference: summary.reference_ticker_count, label: "có dữ liệu giá đúng phiên" })
      : `${summary.price_available_count.toLocaleString("vi-VN")} / ${summary.denominator.toLocaleString("vi-VN")} mã tham chiếu có dữ liệu giá đúng phiên`;
    const tacticalCoverage = scope
      ? scope.formatCoverage({ available: summary.tactical_available_count, reference: summary.reference_ticker_count, label: "có trạng thái kỹ thuật" })
      : `${summary.tactical_available_count.toLocaleString("vi-VN")} / ${summary.denominator.toLocaleString("vi-VN")} mã tham chiếu có trạng thái kỹ thuật`;
    // Official-scope line only renders when the artifact itself publishes a temporally-eligible,
    // session-coherent official_scope_coverage block (see summarizeScreenerOverview) -- absent or
    // stale scope metadata renders nothing here, never a fabricated/estimated number.
    const officialScopeLine = scope && summary.current_research_scope_count != null
      ? `<p class="product-muted mb-1">${esc(scope.formatOfficialResearchScope(summary.current_research_scope_count))}${
          summary.outside_current_official_scope_count != null
            ? ` · ${esc(scope.formatOutsideOfficialScope(summary.outside_current_official_scope_count))}`
            : ""
        }</p>`
      : "";
    const postureBlock = summary.research_action_posture;
    const posture = postureBlock || {};
    // Primary cards: the action decision. Never falls back to research_stance as the decision.
    // A pre-M1 summary (no posture block) renders the primary decision as explicitly unavailable.
    const cards = !postureBlock
      ? `<p class="cockpit-note mb-0" data-action-posture-state="UNAVAILABLE">${esc(POSTURE_UNAVAILABLE_TEXT)}.</p>`
      : posture.available
      ? POSTURE_ORDER.map((name) => {
          const count = (posture.counts || {})[name] || 0;
          const tone = POSTURE_TONE[name] || "neutral";
          const conditional = name === "HOLD" || name === "HOLD_DO_NOT_ADD" || name === "REDUCE";
          const label = `${formatLabel(name, "research_action_posture")}${conditional ? " — nếu đang nắm giữ" : ""}`;
          return `<div class="decision-stance-card is-${tone}" data-action-posture="${esc(name)}"><span class="count">${count.toLocaleString("vi-VN")}</span><span class="label">${esc(label)}</span></div>`;
        }).join("")
      : `<p class="cockpit-note mb-0">Chưa có quyết định hành động cho phiên này.</p>`;
    const currency = (summary.evidence_currency || {}).counts || {};
    // Absent currency block (pre-M1): unavailable -- never counted as CURRENT_SESSION.
    const currencyLine = !summary.evidence_currency
      ? `<span data-evidence-currency="UNAVAILABLE">chưa có dữ liệu cho phiên dữ liệu này</span>`
      : EVIDENCE_CURRENCY_ORDER
      .filter((name) => name !== "UNKNOWN" || currency[name])
      .map((name) => `<span data-evidence-currency="${esc(name)}">${(currency[name] || 0).toLocaleString("vi-VN")} ${esc(EVIDENCE_CURRENCY_LABELS[name])}</span>`)
      .join(" · ");
    const stanceSecondary = STANCE_ORDER.map((stance) => {
      const count = ((summary.research_stance || {}).counts || {})[stance] || 0;
      return `<li data-research-stance="${esc(stance)}">${esc(formatLabel(stance, "research_stance"))}: ${count.toLocaleString("vi-VN")}</li>`;
    }).join("");
    return `
      ${staleBanner}
      <p class="product-muted mb-1">Phiên ${esc(session)} · ${esc(referenceScope)}.</p>
      ${officialScopeLine}
      <p class="product-muted mb-3">${esc(priceCoverage)} · ${esc(tacticalCoverage)}. Đây là tóm tắt quyết định hành động nghiên cứu, không phải lệnh thực hiện.</p>
      <p class="product-muted mb-2">Độ mới bằng chứng: ${currencyLine}</p>
      <div class="decision-summary-grid mb-3">${cards}</div>
      <details class="mb-3"><summary class="product-muted">Sàng lọc nghiên cứu (phụ, không phải quyết định hành động)</summary><ul class="cockpit-list">${stanceSecondary}</ul></details>
      `;
  }

  function fillText(id, text, className) {
    const el = typeof document !== "undefined" ? document.getElementById(id) : null;
    if (!el) return;
    el.textContent = text;
    if (className) el.className = className;
  }

  /* Nhãn trạng thái thị trường thuần mô tả (dựa trên số mã tăng/giảm đã tính sẵn ở
     trên, không phải một quy tắc đầu tư mới): nghiêng hẳn về một phía mới gọi tên,
     còn lại là "giằng co" -- không suy ra khuyến nghị mua/bán. */
  function marketBreadthStateLabel(breadth) {
    if (!breadth.available || (breadth.up + breadth.down) === 0) return null;
    if (breadth.up >= breadth.down * 1.2) return { text: "Nghiêng tăng", cls: "bs-green" };
    if (breadth.down >= breadth.up * 1.2) return { text: "Nghiêng giảm", cls: "bs-red" };
    return { text: "Giằng co", cls: "bs-amber" };
  }

  /* Hero banner: trạng thái thị trường thật (phiên, độ rộng), không phải văn bản
     giải thích phạm vi/phương pháp nội bộ -- đó là nội dung cho người làm sản
     phẩm, không phải người xem Tổng quan (mục B của milestone hội tụ Dashboard). */
  /* Pure: returns the hero HTML string for a given summary. No DOM access, so it is
     directly unit-testable (mirrors renderDecisionSummaryHtml's existing pattern). */
  function heroBannerHtml(summary) {
    if (!summary || !summary.as_of_session) {
      return `
        <div class="home-pulse-status">
          <span class="badge-soft bs-gray">Chưa có dữ liệu phiên thị trường</span>
        </div>`;
    }
    const dateMatch = String(summary.as_of_session).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const displayDate = dateMatch ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}` : summary.as_of_session;
    const breadth = summary.session_breadth;
    const state = marketBreadthStateLabel(breadth);
    // The three counts are the large figures beside this status; repeat them only as
    // one short sentence for screen readers and narrow layouts, not as a second panel.
    const breadthText = breadth.available
      ? `${breadth.up.toLocaleString("vi-VN")} tăng · ${breadth.down.toLocaleString("vi-VN")} giảm · ${breadth.flat.toLocaleString("vi-VN")} tham chiếu`
      : "Chưa có dữ liệu độ rộng phiên";
    return `
      <div class="home-pulse-status">
        <div class="home-pulse-label">Nhịp thị trường</div>
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <span class="badge-soft bs-blue">Phiên ${esc(displayDate)}</span>
          ${state ? `<span class="badge-soft ${state.cls}">${esc(state.text)}</span>` : ""}
        </div>
        <div class="home-pulse-summary">${esc(breadthText)}</div>
      </div>`;
  }

  function renderHeroBanner(summary) {
    const host = typeof document !== "undefined" ? document.getElementById("dashboard-hero-banner") : null;
    if (!host) return;
    host.innerHTML = heroBannerHtml(summary);
  }

  function renderMarketOverview(summary) {
    if (typeof document === "undefined" || !summary) return;
    renderHeroBanner(summary);
    const breadth = summary.session_breadth;
    const scope = getProductScopeFormat();
    if (breadth.available) {
      fillText("kpi-session-up", breadth.up.toLocaleString("vi-VN"), "kpi-value val-pos");
      fillText("kpi-session-flat", breadth.flat.toLocaleString("vi-VN"), "kpi-value");
      fillText("kpi-session-down", breadth.down.toLocaleString("vi-VN"), "kpi-value val-neg");
      fillText("kpi-session-up-sub", `${breadth.priced.toLocaleString("vi-VN")} / ${breadth.price_available.toLocaleString("vi-VN")} mã có biến động giá đủ tính độ rộng`);
      fillText("kpi-session-flat-sub", "tham chiếu / không đổi");
      fillText("kpi-session-down-sub", `${breadth.unpriced.toLocaleString("vi-VN")} mã tham chiếu chưa có giá đúng phiên — không tính là đứng giá`);
    } else {
      fillText("kpi-session-up", "Chưa có dữ liệu hiện tại", "kpi-value");
      fillText("kpi-session-flat", "Chưa có dữ liệu hiện tại", "kpi-value");
      fillText("kpi-session-down", "Chưa có dữ liệu hiện tại", "kpi-value");
    }

    const liq = coverageText(summary.liquidity.proxy_count, summary.denominator, summary.liquidity.proxy_available);
    fillText("kpi-liquidity-proxy", liq.text, "kpi-value");
    fillText("kpi-liquidity-proxy-sub", "Thanh khoản nghiên cứu có dữ liệu");
    fillText(
      "kpi-execution-capacity",
      summary.liquidity.execution_exact_established
        ? coverageText(summary.liquidity.execution_exact_ready, summary.denominator, true).text
        : "Chưa xác lập",
      "kpi-value"
    );
    fillText("kpi-execution-capacity-sub", "Năng lực thực hiện lệnh chính xác");

    const tactical = coverageText(summary.tactical.coverage, summary.denominator, summary.tactical.available);
    const tacticalHost = document.getElementById("tactical-coverage-note");
    if (tacticalHost) {
      tacticalHost.textContent = summary.tactical.available
        ? (scope
          ? scope.formatCoverage({ available: summary.tactical.coverage, reference: summary.reference_ticker_count, label: "có trạng thái kỹ thuật" })
          : `${summary.tactical.coverage.toLocaleString("vi-VN")} / ${summary.denominator.toLocaleString("vi-VN")} mã tham chiếu có trạng thái kỹ thuật`)
        : "Chưa có dữ liệu trạng thái kỹ thuật";
    }
    const sectorHost = document.getElementById("sector-coverage-note");
    if (sectorHost) {
      sectorHost.textContent = summary.sector.available
        ? `${summary.sector.labeled.toLocaleString("vi-VN")} / ${summary.reference_ticker_count.toLocaleString("vi-VN")} mã tham chiếu có nhãn ngành thực`
        : "Chưa có dữ liệu ngành hiện tại";
    }
    renderOverviewCharts(summary);
  }

  function renderOverviewCharts(summary) {
    if (typeof window === "undefined" || !window.Chart || !summary) return;
    const vf = getValueFormat();
    if (vf && typeof vf.applyChartTheme === "function") vf.applyChartTheme();
    const colors = (vf && vf.CHART_COLORS) || {};
    const sectorCanvas = document.getElementById("chart-sector");
    const tacticalCanvas = document.getElementById("chart-tactical");
    const topSectors = (summary.sector.rows || []).slice(0, 10);
    if (sectorCanvas && summary.sector.available && topSectors.length) {
      if (sectorCanvas._chart) sectorCanvas._chart.destroy();
      sectorCanvas._chart = new window.Chart(sectorCanvas, {
        type: "bar",
        data: {
          labels: topSectors.map((row) => row.label),
          datasets: [{
            data: topSectors.map((row) => row.count),
            backgroundColor: colors.series ? colors.series[0] : "rgba(32, 231, 207, 0.75)",
            borderRadius: 4,
            barThickness: 14,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${topSectors[ctx.dataIndex].count.toLocaleString("vi-VN")} mã`,
              },
            },
          },
          scales: {
            x: { ticks: { precision: 0 } },
            y: { grid: { display: false } },
          },
        },
      });
    }
    if (tacticalCanvas && summary.tactical.available) {
      const rows = TACTICAL_ORDER
        .map((state) => ({ state, count: summary.tactical.counts[state] || 0 }))
        .filter((row) => row.count > 0);
      if (tacticalCanvas._chart) tacticalCanvas._chart.destroy();
      if (rows.length) {
        tacticalCanvas._chart = new window.Chart(tacticalCanvas, {
          type: "doughnut",
          data: {
            labels: rows.map((row) => formatLabel(row.state, "tactical_state")),
            datasets: [{
              data: rows.map((row) => row.count),
              backgroundColor: [
                colors.neg, colors.warn, colors.pos, colors.series && colors.series[1],
                colors.neg, colors.muted, colors.warn, colors.series && colors.series[2], colors.pos,
              ],
              borderColor: colors.surface || "#0D2224",
              borderWidth: 3,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "62%",
            plugins: { legend: { position: "bottom" } },
          },
        });
      }
    }
  }

  function validateProjection(payload) {
    return Boolean(
      payload &&
      payload.contract_version === SCREENER_CONTRACT &&
      payload.cards &&
      typeof payload.cards === "object"
    );
  }

  /* Structural + session-coherence validation for the small Home summary. Phase 3 of
     DASHBOARD_HOME_SUMMARY_AND_CACHE_BUSTING_V1: Home must never render a summary bound
     to a different session than the one build_info.json (already the single freshness
     source of truth elsewhere on this page -- see app.js renderTopbarFreshness) reports
     as current. A missing/absent build_info session fails closed to "no session check
     possible" (buildInfoSession null) rather than silently skipping the check. */
  function validateHomeSummary(payload, buildInfoSession) {
    if (!payload || payload.contract_version !== HOME_SUMMARY_CONTRACT) return false;
    if (typeof payload.as_of_session !== "string" || !payload.as_of_session) return false;
    if (!payload.session_breadth || !payload.research_stance || !payload.tactical || !payload.liquidity || !payload.sector) return false;
    // Rolling-deploy compatibility: the posture block is additive. A valid pre-M1 summary without it
    // is still rendered (primary decision shown as unavailable, never the stance); a present but
    // malformed posture block is refused.
    if (payload.research_action_posture !== undefined
        && (!payload.research_action_posture || typeof payload.research_action_posture.counts !== "object")) return false;
    if (buildInfoSession && payload.as_of_session !== buildInfoSession) return false;
    return true;
  }

  function embeddedBuildInfo() {
    if (typeof window === "undefined" || !window.BUILD_INFO || typeof window.BUILD_INFO !== "object") return null;
    return window.BUILD_INFO;
  }

  function buildInfoRequestPlan(embedded) {
    if (embedded && typeof embedded.market_session === "string" && embedded.market_session) return [];
    return [BUILD_INFO_URL];
  }

  function loadBuildInfo() {
    const embedded = embeddedBuildInfo();
    if (buildInfoRequestPlan(embedded).length === 0) return Promise.resolve(embedded);
    return fetch(BUILD_INFO_URL, { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).catch(() => null);
  }

  function currentWorkspaceArtifactIdentity(buildInfo) {
    const workspace = buildInfo && buildInfo.investment_workspace;
    if (!workspace || workspace.status !== "CURRENT") return null;
    if (typeof buildInfo.market_session !== "string" || !buildInfo.market_session) return null;
    if (workspace.source_session !== buildInfo.market_session) return null;
    if (typeof workspace.artifact_identity !== "string" || !workspace.artifact_identity) return null;
    return workspace.artifact_identity;
  }

  function qualifiedNotableCards(summary, session, buildInfo) {
    const block = summary && summary.notable_cards;
    if (!block) return null;
    const identity = currentWorkspaceArtifactIdentity(buildInfo);
    if (!session || summary.as_of_session !== session || !identity) return null;
    if (block.contract_version !== NOTABLE_CARDS_CONTRACT) return null;
    if (block.as_of_session !== session) return null;
    if (block.source_contract_version !== WORKSPACE_INDEX_CONTRACT) return null;
    if (block.source_artifact_identity !== identity) return null;
    if (block.selection !== NOTABLE_SELECTION) return null;
    if (block.selection_limit !== NOTABLE_SELECTION_LIMIT) return null;
    if (!Array.isArray(block.cards) || block.cards.length > NOTABLE_SELECTION_LIMIT) return null;
    const seen = new Set();
    for (const card of block.cards) {
      if (!card || typeof card !== "object" || Array.isArray(card)) return null;
      if (typeof card.ticker !== "string" || !card.ticker || seen.has(card.ticker)) return null;
      seen.add(card.ticker);
      if (card.as_of_session !== session) return null;
      if (card.why != null && (typeof card.why !== "object" || Array.isArray(card.why))) return null;
      if (card.why && card.why.deterministic_reasons != null && !Array.isArray(card.why.deterministic_reasons)) return null;
      if (card.counter_thesis != null && (typeof card.counter_thesis !== "object" || Array.isArray(card.counter_thesis))) return null;
      if (card.counter_thesis && card.counter_thesis.key_counter_thesis != null && !Array.isArray(card.counter_thesis.key_counter_thesis)) return null;
      if (card.reference_trigger != null && (typeof card.reference_trigger !== "object" || Array.isArray(card.reference_trigger))) return null;
    }
    return block;
  }

  function homeOpportunityRequestPlan(summary, buildInfo) {
    const session = buildInfo && typeof buildInfo.market_session === "string" ? buildInfo.market_session : "";
    if (qualifiedNotableCards(summary, session, buildInfo)) return [];
    return [WORKSPACE_INDEX_URL];
  }

  function bootDashboardOverview() {
    const summaryHost = typeof document !== "undefined" ? document.getElementById("current-product-summary") : null;
    if (!summaryHost) return;
    Promise.all([
      fetch(HOME_SUMMARY_URL, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }),
      loadBuildInfo(),
    ])
      .then(([summary, buildInfo]) => {
        const buildInfoSession = buildInfo && typeof buildInfo.market_session === "string" ? buildInfo.market_session : null;
        if (!buildInfoSession || !validateHomeSummary(summary, buildInfoSession)) throw new Error("invalid or session-incoherent dashboard home summary");
        summaryHost.innerHTML = renderDecisionSummaryHtml(summary);
        renderMarketOverview(summary);
        renderInvestorHome(summary);
        bootHomeOpportunities(summary.as_of_session, summary, buildInfo);
      })
      .catch((error) => {
        if (typeof console !== "undefined" && console.debug) console.debug("dashboard summary unavailable:", error);
        summaryHost.innerHTML = `<p class="cockpit-note mb-0">Tạm chưa có dữ liệu tóm tắt cho phiên hiện tại.</p>`;
        fillText("home-sectors", "Chưa có dữ liệu ngành hiện tại.");
        fillText("home-opportunities", "Chưa có dữ liệu cùng phiên để xem xét cổ phiếu.");
        fillText("home-risks", "Chưa thể đánh giá rủi ro do thiếu dữ liệu phiên hiện tại.");
        renderHeroBanner(null);
      });
  }

  function investorRiskHtml(summary) {
    const risks = [];
    const breadth = summary.session_breadth || {};
    const state = marketBreadthStateLabel(breadth);
    if (!breadth.available) risks.push("Chưa có dữ liệu tăng/giảm của phiên hiện tại.");
    else if (state && state.text === "Nghiêng giảm") risks.push("Số mã giảm áp đảo số mã tăng.");
    else if (state && state.text === "Giằng co") risks.push("Thị trường giằng co; số mã tăng và giảm chưa nghiêng rõ về một phía.");
    if (summary.price_unavailable_count > 0) risks.push(`${summary.price_unavailable_count.toLocaleString("vi-VN")} mã tham chiếu thiếu giá đúng phiên; bức tranh thị trường chưa đầy đủ.`);
    const currency = (summary.evidence_currency || {}).counts || {};
    if (currency.LAST_TRADE_AS_OF) risks.push(`${currency.LAST_TRADE_AS_OF.toLocaleString("vi-VN")} mã có dữ liệu đã cũ.`);
    if (currency.NO_CURRENT_EVIDENCE) risks.push(`${currency.NO_CURRENT_EVIDENCE.toLocaleString("vi-VN")} mã chưa có dữ liệu nghiên cứu hiện tại.`);
    if (!summary.liquidity || !summary.liquidity.execution_exact_established) risks.push("Chưa đủ dữ liệu xác lập khả năng vào/ra vị thế. Thanh khoản tham khảo không chứng minh khả năng thực hiện lệnh.");
    return `<ul class="cockpit-list">${(risks.length ? risks : ["Chưa ghi nhận cảnh báo trong các dữ liệu được công bố; vẫn cần kiểm tra từng mã."]).map((risk) => `<li>${esc(risk)}</li>`).join("")}</ul>`;
  }

  function renderInvestorHome(summary) {
    const sectorHost = document.getElementById("home-sectors");
    if (sectorHost) sectorHost.innerHTML = summary.sector.available
      ? `<p class="cockpit-note">Các nhóm có nhiều mã trong phạm vi dữ liệu; chưa có cơ sở xác định ngành dẫn dắt.</p><div class="home-sector-list">${(summary.sector.rows || []).slice(0, 4).map((row) => `<div><span>${esc(row.label)}</span><strong>${esc(row.count.toLocaleString("vi-VN"))} mã</strong></div>`).join("")}</div>`
      : '<p class="cockpit-note">Chưa có dữ liệu ngành hiện tại.</p>';
    const risks = document.getElementById("home-risks");
    if (risks) risks.innerHTML = investorRiskHtml(summary);
    fillText("home-coverage", `Phạm vi tham chiếu: ${summary.reference_ticker_count.toLocaleString("vi-VN")} mã. Có giá đúng phiên: ${summary.price_available_count.toLocaleString("vi-VN")} mã. Thanh khoản tham khảo: ${summary.liquidity.proxy_count.toLocaleString("vi-VN")} mã.`);
    fillText("market-last-updated", `Phiên ${summary.as_of_session}`);
  }

  function opportunityArticleHtml(ticker, card, workspaceApi) {
    const trigger = card.reference_trigger || (card.tactical || {}).reference_trigger || {};
    const warning = ((card.counter_thesis || {}).key_counter_thesis || [])[0];
    return `<article class="home-opportunity" data-focus-ticker="${esc(ticker)}"><h3><a href="investment-workspace.html?ticker=${encodeURIComponent(ticker)}">${esc(ticker)}</a></h3><p>${esc(formatLabel(card.entry_state, "tactical_state"))}</p><div>${workspaceApi.actionPostureHtml(card)} ${workspaceApi.evidenceCurrencyHtml(card.evidence_currency)}</div><p>${esc(workspaceApi.compactReasons(card, 1)[0])}</p><p class="cockpit-note">${trigger.trigger_level != null ? `Mức tham chiếu: ${esc(trigger.trigger_level)} — cần xác nhận, chưa phải điểm mua.` : "Chưa có mức kích hoạt được xác lập."}</p><p class="cockpit-note">Lưu ý: ${esc(warning ? formatLabel(warning, "setup_tag") : "Cần kiểm tra điều kiện vô hiệu và dữ liệu còn thiếu.")}</p></article>`;
  }

  function homeOpportunitiesHtml(index, session, workspaceApi) {
    if (!index || index.as_of_session !== session || index.contract_version !== WORKSPACE_INDEX_CONTRACT || !index.cards) return '<p class="cockpit-note">Chưa có dữ liệu cổ phiếu cùng phiên. Không dùng dữ liệu cũ thay thế.</p>';
    return workspaceApi.notableTickers(index.cards).map((ticker) => opportunityArticleHtml(ticker, index.cards[ticker], workspaceApi)).join("") || '<p class="cockpit-note">Chưa có mã đáng chú ý theo trạng thái hiện tại.</p>';
  }

  function publishedNotableHtml(block, workspaceApi) {
    return block.cards.map((card) => opportunityArticleHtml(card.ticker, card, workspaceApi)).join("") || '<p class="cockpit-note">Chưa có mã đáng chú ý theo trạng thái hiện tại.</p>';
  }

  function presentationApi() {
    const root = typeof window !== "undefined" ? window : globalThis;
    return root.VSWorkspaceCardPresentation || root.VSInvestmentWorkspace || null;
  }

  function bootHomeOpportunities(session, summary, buildInfo) {
    const host = document.getElementById("home-opportunities");
    if (!host) return;
    const published = qualifiedNotableCards(summary, session, buildInfo);
    if (published) {
      try {
        host.innerHTML = publishedNotableHtml(published, presentationApi());
      } catch (error) {
        if (typeof console !== "undefined" && console.debug) console.debug("Home opportunities unavailable", error);
        host.textContent = "Chưa có dữ liệu cổ phiếu để xem xét.";
      }
      return;
    }
    fetch(WORKSPACE_INDEX_URL, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("workspace index unavailable");
      return response.json();
    }).then((index) => {
      host.innerHTML = homeOpportunitiesHtml(index, session, presentationApi());
    })
      .catch((error) => { console.debug("Home opportunities unavailable", error); host.textContent = "Chưa có dữ liệu cổ phiếu để xem xét."; });
  }

  if (typeof document !== "undefined" && document.body && document.body.dataset.page === "dashboard") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootDashboardOverview);
    } else {
      bootDashboardOverview();
    }
  }

  return {
    SCREENER_URL,
    SCREENER_CONTRACT,
    HOME_SUMMARY_URL,
    HOME_SUMMARY_CONTRACT,
    BUILD_INFO_URL,
    WORKSPACE_INDEX_URL,
    NOTABLE_CARDS_CONTRACT,
    NOTABLE_SELECTION,
    NOTABLE_SELECTION_LIMIT,
    buildInfoRequestPlan,
    qualifiedNotableCards,
    homeOpportunityRequestPlan,
    publishedNotableHtml,
    bootHomeOpportunities,
    STANCE_ORDER,
    POSTURE_ORDER,
    POSTURE_UNAVAILABLE_TEXT,
    EVIDENCE_CURRENCY_ORDER,
    evidenceCurrencyClass,
    TACTICAL_ORDER,
    getProductScopeFormat,
    summarizeScreenerOverview,
    coverageText,
    missingMetricNeverZero,
    renderDecisionSummaryHtml,
    heroBannerHtml,
    marketBreadthStateLabel,
    renderMarketOverview,
    validateProjection,
    validateHomeSummary,
    investorRiskHtml, homeOpportunitiesHtml,
  };
});
