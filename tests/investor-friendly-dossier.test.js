"use strict";
// INVESTOR_FRIENDLY_DASHBOARD_UX_20261108: two-layer dossier acceptance over the committed
// published data. Layer 1 is a plain-language brief; layer 2 keeps every published fact, gap,
// question and raw reason reachable. The presentation never changes a Producer value.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const wb = require("../assets/js/investigation-workbench.js");
const home = require("../assets/js/dashboard-product-summary.js");

const index = JSON.parse(read("data/workspace_index.json"));
const shards = {};
function detail(ticker) {
  const key = index.cards[ticker].detail_shard;
  if (!shards[key]) shards[key] = JSON.parse(read(`data/workspace_detail/${key}.json`));
  return shards[key].tickers[ticker];
}
const ctx = (t) => ({ ticker: t, session: index.as_of_session, sourceArtifactIdentity: index.source_artifact_identity });
const dossier = (t) => { const m = wb.buildDossier(detail(t), ctx(t)); return { m, html: wb.dossierHtml(m) }; };
const layer1 = (html) => html.slice(0, html.indexOf('<div class="wb-deep-head">'));
const visible = (html) => html.replace(/<details class="wb-tech">[\s\S]*?<\/details>/g, "").replace(/<dd class="wb-mono">[\s\S]*?<\/dd>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");

test("HPG: the reference scenario label is not repeated inside its own status", () => {
  const { html } = dossier("HPG");
  assert.doesNotMatch(visible(html), /Kịch bản tham chiếu: Kịch bản tham chiếu/);
  assert.match(html, /<b>Kịch bản tham chiếu<\/b> — Đang theo dõi/);
  assert.match(visible(html), /không có nghĩa là khả năng xảy ra cao nhất/, "the base case is still said not to be the most probable");
});

test("HPG: the brief (situation, positives, cautions, watch, valuation, unknowns) comes before any collapsed section and before the missing-feature list", () => {
  const { m, html } = dossier("HPG");
  const firstDetails = html.indexOf("<details");
  for (const marker of ['data-brief="situation"', "wb-brief-positive", 'class="wb-adverse"', "wb-brief-watch", "wb-brief-valuation", "wb-brief-unknown", 'data-brief="certainty"']) {
    const at = html.indexOf(marker);
    assert.ok(at > 0 && at < firstDetails, `${marker} is in the default view`);
  }
  assert.ok(html.indexOf("Tình hình hiện tại") < html.indexOf('id="wb-sec-fundamentals"'));
  assert.ok(m.fundamentals.unavailable.length >= 40, "HPG still publishes its long list of unusable figures");
  assert.match(html, new RegExp(`${m.fundamentals.unavailable.length} chưa dùng được`), "the raw count is kept on the section");
});

test("HPG: at most five verification questions are open by default, and all of them stay reachable with unchanged ids and text", () => {
  const { m, html } = dossier("HPG");
  // One question per published gap. The count is not a session census: on 2026-11-09
  // P/E_REPORTED_PERIOD and P/S_REPORTED_PERIOD became published figures, so the single
  // blocked-input question those two methods shared on 2026-11-06 must not be kept.
  assert.equal(m.questions.length, m.gaps.length);
  assert.deepEqual(m.questions.map((q) => q.id), m.gaps.map((g) => g.question.id));
  assert.deepEqual(m.questions.map((q) => q.gapKey), m.gaps.map((g) => g.key));
  const qctx = { ticker: "HPG", postureLabel: m.posture.label };
  for (const g of m.gaps) {
    assert.equal(g.question.id, `g-${wb.stableHash(`HPG|${g.key}`)}`);
    assert.equal(g.question.text, wb.verificationQuestion(g, qctx).text);
  }
  for (const raw of ["P/E_REPORTED_PERIOD", "P/S_REPORTED_PERIOD"]) {
    assert.ok(m.valuation.establishes.some((row) => row.raw === raw), `${raw} stays a published figure`);
  }
  assert.equal(
    m.gaps.filter((g) => g.axis === "valuation" && g.reasonRaw === "OFFICIAL_REPORTED_PERIOD_INPUT_NOT_ADMITTED").length,
    0,
    "an admitted reported-period method does not keep a blocked-input question"
  );
  const top = html.slice(html.indexOf('data-questions="top"'), html.indexOf('data-questions="rest"'));
  const shown = top.match(/data-gap-key="/g) || [];
  assert.ok(shown.length > 0 && shown.length <= 5, `default questions: ${shown.length}`);
  const section = html.slice(html.indexOf('id="wb-sec-questions"'), html.indexOf('id="wb-sec-freshness"'));
  const keys = new Set((section.match(/<li class="wb-item wb-item-gap" data-gap-key="([^"]+)"/g) || []).map((s) => s.split('data-gap-key="')[1].slice(0, -1)));
  assert.equal(keys.size, m.gaps.length, "every question is listed once");
  for (const g of m.gaps) {
    assert.ok(keys.has(g.key.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;")) || keys.has(g.key), g.key);
    assert.match(g.question.id, /^g-[0-9a-z]+$/);
  }
  const again = wb.buildDossier(detail("HPG"), ctx("HPG"));
  assert.deepEqual(again.questions, m.questions, "question identity and text are deterministic");
});

test("HPG: the evidence kind is stated once per list instead of on every row, and no internal producer name reaches the default view", () => {
  const { html } = dossier("HPG");
  const inferenceBadges = (html.match(/class="wb-kind wb-kind-inference"/g) || []).length;
  const { m } = dossier("HPG");
  const inferenceRows = m.evidence.support.concat(m.evidence.counter, m.evidence.neutral, m.posture.reasons, m.fundamentals.establishes).filter((it) => it.kind === "PRODUCER_INFERENCE").length;
  assert.ok(inferenceBadges <= 8 && inferenceBadges < inferenceRows, `inference badges ${inferenceBadges} for ${inferenceRows} inference rows (one per list, not one per row)`);
  assert.doesNotMatch(html, /Suy luận của Producer/);
  assert.doesNotMatch(visible(layer1(html)), /Producer|PIT|TTM|proxy/i);
});

test("HPG: Q1 figures are dated as Q1, and a conditional invalidation is never shown as having happened", () => {
  const { m, html } = dossier("HPG");
  const brief = visible(layer1(html));
  assert.match(brief, /kỳ 2026-Q1/);
  assert.doesNotMatch(brief, /Q3/);
  assert.equal(m.conditions.fundamentalInvalidation.fired, false);
  assert.match(layer1(html), /data-watch-role="Điều kiện về nền tảng"[^]*?data-watch-state="pending"/);
  assert.doesNotMatch(layer1(html), /data-watch-state="happened"/);
});

test("HPG: price trend and relative strength are explained as two different lenses", () => {
  const { html } = dossier("HPG");
  assert.match(layer1(html), /data-two-lenses="true"/);
  assert.match(visible(layer1(html)), /Đi ngang \/ trung tính/);
  assert.match(visible(layer1(html)), /Trên trung bình/);
});

// A scenario about one ticker's state is pinned to the published card that had that state.
// PAN was AVOID through 2026-11-09 and INITIATE_ON_BREAKOUT on 2026-11-10; read live, this
// test would fail on a correct publication. Checks over live data are the
// "every published ticker" tests, which hold for any session.
function frozenDossier(name) {
  const f = JSON.parse(read(`tests/fixtures/dossier-scenarios/${name}.json`));
  const m = wb.buildDossier(f.card, { ticker: f.ticker, session: f.as_of_session, sourceArtifactIdentity: f.source_artifact_identity });
  return { f, m, html: wb.dossierHtml(m) };
}

test("PAN: an avoid posture is the first caution, and the two P/B figures are not presented as one", () => {
  const { f, html } = frozenDossier("PAN_2026-11-09_avoid");
  assert.equal(f.card.research_action_posture, "AVOID");
  const l1 = layer1(html);
  assert.match(l1, /class="wb-adverse"[^>]*data-severity="serious"/);
  assert.ok(l1.indexOf('data-severity="serious"') < l1.indexOf('class="wb-brief"'), "serious cautions sit above the cards");
  assert.match(visible(l1), /P\/B có hai giá trị vì dùng số liệu ở hai thời điểm khác nhau/);
  assert.match(visible(l1), /Chưa đủ căn cứ để xác định giá trị hợp lý/);
});

test("SSI / EVF: financial issuers explain their own yardsticks and do not count not-applicable methods as missing data", () => {
  for (const t of ["SSI", "EVF"]) {
    const { m, html } = dossier(t);
    const l1 = layer1(html);
    assert.match(l1, /data-entity-note="true"/, t);
    const valuationRow = l1.match(/<li data-theme="valuation">[^]*?<\/li>/);
    const naMethods = m.valuation.unavailable.filter((u) => /SECTOR_ENTITY_METHOD_NOT_SUPPORTED/.test(u.reasonRaw)).length;
    if (valuationRow) assert.doesNotMatch(valuationRow[0], new RegExp(`${m.valuation.unavailable.length} chỉ tiêu`), t);
    assert.ok(naMethods > 0, t);
    assert.match(visible(html), /Không áp dụng cho loại hình doanh nghiệp này \(không phải thiếu dữ liệu\)/, t);
  }
  assert.match(visible(layer1(dossier("SSI").html)), /môi giới, cho vay ký quỹ, tài sản tài chính FVTPL/);
});

test("every published ticker: the brief never upgrades the Producer decision, invents a target, or reports an unfired condition as fired", () => {
  const forbidden = /(nên mua|khuyến nghị mua|sắp tăng|giá mục tiêu (là|:)? ?\d|xác suất (là|:)? ?\d|điểm mua là)/i;
  let serious = 0;
  for (const t of Object.keys(index.cards)) {
    const card = detail(t);
    const before = JSON.stringify(card);
    const m = wb.buildDossier(card, ctx(t));
    const html = wb.dossierHtml(m);
    assert.equal(JSON.stringify(card), before, `${t}: card mutated`);
    const l1 = layer1(html);
    assert.match(l1, new RegExp(`data-action-posture="${card.research_action_posture || "UNAVAILABLE"}"`), t);
    assert.doesNotMatch(visible(l1), forbidden, t);
    const fired = m.conditions.confirmation.some((c) => c.fired === "PRODUCER_REPORTED_TRIGGERED")
      || m.conditions.invalidation.some((c) => c.fired === "PRODUCER_REPORTED_TRIGGERED")
      || (m.conditions.reference && m.conditions.reference.satisfied)
      || (m.conditions.fundamentalInvalidation && m.conditions.fundamentalInvalidation.fired);
    if (!fired) assert.doesNotMatch(l1, /data-watch-state="happened"/, t);
    if (["AVOID", "REDUCE"].includes(card.research_action_posture)) {
      assert.match(l1, /data-severity="serious"/, t);
      serious++;
    }
  }
  assert.ok(Object.keys(index.cards).length > 0);
  assert.equal(serious, Object.values(index.cards).filter((c) => ["AVOID", "REDUCE"].includes(c.research_action_posture)).length);
});

test("every published ticker: each unusable figure keeps its original reason code reachable in the expanded layer", () => {
  for (const t of Object.keys(index.cards)) {
    const { m, html } = dossier(t);
    for (const u of m.fundamentals.unavailable.concat(m.valuation.unavailable)) {
      if (!u.reasonRaw) continue;
      assert.ok(html.includes(u.reasonRaw), `${t}: ${u.raw} lost reason ${u.reasonRaw}`);
    }
  }
});

test("a fixed card keeps question ids, text, and order when a published figure closes a gap", () => {
  const card = {
    ticker: "HPG",
    as_of_session: "2026-11-09",
    research_action_posture: "EARLY_WATCH",
    lineage: { per_axis_freshness: { fundamental: "STALE", valuation: "CURRENT" }, per_axis_source_session: { fundamental: "2026-11-06" } },
    valuation: {
      method_diagnostics: {
        P_E_REPORTED_PERIOD: { value: 11.4, availability_state: "AVAILABLE", status: "AVAILABLE" },
        P_S_REPORTED_PERIOD: { value: null, availability_state: "NOT_AVAILABLE", status: "BLOCKED", blocker_reason_codes: ["OFFICIAL_REPORTED_PERIOD_INPUT_NOT_ADMITTED"] },
      },
      research_readiness: {},
    },
  };
  const first = wb.buildDossier(card, { ticker: "HPG", session: "2026-11-09" });
  const second = wb.buildDossier(card, { ticker: "HPG", session: "2026-11-09" });
  assert.deepEqual(second.questions, first.questions);
  assert.deepEqual(first.questions.map((q) => q.gapKey), [
    "fundamental|fresh:STALE",
    "valuation|methods:BLOCKED:OFFICIAL_REPORTED_PERIOD_INPUT_NOT_ADMITTED",
  ]);
  assert.ok(first.valuation.establishes.some((row) => row.raw === "P_E_REPORTED_PERIOD"));
  assert.equal(first.gaps.filter((g) => g.key.includes("P_E_REPORTED_PERIOD")).length, 0);
  for (const g of first.gaps) assert.equal(g.question.id, `g-${wb.stableHash(`HPG|${g.key}`)}`);
});

test("hostile text in a card is escaped in both layers", () => {
  const card = JSON.parse(JSON.stringify(detail("HPG")));
  card.why.deterministic_reasons = ["<img src=x onerror=alert(1)>"];
  card.why.financial_analysis.compact.deterministic_positive_evidence = ["HPG: <script>alert(2)</script>"];
  const html = wb.dossierHtml(wb.buildDossier(card, ctx("HPG")));
  assert.doesNotMatch(html, /<img|<script/);
});

test("Home post-hoc VN-Index block reads in plain words and keeps raw source codes only in the technical disclosure", () => {
  const payload = JSON.parse(read("data/market_close_current_research.json"));
  const html = home.currentResearchHtml(payload);
  const outside = html.replace(/<details[\s\S]*?<\/details>/g, "");
  assert.doesNotMatch(outside, /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/, "no raw code outside the disclosure");
  assert.match(outside, /chỉ số giá tiêu dùng \(CPI\) tháng 10\/2026/);
  for (const row of payload.source_closures) assert.ok(html.includes(row.reason), row.reason);
});

test("Macro labels data freshness plainly and explains each headline indicator without forecasting", () => {
  const src = read("assets/js/macro.js");
  assert.match(src, /"Số liệu còn mới"/);
  assert.doesNotMatch(src, /"Trong ngưỡng"/);
  for (const key of ["usdvnd_vcb", "us_fedfunds", "vn_cpi_yoy", "us_10y", "dxy", "vix", "brent", "gold_world"]) {
    assert.match(src, new RegExp(`\\b${key}: \\{ what: "`), key);
  }
  assert.match(src, /không phải dự báo hay nhận định về con số hiện tại/);
});
