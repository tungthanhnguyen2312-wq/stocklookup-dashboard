(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.VSDecisionCockpit = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const URL = "data/current_decision_cockpit.json";
  const vf = (typeof window !== "undefined" && window.VSValueFormat)
    ? window.VSValueFormat
    : (typeof require === "function" ? require("./value-format.js") : {});
  const productScope = root.VSProductScopeFormat || {
    formatCount: (count) => String(count),
    formatCoverage: ({ available, reference, label }) => `${available} / ${reference} mã tham chiếu ${label}`,
  };

  const esc = vf.esc || ((v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])));
  const unavailable = (v) => (v === null || v === undefined || v === "") ? "UNAVAILABLE" : v;

  // Deliberately does not delegate to vf.formatKnownLabel: this wrapper is also
  // called with free-text sentences and no domain (e.g. what_to_verify_next items,
  // a macro reason, a peer-context note) that must pass through unchanged, and the
  // only reliable way to tell "no domain recognized this value" from "this is a
  // real translated label" is formatDomainState's own `known` flag -- not string-
  // comparing the formatted output back against the raw input (a real Vietnamese
  // label is, by construction, always different from its raw source value, so that
  // comparison can't distinguish a genuine miss from a genuine hit).
  function formatLabel(v, domain) {
    if (v === null || v === undefined || v === "") return "Chưa có dữ liệu";
    const raw = String(v).trim();
    if (vf.formatDomainState) {
      const res = vf.formatDomainState(raw, domain);
      if (res && res.known && res.label) return res.label;
      if (vf.DOMAIN_TABLES) {
        for (const altDomain of Object.keys(vf.DOMAIN_TABLES)) {
          if (altDomain === domain) continue;
          const alt = vf.formatDomainState(raw, altDomain);
          if (alt && alt.known) return alt.label;
        }
      }
    }
    if (/^[A-Z0-9_]+$/.test(raw)) {
      if (raw === "UNAVAILABLE" || raw === "ABSENT") return "Chưa có dữ liệu";
      if (raw === "AVAILABLE") return "Có dữ liệu";
      if (raw === "PARTIAL") return "Một phần";
      if (raw === "BLOCKED") return "Bị chặn";
      if (raw === "UNKNOWN") return "Chưa xác định";
      return "Trạng thái kỹ thuật";
    }
    return raw;
  }

  function state(v, domain) {
    const s = unavailable(v);
    const raw = String(s);
    const tone = vf.getSemanticTone ? vf.getSemanticTone(raw, domain) : "neutral";
    const label = formatLabel(raw, domain);
    return `<span class="cockpit-state tone-${tone}" data-state="${esc(raw)}" data-tone="${tone}" title="${esc(raw)}">${esc(label)}</span>`;
  }

  const list = (values) => Array.isArray(values) && values.length
    ? `<ul class="cockpit-list">${values.map(x => {
        const str = typeof x === "string" ? x : JSON.stringify(x);
        return `<li>${esc(formatLabel(str) || str)}</li>`;
      }).join("")}</ul>`
    : '<span class="cockpit-note">Chưa ghi nhận</span>';

  const card = (label, value, domain) =>
    `<div class="cockpit-kpi"><div class="label">${esc(label)}</div><div class="value">${typeof value === "string" ? state(value, domain) : esc(unavailable(value))}</div></div>`;

  function renderTicker(data, ticker) {
    const c = data.ticker_cards && data.ticker_cards[ticker];
    if (!c) return;
    const s = c.current_decision_state || {},
      strategy = c.strategy_fit || {},
      scenario = c.scenario || {},
      peer = c.peer_context || {},
      fundamental = c.fundamental_context || {},
      valuation = c.valuation_context || {},
      flow = c.market_flow_positioning || {},
      corp = c.corporate_intelligence_context || {};

    const scenarios = [
      ['Tiêu cực', scenario.bear_case],
      ['Cơ sở', scenario.base_case],
      ['Tích cực', scenario.bull_case]
    ].map(([name, x]) =>
      `<div class="card">
        <div class="card-header"><h6>${name} <small>${state(x?.case_status, 'evidence_state')}</small></h6></div>
        <div class="card-body">
          <div class="cockpit-note">Trạng thái xác suất: ${state(x?.probability_status, 'data_fitness')}</div>
          <b>Điều kiện xác nhận</b>${list(x?.required_confirmations || x?.case_conditions || x?.continuation_conditions)}
          <b>Điều kiện vô hiệu</b>${list(x?.transition_to_bear_conditions || [x?.invalidation].filter(Boolean))}
          <b>Khoảng trống dữ liệu</b>${list(x?.data_gaps)}
        </div>
      </div>`
    ).join("");

    const stratList = (strategy.strategies || []).map(x => {
      const sId = formatLabel(x.strategy_id, 'strategy');
      const sSt = formatLabel(x.status, 'data_fitness');
      const sWhy = (x.why || []).map(w => formatLabel(w, 'rule_condition')).join('; ');
      return `${sId}: ${sSt}${sWhy ? ` — ${sWhy}` : ''}`;
    });

    const el = document.getElementById('ticker-card');
    if (el) {
      el.innerHTML = `
      <div class="cockpit-grid mb-3">
        ${card('Trạng thái hiện tại', s.entry_state, 'tactical_state')}
        ${card('Hành động nghiên cứu', s.entry_action, 'entry_action')}
        ${card('Khung thời gian', s.horizon, 'horizon')}
        ${card('Chất lượng kỹ thuật', c.data_quality?.technical_eligible ? 'AVAILABLE' : 'UNAVAILABLE', 'data_fitness')}
      </div>
      <div class="cockpit-detail-grid">
        <div class="card">
          <div class="card-header"><h6>Mức phù hợp chiến lược</h6></div>
          <div class="card-body">
            ${state(strategy.status, 'data_fitness')}
            ${list(stratList)}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h6>Bối cảnh cùng ngành</h6></div>
          <div class="card-body">
            <b>${esc(formatLabel(peer.peer_group, 'entity_type'))}</b> · ${state(peer.context_status, 'evidence_state')}<br>
            <span class="cockpit-note">${esc(formatLabel(peer.stock_specific_vs_sector_wide))}</span><br>
            <b>Điểm bất thường</b>${list(peer.what_is_unusual)}
            <b>Điểm không bất thường</b>${list(peer.what_is_not_unusual)}
            ${list(peer.limitations)}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h6>Cơ bản doanh nghiệp</h6></div>
          <div class="card-body">
            ${state(fundamental.authority_tier, 'data_fitness')}<br>
            Doanh thu: ${state(fundamental.revenue_direction, 'fundamental_trajectory')}<br>
            Lợi nhuận: ${state(fundamental.earnings_direction, 'fundamental_trajectory')}<br>
            Mức đồng thuận: ${state(fundamental.revenue_vs_earnings_alignment?.status, 'data_fitness')}
            ${list(fundamental.limitations)}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h6>Định giá</h6></div>
          <div class="card-body">
            Định giá nghiêm ngặt: ${state(valuation.strict_valuation_status, 'valuation_state')}<br>
            Chỉ báo thay thế nghiên cứu: ${state(valuation.shadow_proxy_available ? 'AVAILABLE_SHADOW_ONLY' : 'UNAVAILABLE', 'valuation_state')}
            <div class="cockpit-note mt-2">${esc(unavailable(valuation.authority_warning))}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h6>Dòng tiền thị trường</h6></div>
          <div class="card-body">
            ${state(flow.status, 'liquidity_state')}<br>
            Giá trị giao dịch: ${state(flow.traded_value_composition?.state, 'liquidity_state')}<br>
            Khối ngoại: ${state(flow.foreign_flow, 'liquidity_state')}<br>
            Tự doanh: ${state(flow.proprietary_flow, 'liquidity_state')}<br>
            Dòng lệnh chủ động: ${state(flow.active_order?.state, 'liquidity_state')}
            ${list(flow.limitations)}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h6>Thông tin doanh nghiệp</h6></div>
          <div class="card-body">
            ${state(corp.status, 'evidence_state')}
            <b>Đã xác nhận</b>${list(corp.confirmed)}
            <b>Đang chờ / Kế hoạch</b>${list(corp.planned_or_pending)}
            <b>Cần kiểm chứng</b>${list(corp.what_to_verify)}
          </div>
        </div>
      </div>
      <div class="mt-3">
        <h6>Kịch bản tiêu cực / Cơ sở / Tích cực — có điều kiện, không phải dự báo</h6>
        <div class="cockpit-detail-grid">${scenarios}</div>
      </div>
      <div class="cockpit-detail-grid mt-3">
        <div class="card">
          <div class="card-header"><h6>Luận điểm / Phản biện</h6></div>
          <div class="card-body">
            <b>Luận điểm thực tế / suy luận</b>${list((c.thesis_counter_thesis?.thesis || []).map(x => `${formatLabel(x.type)}: ${x.claim}`))}
            <b>Khoảng trống dữ liệu</b>${list((c.thesis_counter_thesis?.counter_thesis || []).map(x => `${formatLabel(x.type)}: ${x.claim}`))}
            <b>Câu hỏi cần kiểm chứng</b>${list((c.thesis_counter_thesis?.questions_to_verify || []).map(x => `${formatLabel(x.type)}: ${x.claim}`))}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h6>Vĩ mô</h6></div>
          <div class="card-body">
            ${state(data.macro_context?.status, 'data_fitness')}
            <div class="cockpit-note">${esc(formatLabel(data.macro_context?.reason))}</div>
            <b>Giới hạn dữ liệu</b>${list(c.authority_limitations)}
          </div>
        </div>
      </div>`;
    }
  }

  function bindInteractiveEvents(data, setTicker) {
    if (typeof document === "undefined") return;
    document.querySelectorAll('[data-action="toggle-cohort"]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('aria-controls');
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;
        const isExpanded = btn.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
          targetEl.hidden = true;
          btn.setAttribute('aria-expanded', 'false');
          btn.textContent = `Xem thêm ${btn.dataset.remaining} mã`;
        } else {
          targetEl.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
          btn.textContent = 'Thu gọn';
        }
      };
    });

    document.querySelectorAll('[data-ticker]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        if (setTicker) setTicker(btn.dataset.ticker);
      };
    });
  }

  const GAP_DIMENSION_LABELS = Object.freeze({
    corporate_intelligence_unavailable: "Thông tin doanh nghiệp thiếu",
    fundamental_context_unavailable: "Cơ bản doanh nghiệp thiếu context",
    market_flow_unavailable: "Dòng tiền thị trường thiếu",
    peer_context_unavailable: "Bối cảnh cùng ngành thiếu",
    strategy_classification_unavailable: "Phân loại chiến lược chưa sẵn sàng",
    strict_valuation_ready: "Định giá nghiêm ngặt sẵn sàng",
    technical_unavailable: "Kỹ thuật thiếu dữ liệu",
    valuation_peer_context_unavailable: "Định giá cùng ngành thiếu",
  });

  function renderMarketOverviewHtml(data) {
    if (!data) return '<div class="cockpit-note">Chưa có dữ liệu tổng quan thị trường</div>';
    const market = data.market_overview || {};
    const cov = market.coverage || {};
    const trend = market.trend_state || {};
    const trendStr = (trend.above_ma20 != null || trend.at_or_below_ma20 != null)
      ? `${trend.above_ma20 ?? '—'} trên MA20 / ${trend.at_or_below_ma20 ?? '—'} tại/dưới`
      : 'Chưa có';
    const covStr = cov.same_session_technical_feature_available_count != null
      ? productScope.formatCoverage({
        available: cov.same_session_technical_feature_available_count,
        reference: 1683,
        label: "có trạng thái kỹ thuật",
      })
      : 'Chưa có';
    const cards = [
      card('Độ rộng thị trường', market.breadth_state, 'data_fitness'),
      card('Động lượng', market.momentum_state, 'data_fitness'),
      card('Độ bao phủ xu hướng', trendStr),
      card('Độ bao phủ kỹ thuật', covStr),
      card('Phiên nguồn', market.source_market_session || data.session || '—')
    ];
    if (market.volatility_context && market.volatility_context.median != null) {
      cards.push(card('Biến động tham khảo', `${(market.volatility_context.median * 100).toFixed(2)}%`));
    }
    return cards.join('');
  }

  function renderMarketWarningsHtml(data) {
    if (!data) return '';
    const market = data.market_overview || {};
    const warnings = [
      ...(market.data_quality_limitations || []).map(x => formatLabel(x, 'rule_condition')),
      ...(data.source?.warnings || []).map(x => formatLabel(x, 'rule_condition'))
    ];
    return warnings.length ? list(warnings) : '';
  }

  function renderCohortsHtml(data, defaultVisible) {
    const DEFAULT_VISIBLE_COHORT = defaultVisible || 8;
    const cohorts = data?.research_discovery?.cohorts || {};
    return Object.entries(cohorts).map(([name, v], idx) => {
      const sorted = [...(v.tickers || [])].sort();
      const total = sorted.length;
      const cohortId = `cohort-${idx}`;
      const cohortTitle = formatLabel(name, 'tactical_state');
      const initialChips = sorted.slice(0, DEFAULT_VISIBLE_COHORT).map(t => `<button type="button" class="cockpit-chip font-monospace fw-bold" data-ticker="${esc(t)}">${esc(t)}</button>`).join('');
      let extraMarkup = '';
      if (total > DEFAULT_VISIBLE_COHORT) {
        const remaining = total - DEFAULT_VISIBLE_COHORT;
        const extraChips = sorted.slice(DEFAULT_VISIBLE_COHORT).map(t => `<button type="button" class="cockpit-chip font-monospace fw-bold" data-ticker="${esc(t)}">${esc(t)}</button>`).join('');
        extraMarkup = `<span id="${cohortId}-extra" class="cockpit-chip-extra" hidden>${extraChips}</span><button type="button" class="cockpit-toggle-btn" aria-expanded="false" aria-controls="${cohortId}-extra" data-action="toggle-cohort" data-target="${cohortId}-extra" data-remaining="${remaining}">Xem thêm ${remaining} mã</button>`;
      }
      return `<div class="mb-3">
        <div class="d-flex align-items-center gap-2 mb-1">
          <b>${esc(cohortTitle)}</b> <span class="cockpit-state available">${total} mã</span>
        </div>
        <div class="cockpit-note">${esc(v.ordering ? 'sắp xếp theo mã, không phải xếp hạng' : '')}</div>
        <div class="cockpit-chip-row mt-1" id="${cohortId}-chips">
          ${initialChips}
          ${extraMarkup}
        </div>
      </div>`;
    }).join('');
  }

  function renderPriorityReviewHtml(data, defaultVisible) {
    const DEFAULT_VISIBLE_PRIORITY = defaultVisible || 10;
    const review = data?.research_discovery?.high_priority_review || {};
    const reviewSorted = [...(review.tickers || [])].sort();
    const reviewTotal = reviewSorted.length;
    if (!reviewTotal) return '';
    const reviewInitial = reviewSorted.slice(0, DEFAULT_VISIBLE_PRIORITY).map(t => `<button type="button" class="cockpit-chip font-monospace fw-bold" data-ticker="${esc(t)}">${esc(t)}</button>`).join('');
    let reviewExtraMarkup = '';
    if (reviewTotal > DEFAULT_VISIBLE_PRIORITY) {
      const remaining = reviewTotal - DEFAULT_VISIBLE_PRIORITY;
      const reviewExtra = reviewSorted.slice(DEFAULT_VISIBLE_PRIORITY).map(t => `<button type="button" class="cockpit-chip font-monospace fw-bold" data-ticker="${esc(t)}">${esc(t)}</button>`).join('');
      reviewExtraMarkup = `<span id="priority-extra" class="cockpit-chip-extra" hidden>${reviewExtra}</span><button type="button" class="cockpit-toggle-btn" aria-expanded="false" aria-controls="priority-extra" data-action="toggle-cohort" data-target="priority-extra" data-remaining="${remaining}">Xem thêm ${remaining} mã</button>`;
    }
    return `
      <b>Nhóm ưu tiên xem xét: ${reviewTotal} mã</b>
      <div class="cockpit-note">${esc(review.meaning ? 'Ứng viên cho nghiên cứu có người kiểm tra, không phải cấu phần danh mục.' : '')}</div>
      <div class="cockpit-chip-row mt-2" id="priority-chips">
        ${reviewInitial}
        ${reviewExtraMarkup}
      </div>`;
  }

  // workspaceCards is accepted for call-site/signature compatibility but intentionally never used
  // to source a ticker's row: a Workspace card has a different shape than a Cockpit ticker_card
  // (research_stance/why/prospective_case vs strategy_fit/scenario/why_it_is_on_radar), so falling
  // back to it silently mixed Workspace fields into Cockpit-native Strategy/Scenario columns.
  function renderOwnerFocusHtml(data, workspaceCards, overrideTickers) {
    const focus = data?.owner_focus;
    const rawList = overrideTickers || (focus && Array.isArray(focus.tickers) && focus.tickers.length ? focus.tickers : (data?.watchlist?.tickers || []));
    const tickers = rawList.slice().sort();
    if (!tickers.length) {
      return '<tr><td colspan="6" class="cockpit-note text-center">Chưa có mã trong danh sách theo dõi</td></tr>';
    }
    return tickers.map(t => {
      const c = data?.ticker_cards && data.ticker_cards[t];
      if (!c) {
        return `<tr>
          <td><button type="button" class="cockpit-chip font-monospace fw-bold" data-ticker="${esc(t)}">${esc(t)}</button></td>
          <td colspan="5"><span class="cockpit-note">Chưa có dữ liệu bổ sung cho mã này</span> <button type="button" class="btn btn-sm btn-outline-light ms-2" data-ticker="${esc(t)}">Xem chi tiết &rarr;</button></td>
        </tr>`;
      }
      const s = c.current_decision_state || { entry_state: c.entry_state, entry_action: c.entry_action };
      const st = c.strategy_fit || {};
      const sc = c.scenario || {};
      const actionHtml = s.entry_action
        ? `${state(s.entry_state, 'tactical_state')} ${state(s.entry_action, 'entry_action')}`
        : state(s.entry_state, 'tactical_state');
      const stratHtml = st.status ? state(st.status, 'data_fitness') : state(c.research_stance, 'research_stance');
      const scenHtml = state(st.scenario_relationship?.scenario_disposition || sc.base_case?.case_status || (c.prospective_case && c.prospective_case.status), 'data_fitness');
      const rawReason = (c.why_it_is_on_radar?.deterministic_reasons || c.why?.deterministic_reasons || [])[0] || '';
      const reasons = rawReason ? (formatLabel(rawReason) || rawReason) : 'Chưa có dữ liệu';
      const limitations = (c.what_argues_against?.limitations || c.counter_thesis?.warnings || [])[0] || '';
      const quality = state(c.data_quality?.market_breadth_quality_state || (c.data_quality?.technical_eligible ? 'AVAILABLE' : (c.research_stance_readiness || 'UNAVAILABLE')), 'data_fitness');
      return `<tr>
        <td><button type="button" class="cockpit-chip font-monospace fw-bold" data-ticker="${esc(t)}">${esc(t)}</button></td>
        <td>${actionHtml}</td>
        <td>${stratHtml}</td>
        <td>${scenHtml}</td>
        <td>${esc(reasons)}${limitations ? `<br><span class="cockpit-note">${esc(limitations)}</span>` : ''}</td>
        <td>${quality}</td>
      </tr>`;
    }).join('');
  }

  function renderPortfolioRiskHtml(data) {
    const pr = data?.portfolio_risk;
    // Absence test is the explicit contract status only. is_actionable is unconditionally false on
    // every envelope current_portfolio_risk_envelope.py ever emits -- including a fully evaluated
    // one with real positions -- so it is an authority boundary, never a presence/absence signal.
    if (!pr || pr.status === "NO_EXPLICIT_PORTFOLIO_SUPPLIED") {
      const msg = (pr?.message && pr.message !== "No explicit portfolio-risk envelope was supplied for this operation.")
        ? (formatLabel(pr.message) || pr.message)
        : "Không có danh mục cụ thể để đối chiếu trong phiên nghiên cứu hiện tại.";
      // PHASE 26 (DASHBOARD_PAYLOAD_COMPACTION_AND_INVESTOR_FIRST_IA_V1): an expected empty
      // state ("no portfolio uploaded yet") is not a system warning -- a quiet note, not the
      // yellow/red alert box reserved for genuinely investor-relevant risk/decision conditions.
      return `
        <div class="mb-0">
          <div class="d-flex align-items-center gap-2 mb-1">
            <b>Chưa cung cấp danh mục cụ thể</b>
            ${state(pr?.status || "NO_EXPLICIT_PORTFOLIO_SUPPLIED", "portfolio_state")}
          </div>
          <p class="mb-0 mt-1 cockpit-note">${esc(msg)}</p>
        </div>
      `;
    }

    // Evaluated envelope: render only fields verified against current_portfolio_risk_envelope.py's
    // real return shape. Never invent risk_level / concentration_summary / risk_notes.
    const kpis = [];
    if (pr.portfolio_id != null) kpis.push(card("Danh mục", esc(pr.portfolio_id)));
    if (Array.isArray(pr.positions)) kpis.push(card("Số vị thế nắm giữ", esc(pr.positions.length)));

    const concentrationBlocks = (pr.concentration && typeof pr.concentration === "object")
      ? Object.entries(pr.concentration).map(([dim, weights]) => {
          const rows = (weights && typeof weights === "object" && !Array.isArray(weights))
            ? Object.entries(weights).map(([k, v]) => `<li>${esc(k)}: ${esc(typeof v === "number" ? `${(v * 100).toFixed(1)}%` : v)}</li>`).join('')
            : `<li>${esc(String(weights))}</li>`;
          return `<div class="mt-1"><span class="cockpit-note">${esc(formatLabel(dim) || dim)}</span><ul class="cockpit-list">${rows}</ul></div>`;
        }).join('')
      : '';

    const limitResults = Array.isArray(pr.user_limit_results) ? pr.user_limit_results : [];
    const limitHtml = limitResults.length
      ? `<ul class="cockpit-list">${limitResults.map(b => `<li>${esc(b.limit_id || 'Hạn mức')}: ${state(b.status, 'portfolio_state')}</li>`).join('')}</ul>`
      : '<span class="cockpit-note">Chưa thiết lập hạn mức người dùng để đối chiếu.</span>';

    return `
      ${kpis.length ? `<div class="cockpit-grid mb-3">${kpis.join('')}</div>` : ''}
      ${concentrationBlocks ? `<div class="mb-2"><b>Tập trung danh mục</b>${concentrationBlocks}</div>` : ''}
      <div class="mb-2"><b>Đối chiếu hạn mức người dùng</b>${limitHtml}</div>
      <div class="cockpit-note mt-2">Chỉ mang tính nghiên cứu mô tả — không phải khuyến nghị hành động, không tính quy mô vị thế hay phân bổ tối ưu.</div>
    `;
  }

  function renderDataGapsHtml(data) {
    const gaps = data?.risk_data_gaps;
    if (!gaps || typeof gaps !== "object") return '<div class="cockpit-note">Chưa ghi nhận khoảng trống dữ liệu</div>';
    if (Array.isArray(gaps)) {
      return gaps.map(g => card(g.dimension || g.label || "Trục", g.status || g.count || "UNAVAILABLE")).join('');
    }
    const renderEntry = ([k, count]) => {
      const label = GAP_DIMENSION_LABELS[k] || formatLabel(k, 'risk_data_gaps') || k;
      const countDisplay = typeof count === "number" ? `${count.toLocaleString("vi-VN")} mã` : String(count);
      return `<div class="cockpit-kpi"><div class="label">${esc(label)}</div><div class="value font-monospace">${esc(countDisplay)}</div></div>`;
    };
    // Field-name convention in the real artifact: every key is suffixed either "_unavailable"
    // (a missing-data count) or "_ready" (positive readiness coverage) -- e.g. strict_valuation_ready
    // is not another gap. Keep the two apart instead of rendering them as one undifferentiated list.
    const entries = Object.entries(gaps);
    const missingHtml = entries.filter(([k]) => !k.endsWith('_ready')).map(renderEntry).join('');
    const readyEntries = entries.filter(([k]) => k.endsWith('_ready'));
    const readyHtml = readyEntries.length
      ? `<div class="mt-3"><div class="cockpit-note mb-2">Độ bao phủ / Sẵn sàng</div><div class="cockpit-grid">${readyEntries.map(renderEntry).join('')}</div></div>`
      : '';
    return missingHtml + readyHtml;
  }

  // brief_market_context/v1: verbatim copy of the Daily Brief's matched-cohort participation change
  // and market-gated setups. Rendered only when present and bound to the projection's own session;
  // nothing is recomputed, scored or ranked here.
  const PARTICIPATION_CHARACTER_VI = {
    BROADENING: "Lan rộng — nhiều mã cùng tham gia hơn",
    NARROWING: "Thu hẹp — ít mã tham gia hơn",
    DIVERGENT: "Phân hóa — các thước đo đi ngược chiều",
    UNCHANGED: "Không đổi",
    UNCHANGED_ON_ONE_MEASURE: "Gần như không đổi",
    UNKNOWN: "Chưa xác định",
  };
  const CONDITION_VI = {
    CONFIRMED: "Đã xác nhận",
    REFUTED: "Bị bác bỏ",
    NEITHER_CONFIRMED_NOR_REFUTED: "Chưa xác nhận cũng chưa bị bác bỏ",
  };
  const CONDITION_LABEL_VI = {
    "Participation improves": "Điều kiện \"độ rộng cải thiện\" của bản tin đóng cửa",
  };
  const REGIME_VI = {
    DETERIORATING_BREADTH: "Độ rộng suy yếu",
    DEFENSIVE: "Phòng thủ",
    BEARISH: "Giảm",
    WEAK: "Yếu",
    DISTRIBUTION: "Phân phối",
    HIGH_RISK: "Rủi ro cao",
  };

  function signedPp(v) {
    if (typeof v !== "number" || !isFinite(v)) return "—";
    return `${v > 0 ? "+" : ""}${v.toFixed(2)} điểm %`;
  }

  function signedCount(v) {
    if (typeof v !== "number" || !isFinite(v)) return "—";
    return `${v > 0 ? "+" : ""}${v}`;
  }

  const plainKpi = (label, value) =>
    `<div class="cockpit-kpi"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;

  function renderParticipationChangeHtml(pc) {
    if (!pc) return "";
    if (pc.status !== "AVAILABLE") {
      const reasons = Array.isArray(pc.reason_codes) ? pc.reason_codes.join(", ") : "";
      return `<div class="cockpit-note" data-participation-status="${esc(pc.status || "UNAVAILABLE")}">Chưa so sánh được độ rộng với phiên trước${reasons ? ` (${esc(reasons)})` : ""}.</div>`;
    }
    const ch = pc.changes || {};
    const cohort = pc.cohort || {};
    const cross = pc.ma20_crossings || {};
    const character = PARTICIPATION_CHARACTER_VI[pc.participation_character] || "Chưa xác định";
    const span = (pc.span && typeof pc.span === "object") ? pc.span : {};
    const multiSession = span.may_span_multiple_trading_sessions === true;
    const adjacency = String(pc.adjacency || "");
    const warnings = [];
    if (multiSession) {
      const days = Number.isInteger(span.calendar_weekdays_between) ? span.calendar_weekdays_between : null;
      warnings.push(`Giữa hai phiên có ${days != null ? esc(days) + " " : ""}ngày làm việc (thứ Hai–thứ Sáu), nên thay đổi này có thể gộp nhiều phiên giao dịch, không phải biến động của một phiên. Cách đếm này không phải lịch giao dịch chính thức của sở.`);
    }
    if (adjacency.startsWith("NON_ADJACENT") || adjacency === "ADJACENCY_UNVERIFIED") {
      warnings.push("Phiên so sánh chưa được xác nhận là phiên hoàn tất liền trước.");
    }
    const momDenom = Number.isInteger(cohort.matched_with_momentum_both_sessions) ? cohort.matched_with_momentum_both_sessions : null;
    const ma20Denom = Number.isInteger(cohort.matched_with_ma20_side_both_sessions) ? cohort.matched_with_ma20_side_both_sessions : null;
    return `
      <div class="cockpit-grid" data-participation-character="${esc(pc.participation_character || "UNKNOWN")}" data-multi-session="${multiSession ? "true" : "false"}">
        ${plainKpi("Đặc điểm tham gia", character)}
        ${plainKpi("Tỷ lệ mã tăng", signedPp(ch.advance_ratio_pp))}
        ${plainKpi("Tỷ lệ mã trên MA20", signedPp(ch.above_ma20_share_pp))}
        ${plainKpi("Tỷ lệ động lượng dương", signedPp(ch.positive_momentum_share_pp))}
        ${plainKpi("Cắt MA20 (ròng)", `${signedCount(cross.net)} (lên ${cross.crossed_above ?? "—"} / xuống ${cross.crossed_below ?? "—"})`)}
      </div>
      ${warnings.map(w => `<div class="cockpit-note mt-2" data-span-warning="true"><strong>Lưu ý:</strong> ${w}</div>`).join("")}
      <div class="cockpit-note mt-2">So với phiên ${esc(pc.previous_session || "—")} trên cùng ${esc(cohort.matched ?? "—")} mã có mặt ở cả hai phiên; ${esc(cohort.current_only ?? 0)} mã chỉ có ở phiên này và ${esc(cohort.previous_only ?? 0)} mã chỉ có ở phiên trước không được tính.${ma20Denom != null ? ` MA20 tính trên ${esc(ma20Denom)} mã biết vị trí MA20 ở cả hai phiên.` : ""}${momDenom != null ? ` Động lượng tính trên ${esc(momDenom)} mã có dữ liệu động lượng ở cả hai phiên.` : ""}</div>
      ${renderConditionHtml(pc.market_close_condition_evaluation)}`;
  }

  // market_close_condition_evaluation is one object {hypothesis, state, condition_source}. Only the
  // hypothesis and its Engine-evaluated state are shown; condition_source is provenance, not a condition.
  function renderConditionHtml(cond) {
    if (!cond || typeof cond !== "object" || Array.isArray(cond)) return "";
    if (typeof cond.hypothesis !== "string" || typeof cond.state !== "string") return "";
    const label = CONDITION_LABEL_VI[cond.hypothesis] || "Điều kiện của bản tin đóng cửa";
    const state = CONDITION_VI[cond.state] || "Chưa xác định";
    return `<ul class="cockpit-list mt-2"><li data-condition-state="${esc(cond.state)}">${esc(label)}: <strong>${esc(state)}</strong></li></ul>`;
  }

  function renderMarketGatedHtml(rows, count) {
    if (!Array.isArray(rows) || !rows.length) return "";
    const items = rows.map(r => {
      const inv = r.security_invalidation || {};
      const invText = inv.invalidation_level != null ? `Mức vô hiệu của mã: ${esc(inv.invalidation_level)}` : "Chưa có mức vô hiệu";
      return `<tr data-ticker="${esc(r.ticker)}">
        <td><strong>${esc(r.ticker)}</strong></td>
        <td>${r.security_setup === "FIRED_BREAKOUT_TRIGGER_QUALIFIED_AT_SECURITY_LEVEL" ? "Setup của mã đã kích hoạt" : esc(r.security_setup || "—")}</td>
        <td>${esc(REGIME_VI[r.market_regime] || r.market_regime || "—")}</td>
        <td>${invText}</td>
      </tr>`;
    }).join("");
    return `
      <p class="cockpit-note mb-2">${esc(count ?? rows.length)} mã có setup riêng đã kích hoạt nhưng đang được giữ ở trạng thái chờ chỉ vì thị trường chung bất lợi. Quy tắc tự gỡ khi chế độ thị trường không còn thuộc nhóm bất lợi, nếu điểm kích hoạt và mức vô hiệu của mã vẫn còn hiệu lực. Đây không phải khuyến nghị mua.</p>
      <div class="table-responsive"><table class="table table-sm cockpit-table mb-0">
        <thead><tr><th>Mã</th><th>Setup của mã</th><th>Thị trường</th><th>Vô hiệu</th></tr></thead>
        <tbody>${items}</tbody>
      </table></div>`;
  }

  function renderBriefMarketContextHtml(data) {
    const block = data && data.brief_market_context_v1;
    if (!block || block.contract_version !== "brief_market_context/v1" || block.session !== data.session) return "";
    const participation = renderParticipationChangeHtml(block.market_participation_change);
    const gated = renderMarketGatedHtml(block.market_gated_entries, block.market_gated_count);
    if (!participation && !gated) return "";
    return `
      ${participation ? `<h6 class="mb-2">Độ rộng so với phiên trước (cùng tập mã)</h6>${participation}` : ""}
      ${gated ? `<h6 class="mb-2 mt-3">Setup tốt nhưng bị thị trường giữ lại</h6>${gated}` : ""}`;
  }

  function renderVerifyNextHtml(data) {
    const items = Array.isArray(data?.what_to_verify_next) ? data.what_to_verify_next : [];
    return items.length
      ? items.map(x => `<li>${esc(formatLabel(x) || x)}</li>`).join('')
      : '<li>Chưa có nội dung cần kiểm chứng đặc biệt</li>';
  }

  function renderLineageHtml(data) {
    const source = data?.source || {};
    const inputArtifacts = source.input_artifacts || {};
    const inputRows = Object.entries(inputArtifacts).map(([k, v]) => {
      const axisName = formatLabel(k, 'axis_label') || k;
      const contractVer = v?.contract_version || v?.artifact_identity || '—';
      const fState = v?.freshness_state || 'UNAVAILABLE';
      const sess = v?.session || '—';
      return `<tr>
        <td><b>${esc(axisName)}</b> <span class="cockpit-note d-block font-monospace" style="font-size:0.75rem">${esc(k)}</span></td>
        <td class="cockpit-code font-monospace">${esc(contractVer)}</td>
        <td>${state(fState, 'freshness')}</td>
        <td class="font-monospace">${esc(unavailable(sess))}</td>
      </tr>`;
    }).join('');

    // An identity string is only labeled a hash when the real *_sha256 field is present; an
    // operation_identity/product_identity fallback is a governed identity, not a SHA-256 digest.
    const manifestValue = source.operation_manifest_sha256 || source.operation_identity || '';
    const productValue = source.product_artifact_sha256 || source.product_identity || '';
    const manifestLabel = source.operation_manifest_sha256 ? "Mã băm bảng kê (SHA-256)" : "Định danh thao tác";
    const productLabel = source.product_artifact_sha256 ? "Mã băm sản phẩm (SHA-256)" : "Định danh sản phẩm";

    return `
      <div class="cockpit-warning mb-3">
        <div>${esc(manifestLabel)}: <span class="cockpit-code">${esc(manifestValue)}</span></div>
        <div>${esc(productLabel)}: <span class="cockpit-code">${esc(productValue)}</span></div>
      </div>
      <div class="table-responsive">
        <table class="cockpit-table">
          <thead>
            <tr>
              <th>Đầu vào</th>
              <th>Định danh dữ liệu</th>
              <th>Độ mới dữ liệu</th>
              <th>Phiên</th>
            </tr>
          </thead>
          <tbody>${inputRows || '<tr><td colspan="4" class="cockpit-note">Chưa có thông tin nguồn dữ liệu</td></tr>'}</tbody>
        </table>
      </div>
      <h6 class="mt-3">Tính nhất quán phiên</h6>
      <details class="vs-tech-details">
        <summary>Chi tiết kỹ thuật</summary>
        <pre class="cockpit-code">${esc(JSON.stringify(source.session_coherence || {}, null, 2))}</pre>
      </details>
    `;
  }

  function renderSessionMismatchHtml(wsSession, cpSession, reasonCode) {
    // A quiet note, not a system warning box -- this is ordinary staleness on one
    // supplementary section, not an error the investor needs to act on
    // (DASHBOARD_INVESTOR_FIRST_PRESENTATION_SIMPLIFICATION_V1 Phase 5).
    return `
      <p class="cockpit-note mb-0">
        Thông tin bổ sung chưa đồng bộ với phiên hiện tại.
        <details class="vs-tech-details mt-1">
          <summary>Chi tiết kỹ thuật</summary>
          <div class="cockpit-code mt-1">
            <div><strong>Phiên Cơ hội:</strong> ${esc(wsSession || "Chưa xác định")}</div>
            <div><strong>Phiên dữ liệu bổ sung:</strong> ${esc(cpSession || "Chưa xác định")}</div>
            <div><strong>Mã nguyên nhân:</strong> ${esc(reasonCode || "SESSION_MISMATCH")}</div>
          </div>
        </details>
      </p>
    `;
  }

  function render(data) {
    if (typeof document === "undefined") return;
    const cockpitEl = document.getElementById('cockpit');
    if (cockpitEl) cockpitEl.hidden = false;

    const sessionLineEl = document.getElementById('session-line');
    if (sessionLineEl) {
      sessionLineEl.innerHTML = `<span>Phiên nghiên cứu: ${esc(data.session || 'Chưa xác định')}</span>
        <details class="vs-tech-details d-inline-block ms-2">
          <summary>Chi tiết kỹ thuật</summary>
          <div class="cockpit-code mt-1">
            <div><strong>Thao tác:</strong> ${esc(data.source?.operation_identity || '')}</div>
            <div><strong>Sản phẩm:</strong> ${esc(data.source?.product_identity || '')}</div>
          </div>
        </details>`;
    }

    const marketOverviewEl = document.getElementById('market-overview');
    if (marketOverviewEl) {
      marketOverviewEl.innerHTML = renderMarketOverviewHtml(data);
    }

    const marketWarningsEl = document.getElementById('market-warnings');
    if (marketWarningsEl) {
      marketWarningsEl.innerHTML = renderMarketWarningsHtml(data);
    }

    const cohortsEl = document.getElementById('cohorts');
    if (cohortsEl) {
      cohortsEl.innerHTML = renderCohortsHtml(data, 8);
    }

    const priorityReviewEl = document.getElementById('priority-review');
    if (priorityReviewEl) {
      priorityReviewEl.innerHTML = renderPriorityReviewHtml(data, 10);
    }

    const tickers = (data.watchlist?.tickers || data.owner_focus?.tickers || []).slice().sort();
    const watchCountEl = document.getElementById('watch-count');
    if (watchCountEl) watchCountEl.textContent = `${tickers.length} mã`;

    const watchlistEl = document.getElementById('watchlist');
    if (watchlistEl) {
      watchlistEl.innerHTML = renderOwnerFocusHtml(data, null, tickers);
    }

    const select = document.getElementById('ticker-select');
    const allCards = Object.keys(data.ticker_cards || {}).sort();
    if (select) {
      select.innerHTML = allCards.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    }

    const setTicker = t => {
      if (data.ticker_cards && data.ticker_cards[t]) {
        if (select) select.value = t;
        renderTicker(data, t);
        if (typeof location !== "undefined") {
          location.hash = 'ticker-research';
        }
      }
    };

    if (select) {
      select.addEventListener('change', () => setTicker(select.value));
    }
    bindInteractiveEvents(data, setTicker);

    const initialTicker = (typeof location !== "undefined" && location.hash === '#ticker-research' && select && data.ticker_cards && data.ticker_cards[select.value])
      ? select.value
      : (data.ticker_cards && data.ticker_cards.HPG ? 'HPG' : allCards[0]);
    if (initialTicker) {
      setTicker(initialTicker);
    }

    const portfolioRiskEl = document.getElementById('portfolio-risk');
    if (portfolioRiskEl) {
      portfolioRiskEl.innerHTML = renderPortfolioRiskHtml(data);
    }

    const gapsEl = document.getElementById('gaps');
    if (gapsEl) {
      gapsEl.innerHTML = renderDataGapsHtml(data);
    }

    const verifyNextEl = document.getElementById('verify-next');
    if (verifyNextEl) {
      verifyNextEl.innerHTML = renderVerifyNextHtml(data);
    }

    const lineageEl = document.getElementById('lineage-content');
    if (lineageEl) {
      lineageEl.innerHTML = renderLineageHtml(data);
    }
  }

  // Standalone self-boot only when a real standalone Cockpit shell (the #cockpit root) is present.
  // investment-workspace.html loads this module purely for its exported pure render*Html helpers
  // and must never have this fetch/render run against it; decision-cockpit.html is now a thin
  // redirect with no #cockpit element either, so in practice this never executes today -- kept as
  // a guard rather than deleted so a future real standalone Cockpit page can still opt in.
  if (typeof document !== "undefined" && document.getElementById("cockpit") && typeof fetch === "function") {
    fetch(URL, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data.schema_version !== 'current_decision_cockpit_projection/v2') throw Error('unsupported projection schema');
        render(data);
      })
      .catch(err => {
        if (typeof document !== "undefined") {
          const e = document.getElementById('cockpit-error');
          if (e) {
            e.hidden = false;
            e.textContent = `Không thể tải dữ liệu bàn quyết định (${err.message}). Dữ liệu cần được tạo từ Thao tác phiên nghiên cứu hàng ngày (Daily Research Session Operation); không sử dụng cơ chế dự phòng hoặc tự động dò tìm phiên gần nhất.`;
          }
        }
      });
  }

  return {
    render,
    renderTicker,
    formatLabel,
    state,
    list,
    card,
    bindInteractiveEvents,
    renderMarketOverviewHtml,
    renderMarketWarningsHtml,
    renderCohortsHtml,
    renderPriorityReviewHtml,
    renderOwnerFocusHtml,
    renderPortfolioRiskHtml,
    renderDataGapsHtml,
    renderVerifyNextHtml,
    renderBriefMarketContextHtml,
    renderLineageHtml,
    renderSessionMismatchHtml,
  };
});
