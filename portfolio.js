(() => {
  const pr = window.VSPortfolioResearch;
  const readModel = window.VSWorkspaceReadModel;
  const wb = window.VSInvestigationWorkbench;
  const key = pr.STORAGE_KEY;
  const $ = (id) => document.getElementById(id);
  const esc = pr.esc;
  const COLORS = ["#20e7cf", "#27e6a1", "#f0c45a", "#7dd3fc", "#a78bfa", "#f472b6", "#fb923c", "#38bdf8", "#4ade80"];

  const stored = pr.readStored();
  let model = stored.model;
  let allowPersist = stored.status !== "corrupt";
  let indexDoc = null;
  let indexPromise = null;
  let overview = null;
  let detailToken = 0;
  let compareToken = 0;
  const detailInflight = new Map();
  const loadedDetails = new Map();
  let compareTickers = readCompareTray();

  function storage() {
    try { return window.localStorage; } catch (err) { return null; }
  }

  function persist() {
    if (!allowPersist) return false;
    const result = pr.saveModel(storage(), model);
    const status = $("storage-status");
    if (!result.ok && status) {
      status.hidden = false;
      status.textContent = pr.issueMessage(result.reason);
    } else if (status && result.ok) status.hidden = true;
    return result.ok;
  }

  function readCompareTray() {
    try {
      const raw = sessionStorage.getItem(pr.COMPARE_TRAY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => ({
        ticker: pr.cleanTicker(item && item.ticker).ok ? pr.cleanTicker(item.ticker).value : "",
        owned: Boolean(item && item.owned),
      })).filter((item) => item.ticker).slice(0, 5);
    } catch (err) { return []; }
  }

  function writeCompareTray() {
    try { sessionStorage.setItem(pr.COMPARE_TRAY_KEY, JSON.stringify(compareTickers)); } catch (err) { /* tray stays in memory */ }
  }

  function setStatus(id, message, isError) {
    const el = $(id);
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.classList.toggle("text-danger", Boolean(isError));
  }

  function renderAllocation() {
    const body = $("allocation-body");
    if (!body) return;
    const positions = Array.isArray(model.positions) ? model.positions : [];
    const summary = pr.weightSummary(model);
    if (!positions.length) {
      body.innerHTML = '<div class="cockpit-note">Chưa có vị thế nào trong danh mục. Hãy thêm vị thế ở bảng trên.</div>';
      return;
    }
    if (summary.mode === "quantity_only") {
      body.innerHTML = `
        <div class="vs-alert vs-alert-warning mb-0">
          <b>Chưa có tỷ trọng định giá</b>
          <p class="mb-0 mt-1">Danh mục hiện chỉ lưu khối lượng (quantity-only). Việc tính toán tỷ trọng phân bổ chính xác đòi hỏi giá trị vốn hóa theo giá thị trường (mark-to-market) từ pipeline đánh giá của Producer hoặc phiên nghiên cứu hiện hành.</p>
        </div>`;
      return;
    }
    const cash = Number(model.cash) || 0;
    const widthBase = Math.max(100, summary.total_percent);
    body.innerHTML = `
      <div class="mb-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span class="cockpit-note">Tổng tỷ trọng cổ phiếu đã nhập: <b>${summary.total_percent.toFixed(1)}%</b>${summary.over_allocated ? ' <span class="badge-soft bs-red">Vượt 100%</span>' : ""}</span>
        ${cash > 0 ? `<span class="cockpit-note">Tiền mặt: <b>${cash.toLocaleString("vi-VN")} VND</b></span>` : ""}
      </div>
      ${summary.mode === "mixed" ? '<p class="cockpit-note">Các vị thế chỉ có khối lượng không được cộng vào thanh này. Không suy ra tỷ trọng vốn hóa khi chưa có cơ sở giá đủ điều kiện.</p>' : ""}
      ${summary.ambiguous_tickers.length ? `<p class="cockpit-note">Bỏ qua vì vừa có tỷ trọng vừa có khối lượng: ${esc(summary.ambiguous_tickers.join(", "))}.</p>` : ""}
      <div class="portfolio-weight-bar mb-3">
        ${summary.items.map((item, i) => {
          const widthPct = Math.min(100, Math.max(2, (item.weight_percent / widthBase) * 100));
          return `<div class="portfolio-weight-segment" style="width: ${widthPct}%; background: ${COLORS[i % COLORS.length]};" title="${esc(item.ticker)}: ${item.weight_percent.toFixed(1)}%">${esc(item.ticker)} ${item.weight_percent.toFixed(1)}%</div>`;
        }).join("")}
      </div>
      <div class="d-flex flex-wrap gap-2">
        ${summary.items.map((item, i) => `<div class="cockpit-chip d-flex align-items-center gap-1"><span style="width: 8px; height: 8px; border-radius: 50%; background: ${COLORS[i % COLORS.length]}; display: inline-block;"></span><b>${esc(item.ticker)}</b>: ${item.weight_percent.toFixed(1)}%</div>`).join("")}
      </div>`;
  }

  function basisText(position) {
    if (position.ambiguous) return "Vừa tỷ trọng vừa khối lượng";
    if (position.basis === "explicit_weight") return "Tỷ trọng người dùng nhập";
    if (position.basis === "quantity") return "Khối lượng";
    return "Thiếu số liệu";
  }

  function amountText(position) {
    if (position.basis === "explicit_weight" && position.explicit_weight != null) {
      const number = Number(position.explicit_weight);
      return number <= 1 ? `${(number * 100).toFixed(1)}%` : `${number}%`;
    }
    if (position.quantity != null) return Number(position.quantity).toLocaleString("vi-VN");
    return "—";
  }

  function renderPositions() {
    $("portfolio-id").value = model.portfolio_id || "";
    $("cash").value = model.cash == null ? "" : model.cash;
    if ($("review-note") && document.activeElement !== $("review-note")) $("review-note").value = model.review_note || "";
    const posList = Array.isArray(model.positions) ? model.positions : [];
    const countEl = $("pos-count");
    if (countEl) countEl.textContent = `${posList.length} vị thế`;
    $("positions").innerHTML = posList.map((position, i) => `<tr>
      <td><b class="font-monospace">${esc(position.ticker)}</b>${position.duplicate ? ' <span class="badge-soft bs-red">Trùng</span>' : ""}${position.note ? `<div class="cockpit-note pf-note">${esc(position.note)}</div>` : ""}</td>
      <td><span class="cockpit-note">${esc(basisText(position))}</span></td>
      <td><span class="fw-bold">${esc(amountText(position))}</span></td>
      <td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger" data-remove="${i}">Xóa</button></td>
    </tr>`).join("");
    renderAllocation();
  }

  function listHtml(items, empty) {
    if (!items || !items.length) return `<p class="cockpit-note">${esc(empty)}</p>`;
    return `<ul class="mb-0">${items.map((item) => `<li>${esc(item.label || item)}</li>`).join("")}</ul>`;
  }

  function renderOverview() {
    const root = $("portfolio-research");
    if (!root) return;
    overview = pr.buildOverview(model, indexDoc);
    if (!model.positions.length) {
      root.innerHTML = '<p class="cockpit-note">Thêm vị thế để xem bằng chứng đã công bố cho đúng các mã đó. Trang này chưa tải hồ sơ chi tiết.</p>';
      renderJournal();
      renderCompareTray();
      return;
    }
    if (!indexDoc) {
      if (indexPromise) {
        root.innerHTML = '<p class="cockpit-note" role="status">Đang đọc bản tóm tắt đã công bố…</p>';
        return;
      }
      root.innerHTML = `<div class="vs-alert vs-alert-warning" role="alert"><b>Chưa có bản nghiên cứu để đối chiếu.</b><p class="mb-2">${esc(overview.limitations[0] || "")}</p><button type="button" class="btn btn-sm btn-outline-light" id="pf-retry-index">Thử tải lại</button></div>`;
      const retry = $("pf-retry-index");
      if (retry) retry.onclick = () => { indexPromise = null; loadIndex(); };
      renderJournal();
      return;
    }
    const cards = overview.holdings.map((holding) => `<article class="pf-holding" data-holding="${esc(holding.ticker)}" data-posture="${esc(holding.posture_raw || "")}" data-coverage="${esc(holding.coverage)}">
      <header class="pf-holding-head">
        <h3 class="h5 mb-0 font-monospace" id="pf-h-${esc(holding.ticker)}">${esc(holding.ticker)}</h3>
        <div class="pf-actions">
          <button type="button" class="btn btn-sm btn-outline-light" data-inspect="${esc(holding.ticker)}">Xem bằng chứng</button>
          <a class="btn btn-sm btn-outline-light" href="${esc(holding.dossier_href)}">Mở hồ sơ</a>
          <label class="cockpit-note mb-0"><input type="checkbox" data-compare-toggle="${esc(holding.ticker)}" ${compareTickers.some((item) => item.ticker === holding.ticker) ? "checked" : ""}> So sánh</label>
        </div>
      </header>
      <p class="mb-1"><span class="cockpit-note">Người dùng nhập</span> ${esc(basisText(holding.user))} ${holding.user.basis === "explicit_weight" ? esc(`${holding.user.weight_percent.toFixed(1)}%`) : holding.user.quantity != null ? esc(Number(holding.user.quantity).toLocaleString("vi-VN")) : ""}</p>
      <div class="pf-grid">
        <p><span class="cockpit-note">Tư thế đã công bố</span><br><b>${esc(holding.posture_label)}</b></p>
        <p><span class="cockpit-note">Kỹ thuật</span><br>${esc(holding.entry_state_label || "—")}</p>
        <p><span class="cockpit-note">Hành động vào lệnh đã công bố</span><br>${esc(holding.entry_action_label || "—")}</p>
        <p><span class="cockpit-note">Độ mới bằng chứng</span><br>${esc(holding.evidence_currency_label || "—")}</p>
        <p><span class="cockpit-note">Bằng chứng kinh doanh</span><br>${esc(holding.business.state_label || "—")}${holding.business.interpretation === "missing" ? " — thiếu dữ liệu, không kết luận yếu hay mạnh" : ""}${holding.business.interpretation === "not_applicable" ? " — không áp dụng" : ""}</p>
        <p><span class="cockpit-note">Định giá</span><br>${esc(holding.valuation.state_label || "—")}${holding.valuation.qualified ? "" : " — chưa đủ điều kiện"}</p>
      </div>
      <p class="cockpit-note mb-1">Bất lợi đã công bố</p>
      ${listHtml(holding.adverse, "Bản tóm tắt không ghi điều kiện bất lợi riêng.")}
      <p class="cockpit-note mb-1">Điểm ủng hộ theo mã đã công bố</p>
      ${listHtml(holding.positive, "Bản tóm tắt không ghi mã ủng hộ.")}
      <p class="mb-1"><span class="cockpit-note">Xác nhận / vô hiệu</span> ${esc(holding.confirmation.status_label || "—")} · trigger ${esc(holding.confirmation.trigger_state_raw || "—")} · mức tham chiếu đã chạm: ${holding.confirmation.reference_satisfied ? "có" : "không"} · không diễn giải là đã kích hoạt: ${holding.confirmation.treated_as_fired ? "đã có cờ kích hoạt" : "đúng, chưa có cờ kích hoạt"}</p>
      ${holding.entity_class === "bank" ? '<p class="cockpit-note">Loại hình đã công bố là ngân hàng. Thước đo doanh nghiệp không được dùng để kết luận ngân hàng yếu.</p>' : ""}
      ${holding.missing.map((item) => `<p class="cockpit-note mb-1">${esc(item)}</p>`).join("")}
    </article>`).join("");
    const triage = overview.triage.map((group) => `<li><b>${esc(group.label)}</b> — ${esc(group.tickers.join(", "))}</li>`).join("");
    const shared = overview.shared.groups.length
      ? `<ul>${overview.shared.groups.map((group) => `<li data-shared-kind="${esc(group.kind)}" data-shared-code="${esc(group.raw)}"><b>${esc(group.label)}</b> · ${esc(group.tickers.join(", "))}${group.user_weight_percent == null ? " · không có tổng tỷ trọng vốn hóa" : ` · tổng tỷ trọng người dùng nhập ${esc(String(group.user_weight_percent))}%`}</li>`).join("")}</ul>`
      : '<p class="cockpit-note">Chưa có mã nghiên cứu nào lặp lại giữa các vị thế.</p>';
    root.innerHTML = `
      <p class="cockpit-note">Phiên đã công bố ${esc(overview.session || "—")}. Dữ liệu vị thế là của trình duyệt này. Tư thế không đổi theo việc bạn đang nắm giữ.</p>
      ${overview.limitations.map((item) => `<p class="cockpit-note">${esc(item)}</p>`).join("")}
      <div class="pf-columns">
        <section aria-labelledby="pf-holdings-heading"><h3 id="pf-holdings-heading" class="h6">Từng mã</h3>${cards}</section>
        <div>
          <section aria-labelledby="pf-triage-heading"><h3 id="pf-triage-heading" class="h6">Nhóm cần xem tiếp</h3><ul>${triage || "<li>Chưa có nhóm.</li>"}</ul></section>
          <section aria-labelledby="pf-shared-heading"><h3 id="pf-shared-heading" class="h6">Mã nghiên cứu gặp lại</h3><p class="cockpit-note">${esc(overview.shared.industry_statement)}</p>${shared}</section>
        </div>
      </div>`;
    root.querySelectorAll("[data-inspect]").forEach((button) => {
      button.addEventListener("click", () => inspect(button.getAttribute("data-inspect")));
    });
    root.querySelectorAll("[data-compare-toggle]").forEach((input) => {
      input.addEventListener("change", () => toggleCompare(input.getAttribute("data-compare-toggle"), true, input.checked));
    });
    renderJournal();
    renderCompareTray();
  }

  function renderJournal() {
    const root = $("pf-journal");
    if (!root || !wb) return;
    const loaded = wb.loadJournal(storage());
    const questions = pr.journalQuestions(loaded.journal, model.positions.map((position) => position.ticker));
    const status = loaded.status === "corrupt" ? '<p class="vs-alert vs-alert-warning">Sổ nghiên cứu trên trình duyệt bị hỏng. Mở sổ để xóa dữ liệu hỏng. Danh mục không bị đổi.</p>' : "";
    root.innerHTML = `${status}<ul class="mb-2">${questions.length ? questions.map((question) => `<li>${esc(question.tickers.join(", "))}: ${esc(question.text)} <span class="cockpit-note">(${esc(question.status)}, người dùng)</span></li>`).join("") : "<li class=\"cockpit-note\">Chưa có câu hỏi nào trong sổ cho các mã này.</li>"}</ul>
      <a href="investment-workspace.html?view=journal">Mở sổ nghiên cứu</a>`;
  }

  function renderCompareTray() {
    const root = $("pf-compare-tray");
    if (!root) return;
    root.innerHTML = compareTickers.length
      ? compareTickers.map((item) => `<span class="cockpit-chip">${esc(item.ticker)} <span class="cockpit-note">${item.owned ? "đang có trong danh mục" : "mã đối chiếu, không phải sở hữu"}</span> <button type="button" data-tray-remove="${esc(item.ticker)}" aria-label="Bỏ ${esc(item.ticker)} khỏi danh sách so sánh">×</button></span>`).join("")
      : '<span class="cockpit-note">Chưa chọn mã so sánh.</span>';
    root.querySelectorAll("[data-tray-remove]").forEach((button) => {
      button.addEventListener("click", () => toggleCompare(button.getAttribute("data-tray-remove"), false, false));
    });
    const link = $("pf-compare-link");
    if (link) {
      if (compareTickers.length >= 2 && indexDoc) {
        link.href = `investment-workspace.html?view=compare&tickers=${encodeURIComponent(compareTickers.map((item) => item.ticker).join(","))}&session=${encodeURIComponent(indexDoc.as_of_session || "")}`;
        link.hidden = false;
      } else link.hidden = true;
    }
  }

  function toggleCompare(ticker, owned, selected) {
    const clean = pr.cleanTicker(ticker);
    if (!clean.ok) return;
    compareTickers = compareTickers.filter((item) => item.ticker !== clean.value);
    if (selected) {
      if (compareTickers.length >= 5) {
        setStatus("pf-compare-status", "Chỉ chọn từ 2 đến 5 mã.", true);
        renderOverview();
        return;
      }
      compareTickers.push({ ticker: clean.value, owned });
    }
    writeCompareTray();
    setStatus("pf-compare-status", "", false);
    renderCompareTray();
    const box = document.querySelector(`[data-compare-toggle="${clean.value}"]`);
    if (box) box.checked = selected;
  }

  function paintDetail(ticker, dossier, partial, error) {
    const root = $("pf-detail");
    if (!root) return;
    const facts = dossier ? pr.detailFacts(dossier) : null;
    const fired = facts && facts.confirmation_fired === "PRODUCER_REPORTED_TRIGGERED";
    root.innerHTML = `<h3 id="pf-detail-heading" class="h6" tabindex="-1">Bằng chứng chi tiết ${esc(ticker)}</h3>
      ${error ? `<div class="vs-alert vs-alert-warning" role="alert">${esc(error)} <button type="button" class="btn btn-sm btn-outline-light" id="pf-detail-retry">Thử lại</button></div>` : ""}
      ${partial ? '<p class="cockpit-note">Chỉ có bản tóm tắt. Một số mục chi tiết được đánh dấu thiếu.</p>' : ""}
      ${facts ? `<p>Loại hình chi tiết: ${esc(facts.entity_class || "—")}${facts.is_bank ? ". Ngân hàng — các mục không áp dụng không bị tính là điểm yếu." : ""}</p>
        <p>Không áp dụng: ${esc(String(facts.not_applicable_count))} mục. Khoảng trống đã công bố: ${esc(String(facts.gap_count))}.</p>
        <p class="cockpit-note">Ủng hộ trong hồ sơ</p>${listHtml(facts.support, "Chưa có.")}
        <p class="cockpit-note">Phản biện trong hồ sơ</p>${listHtml(facts.counter, "Chưa có.")}
        <p class="cockpit-note">Chưa có hoặc bị chặn về kinh doanh</p>${listHtml(facts.unavailable_business, "Không có mục nào trong phần đã tải.")}
        <p class="cockpit-note">Định giá chưa dùng được</p>${listHtml(facts.unavailable_valuation, "Không có phương pháp bị chặn trong phần đã tải.")}
        <p>Xác nhận trong hồ sơ: ${fired ? "nguồn ghi đã kích hoạt" : "chưa ghi là đã kích hoạt"}.</p>` : ""}
      <form id="pf-question-form" class="row g-2 align-items-end">
        <div class="col-md-8"><label class="form-label" for="pf-question">Câu hỏi của bạn cho ${esc(ticker)}</label><input id="pf-question" class="form-control form-control-sm" maxlength="500"></div>
        <div class="col-md-4"><button class="btn btn-sm btn-outline-light" type="submit">Ghi vào sổ nghiên cứu</button></div>
      </form>
      <p id="pf-question-status" class="cockpit-note" role="status"></p>
      <p><a href="investment-workspace.html?view=dossier&amp;ticker=${encodeURIComponent(ticker)}">Mở hồ sơ đầy đủ của ${esc(ticker)}</a></p>`;
    const heading = $("pf-detail-heading");
    if (heading) heading.focus();
    const retry = $("pf-detail-retry");
    if (retry) retry.onclick = () => { detailInflight.delete(ticker); inspect(ticker); };
    const form = $("pf-question-form");
    if (form) form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveQuestion(ticker);
    });
  }

  function saveQuestion(ticker) {
    const input = $("pf-question");
    const text = input ? input.value : "";
    if (!wb || !indexDoc) return;
    const loaded = wb.loadJournal(storage());
    if (loaded.status === "corrupt") {
      setStatus("pf-question-status", "Sổ đang hỏng nên chưa ghi câu hỏi.", true);
      return;
    }
    const upserted = wb.upsertEntry(loaded.journal, "dossier", [ticker], indexDoc.as_of_session);
    if (!upserted.entry) {
      setStatus("pf-question-status", "Chưa ghi được câu hỏi vào sổ.", true);
      return;
    }
    const question = wb.addQuestion(upserted.entry, text, "user");
    if (!question) {
      setStatus("pf-question-status", "Câu hỏi trống, quá dài hoặc đã có trong sổ.", true);
      return;
    }
    const saved = wb.saveJournal(storage(), loaded.journal);
    setStatus("pf-question-status", saved ? "Đã ghi câu hỏi trên trình duyệt này." : pr.issueMessage("QUOTA_OR_UNAVAILABLE"), !saved);
    if (input && saved) input.value = "";
    renderJournal();
  }

  function inspect(ticker) {
    const token = ++detailToken;
    const root = $("pf-detail");
    if (root) root.innerHTML = `<p class="cockpit-note" role="status">Đang tải bằng chứng chi tiết cho ${esc(ticker)}…</p>`;
    if (!indexDoc || !indexDoc.cards || !indexDoc.cards[ticker]) {
      paintDetail(ticker, null, true, "Mã này không có trong bản nghiên cứu đã công bố.");
      return;
    }
    if (loadedDetails.has(ticker)) {
      paintDetail(ticker, loadedDetails.get(ticker), false, "");
      return;
    }
    let pending = detailInflight.get(ticker);
    if (!pending) {
      pending = readModel.getTickerDetail(ticker, indexDoc).then((result) => {
        if (!result || result.status !== "ok") detailInflight.delete(ticker);
        return result;
      });
      detailInflight.set(ticker, pending);
    }
    pending.then((result) => {
      if (token !== detailToken) return;
      if (result && result.status === "ok") {
        loadedDetails.set(ticker, pr.openDetail(result.card, indexDoc));
        paintDetail(ticker, loadedDetails.get(ticker), false, "");
        return;
      }
      const thin = pr.openDetail(indexDoc.cards[ticker], indexDoc);
      paintDetail(ticker, thin, true, "Chưa tải được hồ sơ chi tiết. Bản tóm tắt vẫn hiển thị.");
    });
  }

  async function runCompare() {
    const token = ++compareToken;
    const out = $("pf-compare-result");
    if (!out) return;
    if (!indexDoc) {
      out.innerHTML = '<div class="vs-alert vs-alert-warning" role="alert">Chưa có bản nghiên cứu để so sánh.</div>';
      return;
    }
    const prepared = pr.comparisonFromDetails(compareTickers.map((item) => ({ ticker: item.ticker, thin: indexDoc.cards[item.ticker], detail: null })), indexDoc);
    if (!prepared.ok && prepared.validation) {
      out.innerHTML = wb.refusalHtml(prepared.validation);
      return;
    }
    out.innerHTML = `<p class="cockpit-note" role="status">Đang tải chi tiết để so sánh ${esc(prepared.validation.tickers.join(", "))}…</p>`;
    const entries = await Promise.all(prepared.validation.tickers.map(async (ticker) => {
      let pending = detailInflight.get(ticker);
      if (!pending) {
        pending = readModel.getTickerDetail(ticker, indexDoc).then((result) => {
          if (!result || result.status !== "ok") detailInflight.delete(ticker);
          return result;
        });
        detailInflight.set(ticker, pending);
      }
      const result = await pending;
      return { ticker, thin: indexDoc.cards[ticker], detail: result && result.status === "ok" ? result.card : null };
    }));
    if (token !== compareToken) return;
    const comparison = pr.comparisonFromDetails(entries, indexDoc);
    if (!comparison.ok) {
      out.innerHTML = wb.refusalHtml(comparison.validation || { errors: [] });
      return;
    }
    out.innerHTML = wb.comparisonHtml(comparison.comparison, { saved: false });
    if (comparison.refused_incompatible.length) {
      out.insertAdjacentHTML("afterbegin", `<p class="cockpit-note" data-incompatible-count="${comparison.refused_incompatible.length}">${comparison.refused_incompatible.length} chỉ tiêu bị từ chối vì khác loại hình, kỳ, phạm vi, cơ sở cổ phiếu hoặc phương pháp. Đây không phải một điểm rủi ro danh mục.</p>`);
    }
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 0);
  }

  function currentReview() {
    const loaded = wb ? wb.loadJournal(storage()) : { journal: { entries: [] } };
    return pr.buildReview(model, overview || pr.buildOverview(model, indexDoc), loaded.journal);
  }

  function loadIndex() {
    if (!model.positions.length) {
      renderOverview();
      return;
    }
    if (!indexPromise) indexPromise = readModel.loadIndex().then((doc) => {
      indexDoc = doc;
      return doc;
    }).catch(() => {
      indexDoc = null;
      indexPromise = null;
      return null;
    });
    const root = $("portfolio-research");
    if (root && !indexDoc) root.innerHTML = '<p class="cockpit-note" role="status">Đang đọc bản tóm tắt đã công bố…</p>';
    indexPromise.then(() => renderOverview());
  }

  function afterModelChange() {
    allowPersist = true;
    renderPositions();
    persist();
    if (model.positions.length && !indexDoc) loadIndex();
    else renderOverview();
  }

  $("portfolio-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const identity = pr.updateIdentity(model, $("portfolio-id").value, $("cash").value === "" ? 0 : $("cash").value);
    if (!identity.ok) {
      setStatus("form-status", identity.message, true);
      return;
    }
    model = identity.model;
    const added = pr.addPosition(model, {
      ticker: $("ticker").value,
      amount: $("amount").value,
      basis: $("basis").value,
      note: $("position-note") ? $("position-note").value : "",
    });
    if (!added.ok) {
      setStatus("form-status", added.message || pr.issueMessage(added.reason), true);
      return;
    }
    model = added.model;
    $("ticker").value = "";
    $("amount").value = "";
    if ($("position-note")) $("position-note").value = "";
    setStatus("form-status", "Đã thêm trên trình duyệt này.", false);
    afterModelChange();
  });

  $("positions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    model = pr.removePosition(model, Number(button.dataset.remove));
    afterModelChange();
  });

  $("save").onclick = () => {
    if (!allowPersist) {
      const status = $("save-status");
      if (status) {
        status.style.display = "block";
        status.textContent = `${pr.issueMessage("CORRUPT")} Bản hỏng chưa bị xóa.`;
      }
      return;
    }
    const identity = pr.updateIdentity(model, $("portfolio-id").value, $("cash").value === "" ? 0 : $("cash").value);
    if (!identity.ok) {
      setStatus("form-status", identity.message, true);
      return;
    }
    model = identity.model;
    const note = pr.updateReviewNote(model, $("review-note") ? $("review-note").value : "");
    if (!note.ok) {
      setStatus("form-status", note.message || pr.issueMessage(note.reason), true);
      return;
    }
    model = note.model;
    renderPositions();
    const ok = persist();
    const status = $("save-status");
    if (status) {
      status.style.display = "block";
      status.textContent = ok ? "Đã lưu trên trình duyệt" : pr.issueMessage("QUOTA_OR_UNAVAILABLE");
      setTimeout(() => { status.style.display = "none"; }, 3000);
    }
    renderOverview();
  };

  $("export").onclick = () => {
    const identity = pr.updateIdentity(model, $("portfolio-id").value, $("cash").value === "" ? 0 : $("cash").value);
    if (identity.ok) model = identity.model;
    download(`portfolio-${model.portfolio_id || "local"}.json`, JSON.stringify(pr.exportDocument(model), null, 2), "application/json");
  };

  $("import").onchange = (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > pr.MAX_IMPORT_BYTES) {
      setStatus("import-status", pr.issueMessage("TOO_LARGE"), true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const imported = pr.importPortfolioText(String(reader.result || ""), model);
      if (!imported.ok) {
        setStatus("import-status", imported.message, true);
        return;
      }
      model = imported.model;
      setStatus("import-status", imported.message, false);
      afterModelChange();
    };
    reader.onerror = () => setStatus("import-status", pr.issueMessage("NOT_JSON"), true);
    reader.readAsText(file);
  };

  $("clear").onclick = () => {
    if (!confirm("Bạn có chắc chắn muốn đặt lại danh mục về trống?")) return;
    model = pr.emptyModel();
    try { storage().removeItem(key); } catch (err) { /* already unavailable */ }
    setStatus("form-status", "", false);
    renderPositions();
    renderOverview();
  };

  $("pf-add-alternative").onclick = () => {
    toggleCompare($("pf-alternative").value, false, true);
    $("pf-alternative").value = "";
  };
  $("pf-run-compare").onclick = () => runCompare();
  $("pf-review-json").onclick = () => download("portfolio-research-review.json", JSON.stringify(pr.buildReview(model, overview || pr.buildOverview(model, indexDoc), wb.loadJournal(storage()).journal), null, 2), "application/json");
  $("pf-review-html").onclick = () => download("portfolio-research-review.html", pr.reviewHtml(currentReview()), "text/html");
  $("pf-review-print").onclick = () => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.srcdoc = pr.reviewHtml(currentReview());
    frame.onload = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (err) { /* print unavailable */ }
      setTimeout(() => frame.remove(), 1000);
    };
    document.body.appendChild(frame);
  };
  if ($("review-note")) {
    $("review-note").addEventListener("change", () => {
      const note = pr.updateReviewNote(model, $("review-note").value);
      if (!note.ok) {
        setStatus("form-status", note.message || pr.issueMessage(note.reason), true);
        return;
      }
      model = note.model;
      persist();
    });
  }
  $("pf-recover-storage").onclick = () => {
    if (stored.status !== "corrupt") return;
    if (!confirm("Xóa bản danh mục hỏng trên trình duyệt này?")) return;
    try { storage().removeItem(key); } catch (err) { /* ignore */ }
    allowPersist = true;
    $("pf-storage-alert").hidden = true;
    $("pf-recover-storage").hidden = true;
  };

  if (stored.status === "corrupt") {
    const alert = $("pf-storage-alert");
    if (alert) {
      alert.hidden = false;
      alert.textContent = `${pr.issueMessage("CORRUPT")} Bản hỏng chưa bị xóa.`;
    }
    $("pf-recover-storage").hidden = false;
  } else if (stored.status === "unavailable") {
    setStatus("storage-status", pr.issueMessage("STORAGE_UNAVAILABLE"), true);
  }

  renderPositions();
  renderCompareTray();
  loadIndex();
  document.documentElement.dataset.portfolioReady = "1";
  window.addEventListener("pagehide", () => {
    const identity = pr.updateIdentity(model, $("portfolio-id").value, $("cash").value === "" ? 0 : $("cash").value);
    if (identity.ok) model = identity.model;
    const note = pr.updateReviewNote(model, $("review-note") ? $("review-note").value : model.review_note);
    if (note.ok) model = note.model;
    persist();
  });
})();
