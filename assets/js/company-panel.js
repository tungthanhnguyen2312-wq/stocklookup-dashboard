/* ============================================================
 * VNSTOCK — assets/js/company-panel.js (dùng ở screener.html + signals.html)
 * Bấm vào dòng #tblScreen hoặc gọi VSCompanyPanel.open(row) -> mở panel trượt từ phải,
 * 3 tab: Tổng quan / Biểu đồ / Báo cáo tài chính.
 *
 * Lấy dữ liệu trực tiếp từ instance DataTables ĐANG CHẠY
 * (jQuery("#tblScreen").DataTable() trả về instance đã khởi tạo,
 * không tạo mới) — không fetch lại, không đụng tới script
 * tải/lọc/vẽ cột đã có sẵn trong screener.html.
 *
 * Tab "Báo cáo tài chính" CHƯA có dữ liệu — financial_snapshot.csv/
 * data_bctc/ vẫn là dữ liệu cá nhân, không public (xem .gitignore).
 * Tab này chỉ hiện trạng thái "đang chờ dữ liệu", không bịa số liệu.
 * ============================================================ */

(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 1) => (v === null || v === undefined || v === "" || Number.isNaN(v))
    ? "–" : Number(v).toLocaleString("vi-VN", { maximumFractionDigits: d });
  const valueSignClass = (v) => Number(v) > 0 ? "up" : Number(v) < 0 ? "down" : "flat";
  const structCls = (s) => {
    s = String(s).toLowerCase();
    return s === "up" ? "bs-green" : s === "side" ? "bs-amber" : s === "down" ? "bs-red" : "bs-gray";
  };

  /* ---------- Phase 5A: URL-synced ticker state (pure, no browser globals —
   * testable directly from Node). VN tickers are 3-4 uppercase alnum chars;
   * accept up to 10 defensively and reject anything else so an invalid/hostile
   * URL value never reaches a lookup or the DOM. ---------- */
  const TICKER_PARAM = "ticker";
  function normalizeTicker(value) {
    const t = String(value === null || value === undefined ? "" : value).trim().toUpperCase();
    return /^[A-Z0-9]{1,10}$/.test(t) ? t : null;
  }
  function tickerFromSearch(search) {
    return normalizeTicker(new URLSearchParams(search || "").get(TICKER_PARAM));
  }
  // Trả về "" hoặc "?a=1&ticker=X..." — không đụng tới các tham số khác.
  function searchWithTicker(search, ticker) {
    const params = new URLSearchParams(search || "");
    if (ticker) params.set(TICKER_PARAM, ticker); else params.delete(TICKER_PARAM);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }
  // openTicker: mã đang thực sự hiển thị trên panel (null nếu đang đóng).
  // currentTicker: mã đang phản ánh trên URL hiện tại (null nếu không có).
  // primed: đã từng push/bootstrap 1 lần trong phiên trang này chưa.
  function decideOpenAction(currentTicker, openTicker, targetTicker, primed) {
    if (!targetTicker) return { render: false };
    if (openTicker === targetTicker) return { render: true, history: "none" };
    // URL đã sẵn đúng mã (nạp thẳng bằng link/back-forward) — nếu đây là lần đầu
    // tiên trong phiên thì cần "bootstrap" (chèn 1 trạng thái đã-đóng bên dưới)
    // để nút Back/Đóng luôn có nơi an toàn để về, thay vì thoát hẳn trang.
    if (currentTicker === targetTicker) return { render: true, history: primed ? "none" : "bootstrap" };
    return { render: true, history: "push" };
  }
  // depth: số bước push kể từ trạng thái "đã đóng" gần nhất bên dưới (0 = đã ở
  // trạng thái đóng). Đóng tường minh (X / Escape / bấm ra ngoài) LUÔN phải đóng
  // hẳn — kể cả sau khi đã chuyển qua nhiều mã — nên nhảy thẳng N bước bằng
  // history.go(-N) thay vì lùi từng bước 1 (lùi 1 bước sẽ chỉ hiện lại mã trước
  // đó, đúng ngữ nghĩa của nút Back nhưng SAI với "Đóng" — Đóng phải đóng hẳn).
  function decideCloseAction(depth) {
    return depth > 0 ? { hide: false, history: "back", steps: depth } : { hide: true, history: "none" };
  }

  let backdrop;
  let chartInstance = null;
  let corporateBundlePromise = null;
  let lastFocused = null;
  let historyPrimed = false;
  const tickerRowCache = new Map();

  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  // Backend-authored free text (an evidence "reason", a model "limitation", a warning
  // sentence) sometimes names its own implementation in passing (a contract, a
  // pipeline, an artifact) -- this file cannot edit that upstream text, so anything
  // rendered through displayValue/vi() is scrubbed of the forbidden-vocabulary terms
  // first (DASHBOARD_INVESTOR_FIRST_LOCALIZATION_AND_UI_CLOSEOUT_V1 Phase 9/10).
  const FORBIDDEN_TERM_SCRUB = [
    [/\bbackend\b/gi, "hệ thống"], [/\bfrontend\b/gi, "giao diện"], [/\bpython\b/gi, "hệ thống"],
    [/\bDNSE\b/gi, "nguồn dữ liệu"], [/\bcohort\b/gi, "nhóm đối sánh"], [/\bshadow\b/gi, "tham khảo"],
    [/\bpipelines?\b/gi, "quy trình xử lý"], [/\bcontracts?\b/gi, "quy chuẩn dữ liệu"],
    [/\bartifacts?\b/gi, "dữ liệu"], [/\bruntime\b/gi, "hệ thống"], [/\bprojections?\b/gi, "ước tính"],
    [/\breason[_ ]code\b/gi, "mã lý do"], [/\bschema[_ ]version\b/gi, ""],
    [/\bRAW_AS_TRADED\b/g, ""], [/\bPIT\b/g, ""],
  ];
  function sanitizeFreeText(text) {
    let out = String(text);
    for (const [pattern, replacement] of FORBIDDEN_TERM_SCRUB) out = out.replace(pattern, replacement);
    return out.replace(/\s{2,}/g, " ").trim();
  }
  const displayValue = (value) => value === null || value === undefined || value === "" ? "-" : esc(sanitizeFreeText(value));
  const displayNumber = (value, digits = 2) => value === null || value === undefined || value === ""
    ? "-" : (Number.isFinite(Number(value)) ? num(value, digits) : esc(value));
  const titleCase = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const sectionState = (section) => isObject(section) && typeof section.status === "string" ? section.status.toLowerCase() : "available";
  const sectionData = (section) => isObject(section) && Object.prototype.hasOwnProperty.call(section, "data") ? section.data : section;
  const statusMessage = (state) => ({ current: "Dữ liệu hiện tại.", expiring: "Sắp đến kỳ cập nhật.", stale: "Dữ liệu đã cũ.", missing: "Chưa có trong bản dữ liệu này.", historical: "Đây là dữ liệu lịch sử, không phải trạng thái thị trường hiện tại.", unknown: "Chưa xác định được độ mới của dữ liệu.", partial: "Dữ liệu chưa đầy đủ; phần hợp lệ vẫn được hiển thị.", malformed: "Phần này không hợp lệ và không thể hiển thị.", incomparable: "Hai kỳ dữ liệu không thể so sánh với nhau." }[state] || "");
  // Routes a raw contract status/enum through the shared Vietnamese vocabulary
  // (assets/js/value-format.js, same module the Workspace/Screener use) so no
  // snake_case/UPPER_CASE token ever reaches the page unmapped. Falls back to
  // a neutral "see technical detail" phrase -- never the raw token -- when
  // nothing recognizes it and it looks machine-generated.
  function getValueFormat() {
    if (typeof window !== "undefined" && window.VSValueFormat) return window.VSValueFormat;
    if (typeof require === "function") {
      try { return require("./value-format.js"); } catch (err) { return null; }
    }
    return null;
  }
  function looksLikeRawEnum(raw) {
    return /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+$/.test(raw);
  }
  // An internal code the shared Vietnamese vocabulary doesn't recognize is still
  // real information (e.g. an operating-cash-flow direction, or an enterprise-value
  // method explaining exactly why a bank archetype doesn't qualify) -- de-snake it
  // into a plain capitalized sentence instead of discarding it or showing the raw
  // programmer-style token. Anything with fewer than two words never reaches here
  // (looksLikeRawEnum requires at least one underscore), so this always succeeds;
  // the null case only guards a pathological all-underscore input.
  function humanizeSnakeSentence(raw) {
    const words = raw.split("_").filter(Boolean);
    if (words.length < 2) return null;
    const text = words.join(" ").toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1) + ".";
  }
  // Scans the preferred domain table first, then every other domain table --
  // deliberately not delegating to value-format.js's own formatKnownLabel, which
  // (as actually exported today) only checks the single preferred domain and
  // echoes the raw value back on a miss rather than trying the rest, since a
  // second `function formatKnownLabel` declared later in that file's closure
  // shadows the first, cross-domain-scanning one (see value-format.js ~line 1230).
  // A few single-word contract states used in this panel (no underscore, so they
  // never trip looksLikeRawEnum) are not covered by any value-format.js domain table.
  const LOCAL_STATE_FALLBACK_VI = {
    inapplicable: "Không áp dụng", eligible: "Đủ điều kiện", derived: "Suy ra từ dữ liệu báo cáo",
    comparable: "So sánh được", partially_comparable: "So sánh được một phần", incomparable: "Không thể so sánh",
    degraded: "Suy giảm",
  };
  function vi(value, domain) {
    const raw = value === null || value === undefined || value === "" ? "" : String(value);
    if (!raw) return "Chưa có dữ liệu";
    const vf = getValueFormat();
    if (vf && typeof vf.formatDomainState === "function") {
      const primary = vf.formatDomainState(raw, domain);
      if (primary.known) return primary.label;
      const tables = vf.DOMAIN_TABLES || {};
      for (const altDomain of Object.keys(tables)) {
        if (altDomain === domain) continue;
        const alt = vf.formatDomainState(raw, altDomain);
        if (alt.known) return alt.label;
      }
    }
    const local = LOCAL_STATE_FALLBACK_VI[raw.toLowerCase()];
    if (local) return esc(local);
    if (!looksLikeRawEnum(raw)) return esc(sanitizeFreeText(raw));
    return esc(humanizeSnakeSentence(raw) || "Xem chi tiết kỹ thuật");
  }
  function viList(values, domain) {
    return Array.isArray(values) && values.length ? values.map((value) => vi(value, domain)).join(", ") : "";
  }

  function sourceBlocks(value) {
    if (!isObject(value)) return [];
    if (isObject(value.sources)) return Object.entries(value.sources).filter(([, item]) => isObject(item) || Array.isArray(item));
    if (Array.isArray(value.sources)) return value.sources.filter((item) => isObject(item) || Array.isArray(item)).map((item) => [isObject(item) ? item.source_name || item.source || item.provider || "Nguồn" : "Nguồn", item]);
    if (["owners", "items", "holders", "subsidiaries", "entities"].some((key) => Array.isArray(value[key]))) return [[value.source || value.provider || "Nguồn", value]];
    const ignored = new Set(["status", "data", "snapshot_date", "provenance_date", "reference", "reference_scope", "update_date"]);
    const entries = Object.entries(value).filter(([key, item]) => !ignored.has(key) && (isObject(item) || Array.isArray(item)));
    return entries.length ? entries : [[value.source || value.provider || "Nguồn", value]];
  }
  function metadata(item) {
    if (!isObject(item)) return "";
    const bits = [item.source_name || item.source || item.provider, item.snapshot_date || item.provenance_date || item.as_of_date || item.update_date || item.fetched_at, item.source_reference || item.reference_scope || item.reference || item.provenance].filter((value) => value !== null && value !== undefined && value !== "").map(esc);
    return bits.length ? `<div class="cp-ci-meta">${bits.join(" · ")}</div>` : "";
  }
  function fieldRows(item, fields) {
    if (!isObject(item)) return "";
    const rows = fields.filter(({ key }) => Object.prototype.hasOwnProperty.call(item, key)).map(({ key, label, number }) => `<div class="cp-ci-field"><span>${esc(label)}</span><strong>${number ? displayNumber(item[key]) : displayValue(item[key])}</strong></div>`);
    return rows.length ? `<div class="cp-ci-fields">${rows.join("")}</div>` : "";
  }
  function subsection(title, section, render) {
    const state = sectionState(section); if (state === "missing") return "";
    const notice = statusMessage(state), body = state === "malformed" ? "" : render(sectionData(section));
    const freshness = isObject(section) && isObject(section.freshness) ? section.freshness : null;
    const freshnessNotice = freshness ? `<div class="cp-ci-notice cp-ci-${esc(freshness.freshness_status || "unknown")}">${esc(statusMessage(freshness.freshness_status || "unknown"))}${freshness.stale_reason ? ` ${vi(freshness.stale_reason, "diagnostic_reason")}` : ""}${freshness.is_actionable ? "" : " Không dùng để hành động."}</div>` : "";
    return body || notice || freshnessNotice ? `<section class="cp-ci-section"><h4>${esc(title)}</h4>${notice ? `<div class="cp-ci-notice cp-ci-${esc(state)}">${esc(notice)}</div>` : ""}${freshnessNotice}${body}</section>` : "";
  }
  // Company-profile fields are a free-form passthrough from each data source (sector,
  // business model, share count, ...), not a fixed enum -- there is no complete list to
  // translate ahead of time. Known investor-relevant keys get a Vietnamese label; any
  // other key falls back to its own titleCase (never a raw snake_case token).
  const PROFILE_FIELD_LABELS_VI = {
    sector: "Ngành", business_model: "Mô hình kinh doanh", issue_share: "Số cổ phiếu phát hành",
    outstanding_shares: "Số cổ phiếu đang lưu hành", charter_capital: "Vốn điều lệ",
    established_date: "Ngày thành lập", listing_date: "Ngày niêm yết", exchange: "Sàn giao dịch",
    website: "Trang web", address: "Địa chỉ", employee_count: "Số lượng nhân viên",
    company_name: "Tên doanh nghiệp", industry: "Lĩnh vực",
  };
  function renderProfile(profile) {
    return sourceBlocks(profile).map(([source, item]) => { const values = isObject(item) ? item : {};
      const profileFields = isObject(values.record) && isObject(values.record.qualified_fields) ? values.record.qualified_fields : values;
      const fields = Object.entries(profileFields).filter(([key, value]) => !["source", "source_name", "provider", "snapshot_date", "provenance_date", "as_of_date", "update_date", "fetched_at", "reference", "reference_scope", "source_reference", "provenance", "status", "data"].includes(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean"));
      return `<div class="cp-ci-source"><h5>${esc(source)}</h5>${metadata(values)}${fields.length ? `<div class="cp-ci-fields">${fields.map(([key, value]) => `<div class="cp-ci-field"><span>${esc(PROFILE_FIELD_LABELS_VI[key] || titleCase(key))}</span><strong>${displayValue(value)}</strong></div>`).join("")}</div>` : ""}</div>`;
    }).join("");
  }
  function renderOwnership(ownership) {
    return sourceBlocks(ownership).map(([source, item]) => { const rows = Array.isArray(item) ? item : (isObject(item) ? item.records || item.owners || item.items || item.holders || [] : []); if (!Array.isArray(rows)) return "";
      return `<div class="cp-ci-source"><h5>${esc(source)}</h5>${metadata(item)}${rows.map((owner) => { const fields = isObject(owner) && isObject(owner.fields) ? owner.fields : owner; return isObject(fields) ? `<div class="cp-ci-record">${fieldRows(fields, [{ key: "owner_type", label: "Loại sở hữu" }, { key: "ownership_percentage", label: "Tỷ lệ sở hữu (%)", number: true }, { key: "shares_owned", label: "Số cổ phiếu sở hữu", number: true }, { key: "update_date", label: "Ngày cập nhật" }])}</div>` : ""; }).join("")}</div>`;
    }).join("");
  }
  const SHAREHOLDER_CHANGE_TYPE_VI = { new_holder: "Cổ đông mới", disappeared_holder: "Cổ đông rút khỏi danh sách" };
  function renderMajorShareholders(value) {
    if (!isObject(value)) return "";
    if (Array.isArray(value.sources)) return value.sources.filter(isObject).map((source) => {
      const rows = Array.isArray(source.records) ? source.records : [];
      const snapshot = rows.length ? `<div class="cp-ci-source"><h5>${esc(source.source_name || "Danh sách gần nhất")}</h5>${metadata(source)}${rows.map((holder) => isObject(holder) ? `<div class="cp-ci-record">${fieldRows(holder, [{ key: "holder_name", label: "Cổ đông" }, { key: "shares", label: "Số cổ phiếu", number: true }, { key: "ownership_pct", label: "Tỷ lệ sở hữu (%)", number: true }])}</div>` : "").join("")}</div>` : "";
      const delta = source.delta;
      if (!isObject(delta)) return snapshot;
      if (String(delta.status || "").startsWith("incomparable")) return `${snapshot}<div class="cp-ci-notice cp-ci-incomparable">${esc(statusMessage("incomparable"))}</div>`;
      const changes = Array.isArray(delta.changes) ? delta.changes : [];
      return `${snapshot}${changes.map((change) => isObject(change) ? `<div class="cp-ci-source"><h5>${esc(SHAREHOLDER_CHANGE_TYPE_VI[change.change_type] || "Thay đổi cổ đông")}</h5>${fieldRows(change, [{ key: "holder_name_after", label: "Cổ đông" }, { key: "holder_name_before", label: "Cổ đông" }, { key: "shares_delta", label: "Thay đổi số cổ phiếu", number: true }, { key: "ownership_pct_delta", label: "Thay đổi tỷ lệ sở hữu (%)", number: true }])}</div>` : "").join("")}`;
    }).join("");
    const snapshot = value.latest_valid_snapshot || value.latest_snapshot || value.snapshot, delta = value.delta || value.snapshot_delta;
    const rows = Array.isArray(snapshot) ? snapshot : (isObject(snapshot) ? (snapshot.holders || snapshot.items || []) : []);
    const snapshotHtml = Array.isArray(rows) && rows.length ? `<div class="cp-ci-source"><h5>Danh sách gần nhất</h5>${metadata(snapshot)}${rows.map((holder) => isObject(holder) ? `<div class="cp-ci-record">${fieldRows(holder, [{ key: "holder_name", label: "Cổ đông" }, { key: "name", label: "Cổ đông" }, { key: "shares_owned", label: "Số cổ phiếu", number: true }, { key: "ownership_percentage", label: "Tỷ lệ sở hữu (%)", number: true }])}</div>` : "").join("")}</div>` : "";
    if (!isObject(delta)) return snapshotHtml;
    if (sectionState(delta) === "incomparable" || value.status === "incomparable") return `${snapshotHtml}<div class="cp-ci-notice cp-ci-incomparable">${esc(statusMessage("incomparable"))}</div>`;
    const changes = [["Cổ đông mới", delta.new_holder], ["Cổ đông rút khỏi danh sách", delta.disappeared_holder], ["Thay đổi số cổ phiếu", delta.shares_change ?? delta.change_shares], ["Thay đổi tỷ lệ sở hữu (%)", delta.ownership_percentage_change ?? delta.change_ownership_percentage]].filter(([, item]) => item !== undefined);
    return `${snapshotHtml}${changes.length ? `<div class="cp-ci-source"><h5>Thay đổi so với kỳ trước</h5>${metadata(delta)}${changes.map(([label, item]) => `<div class="cp-ci-field"><span>${esc(label)}</span><strong>${Array.isArray(item) ? item.map(displayValue).join(", ") : displayValue(item)}</strong></div>`).join("")}</div>` : ""}`;
  }
  function renderSubsidiaries(value) {
    return sourceBlocks(value).map(([source, item]) => { const rows = Array.isArray(item) ? item : (isObject(item) ? item.records || item.subsidiaries || item.items || item.entities || [] : []); if (!Array.isArray(rows)) return "";
      return `<div class="cp-ci-source"><h5>${esc(source)}</h5>${metadata(item)}${rows.map((entity) => { const fields = isObject(entity) && isObject(entity.fields) ? entity.fields : entity; return isObject(fields) ? `<div class="cp-ci-record">${fieldRows(fields, [{ key: "organization_name", label: "Tên đơn vị" }, { key: "entity_name", label: "Tên đơn vị" }, { key: "name", label: "Tên đơn vị" }, { key: "provider_record_id", label: "Mã đối tác" }, { key: "provider_local_identity", label: "Mã đối tác" }, { key: "relationship_type", label: "Quan hệ" }, { key: "ownership_percent", label: "Tỷ lệ sở hữu (%)", number: true }, { key: "ownership_percentage", label: "Tỷ lệ sở hữu (%)", number: true }, { key: "ownership", label: "Tỷ lệ sở hữu", number: true }, { key: "provenance", label: "Nguồn thông tin" }])}</div>` : ""; }).join("")}</div>`;
    }).join("");
  }
  function renderCorporateEvents(value) {
    if (!isObject(value)) return "";
    const warning = "Chỉ ghi nhận sự kiện sắp diễn ra, chưa đầy đủ; không phải toàn bộ lịch sử sự kiện.";
    return sourceBlocks(value).map(([source, item]) => {
      const rows = isObject(item) && Array.isArray(item.records) ? item.records : [];
      if (!rows.length) return "";
      return `<div class="cp-ci-source"><h5>${esc(source)}</h5><div class="cp-ci-notice cp-ci-partial">${esc(warning)}</div>${rows.map((record) => {
        if (!isObject(record)) return "";
        const fields = isObject(record.fields) ? record.fields : record;
        const provenance = isObject(record.provenance) ? record.provenance : {};
        const title = fields.event_title_vi || fields.event_title_en || fields.event_name_vi || fields.event_name_en || "Sự kiện doanh nghiệp";
        return `<div class="cp-ci-record"><strong>${displayValue(title)}</strong>${fieldRows({ provider_event_id: record.provider_event_id, ...fields }, [
          { key: "provider_event_id", label: "Mã sự kiện" }, { key: "event_code", label: "Mã loại sự kiện" },
          { key: "category", label: "Loại sự kiện" }, { key: "public_date", label: "Ngày công bố" },
          { key: "record_date", label: "Ngày chốt danh sách" }, { key: "exright_date", label: "Ngày giao dịch không hưởng quyền" },
          { key: "issue_date", label: "Ngày phát hành" }, { key: "start_date", label: "Ngày bắt đầu" },
          { key: "end_date", label: "Ngày kết thúc" }, { key: "payout_date", label: "Ngày thanh toán" },
          { key: "listing_date", label: "Ngày niêm yết" }, { key: "exercise_ratio", label: "Tỷ lệ thực hiện", number: true },
          { key: "value_per_share", label: "Giá trị mỗi cổ phiếu", number: true },
        ]) }<div class="cp-ci-meta">${esc(provenance.provider || source)}${provenance.retrieved_at ? ` · ${esc(provenance.retrieved_at)}` : ""}</div></div>`;
      }).join("")}</div>`;
    }).join("");
  }
  function renderAnalysisReadiness(readiness) {
    if (!isObject(readiness) || !isObject(readiness.domains)) return "";
    const combined = readiness.domains.combined_ai_analysis;
    if (!isObject(combined)) return "";
    const state = String(combined.state || "unknown");
    return `<div class="cp-ci-notice cp-ci-${esc(state.toLowerCase())}">Mức sẵn sàng phân tích: ${vi(state, "data_fitness")}.${combined.reason ? ` ${vi(combined.reason, "diagnostic_reason")}` : ""}${combined.is_actionable ? "" : " Suy luận còn hạn chế."}</div>`;
  }
  function renderCorporateIntelligence(corporate) {
    if (!isObject(corporate)) return `<section class="cp-ci"><h3>Thông tin doanh nghiệp</h3><div class="cp-ci-notice cp-ci-missing">${esc(statusMessage("missing"))}</div></section>`;
    const majorShareholders = corporate.major_shareholders || (corporate.major_shareholder_snapshot || corporate.major_shareholder_delta ? { latest_valid_snapshot: corporate.major_shareholder_snapshot, delta: corporate.major_shareholder_delta } : null);
    const parts = [subsection("Hồ sơ doanh nghiệp", corporate.company_profile, renderProfile), subsection("Cấu trúc sở hữu", corporate.ownership_structure, renderOwnership), subsection("Cổ đông lớn", majorShareholders, renderMajorShareholders), subsection("Công ty con", corporate.company_subsidiaries, renderSubsidiaries), subsection("Sự kiện doanh nghiệp", corporate.corporate_events, renderCorporateEvents)].filter(Boolean);
    return `<section class="cp-ci"><h3>Thông tin doanh nghiệp</h3>${parts.length ? parts.join("") : `<div class="cp-ci-notice cp-ci-missing">${esc(statusMessage("missing"))}</div>`}</section>`;
  }

  const SCENARIO_LABEL_VI = { bear: "Xấu", base: "Cơ sở", bull: "Tốt" };
  const RISK_POSTURE_VI = { low: "Thấp", moderate: "Trung bình", elevated: "Cao", severe: "Nghiêm trọng" };
  const PROHIBITED_CLAIM_VI = {
    target_price: "Giá mục tiêu", recommendation: "Khuyến nghị mua/bán", probability: "Xác suất",
    position_size: "Quy mô vị thế", ranking: "Xếp hạng so sánh", allocation: "Phân bổ danh mục",
  };
  function prohibitedClaimsVi(claims) {
    return Array.isArray(claims) && claims.length ? claims.map((claim) => esc(PROHIBITED_CLAIM_VI[claim] || vi(claim, "diagnostic_reason"))).join(", ") : "Không có";
  }
  function renderQualifiedResearchBrief(brief) {
    if (!isObject(brief)) return '<section class="company-section research-brief"><h3>Luận điểm nghiên cứu lịch sử</h3><p>Chưa có luận điểm nghiên cứu cho phiên bản dữ liệu cũ này.</p></section>';
    const facts = Array.isArray(brief.qualified_facts) ? brief.qualified_facts.slice(0, 8) : [];
    const quality = isObject(brief.quality) ? Object.values(brief.quality) : [];
    const scenarios = isObject(brief.scenarios) ? ["bear", "base", "bull"].map((name) => [name, brief.scenarios[name]]).filter(([, value]) => isObject(value)) : [];
    const liquidity = isObject(brief.portfolio_risk_boundary) ? brief.portfolio_risk_boundary.liquidity : null;
    const conclusion = isObject(brief.historical_conclusion) ? brief.historical_conclusion : {};
    return `<section class="company-section research-brief"><h3>Luận điểm nghiên cứu lịch sử</h3><p><b>${esc(brief.ticker || "")}</b> · ${vi(brief.entity_type, "entity_type")} · chỉ mang tính lịch sử, không dùng để hành động</p><p><b>Kết luận lịch sử:</b> ${vi(conclusion.status || "insufficient_evidence", "diagnostic_reason")} — ${conclusion.rationale ? esc(sanitizeFreeText(conclusion.rationale)) : ""}</p><h4>Dữ kiện đã xác nhận</h4><ul>${facts.map((f) => `<li>${esc(f.canonical_metric)} (${esc(f.reporting_period)}): ${displayValue(f.value)}</li>`).join("") || "<li>Chưa có dữ liệu</li>"}</ul><h4>Chất lượng dữ liệu</h4><ul>${quality.map((q) => `<li>${esc(q.dimension)}: ${vi(q.status, "diagnostic_reason")}${(q.reason_codes || []).length ? ` — ${viList(q.reason_codes, "diagnostic_reason")}` : ""}</li>`).join("") || "<li>Chưa có dữ liệu</li>"}</ul><h4>Rủi ro chính</h4><ul>${(brief.risks && brief.risks.phase_4b || []).map((r) => `<li>${esc(r.risk_id)}: ${r.inference || r.uncertainty ? esc(sanitizeFreeText(r.inference || r.uncertainty)) : ""}</li>`).join("") || "<li>Chưa ghi nhận rủi ro đã xác nhận bổ sung</li>"}</ul><h4>Điều kiện Xấu / Cơ sở / Tốt</h4>${scenarios.map(([n,s]) => `<p><b>${esc(SCENARIO_LABEL_VI[n] || titleCase(n))}:</b> ${s.thesis ? displayValue(s.thesis) : "Chưa có dữ liệu"}</p>`).join("")}<h4>Điều kiện làm mất hiệu lực luận điểm</h4><ul>${(brief.invalidation_conditions || []).map((x) => `<li>${displayValue(x)}</li>`).join("") || "<li>Chưa có dữ liệu</li>"}</ul><h4>Ranh giới rủi ro danh mục / thanh khoản</h4><p>Rủi ro cơ bản: ${(() => { const posture = (brief.risks && brief.risks.phase_4c || {}).aggregate_posture || "insufficient_evidence"; return esc(RISK_POSTURE_VI[posture] || "") || vi(posture, "diagnostic_reason"); })()}. Thanh khoản: ${vi((liquidity || {}).status || "unavailable", "liquidity_state")}${((liquidity || {}).reason_codes || []).length ? ` — ${viList((liquidity || {}).reason_codes, "diagnostic_reason")}` : ""}. Bối cảnh danh mục: ${vi(((brief.portfolio_risk_boundary || {}).portfolio_context || {}).status || "blocked_input", "diagnostic_reason")}. Phân bổ: ${vi(((brief.portfolio_risk_boundary || {}).allocation || {}).status || "allocation_blocked", "diagnostic_reason")}.</p><h4>Chưa thể kết luận</h4><p>${prohibitedClaimsVi(brief.prohibited_claims)}</p></section>`;
  }
  function researchBriefForRow(row,bundle) { const e=bundleEntryForRow(row,bundle); return e && e.qualified_research_brief; }
  function renderQualifiedResearchDelta(delta) {
    if (!isObject(delta)) return '<section class="company-section research-delta"><h3>Điều gì đã thay đổi?</h3><p>Chưa có kỳ so sánh đã xác nhận.</p></section>';
    const state = String(delta.comparison_status || "unavailable");
    if (state !== "comparable" && state !== "partially_comparable") return `<section class="company-section research-delta"><h3>Điều gì đã thay đổi?</h3><p>Chưa thể so sánh: ${vi(state, "diagnostic_reason")}.</p></section>`;
    const summary = isObject(delta.material_change_summary) ? delta.material_change_summary : {};
    const conclusion = isObject(delta.historical_conclusion) ? delta.historical_conclusion : {};
    const keyChanges = Array.isArray(summary.highest_priority_changes) ? summary.highest_priority_changes.slice(0, 8) : [];
    const quality = Array.isArray(delta.quality_changes) ? delta.quality_changes.filter((item) => isObject(item) && item.status !== "unchanged").slice(0, 5) : [];
    const risks = Array.isArray(delta.risk_changes) ? delta.risk_changes.filter((item) => isObject(item) && item.status !== "persistent").slice(0, 5) : [];
    const invalidations = Array.isArray(delta.invalidation_changes) ? delta.invalidation_changes.filter((item) => isObject(item) && (item.status !== "unchanged" || item.trigger_evaluation === "triggered")).slice(0, 5) : [];
    const blocked = Array.isArray(summary.unchanged_critical_boundaries) ? summary.unchanged_critical_boundaries : [];
    const changedConclusion = conclusion.changed ? `<p><b>Kết luận lịch sử:</b> ${vi((conclusion.previous || {}).status || "unavailable", "diagnostic_reason")} → ${vi((conclusion.current || {}).status || "unavailable", "diagnostic_reason")}</p>` : "";
    return `<section class="company-section research-delta"><h3>Điều gì đã thay đổi?</h3><p><b>Trạng thái thay đổi luận điểm:</b> ${summary.material_change_detected ? "đã phát hiện thay đổi trọng yếu" : "không có thay đổi trọng yếu đã xác nhận"} (${vi(state, "diagnostic_reason")}).</p>${changedConclusion}<h4>Thay đổi chính</h4><ul>${keyChanges.map((item) => `<li>${vi(item.category, "diagnostic_reason")}: ${esc(item.reference)}</li>`).join("") || "<li>Chưa có thay đổi mới được xác nhận.</li>"}</ul><h4>Rủi ro và chất lượng dữ liệu</h4><ul>${quality.map((item) => `<li>Chất lượng ${esc(item.dimension)}: ${vi(item.status, "diagnostic_reason")}${item.direction && item.direction !== "unchanged" ? ` (${vi(item.direction, "diagnostic_reason")})` : ""}</li>`).join("")}${risks.map((item) => `<li>Rủi ro ${esc(item.risk_id)}: ${vi(item.status, "diagnostic_reason")}</li>`).join("") || "<li>Không có rủi ro hoặc chất lượng nào thay đổi.</li>"}</ul><h4>Kịch bản / điều kiện làm mất hiệu lực</h4><ul>${invalidations.map((item) => `<li>${esc(item.condition_id)}: ${vi(item.status, "invalidation_state")}; kích hoạt: ${vi(item.trigger_evaluation || "unavailable", "evidence_state")}</li>`).join("") || "<li>Không có điều kiện làm mất hiệu lực nào thay đổi.</li>"}</ul><h4>Vẫn còn bị chặn</h4><p>${blocked.length ? viList(blocked, "diagnostic_reason") : "Không còn ranh giới trọng yếu nào bị chặn không đổi."}</p></section>`;
  }
  function researchDeltaForRow(row,bundle) { const e=bundleEntryForRow(row,bundle); return e && e.qualified_research_delta; }
  // Financial distress (Altman Z'). Deliberately narrow: this section renders the model's
  // own fail-closed envelope and nothing else. It never computes a score, never turns an
  // applicability verdict into a rating, and never shows a number for a filer the model
  // does not apply to — a credit institution or a broker reaches this function with
  // applicability "not_applicable" and no score, and that is exactly what is displayed.
  const ZONE_VI = { distress: "Vùng nguy hiểm", grey: "Vùng cảnh báo", safe: "Vùng an toàn" };
  const APPLICABILITY_VERDICT_VI = { eligible: "Đủ điều kiện", not_applicable: "Không áp dụng", insufficient_evidence: "Chưa đủ bằng chứng" };
  const DISTRESS_APPLICABILITY = {
    not_applicable: "Mô hình này không áp dụng cho doanh nghiệp này.",
    insufficient_evidence: "Chưa đủ dữ liệu đã xác nhận để áp dụng mô hình này.",
    eligible: "Doanh nghiệp này đủ điều kiện áp dụng mô hình này.",
  };
  const STATEMENT_TAXONOMY_VI = {
    corporate_vas: "Doanh nghiệp (VAS)", credit_institution: "Tổ chức tín dụng",
    securities_company: "Công ty chứng khoán", insurance_company: "Doanh nghiệp bảo hiểm",
    generated_taxonomy: "Tự động nhận diện", generated_evidence: "Tự động nhận diện", manual_profile: "Hồ sơ thủ công",
  };
  function renderStatementTaxonomy(evidence) {
    if (!isObject(evidence) || !evidence.statement_taxonomy) return "";
    const authority = String(evidence.entity_type_authority || "unknown");
    return `<div class="cp-ci-source"><h5>Loại báo cáo tài chính (tự động nhận diện)</h5>`
      + `<div class="cp-ci-fields">`
      + `<div class="cp-ci-field"><span>Mẫu báo cáo</span><strong>${displayValue(STATEMENT_TAXONOMY_VI[evidence.statement_taxonomy] || titleCase(evidence.statement_taxonomy))}</strong></div>`
      + `<div class="cp-ci-field"><span>Nguồn xác định loại hình</span><strong>${displayValue(STATEMENT_TAXONOMY_VI[authority] || titleCase(authority))}</strong></div>`
      + `</div>`
      + `<div class="cp-ci-notice cp-ci-partial">Đây là quan sát tự động về mẫu báo cáo, không phải loại hình doanh nghiệp đã được kiểm tra thủ công.</div>`
      + `</div>`;
  }
  function renderFinancialDistress(distress, taxonomy) {
    const taxonomyHtml = renderStatementTaxonomy(taxonomy);
    if (!isObject(distress)) {
      return taxonomyHtml
        ? `<section class="cp-ci"><h3>Cảnh báo rủi ro tài chính (Altman Z′)</h3>${taxonomyHtml}<div class="cp-ci-notice cp-ci-missing">Chưa có kết quả mô hình cảnh báo rủi ro trong bản dữ liệu này.</div></section>`
        : "";
    }
    const applicability = isObject(distress.applicability) ? distress.applicability : {};
    const verdict = String(applicability.applicability || distress.status || "insufficient_evidence");
    const head = `<div class="cp-ci-meta">Mô hình: ${esc(distress.model || "Altman Z'")}`
      + `${distress.variant ? ` · biến thể ${esc(distress.variant)}` : ""}`
      + ` · khả năng áp dụng: ${APPLICABILITY_VERDICT_VI[verdict] ? esc(APPLICABILITY_VERDICT_VI[verdict]) : vi(verdict, "diagnostic_reason")}</div>`;
    const notice = `<div class="cp-ci-notice cp-ci-${verdict === "eligible" ? "partial" : "missing"}">`
      + `${esc(DISTRESS_APPLICABILITY[verdict] || "Chưa xác định được khả năng áp dụng mô hình.")}`
      + `${applicability.reason ? ` ${esc(sanitizeFreeText(applicability.reason))}` : ""}</div>`;
    const blocking = Array.isArray(distress.blocking_reasons) ? distress.blocking_reasons : [];
    const missing = Array.isArray(distress.missing_inputs) ? distress.missing_inputs : [];
    const reasons = (blocking.length || missing.length)
      ? `<div class="cp-ci-source"><h5>Vì sao chưa hiển thị điểm số</h5>${blocking.map((r) => `<div class="cp-ci-field"><span>Bị chặn</span><strong>${displayValue(r)}</strong></div>`).join("")}${missing.map((r) => `<div class="cp-ci-field"><span>Thiếu dữ liệu</span><strong>${displayValue(r)}</strong></div>`).join("")}</div>`
      : "";
    // A score is only ever rendered when the model itself reported one. `status`
    // "available" without a numeric score still renders no number.
    const score = distress.status === "available" && typeof distress.score === "number" && Number.isFinite(distress.score)
      ? `<div class="cp-ci-source"><h5>Kết quả</h5><div class="cp-ci-fields">`
        + `<div class="cp-ci-field"><span>Điểm Z'</span><strong>${displayNumber(distress.score, 4)}</strong></div>`
        + `<div class="cp-ci-field"><span>Phân vùng</span><strong>${displayValue(ZONE_VI[distress.zone] || titleCase(distress.zone))}</strong></div>`
        + `<div class="cp-ci-field"><span>Kỳ báo cáo</span><strong>${displayValue(distress.period)}</strong></div>`
        + `</div></div>`
      : "";
    const proximity = isObject(distress.zone_proximity) ? distress.zone_proximity : null;
    const boundary = score && proximity && proximity.near_threshold
      ? `<div class="cp-ci-notice cp-ci-partial">Điểm số gần ranh giới vùng ${esc(proximity.nearest_threshold || "zone")} (${displayNumber(proximity.nearest_threshold_value, 2)}); nhãn vùng cảnh báo dễ thay đổi khi số liệu đầu vào thay đổi nhỏ.</div>`
      : "";
    const limits = Array.isArray(distress.limitations) && distress.limitations.length
      ? `<div class="cp-ci-source"><h5>Giới hạn khi diễn giải</h5>${distress.limitations.map((l) => `<div class="cp-ci-notice cp-ci-partial">${displayValue(l)}</div>`).join("")}</div>`
      : "";
    return `<section class="cp-ci"><h3>Cảnh báo rủi ro tài chính (Altman Z′)</h3>${head}${taxonomyHtml}${notice}${score}${boundary}${reasons}${limits}`
      + `<div class="cp-ci-notice cp-ci-missing">Vùng cảnh báo của mô hình không phải là xác suất phá sản và không phải khuyến nghị đầu tư.</div></section>`;
  }
  function renderCitedDocumentEvidence(evidence) {
    if (!isObject(evidence)) return "";
    const state = String(evidence.retrieval_status || "unavailable");
    const reason = evidence.reason || (state === "unavailable" ? "section_absent" : null);
    const notices = { unsupported_query: "Truy vấn bằng chứng này chưa được hỗ trợ.", no_source_supported_passage: "Không tìm thấy đoạn trích có nguồn xác nhận.", missing_document: "Chưa có tài liệu được trích dẫn.", source_hash_mismatch: "Tài liệu trích dẫn không khớp kiểm tra tính toàn vẹn nguồn.", section_absent: "Chưa có trích dẫn tài liệu trong bối cảnh này." };
    const rows = Array.isArray(evidence.results) ? evidence.results.filter((item) => isObject(item) && Array.isArray(item.citation_ids) && item.citation_ids.length).slice().sort((a, b) => String(a.document_id || "").localeCompare(String(b.document_id || "")) || String(a.chunk_id || "").localeCompare(String(b.chunk_id || ""))) : [];
    const rowHtml = rows.map((item) => `<div class="cp-ci-source"><h5>${esc(item.document_id || "Tài liệu")}</h5><div class="cp-ci-fields"><div class="cp-ci-field"><span>Mã</span><strong>${displayValue(evidence.ticker)}</strong></div><div class="cp-ci-field"><span>Trang / mục</span><strong>${displayValue(item.page)} / ${displayValue(item.section)}</strong></div><div class="cp-ci-field"><span>Mã trích dẫn</span><strong>${item.citation_ids.map(esc).join(", ")}</strong></div><div class="cp-ci-field"><span>Công bố / ghi nhận</span><strong>${displayValue(item.published_at)} / ${displayValue(item.observed_at)}</strong></div><div class="cp-ci-field"><span>Mã băm tài liệu</span><strong>${displayValue(item.document_sha256)}</strong></div></div></div>`).join("");
    const notice = notices[reason] || (state === "unavailable" ? "Chưa có trích dẫn tài liệu." : "");
    return `<section class="cp-ci"><h3>Trích dẫn tài liệu nguồn</h3><div class="cp-ci-meta">Trạng thái truy xuất: ${vi(state, "data_fitness")}</div>${notice ? `<div class="cp-ci-notice cp-ci-missing">${esc(notice)}</div>` : ""}${rowHtml}</section>`;
  }
  function qualifiedResearchSnapshotForRow(row, bundle) {
    if (isObject(row && row.qualified_research_snapshot_v2)) return row.qualified_research_snapshot_v2;
    return isObject(bundle && bundle.qualified_research_snapshot_v2) ? bundle.qualified_research_snapshot_v2 : null;
  }
  function snapshotRecordForTicker(snapshot, ticker) {
    if (!isObject(snapshot) || !Array.isArray(snapshot.tickers)) return null;
    return snapshot.tickers.find((record) => isObject(record) && record.ticker === ticker) || null;
  }
  function researchStateClass(status) {
    return ["qualified", "available"].includes(String(status || "").toLowerCase()) ? "qrs2-qualified" : "qrs2-unavailable";
  }
  // The v2 snapshot's own bounded capability vocabulary (qualified/unqualified/
  // blocked/available/unknown), distinct from the broader availability_state
  // domain -- kept as its own small dictionary so it does not silently drift if
  // that shared domain's wording changes for an unrelated surface.
  const RESEARCH_CAPABILITY_STATUS_VI = { qualified: "Đã xác nhận", unqualified: "Chưa xác nhận", blocked: "Bị chặn", unknown: "Chưa xác định", available: "Có dữ liệu" };
  function researchCapabilityStatusVi(status) {
    const key = String(status || "unknown").toLowerCase();
    return esc(RESEARCH_CAPABILITY_STATUS_VI[key] || RESEARCH_CAPABILITY_STATUS_VI.unknown);
  }
  function renderResearchState(label, state) {
    const status = isObject(state) && typeof state.status === "string" ? state.status : "unknown";
    const reasons = isObject(state) && Array.isArray(state.reason_codes) ? state.reason_codes.filter((reason) => typeof reason === "string" && reason) : [];
    return `<div class="qrs2-state ${researchStateClass(status)}"><span>${esc(label)}</span><strong>${researchCapabilityStatusVi(status)}</strong>${reasons.length ? `<small>${viList(reasons, "diagnostic_reason")}</small>` : ""}</div>`;
  }
  function issuerForRow(row) {
    const issuer = [row && row.issuer, row && row.issuer_name, row && row.company_name, row && row.company, row && row.name]
      .find((value) => typeof value === "string" && value.trim());
    return issuer || "Chưa có trong bản dữ liệu này";
  }
  function renderQualifiedResearchSnapshotV2(snapshot, row) {
    const ticker = row && row.ticker;
    if (!isObject(snapshot)) return "";
    const record = snapshotRecordForTicker(snapshot, ticker);
    if (!record) return `<section class="cp-ci qrs2"><h3>Năng lực nghiên cứu theo mã</h3><div class="qrs2-state qrs2-unavailable"><span>Mã</span><strong>${esc(ticker || "unknown")}</strong><small>Chưa có mã này trong bản dữ liệu</small></div></section>`;
    const reasons = Array.isArray(record.reason_codes) ? record.reason_codes.filter((reason) => typeof reason === "string" && reason) : [];
    const states = isObject(record.analysis_states) ? record.analysis_states : {};
    const stateRows = [
      ["Nghiên cứu lịch sử", states.historical_research],
      ["Cơ sở giá gốc", states.raw_as_traded_price],
      ["Định giá hiện tại", states.current_valuation],
      ["Thanh khoản", states.generic_liquidity],
      ["Giá trị dòng vốn ngoại", states.foreign_flow_value],
    ].map(([label, state]) => renderResearchState(label, state)).join("");
    return `<section class="cp-ci qrs2"><h3>Năng lực nghiên cứu theo mã</h3><div class="cp-ci-meta">${esc(snapshot.snapshot_id || "Chưa có định danh")}</div><div class="cp-ci-fields"><div class="cp-ci-field"><span>Mã</span><strong>${esc(record.ticker)}</strong></div><div class="cp-ci-field"><span>Doanh nghiệp</span><strong>${esc(issuerForRow(row))}</strong></div><div class="cp-ci-field"><span>Năng lực nghiên cứu</span><strong>${researchCapabilityStatusVi(record.research_status)}</strong></div></div>${reasons.length ? `<div class="cp-ci-notice cp-ci-partial">${viList(reasons, "diagnostic_reason")}</div>` : ""}<div class="qrs2-states">${stateRows}</div></section>`;
  }
  function loadCorporateBundle() { if (window.ANALYSIS_BUNDLE) return Promise.resolve(window.ANALYSIS_BUNDLE); if (!corporateBundlePromise && typeof fetch === "function") corporateBundlePromise = fetch("analysis_bundle.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null); return corporateBundlePromise || Promise.resolve(null); }
  function corporateForRow(row, bundle) { if (isObject(row && row.corporate_intelligence)) return row.corporate_intelligence; return bundle && bundle.tickers && row && bundle.tickers[row.ticker] && bundle.tickers[row.ticker].corporate_intelligence; }
  function distressForRow(row, bundle) {
    if (isObject(row && row.financial_distress_evidence)) return row.financial_distress_evidence;
    const entry = bundle && bundle.tickers && row && bundle.tickers[row.ticker];
    return entry && entry.financial_distress_evidence;
  }
  function taxonomyForRow(row, bundle) {
    if (isObject(row && row.statement_taxonomy_evidence)) return row.statement_taxonomy_evidence;
    const entry = bundle && bundle.tickers && row && bundle.tickers[row.ticker];
    return entry && entry.statement_taxonomy_evidence;
  }
  function evidenceForRow(row, bundle) { if (isObject(row && row.cited_document_evidence)) return row.cited_document_evidence; const entry = bundle && bundle.tickers && row && bundle.tickers[row.ticker]; return entry && entry.context_package && entry.context_package.cited_document_evidence; }
  function readinessForRow(row, bundle) { return bundle && bundle.tickers && row && bundle.tickers[row.ticker] && bundle.tickers[row.ticker].analysis_readiness; }
  function bundleEntryForRow(row, bundle) {
    if (isObject(row) && isObject(row.relative_valuation)) return row;
    return isObject(bundle) && isObject(bundle.tickers) && isObject(row) && isObject(bundle.tickers[row.ticker]) ? bundle.tickers[row.ticker] : null;
  }
  function historicalValuationPeriod(methods) {
    const first = methods.find((method) => isObject(method.financial_period));
    return first && first.financial_period && first.financial_period.period ? `FY${first.financial_period.period}` : "Chưa có kỳ báo cáo tài chính";
  }
  function historicalEbitdaMetadata(entry) {
    const records = entry && entry.financial_canonical && entry.financial_canonical.records;
    return Array.isArray(records) ? records.find((record) => isObject(record) && record.canonical_metric === "ebitda" && record.formula_version) || null : null;
  }
  function renderHistoricalValuation(entry) {
    const valuation = entry && entry.relative_valuation;
    if (!isObject(valuation) || !isObject(valuation.methods)) return "";
    const labels = { pe: "P/E", pb: "P/B", ps: "P/S", ev_sales: "EV/Doanh thu", ev_ebitda: "EV/EBITDA" };
    const ordered = ["pe", "pb", "ps", "ev_sales", "ev_ebitda"].map((key) => ({ key, method: valuation.methods[key] })).filter(({ method }) => isObject(method));
    if (!ordered.length) return "";
    const available = ordered.filter(({ method }) => method.state === "available" && method.is_actionable !== false && Number.isFinite(Number(method.observed_multiple)));
    if (!available.length) {
      const unavailable = ordered.find(({ method }) => method.state === "unavailable" || method.is_actionable === false);
      const reason = unavailable && Array.isArray(unavailable.method.missing_inputs) ? unavailable.method.missing_inputs.join(", ") : "historical_valuation_not_actionable";
      return `<section class="cp-hv" data-valuation-state="unavailable" data-valuation-reason="${esc(reason)}"><h3>Định giá lịch sử</h3><div class="cp-ci-notice cp-ci-missing">Chưa có định giá lịch sử cho mã này. Không suy ra định giá hiện tại/trực tiếp.</div></section>`;
    }
    const priceDate = available.find(({ method }) => method.price_as_of_date)?.method.price_as_of_date || "Chưa xác định";
    const ebitda = historicalEbitdaMetadata(entry);
    const rows = available.map(({ key, method }) => `<div class="cp-ci-field"><span>${esc(labels[key])}${key === "ev_ebitda" ? " (EBITDA suy ra)" : ""}</span><strong>${displayNumber(method.observed_multiple, 2)}x</strong></div>`).join("");
    // Methods present in the artifact but not "available" (e.g. ps unavailable for a
    // bank with no revenue identity, ev_sales/ev_ebitda inapplicable for a bank archetype)
    // must still render explicitly here -- never silently dropped alongside the available
    // ones, and never conflated with a "zero available" ticker (the branch above).
    const notAvailable = ordered.filter(({ key }) => !available.some((entry2) => entry2.key === key));
    const notAvailableRows = notAvailable.map(({ key, method }) => {
      const state = String(method.state || "unknown");
      return `<div class="cp-ci-notice cp-ci-${esc(state)}"><span>${esc(labels[key])}</span>: ${vi(state, "data_fitness")} — ${authoritativeReasonVi(method)}</div>`;
    }).join("");
    const ebitdaDetails = ebitda ? `<details class="cp-hv-details"><summary>Chi tiết EBITDA suy ra</summary>${Array.isArray(ebitda.warnings) && ebitda.warnings.length ? `<div class="cp-ci-notice cp-ci-incomparable">${ebitda.warnings.map((w) => vi(w, "diagnostic_reason")).join(" ")}</div>` : ""}</details>` : "";
    return `<section class="cp-hv" data-valuation-state="historical"><h3>Định giá lịch sử</h3><div class="cp-ci-notice cp-ci-historical">Chỉ là hệ số định giá lịch sử — không phải hệ số hiện tại/trực tiếp.</div><div class="cp-ci-meta">Báo cáo tài chính ${esc(historicalValuationPeriod(available.map(({ method }) => method)))} · giá thị trường đã xác nhận tính đến ${esc(priceDate)}</div><div class="cp-ci-source"><div class="cp-ci-fields">${rows}</div></div>${notAvailableRows}${ebitdaDetails}</section>`;
  }

  /* ---------- Financial-analysis visibility (bounded closeout): render already-
   * qualified fundamental_quality / intrinsic_valuation (net_net, fcff_dcf) /
   * financial_canonical(ebitda) fields from the production artifact as-is.
   * Contract-driven only — no ticker checks, no recomputation, no invented
   * aggregates. Anything absent from the artifact simply renders nothing
   * (fail closed), never a fabricated zero/blank/NaN. ---------- */
  const FUNDAMENTAL_QUALITY_LABELS = { growth_profitability: "Tăng trưởng & Khả năng sinh lời", dupont_roe: "DuPont ROE", earnings_quality: "Chất lượng lợi nhuận", financial_strength: "Sức mạnh tài chính", piotroski_f_score: "Piotroski F-Score", altman_z_score: "Altman Z-Score", beneish_m_score: "Beneish M-Score" };
  // A plain neutral phrase, never a raw snake_case internal fallback token
  // panel: missing_inputs/warnings are internal contract codes, so they are routed
  // through the shared Vietnamese vocabulary (never shown as a raw snake_case list).
  function authoritativeReasonVi(method) {
    if (!isObject(method)) return "Chưa có lý do cụ thể";
    if (Array.isArray(method.missing_inputs) && method.missing_inputs.length) return viList(method.missing_inputs, "diagnostic_reason");
    if (Array.isArray(method.warnings) && method.warnings.length) return viList(method.warnings, "diagnostic_reason");
    return "Chưa có lý do cụ thể";
  }
  function financialCurrency(entry) {
    const records = entry && entry.financial_canonical && entry.financial_canonical.records;
    const found = Array.isArray(records) ? records.find((r) => isObject(r) && r.currency) : null;
    return found ? found.currency : null;
  }
  function periodLabelFromPeriods(periods) {
    const first = Array.isArray(periods) ? periods.find((p) => p) : null;
    return first ? `FY${first}` : "Chưa có kỳ báo cáo tài chính";
  }
  function renderFundamentalQuality(entry) {
    const fq = entry && entry.fundamental_quality;
    if (!isObject(fq) || !isObject(fq.models)) return "";
    const models = Object.entries(fq.models).filter(([, model]) => isObject(model));
    if (!models.length) return "";
    const availableCount = models.filter(([, model]) => model.result_state === "available").length;
    const rows = models.map(([key, model]) => {
      const label = FUNDAMENTAL_QUALITY_LABELS[key] || titleCase(key);
      const state = String(model.result_state || model.applicability_state || "unknown");
      if (state === "available") {
        return `<div class="cp-ci-source"><h5>${esc(label)}</h5><div class="cp-ci-fields"><div class="cp-ci-field"><span>Kết quả</span><strong>${displayNumber(model.score_or_value, 2)}</strong></div></div></div>`;
      }
      return `<div class="cp-ci-source"><h5>${esc(label)}</h5><div class="cp-ci-notice cp-ci-${esc(state)}">${vi(state, "data_fitness")}: ${authoritativeReasonVi(model)}</div></div>`;
    }).join("");
    return `<section class="cp-ci-section"><h4>Chất lượng cơ bản</h4><div class="cp-ci-meta">${availableCount}/${models.length} mô hình có kết quả</div>${rows}</section>`;
  }
  function renderNetNet(entry) {
    const method = entry && entry.intrinsic_valuation && entry.intrinsic_valuation.methods && entry.intrinsic_valuation.methods.net_net;
    if (!isObject(method)) return "";
    const state = String(method.state || "unknown");
    if (state !== "available") {
      return `<section class="cp-ci-section"><h4>Giá trị thanh lý ước tính (Net-Net)</h4><div class="cp-ci-notice cp-ci-${esc(state)}">${vi(state, "data_fitness")}: ${authoritativeReasonVi(method)}</div></section>`;
    }
    const currency = financialCurrency(entry);
    const period = periodLabelFromPeriods(method.historical_input_periods);
    const hasPerShare = method.per_share_value !== null && method.per_share_value !== undefined;
    return `<section class="cp-ci-section"><h4>Giá trị thanh lý ước tính (Net-Net)</h4><div class="cp-ci-meta">${esc(period)}${currency ? ` · ${esc(currency)}` : ""}${method.statement_scope ? ` · ${esc(method.statement_scope)}` : ""}</div><div class="cp-ci-fields"><div class="cp-ci-field"><span>Kết quả Net-Net</span><strong>${displayNumber(method.equity_value, 0)}</strong></div>${hasPerShare ? `<div class="cp-ci-field"><span>Trên mỗi cổ phiếu</span><strong>${displayNumber(method.per_share_value, 2)}</strong></div>` : ""}</div></section>`;
  }
  function renderFcff(entry) {
    const method = entry && entry.intrinsic_valuation && entry.intrinsic_valuation.methods && entry.intrinsic_valuation.methods.fcff_dcf;
    if (!isObject(method)) return "";
    const state = String(method.state || "unknown");
    if (state !== "available") {
      return `<section class="cp-ci-section"><h4>Dòng tiền tự do (FCFF)</h4><div class="cp-ci-notice cp-ci-${esc(state)}">${vi(state, "data_fitness")}: ${authoritativeReasonVi(method)}</div></section>`;
    }
    return `<section class="cp-ci-section"><h4>Dòng tiền tự do (FCFF)</h4><div class="cp-ci-fields"><div class="cp-ci-field"><span>Giá trị doanh nghiệp</span><strong>${displayNumber(method.enterprise_value, 0)}</strong></div><div class="cp-ci-field"><span>Giá trị vốn chủ sở hữu</span><strong>${displayNumber(method.equity_value, 0)}</strong></div><div class="cp-ci-field"><span>Trên mỗi cổ phiếu</span><strong>${displayNumber(method.per_share_value, 2)}</strong></div></div></section>`;
  }
  function qualifiedMetric(row, name) {
    const metrics = isObject(row) && isObject(row.metrics) ? row.metrics : {};
    return isObject(metrics[name]) ? metrics[name] : null;
  }
  function qualifiedMetricValue(metric, suffix = "") {
    if (!isObject(metric)) return "Chưa có dữ liệu";
    if (metric.status !== "available") return vi(metric.status || metric.applicability || "unavailable", "diagnostic_reason");
    return metric.value === null || metric.value === undefined ? "Chưa có dữ liệu" : `${displayNumber(metric.value, 2)}${suffix}`;
  }
  function predicateNames(items) {
    return Array.isArray(items) && items.length
      ? items.filter(isObject).map((item) => vi(item.predicate || "qualified_condition", "diagnostic_reason")).join(", ")
      : "Chưa ghi nhận";
  }
  function scenarioConditions(scenarios, name) {
    const scenario = isObject(scenarios) && isObject(scenarios[name]) ? scenarios[name] : {};
    const values = scenario.historical_fundamental_conditions || scenario.required_conditions;
    return Array.isArray(values) && values.length ? values.map(displayValue).join("; ") : "Chưa có dữ liệu";
  }
  function validQualifiedComparison(value) {
    return isObject(value) && value.status === "available" && value.historical_only === true
      && value.market_dependent === false && value.is_actionable === false && value.ranking_prohibited === true
      && Array.isArray(value.rows) && value.cross_sectional_comparison === "available";
  }
  function renderQualifiedHistoricalResearch(entry) {
    const comparison = entry && entry.qualified_cohort_comparison;
    if (comparison === undefined) return "";
    if (!validQualifiedComparison(comparison)) return `<section class="cp-ci-section" data-qualified-research-state="unavailable"><h4>Nghiên cứu cơ bản lịch sử đã xác nhận</h4><div class="cp-ci-notice cp-ci-missing">Chưa có dữ liệu.</div></section>`;
    const decision = isObject(entry.historical_decision_analysis) ? entry.historical_decision_analysis : {};
    const ticker = String(entry.ticker || decision.ticker || "").toUpperCase();
    const row = comparison.rows.find((item) => isObject(item) && String(item.ticker || "").toUpperCase() === ticker);
    if (!isObject(row)) return `<section class="cp-ci-section" data-qualified-research-state="unavailable"><h4>Nghiên cứu cơ bản lịch sử đã xác nhận</h4><div class="cp-ci-notice cp-ci-missing">Chưa có dữ liệu.</div></section>`;
    const metrics = {
      earnings: qualifiedMetric(row, "earnings_state"), ocf: qualifiedMetric(row, "operating_cash_flow_state"),
      conversion: qualifiedMetric(row, "operating_cash_flow_to_net_income"), debtEquity: qualifiedMetric(row, "debt_to_equity"),
      cashDebt: qualifiedMetric(row, "cash_to_debt"), netDebtEquity: qualifiedMetric(row, "net_debt_to_equity"),
    };
    const stateText = (metric) => isObject(metric) && Array.isArray(metric.reason_codes) && metric.reason_codes.length
      ? vi(metric.reason_codes[0], "diagnostic_reason") : qualifiedMetricValue(metric);
    const cards = [
      ["Khả năng sinh lời", stateText(metrics.earnings)], ["Dòng tiền từ HĐKD", stateText(metrics.ocf)],
      ["Chuyển đổi tiền mặt (OCF / LNST)", qualifiedMetricValue(metrics.conversion, "x")], ["Nợ / Vốn chủ sở hữu", qualifiedMetricValue(metrics.debtEquity, "x")],
      ["Tiền mặt / Nợ", qualifiedMetricValue(metrics.cashDebt, "x")], ["Nợ vay ròng / Vốn chủ sở hữu", qualifiedMetricValue(metrics.netDebtEquity, "x")],
      ["Kết luận lịch sử", vi(row.conclusion_code || "unavailable", "diagnostic_reason")], ["Mức độ đầy đủ xu hướng", vi(row.trend_status || "insufficient_history", "diagnostic_reason")],
    ].map(([label, value]) => `<div class="cp-ci-field"><span>${esc(label)}</span><strong>${value}</strong></div>`).join("");
    const comparisonRows = comparison.rows.map((item) => {
      const value = (metricName) => qualifiedMetricValue(qualifiedMetric(item, metricName), "x");
      return `<tr><td>${displayValue(item.ticker)}</td><td>${stateText(qualifiedMetric(item, "earnings_state"))}</td><td>${stateText(qualifiedMetric(item, "operating_cash_flow_state"))}</td><td>${value("operating_cash_flow_to_net_income")}</td><td>${value("debt_to_equity")}</td><td>${value("cash_to_debt")}</td><td>${value("net_debt_to_equity")}</td><td>${displayValue(vi(item.conclusion_code || "unavailable", "diagnostic_reason"))}</td></tr>`;
    }).join("");
    const scenarios = decision.scenarios;
    const limitations = Array.isArray(comparison.limitations) ? comparison.limitations.map((item) => `<div class="cp-ci-notice cp-ci-historical">${displayValue(item)}</div>`).join("") : "";
    return `<section class="cp-ci-section" data-qualified-research-state="available"><h4>Nghiên cứu cơ bản lịch sử đã xác nhận</h4><div class="cp-ci-notice cp-ci-historical">Chỉ là dữ liệu cơ bản lịch sử đã xác nhận. Có bối cảnh đối sánh cùng nhóm; mức độ đầy đủ xu hướng nhiều kỳ: ${vi(comparison.multi_period_trend || "unavailable", "diagnostic_reason")}.</div><div class="cp-ci-meta">Năm tài chính ${displayValue(row.analysis_period)}${row.currency ? ` · ${displayValue(row.currency)}` : ""} · không phải định giá, khuyến nghị, xếp hạng hay nhận định thanh khoản thị trường</div><div class="cp-ci-fields">${cards}</div><div class="cp-ci-source"><h5>Điểm mạnh</h5><div class="cp-ci-meta">${predicateNames(row.strength_predicates)}</div><h5>Rủi ro</h5><div class="cp-ci-meta">${predicateNames(row.risk_predicates)}</div></div><div class="cp-ci-source"><h5>Điều kiện Xấu / Cơ sở / Tốt</h5><div class="cp-ci-field"><span>Xấu</span><strong>${displayValue(scenarioConditions(scenarios, "bear"))}</strong></div><div class="cp-ci-field"><span>Cơ sở</span><strong>${displayValue(scenarioConditions(scenarios, "base"))}</strong></div><div class="cp-ci-field"><span>Tốt</span><strong>${displayValue(scenarioConditions(scenarios, "bull"))}</strong></div></div><div class="cp-ci-source"><h5>Bối cảnh đối sánh cùng nhóm đã xác nhận</h5><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Mã</th><th>Khả năng sinh lời</th><th>Dòng tiền HĐKD</th><th>OCF/LNST</th><th>Nợ/VCSH</th><th>Tiền mặt/Nợ</th><th>Nợ vay ròng/VCSH</th><th>Kết luận</th></tr></thead><tbody>${comparisonRows}</tbody></table></div></div>${limitations}</section>`;
  }
  function financialAnalysisAvailable(entry) {
    return isObject(entry) && (isObject(entry.fundamental_quality) || isObject(entry.intrinsic_valuation) || entry.qualified_cohort_comparison !== undefined);
  }
  function renderFinancialAnalysis(entry) {
    if (!financialAnalysisAvailable(entry)) return financialsPlaceholder();
    const sections = [renderQualifiedHistoricalResearch(entry), renderFundamentalQuality(entry), renderNetNet(entry), renderFcff(entry)].filter(Boolean);
    if (!sections.length) return financialsPlaceholder();
    return `<section class="cp-ci"><h3>Phân tích tài chính</h3>${sections.join("")}</section>`;
  }
  // Independent of renderHistoricalValuation's own state: a qualified EBITDA
  // record must stay visible even when every historical multiple is unavailable
  // (e.g. VNM has no qualified historical price yet, so EV/EBITDA and its inline
  // details never render there — this section is the only place VNM's EBITDA
  // lineage is shown). Left decoupled rather than folded into
  // renderHistoricalValuation so HPG's existing inline "Derived EBITDA details"
  // disclosure — and the test asserting it — stay untouched.
  function renderEbitdaLineage(entry) {
    const ebitda = historicalEbitdaMetadata(entry);
    if (!ebitda) return "";
    const period = isObject(ebitda.period_identity) && ebitda.period_identity.period ? `FY${ebitda.period_identity.period}` : "Chưa có kỳ báo cáo tài chính";
    const warnings = Array.isArray(ebitda.warnings) && ebitda.warnings.length ? `<div class="cp-ci-notice cp-ci-incomparable">${ebitda.warnings.map((w) => vi(w, "diagnostic_reason")).join(" ")}</div>` : "";
    return `<section class="cp-ci" data-ebitda-state="${esc(String(ebitda.quality_state || "unknown"))}"><h3>Nguồn gốc EBITDA</h3><div class="cp-ci-meta">${esc(period)}${ebitda.currency ? ` · ${esc(ebitda.currency)}` : ""}${ebitda.statement_scope ? ` · ${esc(ebitda.statement_scope)}` : ""}</div><div class="cp-ci-fields"><div class="cp-ci-field"><span>EBITDA suy ra</span><strong>${displayNumber(ebitda.value, 0)}</strong></div><div class="cp-ci-field"><span>Trạng thái suy ra</span><strong>${ebitda.derivation_status ? vi(ebitda.derivation_status, "diagnostic_reason") : "-"}</strong></div></div>${warnings}</section>`;
  }

  let chartRenderedFor = null; // ticker mà biểu đồ hiện đang hiển thị — tránh huỷ/tạo lại Chart.js
                                // khi bấm lại đúng tab của cùng 1 mã (Phase 5: giảm render thừa)

  function stat(label, valueHtml) {
    return `<div><div class="vs-modal-stat-label">${esc(label)}</div><div class="vs-modal-stat-value">${valueHtml}</div></div>`;
  }

  function renderOverview(r) {
    return `
      <div class="mb-3" style="font-size:0.8rem; color:var(--text-muted);">
        ${esc(typeof displayExchange === "function" ? displayExchange(r.exchange) : (r.exchange || "–"))} · ${esc(r.industry || "–")}
      </div>
      <div class="vs-modal-stat-grid">
        ${stat("Giá đóng cửa", num(r.close, 0))}
        ${stat("% phiên", `<span class="${valueSignClass(r.chg_today_pct ?? r.change_pct)}">${num(r.chg_today_pct ?? r.change_pct, 2)}%</span>`)}
        ${stat("RS Rating", num(r.rs_rating, 0))}
        ${stat("RSI 14", num(r.rsi14, 0))}
        ${stat("Cấu trúc", (typeof formatStructureBadge === "function" ? formatStructureBadge(r.structure) : `<span class="badge-soft ${structCls(r.structure)}">${esc(typeof formatStructure === "function" ? formatStructure(r.structure).label : (r.structure || "–"))}</span>`))}
        ${stat("% từ đỉnh 52 tuần", `<span class="${valueSignClass(r.pct_from_52w_high)}">${num(r.pct_from_52w_high, 1)}%</span>`)}
        ${stat("GTGD 20 phiên (tỷ)", num(r.gtgd20_ty, 1))}
        ${stat("KL tương đối", num(r.rel_vol, 2))}
        ${stat("P/E", num(r.pe, 1))}
        ${stat("P/B", num(r.pb, 2))}
        ${stat("ROE %", num(r.roe, 1))}
        ${stat("Room ngoại %", num(r.foreign_room_pct, 1))}
      </div>
      ${r.margin_status ? `<div class="mt-3"><span class="badge-margin">${esc(r.margin_status)}</span></div>` : ""}`;
  }

  function renderChart(r) {
    if (chartRenderedFor === r.ticker && chartInstance) return; // đã đúng biểu đồ rồi, khỏi vẽ lại
    const canvas = document.getElementById("cp-chart-canvas");
    if (!canvas || !window.Chart) return;
    // screener.html/signals.html KHÔNG load app.js nên Chart.defaults có thể chưa
    // từng được set — gọi ở đây để chart luôn đúng theme dù trang nào vẽ trước.
    if (typeof applyChartTheme === "function") applyChartTheme();
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    chartRenderedFor = r.ticker;

    const periods = [
      { label: "1 tháng", value: r.ret_1m },
      { label: "3 tháng", value: r.ret_3m },
      { label: "6 tháng", value: r.ret_6m },
      { label: "12 tháng", value: r.ret_12m },
    ];
    const values = periods.map((p) => (p.value === null || p.value === undefined || p.value === "" ? null : Number(p.value)));

    chartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels: periods.map((p) => p.label),
        datasets: [{
          data: values,
          backgroundColor: values.map((v) => (v === null ? CHART_COLORS.muted : v >= 0 ? CHART_COLORS.pos : CHART_COLORS.neg)),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y ?? "–"}%` } },
        },
        scales: { y: { ticks: { callback: (v) => v + "%" } } },
      },
    });
  }

  function financialsPlaceholder() {
    return `
      <div class="vs-empty" style="padding:2rem 1rem;">
        <i data-lucide="file-clock"></i>
        <div class="vs-empty-title">Báo cáo tài chính đang chờ dữ liệu</div>
        <div class="vs-empty-sub">Các chỉ số Tỷ số tài chính, Tăng trưởng, Khả năng sinh lời, Dòng tiền, Định giá
          sẽ hiển thị tại đây khi dữ liệu BCTC được công khai. Hiện dữ liệu này chỉ lưu cục bộ, chưa xuất bản
          lên trang web công khai.</div>
      </div>`;
  }

  function switchTab(tabName) {
    backdrop.querySelectorAll(".vs-panel-tab").forEach((t) => {
      const active = t.dataset.tab === tabName;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", String(active));
    });
    backdrop.querySelectorAll(".vs-panel-tab-content").forEach((c) => {
      c.classList.toggle("is-active", c.dataset.tabContent === tabName);
    });
  }

  function getFocusable() {
    return Array.from(backdrop.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null);
  }

  function buildPanelShell() {
    backdrop = document.createElement("div");
    backdrop.className = "vs-modal-backdrop";
    backdrop.innerHTML = `
      <div class="vs-modal" role="dialog" aria-modal="true" aria-labelledby="cp-title">
        <div class="vs-modal-header">
          <span class="vs-modal-title" id="cp-title"></span>
          <button type="button" class="vs-icon-btn" id="cp-close" aria-label="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="vs-panel-tabs" role="tablist">
          <button type="button" class="vs-panel-tab is-active" id="cp-tab-overview" data-tab="overview" role="tab" aria-selected="true" aria-controls="cp-panel-overview">Tổng quan</button>
          <button type="button" class="vs-panel-tab" id="cp-tab-chart" data-tab="chart" role="tab" aria-selected="false" aria-controls="cp-panel-chart">Biểu đồ</button>
          <button type="button" class="vs-panel-tab" id="cp-tab-financials" data-tab="financials" role="tab" aria-selected="false" aria-controls="cp-panel-financials">Báo cáo tài chính</button>
        </div>
        <div class="vs-modal-body">
          <div class="vs-panel-tab-content is-active" data-tab-content="overview" id="cp-panel-overview" role="tabpanel" aria-labelledby="cp-tab-overview">
            <div id="cp-overview"></div>
          </div>
          <div class="vs-panel-tab-content" data-tab-content="chart" id="cp-panel-chart" role="tabpanel" aria-labelledby="cp-tab-chart">
            <div class="chart-box" style="height:220px"><canvas id="cp-chart-canvas"></canvas></div>
          </div>
          <div class="vs-panel-tab-content" data-tab-content="financials" id="cp-panel-financials" role="tabpanel" aria-labelledby="cp-tab-financials"><div id="cp-financials-content">${financialsPlaceholder()}</div></div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    if (window.lucide) lucide.createIcons();

    backdrop.querySelectorAll(".vs-panel-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        switchTab(tab.dataset.tab);
        if (tab.dataset.tab === "chart") renderChart(backdrop._currentRow);
      });
    });

    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closePanel(); });
    backdrop.querySelector("#cp-close").addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (!backdrop.classList.contains("is-open")) return;
      if (e.key === "Escape") { closePanel(); return; }
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  // company-panel.js is shared with dashboard.html and signals.html — the ?ticker=
  // URL/history contract is a Screener-specific feature (Phase 5A), so every write
  // to history/location below is gated on this. Rendering, caching, and focus
  // restoration stay page-agnostic; only the URL/history side effects are scoped.
  function isScreenerPage() {
    return typeof document !== "undefined" && document.body && document.body.dataset.page === "screener";
  }
  function currentUrlTicker() {
    return typeof location === "undefined" ? null : tickerFromSearch(location.search);
  }
  function currentOpenTicker() {
    return backdrop && backdrop.classList.contains("is-open") && backdrop._currentRow
      ? normalizeTicker(backdrop._currentRow.ticker) : null;
  }
  function currentDepth() {
    return (typeof history !== "undefined" && history.state && history.state.vsDepth) || 0;
  }
  function urlForTicker(ticker) {
    return location.pathname + searchWithTicker(location.search, ticker) + location.hash;
  }
  function pushUrlForTicker(ticker) {
    const depth = currentDepth() + 1;
    history.pushState({ vsTicker: ticker, vsDepth: depth }, "", urlForTicker(ticker));
  }

  function openPanel(row) {
    const ticker = normalizeTicker(row && row.ticker);
    const action = decideOpenAction(currentUrlTicker(), currentOpenTicker(), ticker, historyPrimed);
    if (!action.render) return;
    if (!backdrop) buildPanelShell();
    const wasOpen = backdrop.classList.contains("is-open");
    if (!wasOpen) lastFocused = document.activeElement;
    backdrop._currentRow = row;
    document.getElementById("cp-title").textContent = row.ticker || "?";
    const overview = document.getElementById("cp-overview");
    const financialsContent = document.getElementById("cp-financials-content");
    const immediateEntry = bundleEntryForRow(row);
    overview.innerHTML = renderOverview(row) + renderHistoricalValuation(immediateEntry) + renderQualifiedResearchBrief(researchBriefForRow(row)) + renderQualifiedResearchDelta(researchDeltaForRow(row)) + renderEbitdaLineage(immediateEntry) + renderAnalysisReadiness(readinessForRow(row)) + renderCorporateIntelligence(corporateForRow(row)) + renderFinancialDistress(distressForRow(row), taxonomyForRow(row)) + renderCitedDocumentEvidence(evidenceForRow(row)) + renderQualifiedResearchSnapshotV2(qualifiedResearchSnapshotForRow(row), row);
    if (financialsContent) financialsContent.innerHTML = renderFinancialAnalysis(immediateEntry);
    // Legacy bundles render a neutral missing state immediately.  A cached dashboard
    // artifact, when present, replaces only this panel's Corporate Intelligence area.
    loadCorporateBundle().then((bundle) => {
      if (!backdrop || backdrop._currentRow !== row) return;
      const entry = bundleEntryForRow(row, bundle);
      overview.innerHTML = renderOverview(row) + renderHistoricalValuation(entry) + renderQualifiedResearchBrief(researchBriefForRow(row, bundle)) + renderQualifiedResearchDelta(researchDeltaForRow(row, bundle)) + renderEbitdaLineage(entry) + renderAnalysisReadiness(readinessForRow(row, bundle)) + renderCorporateIntelligence(corporateForRow(row, bundle)) + renderFinancialDistress(distressForRow(row, bundle), taxonomyForRow(row, bundle)) + renderCitedDocumentEvidence(evidenceForRow(row, bundle)) + renderQualifiedResearchSnapshotV2(qualifiedResearchSnapshotForRow(row, bundle), row);
      if (financialsContent) financialsContent.innerHTML = renderFinancialAnalysis(entry);
    });
    switchTab("overview");
    backdrop.classList.add("is-open");
    document.body.style.overflow = "hidden";
    backdrop.querySelector("#cp-close").focus();

    if (ticker) tickerRowCache.set(ticker, row);
    if (isScreenerPage()) {
      if (action.history === "bootstrap") {
        history.replaceState({ vsTicker: null, vsDepth: 0 }, "", urlForTicker(null));
        pushUrlForTicker(ticker);
        historyPrimed = true;
      } else if (action.history === "push") {
        pushUrlForTicker(ticker);
        historyPrimed = true;
      }
    }
  }

  // Hides the panel with no history side effect at all. This is the only thing
  // handlePopState may ever do to close — the browser has ALREADY finished
  // navigating by the time popstate fires, so reacting to it with another
  // history.go() (as closePanel() below does) would double-navigate. A stale or
  // foreign vsDepth on the landed-on entry (external history entry, corrupted
  // state) must never trigger a further jump — see the regression test.
  function hidePanelUI() {
    if (!backdrop || !backdrop.classList.contains("is-open")) return;
    backdrop.classList.remove("is-open");
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function" && document.contains(lastFocused)) lastFocused.focus();
    lastFocused = null;
  }

  // Public/explicit close (X button, Escape, backdrop click). Only this path is
  // allowed to navigate history, since only here do we know the URL still shows
  // the ticker we're actively dismissing.
  function closePanel() {
    if (!backdrop || !backdrop.classList.contains("is-open")) return;
    if (isScreenerPage()) {
      const action = decideCloseAction(currentDepth());
      if (action.history === "back") { history.go(-action.steps); return; }
    }
    hidePanelUI();
  }

  function handlePopState() {
    if (!isScreenerPage()) return;
    const ticker = currentUrlTicker();
    if (ticker === currentOpenTicker()) return;
    if (!ticker) { hidePanelUI(); return; }
    const row = tickerRowCache.get(ticker);
    if (row) openPanel(row); else hidePanelUI();
  }

  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
    if (!backdrop) buildPanelShell();
    document.addEventListener("click", (e) => {
      if (isScreenerPage()) return;
      const tr = e.target.closest("#tblScreen tbody tr");
      if (!tr || typeof jQuery === "undefined") return;
      const data = jQuery("#tblScreen").DataTable().row(tr).data();
      if (data) openPanel(data);
    });
  });

  // API dùng chung cho các bảng ngoài DataTables (ví dụ bảng mẫu hình nến ở signals.html).
  if (typeof window !== "undefined") {
    window.VSCompanyPanel = { open: openPanel, close: closePanel, normalizeTicker, tickerFromSearch };
    // Đồng bộ ?ticker= với Back/Forward — chỉ phản ứng khi tham số ticker thực sự
    // đổi (bỏ qua popstate do điều hướng hash-tab không liên quan, ví dụ signals.html).
    window.addEventListener("popstate", handlePopState);
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      renderCorporateIntelligence, renderAnalysisReadiness, renderHistoricalValuation, renderOverview, bundleEntryForRow, corporateForRow, readinessForRow, statusMessage,
      qualifiedResearchSnapshotForRow, snapshotRecordForTicker, renderQualifiedResearchSnapshotV2,
      normalizeTicker, tickerFromSearch, searchWithTicker, decideOpenAction, decideCloseAction,
      isScreenerPage,
      renderFundamentalQuality, renderNetNet, renderFcff, renderEbitdaLineage, renderQualifiedHistoricalResearch, renderFinancialAnalysis, financialAnalysisAvailable,
      renderFinancialDistress, renderStatementTaxonomy, distressForRow, taxonomyForRow,
      renderCitedDocumentEvidence, evidenceForRow,
      renderQualifiedResearchBrief, researchBriefForRow, renderQualifiedResearchDelta, researchDeltaForRow,
    };
  }
})();
