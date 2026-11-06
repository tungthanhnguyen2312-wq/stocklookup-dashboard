(function () {
  "use strict";

  const ALLOWED_TIMEFRAMES = new Set(["1D", "1W", "1M"]);
  const MAX_RENDERED_ROWS = 500;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
  const number = (value, digits = 1) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? "–" : Number(value).toLocaleString("vi-VN", { maximumFractionDigits: digits });

  /* Localized signal-direction terminology (Phase 4D) — DISPLAY-ONLY. The raw
   * "bullish"/"bearish"/"neutral" values keep flowing unchanged through filtering,
   * sorting, analytics and CSS state classes; only the human-visible text changes.
   * Compact form fits tight inline badges (this row's own direction cell, watchlist
   * cards); full form reads better as a standalone label (KPI summary, filter option). */
  const DIRECTION_VI = {
    bullish: { full: "Tăng giá", compact: "Tăng" },
    bearish: { full: "Giảm giá", compact: "Giảm" },
    neutral: { full: "Trung tính", compact: "Trung tính" },
  };
  function directionLabel(direction, compact) {
    const entry = DIRECTION_VI[direction];
    if (!entry) return direction || "";
    return compact ? entry.compact : entry.full;
  }

  /* ============================================================
   * Nguồn Vietnamese hoá SMC DUY NHẤT (Phase 4B, Objective B) — trước đây
   * confirmationLabels ở đây dùng khoá kiểu "bullish_order_block"/"bearish_fvg"
   * (từ candlestick_patterns.json confirmations[]) còn signals.html lại tự hiện
   * nguyên khoá thô "ob_bull"/"fvg_bear" (từ candle_signals.json smc[]) — CÙNG một
   * khái niệm nhưng 2 quy ước đặt tên khác nhau ở 2 file dữ liệu khác nhau. Khai báo
   * đúng 1 lần ở đây, cả bảng chi tiết lẫn tab Tổng quan (qua window.VSCandlestickPatterns)
   * đều tra cứu từ CÙNG nguồn này — không tự tạo hoặc đổi giá trị lưu trữ gốc. Chỉ 4
   * khái niệm này thực sự tồn tại trong dữ liệu hiện tại — KHÔNG thêm BOS/CHoCH/liquidity
   * sweep vì không có trong code/dữ liệu (xem phase4a_signals_macro_audit.md).
   * ============================================================ */
  const SMC_GLOSSARY = {
    ob_bull: { vi: "Khối lệnh tăng", abbr: "OB Bull", direction: "bullish",
      tooltip: "Order Block tăng: vùng giá tổ chức có thể đã mua/tích lũy trước khi giá tăng." },
    ob_bear: { vi: "Khối lệnh giảm", abbr: "OB Bear", direction: "bearish",
      tooltip: "Order Block giảm: vùng giá tổ chức có thể đã bán/phân phối trước khi giá giảm." },
    fvg_bull: { vi: "Khoảng trống giá tăng", abbr: "FVG Bull", direction: "bullish",
      tooltip: "Fair Value Gap tăng: khoảng trống giá chưa khớp lệnh đầy đủ, hình thành khi giá tăng nhanh." },
    fvg_bear: { vi: "Khoảng trống giá giảm", abbr: "FVG Bear", direction: "bearish",
      tooltip: "Fair Value Gap giảm: khoảng trống giá chưa khớp lệnh đầy đủ, hình thành khi giá giảm nhanh." },
    // Alias: cùng khái niệm, khác quy ước đặt tên trong confirmations[]/warnings[] của
    // candlestick_patterns.json — KHÔNG lặp lại nội dung, chỉ trỏ sang bản chính ở trên.
    bullish_order_block: { alias: "ob_bull" },
    bearish_order_block: { alias: "ob_bear" },
    bullish_fvg: { alias: "fvg_bull" },
    bearish_fvg: { alias: "fvg_bear" },
  };

  function smcInfo(key) {
    const entry = SMC_GLOSSARY[key];
    if (!entry) return null;
    return entry.alias ? SMC_GLOSSARY[entry.alias] : entry;
  }

  function smcDisplayLabel(key) {
    const info = smcInfo(key);
    return info ? `${info.vi} (${info.abbr})` : key;
  }

  /* ============================================================
   * Deterministic, canonical-key-based colors (Phase 4D) — a restrained, fixed
   * dark-theme palette, NOT a per-row random/generated color. Both maps below key
   * off the CANONICAL pattern_key / SMC key (data/candlestick_patterns.json
   * registry, SMC_GLOSSARY above), so the same pattern always gets the same color
   * everywhere on the page (Overview chips and the detail table alike). The
   * resolver functions only ever return one of the fixed PATTERN_COLOR_TOKENS
   * strings — never the raw key itself — so a class like `pattern-color-${token}`
   * can never carry an attacker/producer-controlled value into HTML/CSS, even for
   * an unrecognized key (safe predefined fallback below, direction-based when
   * known, else slate). Direction itself is still conveyed via visible Vietnamese
   * text (directionLabel) — these accent colors are a secondary, non-exclusive cue.
   * ============================================================ */
  const PATTERN_COLOR_TOKENS = new Set([
    "emerald", "teal", "cyan", "rose", "red", "orange", "magenta", "amber", "violet", "slate",
  ]);

  const PATTERN_COLORS = {
    // bullish family — emerald / teal / cyan
    bullish_engulfing: "emerald", bullish_harami: "emerald", bullish_harami_cross: "emerald",
    piercing_line: "emerald", three_white_soldiers: "emerald",
    hammer: "teal", inverted_hammer: "teal", tweezer_bottom: "teal", marubozu_bullish: "teal",
    morning_star: "cyan", morning_doji_star: "cyan", dragonfly_doji: "cyan", rising_three_methods: "cyan",
    // bearish family — rose / orange / magenta
    bearish_engulfing: "rose", bearish_harami: "rose", bearish_harami_cross: "rose",
    dark_cloud_cover: "rose", three_black_crows: "rose", tweezer_top: "rose",
    shooting_star: "orange", hanging_man: "orange", marubozu_bearish: "orange",
    evening_star: "magenta", evening_doji_star: "magenta", gravestone_doji: "magenta", falling_three_methods: "magenta",
    // neutral/indecision family — amber / violet / slate
    doji: "amber", long_legged_doji: "amber",
    spinning_top: "violet",
    inside_bar: "slate", outside_bar: "slate",
  };

  const DIRECTION_FALLBACK_COLOR = { bullish: "emerald", bearish: "rose", neutral: "slate" };
  const DEFAULT_FALLBACK_COLOR = "slate";

  function colorTokenForPattern(key, direction) {
    const mapped = PATTERN_COLORS[key];
    if (mapped && PATTERN_COLOR_TOKENS.has(mapped)) return mapped;
    return DIRECTION_FALLBACK_COLOR[direction] || DEFAULT_FALLBACK_COLOR;
  }

  // 4 khái niệm SMC thật sự tồn tại — màu cố định theo key chuẩn (kể cả khi tới từ
  // alias confirmations[]/warnings[] như "bullish_order_block") để cùng 1 khái niệm
  // luôn ra cùng 1 màu dù xuất hiện dưới quy ước đặt tên nào.
  const SMC_COLORS = { ob_bull: "emerald", ob_bear: "rose", fvg_bull: "cyan", fvg_bear: "violet" };

  function colorTokenForSmc(key) {
    const entry = SMC_GLOSSARY[key];
    if (!entry) return DEFAULT_FALLBACK_COLOR;
    const canonicalKey = entry.alias || key;
    const mapped = SMC_COLORS[canonicalKey];
    return mapped && PATTERN_COLOR_TOKENS.has(mapped) ? mapped : DEFAULT_FALLBACK_COLOR;
  }

  const confirmationLabels = {
    near_support: "Gần hỗ trợ", near_resistance: "Gần kháng cự",
    volume_confirmation: "Khối lượng xác nhận", normal_volume: "Khối lượng bình thường",
    above_sma200: "Trên SMA200", below_sma200: "Dưới SMA200", rs_strong: "RS mạnh",
    bollinger_lower_band: "Biên Bollinger dưới", bollinger_upper_band: "Biên Bollinger trên",
    macd_confirmed: "MACD xác nhận", rsi_oversold: "RSI quá bán", rsi_overbought: "RSI quá mua",
  };
  const warningLabels = {
    low_liquidity: "Thanh khoản thấp", weak_volume: "Khối lượng yếu", margin_warning: "Cảnh báo margin",
    counter_trend: "Ngược xu hướng", below_sma200: "Dưới SMA200",
    above_sma200_against_bearish_pattern: "Mẫu giảm nhưng trên SMA200", insufficient_history: "Thiếu lịch sử",
    incomplete_period: "Kỳ chưa đóng", unconfirmed_pattern: "Chưa xác nhận", conflicting_smc: "SMC xung đột",
    conflicting_indicator: "Chỉ báo xung đột", missing_volume_context: "Thiếu nền khối lượng",
    zero_or_missing_volume: "Khối lượng bằng 0/thiếu",
    stale_ticker_data: "Dữ liệu mã chưa cập nhật đến phiên quét",
  };

  // Tra nhãn: ưu tiên SMC_GLOSSARY (bao gồm cả 2 quy ước đặt tên) rồi mới tới map cũ —
  // đảm bảo 1 nguồn sự thật cho 4 khái niệm SMC dù xuất hiện dưới tên nào.
  function labelFor(key, type) {
    const smc = smcInfo(key);
    if (smc) return `${smc.vi} (${smc.abbr})`;
    const map = type === "warning" ? warningLabels : confirmationLabels;
    return map[key] || key;
  }

  /* ============================================================
   * Registry mẫu hình nến — KHÔNG tự tạo bảng dịch thứ 2. name/name_vi/description/
   * direction/category đã có sẵn trong data/candlestick_patterns.json (payload.registry),
   * hàm này chỉ tra cứu lại đúng nguồn đó cho cả bảng chi tiết lẫn tab Tổng quan.
   * ============================================================ */
  function lookupPatternInfo(registry, key) {
    return (registry && registry[key]) || null;
  }

  function patternInfo(key) {
    return lookupPatternInfo(payload && payload.registry, key);
  }

  /* ============================================================
   * Tooltip/giải thích tiếp cận dùng chung (Objective C) — 1 bubble DOM thật, không
   * title="" (chỉ hover), mở bằng hover/focus/click, đóng bằng Escape/click ra ngoài,
   * nội dung gán qua textContent (không innerHTML) nên không thể chèn HTML từ dữ liệu.
   * ============================================================ */
  let tooltipBubble = null;
  let tooltipOwner = null;

  function ensureTooltipBubble() {
    if (tooltipBubble) return tooltipBubble;
    tooltipBubble = document.createElement("div");
    tooltipBubble.className = "vs-tooltip-bubble";
    tooltipBubble.id = "vs-tooltip-bubble";
    tooltipBubble.setAttribute("role", "tooltip");
    tooltipBubble.hidden = true;
    document.body.appendChild(tooltipBubble);
    return tooltipBubble;
  }

  function positionTooltip(trigger) {
    const bubble = ensureTooltipBubble();
    const margin = 8;
    const rect = trigger.getBoundingClientRect();
    bubble.style.maxWidth = Math.min(280, window.innerWidth - margin * 2) + "px";
    const bubbleRect = bubble.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - bubbleRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - bubbleRect.width - margin));
    let top = rect.bottom + 6;
    if (top + bubbleRect.height > window.innerHeight - margin) top = rect.top - bubbleRect.height - 6;
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  function showTooltip(trigger) {
    const text = trigger.getAttribute("data-tooltip");
    if (!text) return;
    const bubble = ensureTooltipBubble();
    bubble.textContent = text;
    bubble.hidden = false;
    tooltipOwner = trigger;
    trigger.setAttribute("aria-expanded", "true");
    positionTooltip(trigger);
  }

  function hideTooltip(trigger) {
    if (trigger && tooltipOwner !== trigger) return;
    if (tooltipOwner) tooltipOwner.setAttribute("aria-expanded", "false");
    if (tooltipBubble) tooltipBubble.hidden = true;
    tooltipOwner = null;
  }

  function tooltipTrigger(text, ariaLabel) {
    if (!text) return "";
    return `<button type="button" class="vs-info-trigger" data-tooltip="${esc(text)}" ` +
      `aria-describedby="vs-tooltip-bubble" aria-expanded="false" ` +
      `aria-label="${esc(ariaLabel || "Xem giải thích")}">?</button>`;
  }

  /* Trigger tooltip KHÔNG dùng icon "?" riêng (Objective B, Phase 4C) — chính text hiển
   * thị (tên mẫu hình / nhãn SMC) là trigger: [data-tooltip] được initTooltips() xử lý
   * hover/focus/click/Escape giống hệt tooltipTrigger(), không thêm phần tử hiển thị nào
   * khác nên không nới rộng hàng. Nội dung gán qua esc() (không innerHTML từ dữ liệu). */
  function textTrigger(label, tooltipText) {
    const safeLabel = esc(label);
    if (!tooltipText) return safeLabel;
    return `<span class="vs-text-trigger" data-tooltip="${esc(tooltipText)}" ` +
      `aria-describedby="vs-tooltip-bubble" aria-expanded="false" tabindex="0">${safeLabel}</span>`;
  }

  /* SMC name hierarchy (Phase 4D) — same "text itself is the trigger" contract as
   * textTrigger() above (same data-tooltip/aria-describedby/aria-expanded/tabindex,
   * so initTooltips() and bindEvents()'s company-panel guard both keep working
   * unchanged), but the Vietnamese term and the "(ABBR)" are two separately
   * escaped/styled spans instead of one flat string, so the abbreviation can render
   * as smaller secondary text. Both pieces still come from the fixed SMC_GLOSSARY
   * (never raw row data), and each is escaped independently before concatenation. */
  function smcNameTrigger(key) {
    const info = smcInfo(key);
    if (!info) return esc(key);
    const inner = `<span class="smc-name-vi">${esc(info.vi)}</span> ` +
      `<span class="smc-name-abbr">(${esc(info.abbr)})</span>`;
    if (!info.tooltip) return inner;
    return `<span class="vs-text-trigger" data-tooltip="${esc(info.tooltip)}" ` +
      `aria-describedby="vs-tooltip-bubble" aria-expanded="false" tabindex="0">${inner}</span>`;
  }

  function initTooltips() {
    ensureTooltipBubble();
    document.addEventListener("mouseover", (event) => {
      const trigger = event.target.closest("[data-tooltip]");
      if (trigger) showTooltip(trigger);
    });
    document.addEventListener("mouseout", (event) => {
      const trigger = event.target.closest("[data-tooltip]");
      if (trigger && !trigger.contains(event.relatedTarget)) hideTooltip(trigger);
    });
    document.addEventListener("focusin", (event) => {
      const trigger = event.target.closest("[data-tooltip]");
      if (trigger) showTooltip(trigger);
    });
    document.addEventListener("focusout", (event) => {
      const trigger = event.target.closest("[data-tooltip]");
      if (trigger) hideTooltip(trigger);
    });
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-tooltip]");
      if (trigger) {
        if (tooltipOwner === trigger) hideTooltip(trigger); else showTooltip(trigger);
        return;
      }
      if (tooltipOwner && tooltipBubble && !tooltipBubble.contains(event.target)) hideTooltip(tooltipOwner);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && tooltipOwner) {
        const owner = tooltipOwner;
        hideTooltip(owner);
        owner.focus();
      }
    });
    window.addEventListener("scroll", () => { if (tooltipOwner) positionTooltip(tooltipOwner); }, { passive: true, capture: true });
    window.addEventListener("resize", () => { if (tooltipOwner) positionTooltip(tooltipOwner); });
  }

  /* ============================================================
   * Chỉ số độ tin cậy dùng chung cho tab Tổng quan (Objective A — join xác định,
   * không suy đoán theo tên chuỗi). Khoá ghép ticker + pattern_key, chỉ khớp phiên
   * 1D và bars_ago===0 (nến hiện tại) — 2 trường này tồn tại thật trong cả
   * candle_signals.json (ticker/patterns[]) lẫn candlestick_patterns.json
   * (ticker/pattern_key/timeframe/bars_ago). Nếu >1 dòng khớp (không xảy ra trong dữ
   * liệu hiện tại nhưng vẫn xử lý tường minh): giữ dòng có confidence_score cao hơn;
   * bằng điểm thì giữ dòng gặp trước theo thứ tự mảng gốc (xác định, có thể test).
   * ============================================================ */
  function buildConfidenceIndex(snapshot) {
    const index = new Map();
    ((snapshot && snapshot.patterns) || []).forEach((row) => {
      if (row.timeframe !== "1D" || row.bars_ago !== 0) return;
      const key = `${row.ticker}|${row.pattern_key}`;
      const existing = index.get(key);
      if (!existing || Number(row.confidence_score) > Number(existing.confidence_score)) index.set(key, row);
    });
    return index;
  }

  function confidenceFor(index, ticker, patternKey) {
    return (index && index.get(`${ticker}|${patternKey}`)) || null;
  }

  let cachedConfidenceIndex = null;
  async function getConfidenceIndex() {
    if (cachedConfidenceIndex) return cachedConfidenceIndex;
    const snapshot = await ready;
    cachedConfidenceIndex = snapshot ? buildConfidenceIndex(snapshot) : new Map();
    return cachedConfidenceIndex;
  }

  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  let payload = null;
  let rows = [];
  let sortKey = "confidence_score";
  let sortDirection = "desc";

  function setState(message, kind = "") {
    const el = $("pattern-state");
    if (!el) return;
    el.textContent = message;
    el.className = "pattern-state" + (kind ? ` ${kind}` : "");
  }

  function validateSnapshot(data) {
    if (!data || data.schema_version !== 1 || !Array.isArray(data.patterns) || !Array.isArray(data.timeframes)) {
      throw new Error("invalid candlestick snapshot schema");
    }
    if (data.timeframes.some((tf) => !ALLOWED_TIMEFRAMES.has(tf))) throw new Error("unsupported timeframe in snapshot");
    data.patterns.forEach((row) => {
      if (!row || !ALLOWED_TIMEFRAMES.has(row.timeframe) || !["completed", "forming"].includes(row.status)) {
        throw new Error("invalid candlestick row");
      }
    });
    return data;
  }

  async function loadSnapshot() {
    const component = window.BUILD_INFO && window.BUILD_INFO.domains &&
      window.BUILD_INFO.domains.signals && window.BUILD_INFO.domains.signals.components &&
      window.BUILD_INFO.domains.signals.components.candlestick_patterns;
    if (component && component.status !== "CURRENT" && component.status !== "STALE") {
      throw new Error("Candlestick patterns are unavailable for the current market session.");
    }
    // Ưu tiên fetch JSON qua http(s); file:// (fetch luôn bị CORS chặn) hoặc fetch lỗi thì
    // nạp fallback data/candlestick_patterns.js (13,5MB) CHỈ lúc đó, không tải song song.
    if (!isFileProtocol()) {
      try {
        const response = await fetch("data/candlestick_patterns.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return validateSnapshot(await response.json());
      } catch (error) { /* rơi xuống fallback bên dưới */ }
    }
    await loadFallbackScript("data/candlestick_patterns.js", "CANDLESTICK_PATTERNS");
    if (window.CANDLESTICK_PATTERNS) return validateSnapshot(window.CANDLESTICK_PATTERNS);
    const error = new Error("Không tải được dữ liệu mẫu hình nến (cả HTTP và fallback).");
    console.error("Candlestick snapshot load failed", error);
    throw error;
  }

  const CONTEXT_TOOLTIPS = {
    near_support: "Giá hiện đang ở gần một vùng hỗ trợ được xác định từ các đáy swing gần nhất.",
    near_resistance: "Giá hiện đang ở gần một vùng kháng cự được xác định từ các đỉnh swing gần nhất.",
    volume_confirmation: "Khối lượng giao dịch tại thời điểm hình thành mẫu hình cao hơn đáng kể so với trung bình, củng cố độ tin cậy tín hiệu.",
  };

  // row=null (không tìm được dòng khớp qua join), row có field nhưng thiếu giá trị, hoặc
  // số sao làm tròn về 0 đều PHẢI không render gì (Objective C, Phase 4C — trước đây hiện
  // text "Chưa đủ dữ liệu"; nay bỏ hẳn placeholder, để layout gọn) — không bao giờ coi
  // thiếu dữ liệu là 0 sao (trước đây `Number(row.confidence_stars) || 0` biến undefined
  // thành 0 sao, không phân biệt được với 1 điểm tin cậy=0 thật sự) và cũng không tự vẽ
  // hàng "0 sao" khi giá trị thật làm tròn về 0 — chỉ 1-3 sao mới là kết quả hợp lệ.
  function stars(row) {
    if (!row) return "";
    const rawStars = row.confidence_stars;
    const rawScore = row.confidence_score;
    const known = rawStars !== null && rawStars !== undefined && Number.isFinite(Number(rawStars))
      && rawScore !== null && rawScore !== undefined && Number.isFinite(Number(rawScore));
    if (!known) return "";
    const count = Math.max(0, Math.min(3, Math.round(Number(rawStars))));
    if (count === 0) return "";
    const filled = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.14 6.37 20.1l1.08-6.27L2.9 9.4l6.3-.9L12 2.8Z"/></svg>';
    const empty = '<svg class="empty-star" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m12 2.8 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.14 6.37 20.1l1.08-6.27L2.9 9.4l6.3-.9L12 2.8Z"/></svg>';
    return `<span class="pattern-stars" role="img" aria-label="Mức độ tin cậy: ${count} trên 3 sao">${filled.repeat(count)}${empty.repeat(3 - count)}</span> ${number(rawScore, 0)}`;
  }

  function tags(values, type) {
    return `<div class="pattern-tags">${(values || []).map((key) => {
      const label = labelFor(key, type);
      const smc = smcInfo(key);
      const cls = `pattern-tag ${type === "warning" ? "warning" : ""}`;
      // Nhãn SMC dùng cùng cách trình bày "text chính là trigger" như tên mẫu hình
      // (không icon "?") — nhãn confirmation/warning thường khác vẫn giữ nguyên nút "?".
      // Màu SMC (Phase 4D) cố định theo key chuẩn hoá qua colorTokenForSmc().
      if (smc && smc.tooltip) return `<span class="${cls} pattern-color-${colorTokenForSmc(key)}">${smcNameTrigger(key)}</span>`;
      const tipText = CONTEXT_TOOLTIPS[key] || "";
      const tip = tipText ? tooltipTrigger(tipText, `Giải thích ${label}`) : "";
      return `<span class="${cls}">${esc(label)}${tip}</span>`;
    }).join("") || '<span class="pattern-muted">–</span>'}</div>`;
  }

  function rowHtml(row) {
    const changeClass = Number(row.change_pct) > 0 ? "pattern-positive" : Number(row.change_pct) < 0 ? "pattern-negative" : "";
    const statusText = row.status === "forming" ? "Đang hình thành · Chưa xác nhận" : "Hoàn chỉnh";
    const meta = row.pattern_metadata || {};
    const registryInfo = patternInfo(row.pattern_key) || {};
    // Việt hoá làm nổi bật (yêu cầu chính), tên gốc tiếng Anh giữ lại làm phụ — cả 2 đều
    // lấy từ dữ liệu có sẵn (row hoặc registry), không tạo bảng dịch thủ công thứ 2.
    const nameVi = row.pattern_name_vi || registryInfo.name_vi || row.pattern_name || row.pattern_key;
    const nameEn = row.pattern_name || registryInfo.name || row.pattern_key;
    const description = meta.description || registryInfo.description || "";
    // Màu theo pattern_key chuẩn hoá (Phase 4D) — colorTokenForPattern() chỉ trả về 1
    // trong các token cố định ở trên, không bao giờ lấy thẳng pattern_key/direction thô
    // làm class, nên vẫn an toàn kể cả khi 2 trường này có giá trị lạ/không có trong registry.
    const colorToken = colorTokenForPattern(row.pattern_key, row.direction);
    const statusTip = tooltipTrigger(
      row.status === "forming"
        ? "Kỳ chưa đóng — mẫu hình có thể còn thay đổi cho tới khi kỳ này kết thúc."
        : "Kỳ đã đóng — mẫu hình đã hoàn chỉnh theo dữ liệu hiện tại.",
      "Giải thích trạng thái",
    );
    return `<tr class="pattern-row js-company-row" tabindex="0" data-ticker="${esc(row.ticker)}">
      <td><strong>${esc(row.ticker)}</strong></td>
      <td><strong class="pattern-name-vi pattern-color-${colorToken}">${textTrigger(nameVi, description)}</strong><br><small class="pattern-muted pattern-name-en">${esc(nameEn)}</small></td>
      <td><span class="pattern-direction ${esc(row.direction)}">${esc(directionLabel(row.direction, true))}</span></td>
      <td><strong>${esc(row.timeframe)}</strong></td>
      <td>${stars(row)}</td>
      <td><span class="pattern-status ${esc(row.status)}">${statusText}</span>${statusTip}</td>
      <td>${number(row.bars_ago, 0)}</td>
      <td>${esc(row.detected_at || "–")}</td>
      <td>${number(row.close, 0)}</td>
      <td class="${changeClass}">${number(row.change_pct, 2)}${row.change_pct === null ? "" : "%"}</td>
      <td class="optional-sm">${number(row.rs_rating, 0)}</td>
      <td class="optional-sm">${number(row.rel_vol, 2)}</td>
      <td class="optional-md">${number(row.gtgd20_ty, 1)}</td>
      <td class="optional-md">${esc(row.exchange || "–")}<br><small class="pattern-muted">${esc(row.industry || "–")}</small></td>
      <td class="optional-md">${tags(row.confirmations, "confirmation")}</td>
      <td class="optional-md">${tags(row.warnings, "warning")}</td>
    </tr>`;
  }

  function filters() {
    const maxBars = Number($("pattern-bars")?.value || 999999);
    return {
      ticker: ($("pattern-ticker")?.value || "").trim().toUpperCase(),
      timeframe: $("pattern-timeframe")?.value || "all",
      direction: $("pattern-direction")?.value || "all",
      status: $("pattern-status-filter")?.value || "all",
      confidence: Number($("pattern-confidence")?.value || 0), maxBars,
      exchange: $("pattern-exchange")?.value || "all", industry: $("pattern-industry")?.value || "all",
      liquid: Boolean($("pattern-liquid")?.checked), marginFree: Boolean($("pattern-margin-free")?.checked),
      smc: Boolean($("pattern-smc")?.checked),
    };
  }

  function filteredRows() {
    const f = filters();
    const result = rows.filter((row) => (!f.ticker || String(row.ticker).toUpperCase().includes(f.ticker))
      && (f.timeframe === "all" || row.timeframe === f.timeframe)
      && (f.direction === "all" || row.direction === f.direction)
      && (f.status === "all" || row.status === f.status)
      && Number(row.confidence_stars || 0) >= f.confidence && Number(row.bars_ago) <= f.maxBars
      && (f.exchange === "all" || row.exchange === f.exchange) && (f.industry === "all" || row.industry === f.industry)
      && (!f.liquid || !(row.warnings || []).includes("low_liquidity"))
      && (!f.marginFree || !(row.warnings || []).includes("margin_warning"))
      && (!f.smc || (row.smc || []).length > 0));
    result.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === "timeframe") { av = ["1D", "1W", "1M"].indexOf(av); bv = ["1D", "1W", "1M"].indexOf(bv); }
      const comparison = typeof av === "string" ? av.localeCompare(String(bv), "vi") : (Number(av ?? -Infinity) - Number(bv ?? -Infinity));
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return result;
  }

  function renderTable() {
    const filtered = filteredRows();
    const body = $("pattern-table-body");
    if (!body) return;
    body.innerHTML = filtered.slice(0, MAX_RENDERED_ROWS).map(rowHtml).join("");
    if (!filtered.length) setState("Không có mẫu trong phiên/khoảng quét phù hợp bộ lọc.");
    else setState(`${number(filtered.length, 0)} kết quả${filtered.length > MAX_RENDERED_ROWS ? ` · đang hiển thị ${number(MAX_RENDERED_ROWS, 0)} dòng đầu` : ""}.`);
    saveFilters();
  }

  function renderSummary() {
    const summary = payload.summary || {};
    const values = [summary.total_patterns, summary.bullish, summary.bearish, summary.neutral, summary.forming, summary.completed];
    ["total", "bullish", "bearish", "neutral", "forming", "completed"].forEach((key, index) => {
      const el = $(`pattern-summary-${key}`); if (el) el.textContent = number(values[index], 0);
    });
    const generated = $("pattern-generated");
    if (generated) generated.textContent = payload.generated_at ? new Date(payload.generated_at).toLocaleString("vi-VN") : "–";
  }

  function populateSelect(id, values) {
    const select = $(id); if (!select) return;
    values.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "vi")).forEach((value) => {
      const option = document.createElement("option"); option.value = value; option.textContent = value; select.appendChild(option);
    });
  }

  function saveFilters() {
    try {
      const state = {};
      ["pattern-ticker", "pattern-timeframe", "pattern-direction", "pattern-status-filter", "pattern-confidence", "pattern-bars", "pattern-exchange", "pattern-industry"].forEach((id) => { if ($(id)) state[id] = $(id).value; });
      ["pattern-liquid", "pattern-margin-free", "pattern-smc"].forEach((id) => { if ($(id)) state[id] = $(id).checked; });
      localStorage.setItem("stocklookup:candlestick-filters", JSON.stringify(state));
    } catch (_) { /* storage may be disabled */ }
  }

  function restoreFilters() {
    try {
      const state = JSON.parse(localStorage.getItem("stocklookup:candlestick-filters") || "{}");
      Object.entries(state).forEach(([id, value]) => { if ($(id)) $(id)[$(id).type === "checkbox" ? "checked" : "value"] = value; });
    } catch (_) { /* ignore invalid local state */ }
  }

  function resetFilters() {
    ["pattern-ticker", "pattern-exchange", "pattern-industry", "pattern-timeframe", "pattern-direction", "pattern-status-filter"].forEach((id) => { if ($(id)) $(id).value = id.includes("ticker") ? "" : "all"; });
    if ($("pattern-confidence")) $("pattern-confidence").value = "2";
    if ($("pattern-bars")) $("pattern-bars").value = "12";
    ["pattern-liquid", "pattern-margin-free", "pattern-smc"].forEach((id) => { if ($(id)) $(id).checked = false; });
    renderTable();
  }

  function setupTabs() {
    document.querySelectorAll(".signal-tab").forEach((tab) => tab.addEventListener("click", () => {
      document.querySelectorAll(".signal-tab").forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
      document.querySelectorAll(".signal-tab-panel").forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute("aria-controls"); });
      location.hash = tab.dataset.hash;
    }));
    if (location.hash === "#candlestick-patterns") $("signals-tab-patterns")?.click();
  }

  function openCompany(row) {
    if (window.VSCompanyPanel?.open) window.VSCompanyPanel.open(row);
  }

  function bindEvents() {
    document.querySelectorAll("#pattern-filters input, #pattern-filters select").forEach((input) => input.addEventListener("input", renderTable));
    $("pattern-reset")?.addEventListener("click", resetFilters);
    document.querySelectorAll(".pattern-sort").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.sort;
      sortDirection = sortKey === key && sortDirection === "desc" ? "asc" : "desc";
      sortKey = key; renderTable();
    }));
    // [data-tooltip] (bao gồm .vs-info-trigger) nằm bên trong dòng nhưng KHÔNG được
    // mở company panel — chỉ toggle tooltip qua initTooltips(); guard ở đây để tách
    // 2 hành vi, tránh mở panel ngoài ý muốn khi bấm/gõ phím vào nút giải thích.
    $("pattern-table-body")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-tooltip]")) return;
      const tr = event.target.closest("tr[data-ticker]");
      if (!tr) return;
      openCompany(rows.find((row) => row.ticker === tr.dataset.ticker) || { ticker: tr.dataset.ticker });
    });
    $("pattern-table-body")?.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      if (event.target.closest("[data-tooltip]")) return;
      const tr = event.target.closest("tr[data-ticker]"); if (!tr) return;
      event.preventDefault(); openCompany(rows.find((row) => row.ticker === tr.dataset.ticker) || { ticker: tr.dataset.ticker });
    });
  }

  async function init() {
    initTooltips();
    if (!$("pattern-table-body")) {
      resolveReady(null);
      return;
    }
    setupTabs();
    setState("Đang tải dữ liệu mẫu hình nến…");
    try {
      payload = await loadSnapshot(); rows = payload.patterns.slice();
      populateSelect("pattern-exchange", [...new Set(rows.map((row) => row.exchange))]);
      populateSelect("pattern-industry", [...new Set(rows.map((row) => row.industry))]);
      restoreFilters(); renderSummary(); bindEvents(); renderTable();
      const missing = ["1D", "1W", "1M"].filter((tf) => !payload.timeframes.includes(tf));
      const scanDate = payload.scan_date ? new Date(`${payload.scan_date}T00:00:00`) : null;
      const stale = scanDate && (Date.now() - scanDate.getTime()) > 7 * 86400000;
      if (missing.length) setState(`Snapshot chỉ có một phần dữ liệu; thiếu ${missing.join(", ")}.`, "is-warning");
      else if (stale) setState(`Snapshot cũ · phiên ${payload.scan_date}.`, "is-warning");
      resolveReady(payload);
    } catch (_) {
      setState("Không thể tải dữ liệu mẫu hình nến.", "is-warning");
      resolveReady(null);
    }
  }

  /* ============================================================
   * CURRENT_SESSION_CANDLESTICK_PROJECTION_V1 — one renderer shared by Cơ hội (company drawer +
   * technical view) and the Signals compatibility page. Payload = Producer bridge
   * `current_session_candlestick_projection/v1`; callers must ALSO require the published
   * build_info component CURRENT for the same session (componentIsCurrent).
   * ============================================================ */
  const CANDLE_CONTRACT = "current_session_candlestick_projection/v1";
  const FOCUS_TICKERS = Object.freeze(["HPG", "PAN", "SSI", "EVF", "POW"]);
  const TICKER_STATUS_VI = Object.freeze({
    CONFIRMED_1D_PATTERN_ON_SESSION: "Có mẫu hình nến ngày đã đóng phiên",
    CONFIRMED_HIGHER_TIMEFRAME_ON_SESSION: "Có mẫu hình tuần/tháng đã đóng kỳ ở phiên này",
    FORMING_HIGHER_TIMEFRAME_ONLY: "Chỉ có mẫu hình tuần/tháng đang hình thành",
    RECENT_PATTERN_ONLY: "Không có mẫu ở phiên này; có mẫu gần đây",
    NO_PATTERN_DETECTED: "Không phát hiện mẫu hình",
    EXCLUDED: "Chưa đủ điều kiện quét",
  });
  const EXCLUSION_VI = Object.freeze({
    NO_EXACT_SESSION_BAR: "Không có nến đúng phiên (dữ liệu cũ hoặc không giao dịch)",
    MISSING_OR_INVALID_OHLC: "Thiếu hoặc sai OHLC ở phiên",
    MIXED_PRICE_BASIS: "Chuỗi giá trộn nhiều cơ sở điều chỉnh",
    NO_QUALIFIED_OBSERVATION: "Không có quan sát giá đủ chuẩn",
    INSUFFICIENT_HISTORY: "Lịch sử giá quá ngắn",
  });
  const TREND_VI = Object.freeze({
    ALIGNED_WITH_SMA50_SIDE: "Cùng chiều vị trí so với SMA50",
    AGAINST_SMA50_SIDE: "Ngược chiều vị trí so với SMA50",
    NEUTRAL_PATTERN: "Mẫu trung tính",
    TREND_CONTEXT_UNAVAILABLE: "Chưa đủ dữ liệu xu hướng",
  });
  const VOLUME_VI = Object.freeze({
    VOLUME_ABOVE_20_SESSION_AVERAGE: "KL cao hơn TB 20 kỳ",
    VOLUME_NEAR_20_SESSION_AVERAGE: "KL gần TB 20 kỳ",
    VOLUME_BELOW_20_SESSION_AVERAGE: "KL thấp hơn TB 20 kỳ",
    VOLUME_CONTEXT_UNAVAILABLE: "Chưa có bối cảnh khối lượng",
  });
  const CONFIRM_VI = Object.freeze({
    CONFIRMED_PERIOD_CLOSED: "Đã xác nhận (kỳ đã đóng)",
    FORMING_PERIOD_OPEN: "Đang hình thành (kỳ chưa đóng)",
  });
  const TIMEFRAME_VI = Object.freeze({ "1D": "Ngày", "1W": "Tuần", "1M": "Tháng" });
  const fmtNum = (value, digits = 2) => (typeof value === "number" && Number.isFinite(value))
    ? value.toLocaleString("vi-VN", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : "—";
  const viOf = (map, code) => (code && map[code]) || code || "—";
  const tickerHref = (ticker) => `investment-workspace.html?ticker=${encodeURIComponent(ticker)}`;

  function componentIsCurrent(buildInfo, session) {
    const component = buildInfo && buildInfo.domains && buildInfo.domains.signals &&
      buildInfo.domains.signals.components && buildInfo.domains.signals.components.candlestick_patterns;
    return Boolean(component && component.status === "CURRENT" && session && component.source_session === session);
  }

  function isCurrentCandleSnapshot(snapshot, session) {
    return Boolean(snapshot && snapshot.contract_version === CANDLE_CONTRACT && session &&
      snapshot.source_session === session && snapshot.scan_date === session &&
      Array.isArray(snapshot.patterns) && snapshot.tickers && typeof snapshot.tickers === "object");
  }

  function invalidationText(inv) {
    if (!inv || !inv.rule) return "—";
    if (inv.rule === "CLOSE_BELOW_PATTERN_LOW") return `Vô hiệu nếu đóng cửa dưới ${fmtNum(inv.level)}`;
    if (inv.rule === "CLOSE_ABOVE_PATTERN_HIGH") return `Vô hiệu nếu đóng cửa trên ${fmtNum(inv.level)}`;
    if (inv.rule === "CLOSE_OUTSIDE_PATTERN_RANGE") return `Kết thúc khi đóng cửa ngoài ${fmtNum(inv.low)}–${fmtNum(inv.high)}`;
    return inv.rule;
  }

  function patternDetailRowHtml(row, registry) {
    const info = lookupPatternInfo(registry, row.pattern_key) || {};
    const name = row.pattern_name_vi || info.name_vi || row.pattern_name || row.pattern_key;
    return `<tr data-pattern-key="${esc(row.pattern_key)}"><td>${esc(viOf(TIMEFRAME_VI, row.timeframe))}</td><td><strong>${esc(name)}</strong><br><small class="pattern-muted">${esc(row.detected_at)}${row.bars_ago ? ` · cách ${esc(row.bars_ago)} kỳ` : ""}</small></td><td><span class="pattern-direction ${esc(row.direction || "")}">${esc(directionLabel(row.direction, true))}</span></td><td>${esc(viOf(CONFIRM_VI, row.confirmation_state))}</td><td>${esc(viOf(TREND_VI, row.trend_alignment))}</td><td>${esc(viOf(VOLUME_VI, row.volume_confirmation))}</td><td>${esc(invalidationText(row.invalidation))}</td></tr>`;
  }

  function focusTickerHtml(snapshot, ticker) {
    const info = (snapshot.tickers || {})[ticker];
    if (!info) return `<div class="candle-focus" data-ticker="${esc(ticker)}"><h6>${esc(ticker)}</h6><p class="pattern-muted">Không thuộc phạm vi quét của phiên này.</p></div>`;
    if (info.status === "EXCLUDED") {
      return `<div class="candle-focus" data-ticker="${esc(ticker)}" data-candle-status="EXCLUDED"><h6>${esc(ticker)}</h6><p>${esc(TICKER_STATUS_VI.EXCLUDED)}: ${esc(viOf(EXCLUSION_VI, info.reason_code))}</p></div>`;
    }
    const ind = info.indicators || {};
    const hist = info.history || {};
    const histText = ["1D", "1W", "1M"].map((tf) => `${viOf(TIMEFRAME_VI, tf)} ${fmtNum((hist[tf] || {}).completed_bars, 0)} kỳ${(hist[tf] || {}).status === "PARTIAL_HISTORY" ? " (lịch sử ngắn)" : ""}`).join(" · ");
    const side = (v) => (v === "ABOVE" ? "trên" : v === "BELOW" ? "dưới" : "—");
    const rows = (snapshot.patterns || []).filter((p) => p.ticker === ticker).slice(0, 8)
      .map((p) => patternDetailRowHtml(p, snapshot.registry || {})).join("");
    return `<div class="candle-focus" data-ticker="${esc(ticker)}" data-candle-status="${esc(info.status)}">
      <h6><a class="tactical-link" href="${tickerHref(ticker)}">${esc(ticker)}</a> · ${esc(viOf(TICKER_STATUS_VI, info.status))}</h6>
      <p class="pattern-muted mb-1">Đóng cửa ${fmtNum(ind.close)} · ${side(ind.close_vs_sma50)} SMA50 (${fmtNum(ind.sma50)}) · ${side(ind.close_vs_sma200)} SMA200 (${fmtNum(ind.sma200)}) · RSI14 ${fmtNum(ind.rsi14, 1)} · MACD hist ${fmtNum(ind.macd_hist, 3)} · Bollinger ${fmtNum(ind.bb_lower)}–${fmtNum(ind.bb_upper)} · ATR14 ${fmtNum(ind.atr14)} · KL/TB20 ${fmtNum(ind.relative_volume_20)}</p>
      <p class="pattern-muted mb-1">Lịch sử: ${esc(histText)}</p>
      ${rows ? `<div class="tactical-wrap" tabindex="0"><table class="tactical-table candle-focus-table"><thead><tr><th>Khung</th><th>Mẫu hình</th><th>Hướng</th><th>Trạng thái</th><th>Xu hướng</th><th>Khối lượng</th><th>Điều kiện vô hiệu</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="pattern-muted">Không phát hiện mẫu hình trong cửa sổ quét.</p>`}
    </div>`;
  }

  function coverageHtml(snapshot) {
    const cov = snapshot.coverage || {};
    const reasons = Object.entries(cov.exclusion_reasons || {}).filter(([, n]) => n > 0)
      .map(([code, n]) => `<li title="${esc(code)}">${esc(viOf(EXCLUSION_VI, code))}: ${fmtNum(n, 0)}</li>`).join("");
    return `<p class="pattern-muted mb-1">Phiên ${esc(snapshot.source_session)} · quét ${fmtNum(cov.scanned_count, 0)}/${fmtNum(cov.candidate_count, 0)} mã · nguồn: nến ngày DNSE giữ lại của phiên (giá điều chỉnh hồi tố, chưa phải giá khớp gốc; không tính giá trị giao dịch vì đơn vị giá nguồn chưa được công bố). Mẫu hình nến là bối cảnh nghiên cứu, không phải tín hiệu mua/bán.</p>${reasons ? `<details class="vs-tech-details"><summary>Lý do chưa quét</summary><ul>${reasons}</ul></details>` : ""}`;
  }

  const currentProjection = Object.freeze({
    CANDLE_CONTRACT, FOCUS_TICKERS, componentIsCurrent, isCurrentCandleSnapshot,
    invalidationText, focusTickerHtml, coverageHtml,
  });

  // API dùng chung cho tab Tổng quan (signals.html inline script) — cùng 1 nguồn
  // glossary/tooltip/confidence với bảng chi tiết, không tạo bản dịch/hệ thống thứ 2.
  // Guard typeof window: cho phép require() file này trong Node để unit test các hàm
  // thuần (buildConfidenceIndex/smcInfo/labelFor/...) mà không cần DOM giả lập.
  if (typeof window !== "undefined") {
    window.VSCandlestickPatterns = {
      ready,
      getConfidenceIndex,
      confidenceFor,
      patternInfo,
      lookupPatternInfo,
      loadSnapshot,
      smcInfo,
      smcDisplayLabel,
      labelFor,
      starsMarkup: stars,
      tooltipTrigger,
      textTrigger,
      directionLabel,
      smcNameTrigger,
      colorTokenForPattern,
      colorTokenForSmc,
      currentProjection,
    };
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildConfidenceIndex, confidenceFor, smcInfo, smcDisplayLabel, labelFor,
      SMC_GLOSSARY, stars, tooltipTrigger, textTrigger, lookupPatternInfo, esc,
      tags, rowHtml,
      directionLabel, smcNameTrigger, colorTokenForPattern, colorTokenForSmc,
      PATTERN_COLORS, PATTERN_COLOR_TOKENS, SMC_COLORS,
      currentProjection,
    };
  }
}());
