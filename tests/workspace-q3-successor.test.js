const test = require("node:test");
const assert = require("node:assert/strict");
const ws = require("../assets/js/investment-workspace.js");

const artifact = {
  contract_version: "q3_2026_successor_research/v1",
  session_binding: "NOT_A_SEALED_SESSION_FACT",
  official_fact_admitted_count: 0,
  issuers: {
    HPG: {
      official_fact_admitted: false,
      host: "file.hoaphat.com.vn",
      sha256: "22a4061c9816d11121816377ea78ae99cf68928a75aa8bdcb15e7ded1bbf5ec9",
      shadow_rows: [
        { canonical_metric: "revenue", reporting_period: "2026-Q3", value_vnd: 62214187236976 },
        { canonical_metric: "revenue", reporting_period: "2026-9M", value_vnd: 170273936838530 },
      ],
    },
    PAN: {
      common_shareholder_pb: "UNAVAILABLE",
      missing: ["PARENT_EQUITY_NOT_ADMITTED", "NO_EXACT_OFFICIAL_Q3_STATEMENT_URL"],
      earnings_quality: { reason_codes: ["DISPOSAL_INCOME_NOT_ADMITTED"] },
    },
  },
};

test("HPG shadow rows render as research and not as an official fact", () => {
  const html = ws.q3SuccessorHtml(ws.q3SuccessorFor({ q3Successor: artifact }, "HPG"));
  assert.match(html, /data-official-fact="false"/);
  assert.match(html, /62\.214\.187\.236\.976/);
  assert.match(html, /không phải quý riêng/);
  assert.match(html, /không phải fact chính thức/);
  assert.doesNotMatch(html, /official_fact_admitted": true/);
});

test("PAN stays fail-closed with the missing inputs", () => {
  const html = ws.q3SuccessorHtml(ws.q3SuccessorFor({ q3Successor: artifact }, "PAN"));
  assert.match(html, /PARENT_EQUITY_NOT_ADMITTED/);
  assert.match(html, /DISPOSAL_INCOME_NOT_ADMITTED/);
  assert.match(html, /EPS chuẩn hóa/);
});

test("a promoted official count is not displayed", () => {
  const promoted = { ...artifact, official_fact_admitted_count: 1 };
  assert.equal(ws.q3SuccessorFor({ q3Successor: promoted }, "HPG"), null);
});
