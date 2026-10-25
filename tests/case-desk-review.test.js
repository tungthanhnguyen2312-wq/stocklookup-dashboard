"use strict";
// INVESTOR_CASE_DESK_LOCAL_REVIEW_INTEGRATION_V1: browser-local Case Desk case viewer, exercised
// against sanitized excerpts of the HPG, NVL and five-company acceptance cases of Consumer PR #12
// (tests/fixtures/case_desk/build_case_desk_review_fixtures.py) and the committed published workspace index.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const cdr = require("../assets/js/case-desk-review.js");

const index = JSON.parse(read("data/workspace_index.json"));
const FIXTURES = {
  hpg: read("tests/fixtures/case_desk/case_hpg.json"),
  nvl: read("tests/fixtures/case_desk/case_nvl.json"),
  mixed: read("tests/fixtures/case_desk/case_mixed_basis.json"),
};
const doc = (name) => JSON.parse(FIXTURES[name]);
const open = (name) => {
  const r = cdr.parseCase(FIXTURES[name]);
  assert.equal(r.ok, true, `${name}: ${r.error} ${r.detail}`);
  return r.model;
};
const reject = (value) => cdr.parseCase(typeof value === "string" ? value : JSON.stringify(value));
const visible = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");

test("fixtures are the Consumer PR #12 acceptance cases (identities from its receipt)", () => {
  assert.equal(open("hpg").caseIdentity, "investment_case:245d19e2ee211f110f92b9383fa64bf2bdd69b9cb5a4a2fb86b60c5cfc511c56");
  assert.equal(open("nvl").caseIdentity, "investment_case:a201c3742efd6c74e7cdf4ba7a7dfc4a57293ac81bd1ae737e46aea1f9dc8af3");
  assert.equal(open("mixed").caseIdentity, "investment_case:866d9d2e7da20c7cc6ee15de00cac1f9cfd0757f41f7a9c005bbb5cb406e2801");
  assert.deepEqual(open("mixed").tickers, ["FPT", "HPG", "PNJ", "TPB", "VNM"]);
  for (const name of Object.keys(FIXTURES)) {
    assert.equal(open(name).latestSession, "2026-10-23");
    assert.doesNotMatch(FIXTURES[name], /[A-Za-z]:\\\\|[A-Za-z]:\/|\/Users\//, `${name} must carry no local filesystem path`);
  }
});

test("HPG: business evidence, technical counter-thesis and contradictory evidence stay separate", () => {
  const m = open("hpg");
  const html = cdr.caseViewHtml(m, { ticker: "HPG", indexDoc: index });
  const text = visible(html);
  assert.match(text, /Dưới mức kích hoạt/);
  assert.doesNotMatch(html, /data-case-triggered/);
  assert.match(text, /Phản luận mạnh nhất có căn cứ: Kỹ thuật/);
  assert.match(text, /Chọn theo thứ tự nhóm cố định, không phải điểm mạnh yếu/);
  // Two unresolved source contradictions are shown, and contested support is labelled, not removed.
  const contradictions = doc("hpg").thesis_challenges[0].contradictions;
  assert.equal(contradictions.length, 2);
  for (const id of contradictions) assert.ok(m.evidence.has(id));
  assert.match(text, /Mâu thuẫn trong nguồn/);
  assert.match(text, /Bị chính nguồn Producer phản bác/);
  assert.match(text, /Chỉ dựa trên tình hình tài chính, không phải lợi nhuận hay dòng tiền/);
  assert.match(text, /Lợi nhuận báo cáo chưa được xác lập là lợi nhuận thường xuyên hay thu nhập toàn diện/);
  // The investor's hypothesis is shown as human framing, never as a verified fact.
  assert.match(text, /Giả thuyết của bạn/);
  assert.match(text, /Cách đặt vấn đề của nhà đầu tư, chưa được kiểm chứng/);
});

test("NVL: a TRIGGERED technical condition is never thesis confirmation or a BUY instruction", () => {
  const m = open("nvl");
  const dd = doc("nvl").decision_distinctions[0];
  assert.ok(dd.conditions.some((c) => c.kind === "INTEGRATED_DECISION_TRIGGER" && c.producer_state === "TRIGGERED"));
  const html = cdr.caseViewHtml(m, { ticker: "NVL", indexDoc: index });
  const text = visible(html);
  assert.match(html, /data-case-triggered="true"/);
  assert.match(text, /Đây không xác nhận luận điểm cơ bản, không phải khuyến nghị mua và không thay tư thế nghiên cứu \(tư thế tại phiên hồ sơ: Tránh ?\)/);
  assert.match(text, /Producer không báo trạng thái — không coi là đã hay chưa kích hoạt/);
  assert.doesNotMatch(text, /\bnên mua\b|mua ngay|điểm mua|giá mục tiêu/i);
  assert.equal(cdr.compareWithPublished(m, index, "NVL").casePosture, "AVOID");
});

test("absent OCI and unknown earnings quality are stated, never filled in", () => {
  for (const name of Object.keys(FIXTURES)) {
    const m = open(name);
    for (const t of m.tickers) {
      const html = cdr.caseViewHtml(m, { ticker: t, indexDoc: index });
      assert.match(html, /data-case-oci="COMPREHENSIVE_INCOME_NOT_SUPPLIED_BY_PRODUCER"/, `${name}/${t}`);
      assert.match(visible(html), /Producer không cung cấp thu nhập toàn diện \(OCI\)/);
    }
  }
  const pnj = visible(cdr.caseViewHtml(open("mixed"), { ticker: "PNJ", indexDoc: index }));
  assert.match(pnj, /Có hoặc có thể có khoản không thường xuyên/);
  assert.match(pnj, /Có khoản trích lập\/hoàn nhập dự phòng được báo cáo/);
  assert.match(pnj, /Chỉ là bối cảnh, không được dùng để định giá/);
  assert.match(pnj, /trích xuất image_only_tsv_ocr_geometry/);
});

test("bank versus corporate metrics are refused, never compared or ranked", () => {
  const m = open("mixed");
  const tpb = visible(cdr.caseViewHtml(m, { ticker: "TPB", indexDoc: index }));
  assert.match(tpb, /Loại hình: Ngân hàng/);
  assert.equal((tpb.match(/Khác mô hình kế toán/g) || []).length >= 4, true);
  assert.match(tpb, /Không có mã thắng, xếp hạng hay kết luận hơn kém/);
  const hpg = visible(cdr.caseViewHtml(m, { ticker: "HPG", indexDoc: index }));
  assert.match(hpg, /HPG ↔ TPB: Khác mô hình kế toán \(Doanh nghiệp \/ Ngân hàng\) — không so sánh chỉ số/);
  assert.match(hpg, /HPG ↔ PNJ: Khác ngành, mô hình kinh doanh khác nhau/);
  for (const p of m.pairs) { assert.equal(p.winner, null); }
});

test("case session is compared with the published session; old research is labelled as such", () => {
  const m = open("hpg");
  const same = cdr.compareWithPublished(m, index, "HPG");
  assert.equal(same.state, "SAME_DATE_RUN_NOT_VERIFIED");
  assert.equal(same.publishedPosture, index.cards.HPG.research_action_posture);
  const later = { ...index, as_of_session: "2026-10-30" };
  const older = cdr.caseViewHtml(m, { ticker: "HPG", indexDoc: later });
  assert.match(older, /data-case-session-state="CASE_OLDER"/);
  assert.match(visible(older), /Hồ sơ là nghiên cứu cũ hơn dữ liệu đang công bố/);
  assert.match(visible(older), /2026-10-23.*2026-10-30/);
  assert.equal(cdr.compareWithPublished(m, { ...index, as_of_session: "2026-10-20" }, "HPG").state, "CASE_NEWER");
  const missing = cdr.compareWithPublished(m, { as_of_session: "2026-10-23", cards: {} }, "HPG");
  assert.equal(missing.inPublished, false);
  const html = cdr.caseViewHtml(m, { ticker: "HPG", indexDoc: { as_of_session: "2026-10-23", cards: {} } });
  assert.doesNotMatch(html, /data-case-action="open-dossier"/);
  assert.match(visible(html), /HPG không có trong dữ liệu đang công bố/);
  assert.match(cdr.caseViewHtml(m, { ticker: "HPG", indexDoc: index }), /data-case-action="open-dossier" data-ticker="HPG"/);
});

test("mismatched or malformed sessions are rejected", () => {
  let d = doc("hpg"); d.request.sessions[1].session = "2026-10-20";
  assert.equal(reject(d).error, "SESSION_MISMATCH");
  d = doc("hpg"); d.request.sessions[0].expected_run_identity = `daily_producer_run:${"0".repeat(64)}`;
  assert.equal(reject(d).error, "SESSION_MISMATCH");
  d = doc("hpg"); d.decision_distinctions[0].session = "2026-10-24";
  assert.equal(reject(d).error, "SESSION_MISMATCH");
  d = doc("hpg"); [d.session_basis[0], d.session_basis[1]] = [d.session_basis[1], d.session_basis[0]];
  assert.equal(reject(d).error, "BAD_SESSIONS");
  d = doc("hpg"); d.session_basis[0].run_identity = "latest";
  assert.equal(reject(d).error, "BAD_SESSIONS");
  // A member delivered only at an earlier session is shown with an explicit older-session warning.
  d = doc("hpg"); d.decision_distinctions[0].session = "2026-10-22";
  const r = reject(d);
  assert.equal(r.ok, true);
  assert.match(cdr.caseViewHtml(r.model, { ticker: "HPG", indexDoc: index }), /data-case-distinction-session="2026-10-22"/);
});

test("malformed, oversized and out-of-contract imports are rejected", () => {
  assert.equal(cdr.parseCase("").error, "EMPTY");
  assert.equal(cdr.parseCase("{not json").error, "NOT_JSON");
  assert.equal(cdr.parseCase("[]").error, "NOT_OBJECT");
  assert.equal(cdr.parseCase("{}", { bytes: cdr.LIMITS.bytes + 1 }).error, "FILE_TOO_LARGE");
  assert.equal(cdr.parseCase(" ".repeat(cdr.LIMITS.bytes + 1)).error, "FILE_TOO_LARGE");
  const cases = [
    [(d) => { d.contract_version = "investment_research_case/v2"; }, "WRONG_CONTRACT"],
    [(d) => { d.contract_version = "investor_research_dossier_export/v1"; }, "WRONG_CONTRACT"],
    [(d) => { d.case_identity = "investment_case:xyz"; }, "BAD_IDENTITY"],
    [(d) => { d.authority_boundary.is_actionable = true; }, "AUTHORITY_BOUNDARY"],
    [(d) => { delete d.authority_boundary; }, "AUTHORITY_BOUNDARY"],
    [(d) => { d.request.members.push({ ticker: "HPG" }); }, "BAD_MEMBERS"],
    [(d) => { d.request.members = []; }, "BAD_MEMBERS"],
    [(d) => { d.request.members = Array.from({ length: 21 }, (_, i) => ({ ticker: `T${String(i).padStart(2, "0")}` })); }, "BAD_MEMBERS"],
    [(d) => { delete d.evidence_catalogue; }, "BAD_SECTION"],
    [(d) => { d.overview[0].ticker = "VCB"; }, "BAD_SECTION"],
    [(d) => { d.evidence_catalogue.push(d.evidence_catalogue[0]); }, "BAD_EVIDENCE"],
    [(d) => { d.evidence_catalogue[0].citation.ticker = "VCB"; }, "BAD_EVIDENCE"],
    [(d) => { d.evidence_catalogue[0].citation.session = "2026-01-01"; }, "BAD_EVIDENCE"],
    [(d) => { d.evidence_catalogue[0].evidence_identity = "case_evidence:../../x"; }, "BAD_EVIDENCE"],
  ];
  for (const [mutate, code] of cases) {
    const d = doc("hpg"); mutate(d);
    const r = reject(d);
    assert.equal(r.ok, false, code);
    assert.equal(r.error, code);
    assert.ok(cdr.IMPORT_ERRORS[code]);
    assert.equal(r.model, undefined, "a rejected import never returns a partial model");
  }
});

test("hostile text is escaped everywhere and cannot pollute prototypes", () => {
  const d = doc("nvl");
  const payload = `<script>alert(1)</script><img src=x onerror="alert(2)">"'`;
  d.request.topics[0].text = payload;
  d.decision_distinctions[0].interpretation = payload;
  d.decision_distinctions[0].conditions[0].outcome_across_sessions = payload;
  d.decision_distinctions[0].conditions[0].kind = `"><svg onload=alert(3)>`;
  const ev = d.evidence_catalogue.find((e) => typeof e.observation.text === "string");
  ev.observation.text = payload;
  ev.citation.evidence_ref = `" onmouseover="alert(4)`;
  d.current_profiles[0].evidence_limits.missing_evidence.push({ code: payload, source_value: { [payload]: payload } });
  d.thesis_challenges[0].producer_support.unshift(ev.evidence_identity);
  d.thesis_challenges[0].contradictions.push("case_evidence:" + "f".repeat(64));
  const text = JSON.stringify(d).replace('"contract_version"', '"__proto__":{"polluted":true},"contract_version"');
  const r = cdr.parseCase(text);
  assert.equal(r.ok, true, r.error);
  assert.equal({}.polluted, undefined);
  const html = cdr.caseViewHtml(r.model, { ticker: "NVL", indexDoc: index });
  assert.doesNotMatch(html, /<script|<img|<svg/i);
  assert.doesNotMatch(html.replace(/="[^"]*"/g, '=""'), /<[^>]*\son[a-z]+\s*=/i, "no injected event-handler attribute inside any rendered tag");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /data-case-evidence-missing="true"/, "an unknown evidence reference is shown as missing, not dropped");
  const err = cdr.emptyStateHtml({ error: "NOT_JSON", message: payload, detail: payload });
  assert.doesNotMatch(err, /<script|<img/);
  assert.equal(reject({ ...doc("hpg"), request: { ...doc("hpg").request, members: [{ ticker: "<b>" }] } }).error, "BAD_MEMBERS");
});

test("a failed import keeps the previously opened valid case; close forgets it", () => {
  cdr.closeCase();
  assert.equal(cdr.currentModel(), null);
  assert.equal(cdr.acceptText(FIXTURES.hpg).ok, true);
  const first = cdr.currentModel();
  assert.equal(cdr.acceptText("{broken").ok, false);
  assert.equal(cdr.currentModel(), first);
  const d = doc("nvl"); d.authority_boundary.is_actionable = true;
  assert.equal(cdr.acceptText(JSON.stringify(d)).error, "AUTHORITY_BOUNDARY");
  assert.equal(cdr.currentModel(), first);
  assert.equal(cdr.acceptText(FIXTURES.nvl).ok, true);
  assert.equal(cdr.currentModel().tickers[0], "NVL");
  cdr.closeCase();
  assert.equal(cdr.currentModel(), null);
});

test("dossier notice appears only for a ticker inside the opened case", () => {
  const m = open("mixed");
  assert.equal(cdr.dossierNoticeHtml(null, "HPG", index), "");
  assert.equal(cdr.dossierNoticeHtml(m, "NVL", index), "");
  const notice = cdr.dossierNoticeHtml(m, "TPB", index);
  assert.match(notice, /data-case-dossier-notice="SAME_DATE_RUN_NOT_VERIFIED"/);
  assert.match(visible(notice), /Hồ sơ là nghiên cứu riêng, không phải dữ liệu đang công bố/);
});

test("the case viewer has no network, storage or URL write path", () => {
  const src = read("assets/js/case-desk-review.js").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /history\.(?:push|replace)State/, /location\.(?:href|hash|search)\s*=/, /URLSearchParams/, /postMessage/, /WebSocket/]) {
    assert.doesNotMatch(src, forbidden, String(forbidden));
  }
  assert.match(src, /readAsText/);
  assert.match(cdr.NOTICE, /không tải lên máy chủ, không lưu, không đưa vào liên kết và không công bố/);
});

test("the Cơ hội page wires the case view into the existing workbench without new data files", () => {
  const html = read("investment-workspace.html");
  const build = JSON.parse(read("data/build_info.json")).build_id;
  assert.match(html, /id="ws-tab-case"[^>]*role="tab"[^>]*aria-controls="ws-view-case"/);
  assert.match(html, /id="ws-view-case" data-ws-view role="tabpanel" aria-labelledby="ws-tab-case" hidden>/);
  assert.match(html, new RegExp(`assets/js/case-desk-review\\.js\\?v=${build}`));
  assert.match(html, new RegExp(`assets/css/case-desk-review\\.css\\?v=${build}`));
  assert.ok(html.indexOf("case-desk-review.js") < html.indexOf("assets/js/investment-workspace.js"));
  assert.match(html, /accept="application\/json"/);
  const wsJs = read("assets/js/investment-workspace.js");
  assert.match(wsJs, /WORKBENCH_VIEWS = \["dossier", "compare", "journal", "case"\]/);
  assert.match(wsJs, /localCaseNoticeHtml: \(t\) =>/);
  assert.match(read("assets/js/investigation-workbench.js"), /UI\.ctx\.localCaseNoticeHtml \? UI\.ctx\.localCaseNoticeHtml\(model\.ticker\) : ""/);
  assert.doesNotMatch(read("portfolio.html"), /case-desk-review/, "the portfolio page is unchanged");
});
