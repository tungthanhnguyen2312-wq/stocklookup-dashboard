const test = require("node:test");
const assert = require("node:assert/strict");
const home = require("../assets/js/dashboard-product-summary.js");

test("home market close renders a bound VN-Index and refuses a constituent average", () => {
  const html = home.marketCloseHtml({
    as_of_session: "2026-11-09",
    market_close: {
      contract_version: "market_close_intelligence/v1",
      session: "2026-11-09",
      benchmark_index: { status: "AVAILABLE", close: 1725.36, change_points: -15.37, change_percent: -0.88, authority: "DNSE_CURRENT_STATE_REPUBLISHED_INDEX_NOT_HOSE_ADMINISTRATOR" },
      breadth: { status: "AVAILABLE", denominator: 909, advancing: 262, declining: 424, unchanged: 223 },
      sectors: { status: "AVAILABLE", groups_with_more_decliners_than_advancers: 17, weakening: ["bank"] },
      liquidity_status: "UNAVAILABLE",
      foreign_flow_status: "UNAVAILABLE",
      macro_usable_axes: ["GLOBAL_RATES"],
    },
  });
  assert.match(html, /1\.725,36/);
  assert.match(html, /Không phải số liệu HOSE/);
  assert.match(html, /909/);
  assert.match(html, /bank/);
  assert.match(html, /Thanh khoản sàn: UNAVAILABLE/);
});

test("home market close without a same-session block does not invent an index", () => {
  const html = home.marketCloseHtml({ as_of_session: "2026-11-06" });
  assert.match(html, /Không suy chỉ số từ giá từng mã/);
  assert.doesNotMatch(html, /1\.725/);
});
