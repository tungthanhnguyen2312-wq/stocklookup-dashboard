const test = require("node:test");
const assert = require("node:assert/strict");
const home = require("../assets/js/dashboard-product-summary.js");

const payload = {
  contract_version: "market_close_current_research/v1",
  session_binding: "NOT_WRITTEN_INTO_SEALED_DAILY",
  posthoc_benchmark: {
    status: "POSTHOC_CURRENT_RESEARCH",
    session: "2026-11-06",
    close: 1725.36,
    change_points: -15.37,
    change_percent: -0.88,
    knowledge_available_at: "2026-11-07T09:49:56+07:00",
    authority: "DNSE_CURRENT_STATE_REPUBLISHED_INDEX_NOT_HOSE_ADMINISTRATOR",
    seal_time_knowledge: "NOT_CLAIMED",
  },
  source_closures: [{ source: "NSO_CPI_OCTOBER_2026", reason: "OCTOBER_2026_CPI_NOT_ON_ADMITTED_NSO_ENGLISH_ROUTE" }],
  compatibility: { reason: "BENCHMARK_KNOWLEDGE_TIME_IS_AFTER_THE_SEALED_SESSION" },
};

test("post-hoc market research stays outside the sealed session", () => {
  const html = home.currentResearchHtml(payload);
  assert.match(html, /sau Daily đã niêm phong/);
  assert.match(html, /1\.725,36/);
  assert.match(html, /OCTOBER_2026_CPI_NOT_ON_ADMITTED_NSO_ENGLISH_ROUTE/);
  assert.match(html, /BENCHMARK_KNOWLEDGE_TIME_IS_AFTER_THE_SEALED_SESSION/);
  assert.doesNotMatch(html, /market_close_intelligence/);
});

test("a sealed binding is not rendered as current research", () => {
  const html = home.currentResearchHtml({ ...payload, session_binding: "SEALED_DAILY" });
  assert.equal(html, "");
});
