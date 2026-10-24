"use strict";
// INVESTOR_EVIDENCE_INVESTIGATION_WORKBENCH_V1: dossier, comparison, journal, export and history
// contracts, exercised against the committed published data (every ticker) rather than fixtures.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const wb = require("../assets/js/investigation-workbench.js");
const ws = require("../assets/js/investment-workspace.js");

const index = JSON.parse(read("data/workspace_index.json"));
const shards = {};
function detail(ticker) {
  const key = index.cards[ticker].detail_shard;
  if (!shards[key]) shards[key] = JSON.parse(read(`data/workspace_detail/${key}.json`));
  return shards[key].tickers[ticker];
}
const ctx = (t) => ({ ticker: t, session: index.as_of_session, sourceArtifactIdentity: index.source_artifact_identity });
const SCENARIO = ["HPG", "FPT", "PNJ", "NVL", "VNM", "QNS", "TCB", "VCB", "TPB"];

// Visible text only: drops tags, attribute values, and the collapsed technical-identity blocks.
function visibleText(html) {
  const withoutTech = html.replace(/<details class="wb-tech">[\s\S]*?<\/details>/g, "").replace(/<dd class="wb-mono">[\s\S]*?<\/dd>/g, "");
  return withoutTech.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
}
function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

test("scenario tickers are present in the published data", () => {
  for (const t of SCENARIO) assert.ok(index.cards[t], t);
});

test("every published ticker builds a dossier whose posture is the Producer's verbatim value and the card is not mutated", () => {
  for (const t of Object.keys(index.cards)) {
    const card = detail(t);
    const before = JSON.stringify(card);
    const m = wb.buildDossier(card, ctx(t));
    assert.equal(m.posture.raw, card.research_action_posture, t);
    assert.equal(m.ticker, t);
    assert.equal(JSON.stringify(card), before, `${t} card mutated`);
    assert.equal(m.authority.isActionable, false);
  }
});

test("real postures stay specific: NVL avoid, TPB hold-do-not-add, never collapsed into a generic wait", () => {
  const nvl = wb.buildDossier(detail("NVL"), ctx("NVL"));
  assert.equal(nvl.posture.raw, "AVOID");
  assert.ok(nvl.adverse.some((a) => a.raw === "AVOID"), "NVL avoid must be listed as an adverse condition");
  const tpb = wb.buildDossier(detail("TPB"), ctx("TPB"));
  assert.equal(tpb.posture.raw, "HOLD_DO_NOT_ADD");
  assert.match(wb.dossierHtml(tpb), /data-action-posture="HOLD_DO_NOT_ADD"/);
  assert.doesNotMatch(wb.dossierHtml(tpb), /data-action-posture="WAIT_FOR_CONFIRMATION"/);
});

test("adverse conditions are always in the compact overview, before any collapsed section", () => {
  for (const t of Object.keys(index.cards)) {
    const card = detail(t);
    if (!["AVOID", "REDUCE"].includes(card.research_action_posture)) continue;
    const html = wb.dossierHtml(wb.buildDossier(card, ctx(t)));
    const adverseAt = html.indexOf('class="wb-adverse"');
    assert.ok(adverseAt > 0, `${t} has no adverse block`);
    assert.ok(adverseAt < html.indexOf("<details"), `${t} adverse block is inside a collapsed section`);
  }
});

test("a future condition is never shown as fired; only a Producer-reported trigger state is", () => {
  for (const t of Object.keys(index.cards)) {
    const card = detail(t);
    const m = wb.buildDossier(card, ctx(t));
    const conf = m.conditions.confirmation[0];
    if (card.confirmation && card.confirmation.confirmation_trigger_state !== "TRIGGERED") {
      assert.notEqual(conf.fired, "PRODUCER_REPORTED_TRIGGERED", t);
    }
    if (conf.isFuture && conf.available) {
      const html = wb.dossierHtml(m);
      const block = html.slice(html.indexOf('data-condition-role="confirmation"'), html.indexOf('data-condition-role="reference"') > 0 ? html.indexOf('data-condition-role="reference"') : undefined);
      assert.doesNotMatch(block, /data-fired="producer-reported"/, t);
    }
    if (m.conditions.reference) {
      assert.equal(m.conditions.reference.satisfied, card.reference_trigger.trigger_condition_satisfied === true, t);
      assert.equal(m.conditions.reference.entryAuthority, card.reference_trigger.entry_authority === true, t);
    }
  }
});

test("technical evidence is never grouped as business evidence, and a technical setup is shown even without financial evidence", () => {
  let checkedMissingFinancials = 0;
  for (const t of Object.keys(index.cards)) {
    const card = detail(t);
    const m = wb.buildDossier(card, ctx(t));
    const items = m.evidence.support.concat(m.evidence.counter, m.evidence.neutral);
    for (const it of items) {
      if (it.raw && /TACTICAL|TECHNICAL|BREAKOUT|BREAKDOWN|PRICE_VOLUME/.test(it.raw) && !/^FA_V2/.test(it.raw)) assert.equal(it.dimension, "technical", `${t} ${it.raw}`);
    }
    if (card.entry_state && card.fundamental && card.fundamental.state === "INSUFFICIENT_DATA") {
      const html = wb.dossierHtml(m);
      assert.match(html, new RegExp(`data-state="${card.entry_state}"`), t);
      assert.match(html, /Thiết lập kỹ thuật vẫn được hiển thị đầy đủ dù dữ liệu tài chính thiếu/);
      checkedMissingFinancials++;
    }
  }
  assert.ok(checkedMissingFinancials > 100);
});

test("no bare Producer codes or backend vocabulary in visible dossier text", () => {
  const forbidden = /\b(?:localStorage|READY_FOR_AI|RAW_AS_TRADED|snapshot|proxy|Workspace|build|pipeline|artifact)\b/;
  for (const t of Object.keys(index.cards)) {
    const html = wb.dossierHtml(wb.buildDossier(detail(t), ctx(t)));
    const text = visibleText(html);
    const codes = text.match(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/g);
    assert.equal(codes, null, `${t}: ${codes && codes.slice(0, 5)}`);
    assert.doesNotMatch(text, forbidden, t);
    assert.doesNotMatch(text, /chưa có nhãn tiếng Việt/, t);
  }
});

test("verification questions are derived mechanically, one per published gap, with stable ids", () => {
  for (const t of SCENARIO) {
    const a = wb.buildDossier(detail(t), ctx(t));
    const b = wb.buildDossier(detail(t), ctx(t));
    assert.equal(a.questions.length, a.gaps.length);
    assert.deepEqual(a.questions.map((q) => q.id), b.questions.map((q) => q.id));
    assert.equal(new Set(a.questions.map((q) => q.id)).size, a.questions.length, `${t} duplicate question id`);
    a.gaps.forEach((g) => {
      assert.ok(g.question.text.includes(t), `${t} question names the ticker`);
      assert.ok(g.question.text.includes(g.label) || g.kind === "LIMITATION", `${t} question restates its gap`);
      assert.ok(["MISSING", "STALE", "BLOCKED", "INCOMPATIBLE", "LIMITATION"].includes(g.kind));
    });
  }
  // Stale fundamentals surface as a stale gap with their source period.
  const hpg = wb.buildDossier(detail("HPG"), ctx("HPG"));
  assert.ok(hpg.gaps.some((g) => g.kind === "STALE" && g.axis === "fundamental" && g.source === "2026-Q1"));
});

test("financial facts keep their period, and cited inputs carry citation and knowledge time", () => {
  const hpg = wb.buildDossier(detail("HPG"), ctx("HPG"));
  assert.equal(hpg.fundamentals.period, "2026-Q1");
  hpg.fundamentals.establishes.filter((e) => e.kind === "RESEARCH_ONLY").forEach((e) => assert.ok(e.period, e.label));
  const qns = wb.buildDossier(detail("QNS"), ctx("QNS"));
  const cited = qns.valuation.establishes.filter((e) => e.citation);
  if (cited.length) {
    cited.forEach((e) => {
      assert.match(e.citation.citationId, /^[0-9a-f]{64}$/);
      assert.ok(e.citation.knowledgeAvailableAt);
      assert.ok(e.citation.reportingPeriod);
    });
    assert.match(wb.dossierHtml(qns), /Mức đảm bảo \(kiểm toán\/soát xét\): chưa được công bố trong dữ liệu/);
  }
});

test("bank dossiers say bank economics differ and do not present non-bank fundamentals as missing", () => {
  const tcb = wb.buildDossier(detail("TCB"), ctx("TCB"));
  assert.equal(tcb.fundamentals.isBank, true);
  assert.ok(tcb.fundamentals.notApplicableCount > 0);
  assert.ok(!tcb.fundamentals.unavailable.some((u) => /gross_margin$|net_margin$/.test(u.raw)), "non-bank margins must not appear as bank gaps");
  assert.match(wb.dossierHtml(tcb), /Ngân hàng dùng thước đo riêng/);
});

test("comparison refuses invalid requests with explicit reasons", () => {
  const v = (list, session) => wb.validateComparisonRequest(list, index, session);
  assert.deepEqual(v("HPG").errors.map((e) => e.code), ["TOO_FEW"]);
  assert.ok(v("HPG,FPT,PNJ,NVL,VNM,QNS").errors.some((e) => e.code === "TOO_MANY"));
  assert.ok(v("HPG,hpg").errors.some((e) => e.code === "DUPLICATE"));
  assert.ok(v("HPG,ZZZZ").errors.some((e) => e.code === "UNKNOWN_TICKER"));
  assert.ok(v("HPG,<script>").errors.some((e) => e.code === "INVALID_TICKER"));
  assert.ok(v("HPG,FPT", "2026-01-02").errors.some((e) => e.code === "SESSION_MISMATCH"));
  assert.equal(v("HPG,FPT", index.as_of_session).ok, true);
  const html = wb.refusalHtml(v("HPG,<img src=x onerror=alert(1)>"));
  assert.doesNotMatch(html, /<img/);
});

function comparison(list) {
  const entries = list.map((t) => ({ ticker: t, thin: index.cards[t], detail: detail(t) }));
  return wb.buildComparison(entries, { session: index.as_of_session, indexDoc: index });
}

test("comparison computes no cross-security statistic, never ranks, and only shows Producer values side by side", () => {
  assert.deepEqual(wb.permittedCrossSecurityStatistics(index), []);
  const cmp = comparison(["HPG", "FPT"]);
  assert.deepEqual(cmp.tickers, ["HPG", "FPT"], "selection order preserved");
  assert.ok(cmp.comparable.length > 0);
  for (const row of cmp.comparable.concat(cmp.notComparable)) {
    for (const cell of row.cells) {
      if (cell.value === undefined) continue;
      const card = detail(cell.ticker);
      const source = row.kind === "valuation"
        ? card.valuation.method_diagnostics[row.id].value
        : card.why.financial_analysis.compact.feature_fitness[row.id].source_feature_context.value;
      assert.equal(cell.value, source, `${row.id} ${cell.ticker} must be the published value`);
    }
  }
  const html = wb.comparisonHtml(cmp);
  assert.doesNotMatch(html, /(trung bình|chênh lệch|xếp thứ|hạng \d|điểm số)\s*[:=]?\s*\d/i);
  assert.match(html, /Hợp đồng dữ liệu đã công bố không cho phép phép tính liên mã nào/);
});

test("bank versus non-bank and unknown statement scope are marked not comparable with reasons", () => {
  const mixed = comparison(["HPG", "TCB"]);
  assert.equal(mixed.bankMix, true);
  const pb = mixed.notComparable.find((r) => r.id === "P/B_CURRENT_RESEARCH");
  if (pb) assert.ok(pb.reasons.some((r) => r.code === "ENTITY_CLASS_DIFFERS" || r.code === "METHOD_BLOCKED"));
  assert.ok(!mixed.comparable.some((r) => r.cells.some((c) => c.entityClass === "bank") && r.cells.some((c) => c.entityClass === "corporate")));
  assert.match(wb.comparisonHtml(mixed), /Ngân hàng và doanh nghiệp phi ngân hàng/);
  const scope = comparison(["HPG", "PNJ"]);
  const eq = scope.notComparable.find((r) => r.id === "equity_to_assets");
  assert.ok(eq && eq.reasons.some((r) => r.code === "SCOPE_DIFFERS"), "PNJ statement scope is unknown and must not be compared");
});

test("journal uses its own storage key and never touches the portfolio editor key", () => {
  assert.equal(wb.JOURNAL_STORAGE_KEY, "stocklookup.investigation-journal.v1");
  assert.notEqual(wb.JOURNAL_STORAGE_KEY, ws.PORTFOLIO_STORAGE_KEY);
  const store = memoryStorage();
  store.setItem(ws.PORTFOLIO_STORAGE_KEY, '{"positions":[{"ticker":"HPG"}]}');
  const j = wb.emptyJournal();
  const { entry } = wb.upsertEntry(j, "dossier", ["HPG"], index.as_of_session);
  wb.setHypothesis(entry, "Kiểm tra biên an toàn");
  wb.addQuestion(entry, "Quý 3 có cải thiện không?", "user", null);
  assert.ok(wb.saveJournal(store, j));
  assert.equal(store.getItem(ws.PORTFOLIO_STORAGE_KEY), '{"positions":[{"ticker":"HPG"}]}');
  const loaded = wb.loadJournal(store);
  assert.equal(loaded.status, "ok");
  assert.equal(loaded.journal.entries[0].hypothesis, "Kiểm tra biên an toàn");
  const q = loaded.journal.entries[0].questions[0];
  wb.setQuestionStatus(loaded.journal.entries[0], q.id, "reviewed");
  assert.equal(loaded.journal.entries[0].questions[0].status, "reviewed");
  assert.ok(!JSON.stringify(loaded.journal).includes("positions"));
});

test("corrupt or foreign storage is reported, not silently overwritten", () => {
  const store = memoryStorage();
  store.setItem(wb.JOURNAL_STORAGE_KEY, "{not json");
  assert.equal(wb.loadJournal(store).status, "corrupt");
  assert.equal(store.getItem(wb.JOURNAL_STORAGE_KEY), "{not json");
  store.setItem(wb.JOURNAL_STORAGE_KEY, JSON.stringify({ schema_version: "something/else", entries: [] }));
  assert.equal(wb.loadJournal(store).status, "corrupt");
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(wb.loadJournal(throwing).status, "unavailable");
  assert.equal(wb.saveJournal(throwing, wb.emptyJournal()), false);
});

test("import sanitizes hostile files: bad schema, duplicates, markup, control text, stale tickers, holdings, future timestamps", () => {
  const base = wb.emptyJournal();
  const { entry } = wb.upsertEntry(base, "dossier", ["VNM"], index.as_of_session);
  wb.setHypothesis(entry, "Giả thuyết cục bộ");
  wb.addQuestion(entry, "Câu hỏi cục bộ", "user", null);
  const hostile = {
    schema_version: wb.JOURNAL_SCHEMA,
    positions: [{ ticker: "HPG", weight: 0.5 }],
    entries: [
      { id: "dossier:VNM", kind: "dossier", tickers: ["VNM"], updated_at: "2099-01-01T00:00:00Z", hypothesis: "Từ tệp ‮<script>alert(1)</script>\u0007", questions: [{ id: entry.questions[0].id, text: "Khác <b>x</b>", status: "reviewed" }, { text: "Câu hỏi cục bộ", status: "reviewed" }] },
      { id: "__proto__", kind: "dossier", tickers: ["ZZZ1"], hypothesis: "cũ" },
      { kind: "dossier", tickers: ["HPG"], questions: [{ text: "x".repeat(5000) }] },
      { kind: "dossier", tickers: ["HPG"], hypothesis: "trùng trong tệp" },
      { kind: "comparison", tickers: ["HPG"] },
      { kind: "dossier", tickers: ["bad ticker!"] },
      "rác", null,
    ],
  };
  const { journal, report } = wb.importJournal(base, JSON.stringify(hostile), { indexDoc: index });
  assert.equal(report.ok, true);
  assert.equal(report.invalid, 4);
  assert.equal(report.duplicatesInFile, 1);
  assert.deepEqual(report.staleTickers, ["ZZZ1"]);
  assert.equal(report.ignoredHoldings, true);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "kind"), false);
  const vnm = wb.findEntry(journal, "dossier:VNM");
  assert.match(vnm.hypothesis, /^Giả thuyết cục bộ\n\n\[Nhập từ tệp\] Từ tệp <script>alert\(1\)<\/script>$/, "local hypothesis kept, import appended, control/bidi characters stripped");
  assert.equal(vnm.questions.find((q) => q.text === "Câu hỏi cục bộ").status, "open", "local status is not overwritten by an import");
  assert.equal(new Set(vnm.questions.map((q) => q.id)).size, vnm.questions.length, "colliding ids are re-keyed");
  assert.ok(Date.parse(vnm.updated_at) < Date.parse("2099-01-01T00:00:00Z"));
  const hpg = wb.findEntry(journal, "dossier:HPG");
  assert.equal(hpg.questions[0].text.length, wb.LIMITS.item);
  assert.ok(!JSON.stringify(journal).includes("weight"));
  const html = wb.journalListHtml(journal, index, "ok");
  assert.doesNotMatch(html, /<script>|<b>x<\/b>/);
  assert.match(html, /Mã không còn trong dữ liệu hiện hành: ZZZ1/);
  for (const [text, code] of [["", "EMPTY_FILE"], ["{", "NOT_JSON"], [JSON.stringify({ schema_version: "x" }), "UNSUPPORTED_SCHEMA"], ["x".repeat(wb.LIMITS.importBytes + 1), "FILE_TOO_LARGE"]]) {
    const r = wb.importJournal(base, text, { indexDoc: index });
    assert.equal(r.report.error, code);
    assert.equal(r.journal.entries.length, 1, "a rejected import leaves the journal unchanged");
  }
});

test("journal export re-imports losslessly and idempotently", () => {
  const j = wb.emptyJournal();
  const a = wb.upsertEntry(j, "dossier", ["FPT"], index.as_of_session).entry;
  wb.setHypothesis(a, "Giả thuyết FPT");
  wb.addQuestion(a, "Câu hỏi 1", "user", null);
  wb.addCondition(a, "Đọc lại khi có báo cáo quý");
  wb.upsertEntry(j, "comparison", ["HPG", "FPT"], index.as_of_session);
  const exported = JSON.stringify(wb.exportJournal(j));
  const fresh = wb.importJournal(wb.emptyJournal(), exported, { indexDoc: index });
  assert.equal(fresh.report.added, 2);
  assert.deepEqual(fresh.journal.entries.map((e) => [e.id, e.hypothesis, e.questions.map((q) => q.text), e.conditions.map((c) => c.text)]), j.entries.map((e) => [e.id, e.hypothesis, e.questions.map((q) => q.text), e.conditions.map((c) => c.text)]));
  const again = wb.importJournal(fresh.journal, exported, { indexDoc: index });
  assert.equal(again.report.merged, 2);
  assert.equal(JSON.stringify(again.journal.entries.map((e) => [e.hypothesis, e.questions.length, e.conditions.length])), JSON.stringify(fresh.journal.entries.map((e) => [e.hypothesis, e.questions.length, e.conditions.length])));
});

test("dossier export is labelled research-only, separates user notes, and never claims Producer or audited authority", () => {
  const m = wb.buildDossier(detail("PNJ"), ctx("PNJ"));
  const j = wb.emptyJournal();
  const e = wb.upsertEntry(j, "dossier", ["PNJ"], index.as_of_session).entry;
  wb.setHypothesis(e, "<script>alert(1)</script> giả thuyết");
  const doc = wb.buildDossierExport({ dossiers: [m], indexDoc: index, journalEntries: [e] });
  assert.equal(doc.schema_version, wb.EXPORT_SCHEMA);
  assert.equal(doc.not_a_sealed_producer_packet, true);
  assert.equal(doc.not_a_qualified_financial_report, true);
  assert.equal(doc.dossiers[0].producer_state.research_action_posture, detail("PNJ").research_action_posture);
  assert.ok(doc.dossiers[0].evidence_against.length > 0);
  assert.equal(doc.user_notes.label, "Ghi chú của người dùng — không phải dữ liệu Producer");
  assert.equal(doc.user_notes.entries[0].hypothesis, "<script>alert(1)</script> giả thuyết");
  assert.ok(!JSON.stringify(doc.dossiers).includes("giả thuyết"), "user notes never mix into Producer sections");
  const html = wb.printableHtml(doc);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Chỉ phục vụ nghiên cứu/);
  assert.match(html, /Không phải gói dữ liệu niêm phong của Producer/);
  // Notes inside a dossier export can be re-imported into the journal.
  const back = wb.importJournal(wb.emptyJournal(), JSON.stringify(doc), { indexDoc: index });
  assert.equal(back.report.added, 1);
  const cmpDoc = wb.buildDossierExport({ dossiers: [], comparison: comparison(["HPG", "FPT"]), indexDoc: index });
  assert.equal(cmpDoc.comparison.ranking, "NOT_PRODUCED");
  assert.equal(cmpDoc.comparison.cross_security_statistics, "NONE_PERMITTED_BY_PUBLISHED_CONTRACT");
});

test("public history reads only published session manifests and states its limitation", async () => {
  assert.deepEqual(wb.candidateSessions("2026-10-26", 3), ["2026-10-26", "2026-10-23", "2026-10-22"]);
  const fetchFromDisk = (url) => {
    const p = path.join(root, url);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
  };
  const dpg = await wb.loadPublicHistory("DPG", index.as_of_session, fetchFromDisk, 30);
  assert.equal(dpg.status, "ok");
  assert.ok(dpg.appearances.length >= 2, "DPG appears in several published focus-card sets");
  dpg.appearances.forEach((a) => assert.ok(a.lenses.length >= 1));
  const hpg = await wb.loadPublicHistory("HPG", index.as_of_session, fetchFromDisk, 10);
  assert.equal(hpg.appearances.length, 0);
  const html = wb.historyHtml(hpg);
  assert.match(html, /Lịch sử tư thế hành động từng mã chưa được công bố công khai/);
  assert.match(html, /không nói gì về tư thế của mã ở các phiên đó/);
  const none = await wb.loadPublicHistory("HPG", index.as_of_session, () => null, 5);
  assert.equal(none.status, "none");
});

test("investment-workspace.html wires the workbench script and stylesheet with the current asset token", () => {
  const html = read("investment-workspace.html");
  const build = JSON.parse(read("data/build_info.json")).build_id;
  assert.match(html, new RegExp(`assets/js/investigation-workbench\\.js\\?v=${build}`));
  assert.match(html, new RegExp(`assets/css/investigation-workbench\\.css\\?v=${build}`));
  assert.ok(html.indexOf("investigation-workbench.js") < html.indexOf("assets/js/investment-workspace.js"));
  assert.match(html, /id="drawer-dossier-link"/);
});
