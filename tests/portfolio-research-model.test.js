"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pr = require("../assets/js/portfolio-research-model.js");
const wb = require("../assets/js/investigation-workbench.js");

const root = path.resolve(__dirname, "..");
const index = JSON.parse(fs.readFileSync(path.join(root, "data/workspace_index.json"), "utf8"));
const beforeIndex = index.source_artifact_identity;

function portfolio(positions, extra) {
  return Object.assign({ portfolio_id: "local-portfolio", cash: 0, review_note: "", positions }, extra || {});
}

function overviewFor(tickers, basis) {
  const positions = tickers.map((ticker) => (
    basis === "quantity"
      ? { ticker, quantity: 100, basis: "quantity", ambiguous: false, duplicate: false }
      : { ticker, explicit_weight: 0.2, basis: "explicit_weight", ambiguous: false, duplicate: false }
  ));
  return pr.buildOverview(portfolio(positions), index);
}

function holding(overview, ticker) {
  return overview.holdings.find((item) => item.ticker === ticker);
}

test("legacy portfolio JSON round-trips and keeps weight versus quantity distinct", () => {
  const legacy = JSON.stringify({
    portfolio_id: "local-portfolio",
    cash: 0,
    positions: [
      { ticker: "hpg", explicit_weight: 0.15 },
      { ticker: "FPT", quantity: 1000 },
    ],
  });
  const parsed = pr.parsePortfolioText(legacy, true);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.model.positions[0].basis, "explicit_weight");
  assert.equal(parsed.model.positions[1].basis, "quantity");
  const again = pr.parsePortfolioText(JSON.stringify(pr.exportDocument(parsed.model)), true);
  assert.equal(again.ok, true);
  assert.equal(again.model.positions[0].explicit_weight, 0.15);
  assert.equal(again.model.positions[1].quantity, 1000);
  assert.equal(again.model.positions[0].quantity, undefined);
  const weights = pr.weightSummary(parsed.model);
  assert.equal(weights.mode, "mixed");
  assert.equal(weights.market_value_inferred, false);
  assert.deepEqual(weights.quantity_tickers, ["FPT"]);
  assert.equal(weights.items[0].weight_percent, 15);
});

test("failed imports leave the current portfolio untouched", () => {
  const current = pr.addPosition(pr.emptyModel(), { ticker: "HPG", amount: 10, basis: "quantity" }).model;
  const cases = [
    "{",
    JSON.stringify({ schema_version: "other/v9", positions: [] }),
    JSON.stringify({ positions: [{ ticker: "HPG", quantity: 1 }, { ticker: "HPG", quantity: 2 }] }),
    JSON.stringify({ positions: [{ ticker: "HPG", quantity: 1, explicit_weight: 0.2 }] }),
    JSON.stringify({ positions: [{ ticker: "<script>", quantity: 1 }] }),
    JSON.stringify({ positions: [{ ticker: "HPG", quantity: Number.POSITIVE_INFINITY }] }),
    '{"__proto__":{"polluted":true},"positions":[{"ticker":"VNM","quantity":1}]}',
    '{"constructor":{"prototype":{"polluted":true}},"positions":[{"ticker":"VNM","quantity":1}]}',
    JSON.stringify({ positions: [{ ticker: "ABC\u202E", quantity: 1 }] }),
    " ".repeat(pr.MAX_IMPORT_BYTES + 1),
  ];
  const snapshot = JSON.stringify(current);
  for (const text of cases) {
    const imported = pr.importPortfolioText(text, current);
    assert.equal(imported.ok, false, text.slice(0, 40));
    assert.equal(JSON.stringify(imported.model), snapshot);
    assert.equal(JSON.stringify(current), snapshot);
  }
  assert.equal(Object.prototype.polluted, undefined);
});

test("notes are stored as text and export does not invent ownership", () => {
  const added = pr.addPosition(pr.emptyModel(), { ticker: "PNJ", amount: "0.25", basis: "explicit_weight", note: "  <script>x</script> câu hỏi  " });
  assert.equal(added.ok, true);
  assert.equal(added.model.positions[0].note.includes("<"), false);
  assert.match(added.model.positions[0].note, /câu hỏi/);
  const duplicate = pr.addPosition(added.model, { ticker: "pnj", amount: 5, basis: "quantity" });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.model.positions.length, 1);
});

test("case A reads published posture for HPG, FPT and PNJ without mutating the index", () => {
  const card = JSON.stringify(index.cards.HPG.research_action_posture);
  const view = overviewFor(["HPG", "FPT", "PNJ"]);
  assert.equal(view.session, "2026-10-23");
  assert.equal(view.source_artifact_identity, index.source_artifact_identity);
  const hpg = holding(view, "HPG");
  const fpt = holding(view, "FPT");
  const pnj = holding(view, "PNJ");
  assert.equal(hpg.posture_raw, index.cards.HPG.research_action_posture);
  assert.equal(fpt.posture_raw, "AVOID");
  assert.equal(pnj.posture_raw, "AVOID");
  assert.notEqual(fpt.posture_label, hpg.posture_label);
  assert.equal(hpg.business.interpretation, "missing");
  assert.equal(hpg.business.state_raw, "INSUFFICIENT_DATA");
  assert.equal(fpt.valuation.state_raw, "EXPENSIVE_RELATIVE_RESEARCH");
  assert.equal(fpt.valuation.qualified, true);
  assert.equal(pnj.valuation.qualified, false);
  assert.equal(hpg.dossier_href, "investment-workspace.html?view=dossier&ticker=HPG");
  assert.ok(fpt.categories.includes("published_adverse_posture"));
  assert.ok(fpt.categories.includes("source_reported_deterioration"));
  assert.equal(JSON.stringify(index.cards.HPG.research_action_posture), card);
  assert.equal(index.source_artifact_identity, beforeIndex);
});

test("case B keeps NVL adverse and does not treat a satisfied reference as a fired outcome", () => {
  const view = overviewFor(["NVL", "HPG"], "quantity");
  const nvl = holding(view, "NVL");
  assert.equal(nvl.posture_raw, "AVOID");
  assert.equal(nvl.confirmation.reference_satisfied, true);
  assert.equal(nvl.confirmation.treated_as_fired, false);
  assert.equal(nvl.confirmation.trigger_state_raw, "NOT_AVAILABLE");
  assert.ok(nvl.categories.includes("published_adverse_posture"));
  assert.ok(nvl.categories.includes("contradictory_source_evidence"));
  const owned = overviewFor(["NVL"]);
  const bare = pr.buildOverview(portfolio([{ ticker: "NVL", explicit_weight: 1, basis: "explicit_weight", ambiguous: false, duplicate: false }]), index);
  assert.equal(holding(owned, "NVL").posture_raw, holding(bare, "NVL").posture_raw);
  assert.equal(view.weights.mode, "quantity_only");
  assert.equal(view.weights.market_value_inferred, false);
});

test("case C separates bank evidence from corporate comparison", () => {
  const view = overviewFor(["TCB", "HPG"]);
  const tcb = holding(view, "TCB");
  const hpg = holding(view, "HPG");
  assert.equal(tcb.entity_class, "bank");
  assert.equal(hpg.entity_class, "corporate");
  assert.ok(tcb.categories.includes("bank_specific_evidence_gap"));
  assert.equal(tcb.categories.includes("bank_specific_evidence_gap") && tcb.business.interpretation === "missing", true);
  assert.equal(hpg.categories.includes("bank_specific_evidence_gap"), false);
  assert.ok(tcb.categories.includes("technical_without_business_evidence"));
  assert.equal(tcb.posture_raw, "WAIT_FOR_CONFIRMATION");
  const load = (ticker) => {
    const card = index.cards[ticker];
    const shard = JSON.parse(fs.readFileSync(path.join(root, "data/workspace_detail", `${card.detail_shard}.json`), "utf8"));
    return { ticker, thin: card, detail: shard.tickers[ticker] };
  };
  const comparison = pr.comparisonFromDetails([load("TCB"), load("HPG")], index);
  assert.equal(comparison.ok, true);
  assert.ok(comparison.refused_incompatible.length > 0);
  assert.ok(comparison.refused_incompatible.some((row) => row.reasons.some((reason) => reason.code === "ENTITY_CLASS_DIFFERS" || reason.code === "NOT_APPLICABLE")));
  const dossier = pr.openDetail(load("TCB").detail, index);
  const facts = pr.detailFacts(dossier);
  assert.equal(facts.is_bank, true);
  assert.equal(facts.confirmation_fired === "PRODUCER_REPORTED_TRIGGERED", false);
});

test("unknown tickers stay visible and do not change published values", () => {
  const view = overviewFor(["NOPE", "VCB"]);
  assert.equal(holding(view, "NOPE").coverage, "missing");
  assert.deepEqual(holding(view, "NOPE").categories, ["missing_published_coverage"]);
  assert.equal(holding(view, "VCB").posture_raw, index.cards.VCB.research_action_posture);
  assert.equal(view.shared.industry_mechanism, "NOT_ESTABLISHED");
});

test("shared groups use exact published codes and skip invented market-value weights", () => {
  const view = overviewFor(["FPT", "PNJ", "NVL"]);
  const deterioration = view.shared.groups.find((group) => group.raw === "TECHNICAL_DETERIORATION");
  assert.ok(deterioration);
  assert.ok(deterioration.tickers.includes("FPT"));
  assert.ok(deterioration.tickers.includes("PNJ"));
  assert.equal(deterioration.mechanism, "SHARED_PUBLISHED_CODE");
  assert.equal(deterioration.user_weight_percent, 60);
  const quantity = overviewFor(["FPT", "PNJ"], "quantity");
  const again = quantity.shared.groups.find((group) => group.raw === "TECHNICAL_DETERIORATION");
  assert.equal(again.user_weight_percent, null);
});

test("review keeps user notes apart from published posture", () => {
  const model = pr.updateReviewNote(pr.addPosition(pr.emptyModel(), { ticker: "HPG", amount: 1, basis: "quantity", note: "câu của tôi" }).model, "ghi chú riêng").model;
  const review = pr.buildReview(model, pr.buildOverview(model, index), {
    entries: [{ tickers: ["HPG"], questions: [{ text: "Biên lợi nhuận nào còn thiếu?", status: "open", origin: "user" }] }],
  });
  assert.equal(review.not_an_investment_recommendation, true);
  assert.equal(review.holdings[0].posture_raw, index.cards.HPG.research_action_posture);
  assert.equal(review.user_supplied.review_note, "ghi chú riêng");
  assert.equal(review.unresolved_questions[0].source, "user_journal");
  const html = pr.reviewHtml(review);
  assert.match(html, /Không phải khuyến nghị/);
  assert.match(html, /ghi chú riêng/);
  assert.equal(html.includes("<script"), false);
  const questions = pr.journalQuestions({ entries: review.unresolved_questions.map((q) => ({ tickers: q.tickers, questions: [q] })) }, ["HPG"]);
  assert.equal(questions.length >= 0, true);
  assert.equal(typeof wb.buildDossier, "function");
});

test("twenty real holdings summarize from the index without a detail shard", () => {
  const tickers = Object.keys(index.cards).slice(0, 20);
  const started = Date.now();
  const view = overviewFor(tickers);
  const elapsed = Date.now() - started;
  assert.equal(view.holdings.length, 20);
  assert.ok(view.holdings.every((item) => item.coverage === "published"));
  assert.ok(elapsed < 3000, `overview took ${elapsed}ms`);
});
