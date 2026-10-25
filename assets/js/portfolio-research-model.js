(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VSPortfolioResearch = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // Portfolio evidence workspace. Personal positions stay browser-local.
  // Published statements are copied from the Producer read model. This module
  // does not score risk, infer market-value weights, or emit a recommendation.
  const STORAGE_KEY = "stocklookup.portfolio-research.v1";
  const COMPARE_TRAY_KEY = "stocklookup.portfolio-compare-tray.v1";
  const SCHEMA = "portfolio_research/v1";
  const REVIEW_SCHEMA = "portfolio_research_review/v1";
  const MAX_POSITIONS = 40;
  const MAX_IMPORT_BYTES = 256 * 1024;
  const MAX_NOTE = 500;
  const MAX_ID = 64;
  const MAX_CASH = 1e15;
  const MAX_QUANTITY = 1e12;
  const TICKER_RE = /^[A-Z0-9]{2,10}$/;
  const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
  const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const ADVERSE_POSTURES = new Set(["AVOID", "REDUCE", "HOLD_DO_NOT_ADD"]);
  const BANK_CLASSES = new Set(["bank", "securities", "insurance", "finance_company"]);
  const UNQUALIFIED_VALUATION = new Set(["", "UNAVAILABLE", "ABSOLUTE_RESEARCH_ONLY"]);
  const CONSTRUCTIVE_ENTRY = /UPTREND|BREAKOUT_READY|BASE_BUILDING|EARLY_REVERSAL/;

  const TRIAGE_LABELS = Object.freeze({
    published_adverse_posture: "Tư thế bất lợi đã công bố",
    conditional_awaiting_confirmation: "Thiết lập có điều kiện, chưa được xác nhận",
    source_reported_deterioration: "Nguồn ghi nhận suy giảm",
    missing_or_stale_financial_evidence: "Thiếu hoặc đã cũ: bằng chứng tài chính",
    bank_specific_evidence_gap: "Ngân hàng hoặc tổ chức tài chính: chưa có bằng chứng riêng",
    unqualified_valuation: "Định giá chưa đủ điều kiện sử dụng",
    contradictory_source_evidence: "Bằng chứng nguồn trái chiều",
    conditions_lacking_verified_outcome: "Điều kiện chưa có kết quả đã kiểm chứng",
    technical_without_business_evidence: "Điều kiện kỹ thuật khi chưa đủ bằng chứng kinh doanh",
    missing_published_coverage: "Chưa có phủ sóng mã đã công bố",
  });

  const ISSUE_TEXT = Object.freeze({
    NOT_JSON: "Tệp không phải JSON hợp lệ. Danh mục đang có được giữ nguyên.",
    UNSUPPORTED_SCHEMA: "Sơ đồ tệp không được hỗ trợ. Danh mục đang có được giữ nguyên.",
    NOT_OBJECT: "Tệp không chứa một danh mục. Danh mục đang có được giữ nguyên.",
    DANGEROUS_KEY: "Tệp chứa khóa không được phép. Danh mục đang có được giữ nguyên.",
    TOO_LARGE: "Tệp vượt quá giới hạn. Danh mục đang có được giữ nguyên.",
    TOO_MANY: "Quá nhiều vị thế. Danh mục đang có được giữ nguyên.",
    NO_POSITIONS: "Tệp không có danh sách vị thế. Danh mục đang có được giữ nguyên.",
    DUPLICATE_TICKER: "Có mã bị lặp. Không gộp số lượng. Danh mục đang có được giữ nguyên.",
    UNSUPPORTED_TICKER: "Có mã không hợp lệ. Danh mục đang có được giữ nguyên.",
    AMBIGUOUS_BASIS: "Một vị thế vừa có tỷ trọng vừa có khối lượng. Không quy đổi. Danh mục đang có được giữ nguyên.",
    NON_FINITE: "Có số không hợp lệ. Danh mục đang có được giữ nguyên.",
    OUT_OF_RANGE: "Có số ngoài khoảng cho phép. Danh mục đang có được giữ nguyên.",
    BAD_NOTE: "Ghi chú không hợp lệ. Danh mục đang có được giữ nguyên.",
    BAD_ID: "Mã danh mục không hợp lệ.",
    MISSING_AMOUNT: "Thiếu khối lượng hoặc tỷ trọng.",
    STORAGE_UNAVAILABLE: "Trình duyệt không cho phép lưu dữ liệu trên máy này.",
    QUOTA_OR_UNAVAILABLE: "Không ghi được vào bộ nhớ trình duyệt. Thay đổi vẫn nằm trên trang này cho đến khi tải lại.",
    CORRUPT: "Dữ liệu danh mục đã lưu bị hỏng và không được dùng.",
  });

  function getWb() {
    if (typeof window !== "undefined" && window.VSInvestigationWorkbench) return window.VSInvestigationWorkbench;
    if (typeof require === "function") {
      try { return require("./investigation-workbench.js"); } catch (err) { return null; }
    }
    return null;
  }

  function getPresentation() {
    if (typeof window !== "undefined" && window.VSWorkspaceCardPresentation) return window.VSWorkspaceCardPresentation;
    if (typeof require === "function") {
      try { return require("./workspace-card-presentation.js"); } catch (err) { return null; }
    }
    return null;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function emptyModel() {
    return { schema_version: SCHEMA, portfolio_id: "local-portfolio", cash: 0, review_note: "", positions: [] };
  }

  function hasDangerousKey(value, depth) {
    if (!value || typeof value !== "object" || depth > 6) return false;
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      if (DANGEROUS_KEYS.has(keys[i])) return true;
      if (hasDangerousKey(value[keys[i]], depth + 1)) return true;
    }
    return false;
  }

  function cleanText(value, max) {
    const text = String(value ?? "").replace(UNSAFE_CHARS, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
    if (text.length > max) return { ok: false, reason: "TOO_LONG" };
    return { ok: true, value: text };
  }

  function cleanTicker(value) {
    const raw = String(value ?? "").trim();
    if (!raw || UNSAFE_CHARS.test(raw) || /[<>]/.test(raw)) return { ok: false, reason: "UNSUPPORTED_TICKER" };
    const ticker = raw.toUpperCase();
    if (!TICKER_RE.test(ticker)) return { ok: false, reason: "UNSUPPORTED_TICKER" };
    return { ok: true, value: ticker };
  }

  function finiteNumber(value, min, max) {
    if (typeof value === "string" && value.trim() === "") return { ok: false, reason: "MISSING_AMOUNT" };
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) return { ok: false, reason: "NON_FINITE" };
    if (number < min || number > max) return { ok: false, reason: "OUT_OF_RANGE" };
    return { ok: true, value: number };
  }

  function weightPercent(raw) {
    return raw <= 1 ? raw * 100 : raw;
  }

  function entityClassFromSector(sector) {
    const parts = String(sector || "").split("|").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3 && parts[1] === "QUALIFIED_ENTITY_CLASS") return parts[2];
    return "";
  }

  function labelOf(code, domain) {
    if (!code) return "Chưa có dữ liệu";
    const wb = getWb();
    if (wb && typeof wb.codeLabel === "function") {
      const labelled = wb.codeLabel(code, domain);
      if (labelled && labelled.label) return labelled.label;
    }
    return String(code);
  }

  function postureLabel(card) {
    const presentation = getPresentation();
    if (presentation && typeof presentation.actionPostureLabel === "function") return presentation.actionPostureLabel(card);
    return labelOf(card && card.research_action_posture, "research_action_posture");
  }

  function polarity(code) {
    const wb = getWb();
    return wb && typeof wb.codePolarity === "function" ? wb.codePolarity(code) : "neutral";
  }

  function dimension(code) {
    const wb = getWb();
    return wb && typeof wb.reasonDimension === "function" ? wb.reasonDimension(code) : "other";
  }

  function strings(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : [];
  }

  function publishedCodes(card) {
    const fundamental = card.fundamental || {};
    const lineage = (card.lineage || {}).per_axis_freshness || {};
    const valuation = card.valuation || {};
    const codes = [];
    const add = (kind, raw) => { if (typeof raw === "string" && raw) codes.push({ kind, raw }); };
    add("posture", card.research_action_posture);
    add("condition_class", card.posture_condition_class);
    add("entry_state", card.entry_state);
    add("fundamental_state", fundamental.state);
    add("fundamental_freshness", lineage.fundamental);
    add("valuation_state", valuation.relative_research_state);
    add("evidence_currency", card.evidence_currency);
    strings(card.setup_tags).forEach((raw) => add("setup_tag", raw));
    strings((card.counter_thesis || {}).key_counter_thesis).forEach((raw) => add("counter_thesis", raw));
    strings((card.why || {}).deterministic_reasons).forEach((raw) => add("reason", raw));
    return codes;
  }

  function businessInterpretation(card) {
    const state = String((card.fundamental || {}).state || "");
    const freshness = String((((card.lineage || {}).per_axis_freshness || {}).fundamental) || "");
    if (state === "NOT_APPLICABLE") return "not_applicable";
    if (!state || /INSUFFICIENT|UNAVAILABLE|MISSING|NOT_READY/.test(state)) return "missing";
    if (freshness && freshness !== "CURRENT") return "stale";
    return "present";
  }

  function categoriesFor(card) {
    const categories = [];
    const posture = String(card.research_action_posture || "");
    const confirmation = card.confirmation || {};
    const triggerState = String(confirmation.confirmation_trigger_state || "");
    const conditionClass = String(card.posture_condition_class || "");
    const entryState = String(card.entry_state || "");
    const entity = entityClassFromSector(card.sector);
    const business = businessInterpretation(card);
    const valuation = card.valuation || {};
    const valuationState = String(valuation.relative_research_state || "");
    const reasonCodes = strings(card.setup_tags)
      .concat(strings((card.counter_thesis || {}).key_counter_thesis))
      .concat(strings((card.why || {}).deterministic_reasons));
    const poles = reasonCodes.map(polarity);
    if (ADVERSE_POSTURES.has(posture)) categories.push("published_adverse_posture");
    if (!ADVERSE_POSTURES.has(posture) && (
      posture === "WAIT_FOR_CONFIRMATION" ||
      confirmation.status === "CONDITIONAL" ||
      conditionClass === "PENDING_DEFINED_CONFIRMATION"
    )) categories.push("conditional_awaiting_confirmation");
    if (ADVERSE_POSTURES.has(posture) && confirmation.status === "CONDITIONAL") categories.push("conditional_awaiting_confirmation");
    if (reasonCodes.some((code) => polarity(code) === "adverse" && (dimension(code) === "technical" || /DETERIORAT|BREAKDOWN|DISTRIBUTION|BREAKOUT_FAILURE/.test(code)))) {
      categories.push("source_reported_deterioration");
    }
    if (business === "missing" || business === "stale") categories.push("missing_or_stale_financial_evidence");
    if (BANK_CLASSES.has(entity) && business !== "present") categories.push("bank_specific_evidence_gap");
    if (UNQUALIFIED_VALUATION.has(valuationState) || valuation.usable_relative_method_count === 0) categories.push("unqualified_valuation");
    if (poles.includes("adverse") && poles.includes("constructive")) categories.push("contradictory_source_evidence");
    if (ADVERSE_POSTURES.has(posture) && CONSTRUCTIVE_ENTRY.test(entryState)) categories.push("contradictory_source_evidence");
    if (triggerState !== "TRIGGERED") categories.push("conditions_lacking_verified_outcome");
    const technicalSupport = CONSTRUCTIVE_ENTRY.test(entryState) || reasonCodes.some((code) => polarity(code) === "constructive" && dimension(code) === "technical");
    if (technicalSupport && business === "missing") categories.push("technical_without_business_evidence");
    return Array.from(new Set(categories));
  }

  function evidenceItems(card) {
    const positive = [];
    const adverse = [];
    strings((card.why || {}).deterministic_reasons).concat(strings(card.setup_tags)).forEach((raw) => {
      const item = { raw, label: labelOf(raw, "rule_condition"), dimension: dimension(raw), polarity: polarity(raw) };
      if (item.polarity === "adverse") adverse.push(item);
      else if (item.polarity === "constructive") positive.push(item);
    });
    strings((card.counter_thesis || {}).key_counter_thesis).forEach((raw) => {
      adverse.push({ raw, label: labelOf(raw, "rule_condition"), dimension: dimension(raw), polarity: "adverse" });
    });
    if (ADVERSE_POSTURES.has(card.research_action_posture)) {
      adverse.unshift({ raw: card.research_action_posture, label: postureLabel(card), dimension: "posture", polarity: "adverse" });
    }
    return { positive, adverse };
  }

  function userView(position) {
    const basis = position.ambiguous ? "ambiguous" : position.basis;
    return {
      basis: basis || "missing_amount",
      explicit_weight: position.explicit_weight == null ? null : position.explicit_weight,
      quantity: position.quantity == null ? null : position.quantity,
      weight_percent: basis === "explicit_weight" ? weightPercent(position.explicit_weight) : null,
      note: position.note || "",
      duplicate: Boolean(position.duplicate),
      ambiguous: Boolean(position.ambiguous),
      source: "user_supplied",
    };
  }

  function holdingFromCard(position, card, indexDoc) {
    const user = userView(position);
    const base = {
      ticker: position.ticker,
      user,
      dossier_href: `investment-workspace.html?view=dossier&ticker=${encodeURIComponent(position.ticker)}`,
    };
    if (!card) {
      return Object.assign(base, {
        coverage: "missing",
        session: indexDoc && indexDoc.as_of_session || null,
        posture_raw: null,
        posture_label: "Chưa có dữ liệu đã công bố cho mã này",
        stance_raw: null,
        stance_label: "Chưa có dữ liệu",
        entry_state_raw: null,
        entry_state_label: "Chưa có dữ liệu",
        entry_action_raw: null,
        condition_class_raw: null,
        evidence_currency_raw: null,
        evidence_currency_label: "Chưa có dữ liệu",
        entity_class: "",
        positive: [],
        adverse: [],
        business: { state_raw: null, trajectory_raw: null, freshness_raw: null, interpretation: "missing" },
        valuation: { state_raw: null, state_label: "Chưa có dữ liệu", usable_relative_method_count: null, qualified: false },
        confirmation: { status_raw: null, trigger_state_raw: null, reference_satisfied: false, treated_as_fired: false },
        invalidation: { fundamental_status: null, technical_status: null },
        missing: ["Không có thẻ nghiên cứu đã công bố cho mã này."],
        categories: ["missing_published_coverage"],
        codes: [],
      });
    }
    const evidence = evidenceItems(card);
    const business = businessInterpretation(card);
    const valuation = card.valuation || {};
    const confirmation = card.confirmation || {};
    const reference = card.reference_trigger || {};
    const invalidation = card.invalidation || {};
    const valuationState = valuation.relative_research_state || null;
    const triggerState = confirmation.confirmation_trigger_state || null;
    const treatedAsFired = triggerState === "TRIGGERED" || (invalidation.technical || {}).status === "TRIGGERED" || (invalidation.fundamental || {}).status === "TRIGGERED";
    const missing = [];
    if (business === "missing") missing.push("Bằng chứng kinh doanh hiện hành chưa đủ. Thiếu dữ liệu không phải kết luận yếu hay mạnh.");
    if (business === "stale") missing.push("Độ mới bằng chứng nền tảng không phải hiện hành.");
    if (business === "not_applicable") missing.push("Một phần thước đo không áp dụng cho loại hình đã công bố.");
    if (!valuationState || UNQUALIFIED_VALUATION.has(String(valuationState)) || valuation.usable_relative_method_count === 0) {
      missing.push("Định giá tương đối chưa đủ điều kiện sử dụng.");
    }
    if (triggerState !== "TRIGGERED") missing.push("Chưa có confirmation_trigger_state = TRIGGERED. Không suy ra điều kiện đã xảy ra.");
    return Object.assign(base, {
      coverage: "published",
      session: card.as_of_session || indexDoc.as_of_session || null,
      posture_raw: card.research_action_posture || null,
      posture_label: postureLabel(card),
      stance_raw: card.research_stance || null,
      stance_label: labelOf(card.research_stance, "research_stance"),
      entry_state_raw: card.entry_state || null,
      entry_state_label: labelOf(card.entry_state, "tactical_state"),
      entry_action_raw: card.entry_action || null,
      entry_action_label: labelOf(card.entry_action, "research_action_posture"),
      condition_class_raw: card.posture_condition_class || null,
      condition_class_label: labelOf(card.posture_condition_class, "rule_condition"),
      evidence_currency_raw: card.evidence_currency || null,
      evidence_currency_label: labelOf(card.evidence_currency, "evidence_currency"),
      entity_class: entityClassFromSector(card.sector),
      sector_raw: card.sector || "",
      positive: evidence.positive,
      adverse: evidence.adverse,
      business: {
        state_raw: (card.fundamental || {}).state || null,
        state_label: labelOf((card.fundamental || {}).state, "fundamental_state"),
        trajectory_raw: (card.fundamental || {}).trajectory || null,
        freshness_raw: (((card.lineage || {}).per_axis_freshness || {}).fundamental) || null,
        interpretation: business,
      },
      valuation: {
        state_raw: valuationState,
        state_label: labelOf(valuationState, "valuation_state"),
        usable_relative_method_count: typeof valuation.usable_relative_method_count === "number" ? valuation.usable_relative_method_count : null,
        qualified: Boolean(valuationState) && !UNQUALIFIED_VALUATION.has(String(valuationState)) && valuation.usable_relative_method_count !== 0,
      },
      confirmation: {
        status_raw: confirmation.status || null,
        status_label: labelOf(confirmation.status, "confirmation_state"),
        trigger_state_raw: triggerState,
        trigger_state_label: labelOf(triggerState, "confirmation_state"),
        reference_satisfied: reference.trigger_condition_satisfied === true,
        entry_authority: reference.entry_authority === true,
        treated_as_fired: treatedAsFired,
      },
      invalidation: {
        fundamental_status: (invalidation.fundamental || {}).status || null,
        technical_status: (invalidation.technical || {}).status || null,
      },
      missing,
      categories: categoriesFor(card),
      codes: publishedCodes(card),
    });
  }

  function buildOverview(model, indexDoc) {
    const source = model || emptyModel();
    const cards = indexDoc && indexDoc.cards && typeof indexDoc.cards === "object" ? indexDoc.cards : null;
    const holdings = source.positions.map((position) => holdingFromCard(position, cards ? cards[position.ticker] : null, indexDoc || {}));
    const triage = Object.keys(TRIAGE_LABELS).map((id) => ({
      id,
      label: TRIAGE_LABELS[id],
      tickers: holdings.filter((holding) => holding.categories.includes(id)).map((holding) => holding.ticker),
    })).filter((group) => group.tickers.length);
    return {
      status: cards ? "ready" : "no_publication",
      session: indexDoc && indexDoc.as_of_session || null,
      source_artifact_identity: indexDoc && indexDoc.source_artifact_identity || null,
      holdings,
      triage,
      shared: sharedConcerns(holdings),
      weights: weightSummary(source),
      limitations: overviewLimitations(holdings, indexDoc),
    };
  }

  function overviewLimitations(holdings, indexDoc) {
    const notes = [];
    const covered = holdings.filter((holding) => holding.coverage === "published");
    if (!indexDoc || !indexDoc.cards) notes.push("Chưa tải được bản nghiên cứu đã công bố. Vị thế người dùng vẫn được giữ.");
    if (covered.length && covered.every((holding) => holding.confirmation.trigger_state_raw !== "TRIGGERED")) {
      notes.push("Không mã nào có confirmation_trigger_state = TRIGGERED. trigger_condition_satisfied không được xem là kết quả đầu tư đã xảy ra.");
    }
    notes.push("Bản tóm tắt không tính VaR, biến động, beta, tương quan, mức sụt giảm hay hạn mức phân bổ.");
    return notes;
  }

  function isConcernCode(code) {
    if (code.kind === "posture") return ADVERSE_POSTURES.has(code.raw);
    if (code.kind === "evidence_currency") return code.raw !== "CURRENT_SESSION";
    if (code.kind === "entry_state") return polarity(code.raw) === "adverse";
    return true;
  }

  function sharedConcerns(holdings) {
    const covered = holdings.filter((holding) => holding.coverage === "published");
    const buckets = new Map();
    covered.forEach((holding) => {
      holding.codes.filter(isConcernCode).forEach((code) => {
        const key = `${code.kind}\u0000${code.raw}`;
        if (!buckets.has(key)) buckets.set(key, { kind: code.kind, raw: code.raw, tickers: [] });
        const bucket = buckets.get(key);
        if (!bucket.tickers.includes(holding.ticker)) bucket.tickers.push(holding.ticker);
      });
    });
    const groups = Array.from(buckets.values()).filter((group) => group.tickers.length >= 2).map((group) => {
      const members = covered.filter((holding) => group.tickers.includes(holding.ticker));
      return {
        kind: group.kind,
        raw: group.raw,
        label: labelOf(group.raw, group.kind === "entry_state" ? "tactical_state" : "rule_condition"),
        tickers: group.tickers,
        user_weight_percent: userWeightSum(members),
        mechanism: "SHARED_PUBLISHED_CODE",
      };
    });
    const classes = new Map();
    covered.forEach((holding) => {
      if (!holding.entity_class) return;
      if (!classes.has(holding.entity_class)) classes.set(holding.entity_class, []);
      classes.get(holding.entity_class).push(holding.ticker);
    });
    const entityGroups = Array.from(classes.entries()).filter((entry) => entry[1].length >= 2).map((entry) => ({
      kind: "entity_class",
      raw: entry[0],
      label: labelOf(entry[0], "entity_type"),
      tickers: entry[1],
      user_weight_percent: userWeightSum(covered.filter((holding) => entry[1].includes(holding.ticker))),
      mechanism: "NOT_A_SHARED_PRICE_MECHANISM",
    }));
    return {
      groups: groups.concat(entityGroups),
      industry_mechanism: "NOT_ESTABLISHED",
      industry_statement: "Bản tóm tắt công bố mã phân loại loại hình, không công bố một ngành kinh doanh dùng chung. Không suy ra tương quan giá, độ nhạy lợi nhuận hay rủi ro hệ thống.",
    };
  }

  function userWeightSum(holdings) {
    if (!holdings.length || holdings.some((holding) => holding.user.basis !== "explicit_weight" || holding.user.duplicate)) return null;
    const total = holdings.reduce((sum, holding) => sum + holding.user.weight_percent, 0);
    return Math.round(total * 10) / 10;
  }

  function weightSummary(model) {
    const positions = (model && model.positions) || [];
    const explicit = [];
    const quantity = [];
    const ambiguous = [];
    positions.forEach((position) => {
      if (position.ambiguous) ambiguous.push(position.ticker);
      else if (position.duplicate) return;
      else if (position.basis === "explicit_weight") explicit.push(position);
      else if (position.basis === "quantity") quantity.push(position.ticker);
    });
    let mode = "empty";
    if (!positions.length) mode = "empty";
    else if (explicit.length && quantity.length) mode = "mixed";
    else if (explicit.length) mode = "explicit";
    else if (quantity.length || ambiguous.length) mode = "quantity_only";
    const items = explicit.map((position) => ({
      ticker: position.ticker,
      weight_percent: weightPercent(position.explicit_weight),
    }));
    const total = items.reduce((sum, item) => sum + item.weight_percent, 0);
    return {
      mode,
      items,
      quantity_tickers: quantity,
      ambiguous_tickers: ambiguous,
      total_percent: Math.round(total * 10) / 10,
      over_allocated: total > 100.5,
      market_value_inferred: false,
    };
  }

  function normalizePosition(raw, strict) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "NOT_OBJECT" };
    const ticker = cleanTicker(raw.ticker);
    if (!ticker.ok) return ticker;
    const hasWeight = Object.prototype.hasOwnProperty.call(raw, "explicit_weight") && raw.explicit_weight != null && raw.explicit_weight !== "";
    const hasQuantity = Object.prototype.hasOwnProperty.call(raw, "quantity") && raw.quantity != null && raw.quantity !== "";
    let weight = null;
    let quantity = null;
    let ambiguous = false;
    if (hasWeight && hasQuantity) {
      if (strict) return { ok: false, reason: "AMBIGUOUS_BASIS" };
      ambiguous = true;
    }
    if (hasWeight) {
      const parsed = finiteNumber(raw.explicit_weight, 0, 100);
      if (!parsed.ok) return parsed;
      weight = parsed.value;
    }
    if (hasQuantity) {
      const parsed = finiteNumber(raw.quantity, 0, MAX_QUANTITY);
      if (!parsed.ok) return parsed;
      quantity = parsed.value;
    }
    if (!hasWeight && !hasQuantity) return { ok: false, reason: "MISSING_AMOUNT" };
    let note = "";
    if (raw.note != null && raw.note !== "") {
      if (typeof raw.note !== "string" || UNSAFE_CHARS.test(raw.note)) return { ok: false, reason: "BAD_NOTE" };
      const cleaned = cleanText(raw.note, MAX_NOTE);
      if (!cleaned.ok) return { ok: false, reason: "BAD_NOTE" };
      note = cleaned.value;
    }
    const position = {
      ticker: ticker.value,
      note,
      ambiguous,
      duplicate: false,
      basis: ambiguous ? "ambiguous" : (hasWeight ? "explicit_weight" : "quantity"),
    };
    if (hasWeight) position.explicit_weight = weight;
    if (hasQuantity) position.quantity = quantity;
    return { ok: true, position };
  }

  function documentFromPayload(payload, strict) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, reason: "NOT_OBJECT" };
    if (hasDangerousKey(payload, 0)) return { ok: false, reason: "DANGEROUS_KEY" };
    const body = payload.portfolio_research_context && typeof payload.portfolio_research_context === "object"
      ? payload.portfolio_research_context : payload;
    if (hasDangerousKey(body, 0)) return { ok: false, reason: "DANGEROUS_KEY" };
    if (body.schema_version != null && body.schema_version !== SCHEMA) return { ok: false, reason: "UNSUPPORTED_SCHEMA" };
    if (!Array.isArray(body.positions)) return { ok: false, reason: "NO_POSITIONS" };
    if (body.positions.length > MAX_POSITIONS) return { ok: false, reason: "TOO_MANY" };
    const id = cleanText(body.portfolio_id == null || body.portfolio_id === "" ? "local-portfolio" : body.portfolio_id, MAX_ID);
    if (!id.ok || !id.value) return { ok: false, reason: "BAD_ID" };
    let cash = 0;
    let cashInvalid = false;
    if (body.cash != null && body.cash !== "") {
      const parsed = finiteNumber(body.cash, 0, MAX_CASH);
      if (!parsed.ok) {
        if (strict) return parsed;
        cashInvalid = true;
        cash = null;
      } else cash = parsed.value;
    }
    let review = "";
    if (body.review_note != null && body.review_note !== "") {
      if (typeof body.review_note !== "string") return { ok: false, reason: "BAD_NOTE" };
      const cleaned = cleanText(body.review_note, MAX_NOTE);
      if (!cleaned.ok) return { ok: false, reason: "BAD_NOTE" };
      review = cleaned.value;
    }
    const positions = [];
    const seen = new Set();
    for (let i = 0; i < body.positions.length; i++) {
      const normalized = normalizePosition(body.positions[i], strict);
      if (!normalized.ok) return normalized;
      if (seen.has(normalized.position.ticker)) {
        if (strict) return { ok: false, reason: "DUPLICATE_TICKER" };
        normalized.position.duplicate = true;
      }
      seen.add(normalized.position.ticker);
      positions.push(normalized.position);
    }
    return {
      ok: true,
      model: { schema_version: SCHEMA, portfolio_id: id.value, cash, cash_invalid: cashInvalid, review_note: review, positions },
    };
  }

  function parsePortfolioText(text, strict) {
    if (typeof text !== "string" || !text.trim()) return { ok: false, reason: "NOT_JSON" };
    if (text.length > MAX_IMPORT_BYTES) return { ok: false, reason: "TOO_LARGE" };
    let parsed;
    try {
      parsed = JSON.parse(text, (key, value) => {
        if (DANGEROUS_KEYS.has(key)) {
          const error = new Error("DANGEROUS_KEY");
          error.code = "DANGEROUS_KEY";
          throw error;
        }
        return value;
      });
    } catch (err) {
      return { ok: false, reason: err && err.code === "DANGEROUS_KEY" ? "DANGEROUS_KEY" : "NOT_JSON" };
    }
    return documentFromPayload(parsed, strict);
  }

  function readStored(storage) {
    let store = storage;
    if (!store) {
      try { store = localStorage; } catch (err) { return { status: "unavailable", model: emptyModel(), reason: "STORAGE_UNAVAILABLE" }; }
    }
    let raw;
    try { raw = store.getItem(STORAGE_KEY); } catch (err) { return { status: "unavailable", model: emptyModel(), reason: "STORAGE_UNAVAILABLE" }; }
    if (raw == null || raw === "") return { status: "empty", model: emptyModel() };
    const parsed = parsePortfolioText(raw, false);
    if (!parsed.ok) return { status: "corrupt", model: emptyModel(), reason: parsed.reason || "CORRUPT" };
    return { status: "ok", model: parsed.model };
  }

  function importPortfolioText(text, current) {
    const parsed = parsePortfolioText(text, true);
    if (!parsed.ok) return { ok: false, model: current || emptyModel(), reason: parsed.reason, message: ISSUE_TEXT[parsed.reason] || ISSUE_TEXT.NOT_JSON };
    return { ok: true, model: parsed.model, reason: null, message: "Đã đọc tệp. Dữ liệu vẫn chỉ nằm trên trình duyệt này." };
  }

  function exportDocument(model) {
    const source = model || emptyModel();
    return {
      schema_version: SCHEMA,
      portfolio_id: source.portfolio_id,
      cash: source.cash,
      review_note: source.review_note || "",
      positions: source.positions.map((position) => {
        const out = { ticker: position.ticker };
        if (position.explicit_weight != null) out.explicit_weight = position.explicit_weight;
        if (position.quantity != null) out.quantity = position.quantity;
        if (position.note) out.note = position.note;
        return out;
      }),
      browser_local_only: true,
      not_an_investment_recommendation: true,
    };
  }

  function saveModel(storage, model) {
    let store = storage;
    if (!store) {
      try { store = localStorage; } catch (err) { return { ok: false, reason: "STORAGE_UNAVAILABLE" }; }
    }
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(exportDocument(model)));
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "QUOTA_OR_UNAVAILABLE" };
    }
  }

  function addPosition(model, input) {
    const source = model || emptyModel();
    if (source.positions.length >= MAX_POSITIONS) return { ok: false, model: source, reason: "TOO_MANY" };
    const normalized = normalizePosition({
      ticker: input.ticker,
      explicit_weight: input.basis === "explicit_weight" ? input.amount : null,
      quantity: input.basis === "quantity" ? input.amount : null,
      note: input.note || "",
    }, true);
    if (!normalized.ok) return { ok: false, model: source, reason: normalized.reason, message: ISSUE_TEXT[normalized.reason] || "Không thêm được vị thế." };
    if (source.positions.some((position) => position.ticker === normalized.position.ticker && !position.duplicate)) {
      return { ok: false, model: source, reason: "DUPLICATE_TICKER", message: "Mã đã có trong danh mục. Không gộp số lượng hay tỷ trọng." };
    }
    return { ok: true, model: Object.assign({}, source, { positions: source.positions.concat([normalized.position]) }) };
  }

  function removePosition(model, index) {
    const source = model || emptyModel();
    const positions = source.positions.slice();
    if (index < 0 || index >= positions.length) return source;
    positions.splice(index, 1);
    return Object.assign({}, source, { positions });
  }

  function updateIdentity(model, portfolioId, cash) {
    const source = model || emptyModel();
    const id = cleanText(portfolioId, MAX_ID);
    if (!id.ok || !id.value) return { ok: false, model: source, reason: "BAD_ID", message: ISSUE_TEXT.BAD_ID };
    const parsed = finiteNumber(cash, 0, MAX_CASH);
    if (!parsed.ok) return { ok: false, model: source, reason: parsed.reason, message: "Tiền mặt không hợp lệ nên chưa được đổi." };
    return { ok: true, model: Object.assign({}, source, { portfolio_id: id.value, cash: parsed.value, cash_invalid: false }) };
  }

  function updateReviewNote(model, note) {
    const source = model || emptyModel();
    if (typeof note !== "string" || UNSAFE_CHARS.test(note)) return { ok: false, model: source, reason: "BAD_NOTE" };
    const cleaned = cleanText(note, MAX_NOTE);
    if (!cleaned.ok) return { ok: false, model: source, reason: "BAD_NOTE", message: "Ghi chú vượt quá độ dài cho phép." };
    return { ok: true, model: Object.assign({}, source, { review_note: cleaned.value }) };
  }

  function detailFacts(dossier) {
    if (!dossier) return null;
    const fundamentals = dossier.fundamentals || {};
    const valuation = dossier.valuation || {};
    const conditions = dossier.conditions || {};
    const confirmation = (conditions.confirmation || [])[0] || null;
    return {
      ticker: dossier.ticker,
      session: dossier.session,
      entity_class: dossier.entityClass || fundamentals.entityClass || "",
      is_bank: Boolean(fundamentals.isBank),
      not_applicable_count: fundamentals.notApplicableCount || 0,
      business_state: fundamentals.state || null,
      unavailable_business: (fundamentals.unavailable || []).slice(0, 8).map((item) => ({ label: item.label, detail: item.detail || "" })),
      valuation_state: valuation.relativeState || null,
      qualified_count: valuation.qualifiedCount,
      unavailable_valuation: (valuation.unavailable || []).slice(0, 6).map((item) => item.label),
      intrinsic: valuation.intrinsic || null,
      confirmation_fired: confirmation ? confirmation.fired : null,
      fundamental_invalidation_fired: conditions.fundamentalInvalidation ? conditions.fundamentalInvalidation.fired === true : false,
      gap_count: (dossier.gaps || []).length,
      support: ((dossier.evidence || {}).support || []).slice(0, 6).map((item) => ({ label: item.label, dimension: item.dimension || "" })),
      counter: ((dossier.evidence || {}).counter || []).slice(0, 6).map((item) => ({ label: item.label, dimension: item.dimension || "" })),
    };
  }

  function openDetail(card, indexDoc) {
    const wb = getWb();
    if (!wb || typeof wb.buildDossier !== "function" || !card) return null;
    return wb.buildDossier(card, {
      ticker: card.ticker,
      session: indexDoc && indexDoc.as_of_session,
      sourceArtifactIdentity: indexDoc && indexDoc.source_artifact_identity,
      decisionSource: indexDoc && indexDoc.decision_authority && indexDoc.decision_authority.primary_action_decision_source,
    });
  }

  function comparisonFromDetails(entries, indexDoc) {
    const wb = getWb();
    if (!wb) return { ok: false, reason: "WORKBENCH_UNAVAILABLE" };
    const validation = wb.validateComparisonRequest(entries.map((entry) => entry.ticker), indexDoc, indexDoc && indexDoc.as_of_session);
    if (!validation.ok) return { ok: false, validation };
    const comparison = wb.buildComparison(entries, { session: validation.session, indexDoc });
    const refused = (comparison.notComparable || []).filter((row) => (row.reasons || []).some((reason) => (
      reason.code === "ENTITY_CLASS_DIFFERS" || reason.code === "NOT_APPLICABLE" || reason.code === "PERIOD_DIFFERS" || reason.code === "SHARE_BASIS_DIFFERS" || reason.code === "SCOPE_DIFFERS" || reason.code === "METHOD_DIFFERS"
    )));
    return { ok: true, validation, comparison, refused_incompatible: refused };
  }

  function journalQuestions(journal, tickers) {
    const wanted = new Set(tickers || []);
    const entries = journal && Array.isArray(journal.entries) ? journal.entries : [];
    const questions = [];
    entries.forEach((entry) => {
      const entryTickers = Array.isArray(entry.tickers) ? entry.tickers : [];
      if (!entryTickers.some((ticker) => wanted.has(ticker))) return;
      (entry.questions || []).forEach((question) => {
        questions.push({
          tickers: entryTickers,
          text: question.text,
          status: question.status,
          origin: question.origin,
          source: "user_journal",
        });
      });
    });
    return questions;
  }

  function buildReview(model, overview, journal) {
    const source = model || emptyModel();
    const view = overview || buildOverview(source, null);
    return {
      schema_version: REVIEW_SCHEMA,
      not_an_investment_recommendation: true,
      not_an_audited_valuation: true,
      browser_local_user_data: true,
      session: view.session,
      source_artifact_identity: view.source_artifact_identity,
      holdings: view.holdings,
      triage: view.triage,
      shared: view.shared,
      limitations: view.limitations,
      unresolved_questions: journalQuestions(journal, source.positions.map((position) => position.ticker)),
      user_supplied: {
        portfolio_id: source.portfolio_id,
        cash: source.cash,
        review_note: source.review_note || "",
        positions: exportDocument(source).positions,
        label: "Thông tin do người dùng nhập trên trình duyệt này, không phải bằng chứng đã công bố.",
      },
    };
  }

  function reviewHtml(review) {
    const holdings = review.holdings || [];
    const rows = holdings.map((holding) => `<section>
      <h2>${esc(holding.ticker)}</h2>
      <p>Phủ sóng: ${esc(holding.coverage === "published" ? "có dữ liệu đã công bố" : "chưa có dữ liệu đã công bố")} · phiên ${esc(holding.session || review.session || "—")}</p>
      <p>Tư thế đã công bố: ${esc(holding.posture_label)} <small>(${esc(holding.posture_raw || "—")})</small></p>
      <p>Kỹ thuật: ${esc(holding.entry_state_label || "—")}. Hành động vào lệnh đã công bố: ${esc(holding.entry_action_label || holding.entry_action_raw || "—")}.</p>
      <p>Bất lợi: ${holding.adverse && holding.adverse.length ? esc(holding.adverse.map((item) => item.label).join("; ")) : "Không thấy điều kiện bất lợi riêng trên bản tóm tắt."}</p>
      <p>Ủng hộ theo mã đã công bố: ${holding.positive && holding.positive.length ? esc(holding.positive.map((item) => item.label).join("; ")) : "Không thấy mã ủng hộ trên bản tóm tắt."}</p>
      <p>Bằng chứng kinh doanh: ${esc(holding.business && holding.business.state_label || "—")} (${esc(holding.business && holding.business.interpretation || "—")}).</p>
      <p>Định giá: ${esc(holding.valuation && holding.valuation.state_label || "—")}.</p>
      <p>Xác nhận: ${esc(holding.confirmation && holding.confirmation.status_label || "—")}; trigger ${esc(holding.confirmation && holding.confirmation.trigger_state_raw || "—")}; mức tham chiếu đã chạm = ${holding.confirmation && holding.confirmation.reference_satisfied ? "true" : "false"}; diễn giải là đã kích hoạt = ${holding.confirmation && holding.confirmation.treated_as_fired ? "true" : "false"}.</p>
      <p>Vị thế do người dùng nhập: ${esc(holding.user.basis)}; ghi chú người dùng: ${esc(holding.user.note || "—")}</p>
      <p><a href="${esc(holding.dossier_href)}">Hồ sơ ${esc(holding.ticker)}</a></p>
    </section>`).join("");
    const groups = (review.triage || []).map((group) => `<li>${esc(group.label)}: ${esc(group.tickers.join(", "))}</li>`).join("");
    const shared = (review.shared && review.shared.groups || []).map((group) => `<li>${esc(group.label)} (${esc(group.raw)}): ${esc(group.tickers.join(", "))}${group.user_weight_percent == null ? "" : ` · tỷ trọng người dùng đã nhập ${esc(group.user_weight_percent)}%`}</li>`).join("");
    const questions = (review.unresolved_questions || []).map((question) => `<li>${esc(question.tickers.join(", "))}: ${esc(question.text)} <small>(${esc(question.status)}, người dùng)</small></li>`).join("");
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Xem lại nghiên cứu danh mục</title>
<style>body{font:15px/1.5 system-ui,sans-serif;color:#111;max-width:920px;margin:24px auto;padding:0 16px}h1{font-size:22px}h2{font-size:18px;border-bottom:1px solid #ccc}.note{border:1px dashed #a16207;background:#fefce8;padding:8px 12px}.limit{border:2px solid #b45309;background:#fff7ed;padding:10px 12px}@media print{body{margin:0}}</style></head><body>
<div class="limit"><b>Không phải khuyến nghị và không phải định giá đã kiểm toán.</b> ${esc(review.limitations && review.limitations.join(" ") || "")} Phiên ${esc(review.session || "—")}.</div>
<h1>Xem lại nghiên cứu danh mục</h1>
<p>Nguồn đã công bố: ${esc(review.source_artifact_identity || "—")}</p>
<h2>Phân loại</h2><ul>${groups || "<li>Chưa có nhóm.</li>"}</ul>
<h2>Mối quan ngại dùng chung theo đúng mã đã công bố</h2>
<p>${esc(review.shared && review.shared.industry_statement || "")}</p>
<ul>${shared || "<li>Không có mã nghiên cứu lặp lại.</li>"}</ul>
${rows || "<p>Chưa có vị thế.</p>"}
<h2>Câu hỏi trong sổ nghiên cứu</h2><ul>${questions || "<li>Chưa có câu hỏi cho các mã này.</li>"}</ul>
<div class="note"><b>Ghi chú của người dùng, không phải bằng chứng đã công bố.</b> ${esc(review.user_supplied && review.user_supplied.review_note || "—")}</div>
</body></html>`;
  }

  function issueMessage(reason) {
    return ISSUE_TEXT[reason] || "Không thực hiện được thao tác.";
  }

  return {
    STORAGE_KEY, COMPARE_TRAY_KEY, SCHEMA, REVIEW_SCHEMA, MAX_POSITIONS, MAX_IMPORT_BYTES, MAX_NOTE, TRIAGE_LABELS, ISSUE_TEXT,
    emptyModel, cleanTicker, parsePortfolioText, readStored, importPortfolioText, exportDocument, saveModel,
    addPosition, removePosition, updateIdentity, updateReviewNote, weightSummary, buildOverview, sharedConcerns,
    openDetail, detailFacts, comparisonFromDetails, journalQuestions, buildReview, reviewHtml, issueMessage, esc,
    entityClassFromSector, categoriesFor,
  };
});
