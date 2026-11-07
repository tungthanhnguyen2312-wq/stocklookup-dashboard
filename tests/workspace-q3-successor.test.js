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

test("POW shows reconciled comparative rows and withholds the one-dong income columns", () => {
  const record = {
    research_kind: "COMPARATIVE_INCOME_AND_OPERATING_CASH_FLOW",
    official_fact_admitted: false,
    valuation_use: "CLOSED",
    session_binding: "NOT_A_SEALED_SESSION_FACT",
    common_shareholder_pb: "UNAVAILABLE",
    issuer_disclosure_date: "2026-10-30",
    sha256: "c423af37737c4fb9ec1df98ff7b0145488f103a9667db5215aacd848ac12bcfb",
    source_url: "https://staticfile.hsx.vn/Uploads/UploadDocuments/2510748/20261030%20-%20POW%20-%20BCTC%20HN%20Q3.2026.pdf",
    operating_cash_flow_yoy_pct: -19.78,
    rejected_income_columns: {
      "2026-Q3": ["LINE_60_DOES_NOT_FOOT_61_PLUS_62"],
      "2026-9M": ["LINE_60_DOES_NOT_FOOT_50_MINUS_51_MINUS_52"],
    },
    observations: [
      { metric: "revenue", period: "2025-Q3", value: 7855188738891, unit: "VND", pdf_page: 8 },
      { metric: "operating_cash_flow", period: "2026-9M", value: 2738981106106, unit: "VND", pdf_page: 10 },
      { metric: "operating_cash_flow", period: "2025-9M", value: 3414230602443, unit: "VND", pdf_page: 10 },
    ],
  };
  const html = ws.q3SuccessorHtml(record);
  assert.match(html, /2\.738\.981\.106\.106/);
  assert.match(html, /3\.414\.230\.602\.443/);
  assert.match(html, /-19,78%/);
  assert.match(html, /lệch 1 đồng/);
  assert.match(html, /data-valuation-use="CLOSED"/);
  assert.match(html, /data-official-fact="false"/);
  assert.doesNotMatch(html, /2\.073\.116\.246\.766/);
  assert.equal(ws.q3SuccessorHtml({ ...record, valuation_use: "AVAILABLE" }), "");
});

test("EVF reviewed nine-month rows stay on the finance-company scope", () => {
  const q3Successor = require("../data/q3_successor_research.json");
  const record = ws.q3SuccessorFor({ q3Successor }, "EVF");
  const html = ws.decisionCardHtml({ ticker: "EVF" }, { ticker: "EVF", q3Successor });
  assert.equal(record.observations.length, 16);
  assert.equal(record.entity_class, "finance_company");
  assert.equal(record.commercial_bank, false);
  assert.equal(record.standalone_quarter_column, false);
  assert.equal(record.official_fact_admitted, false);
  assert.match(html, /triệu đồng/);
  assert.match(html, /không phải ngân hàng thương mại/);
  assert.match(html, /Không tính/);
  assert.match(html, /data-valuation-use="CLOSED"/);
  assert.equal(record.valuation_use, "CLOSED");
});

test("SSI consolidated rows stay securities research", () => {
  const q3Successor = require("../data/q3_successor_research.json");
  const record = ws.q3SuccessorFor({ q3Successor }, "SSI");
  const html = ws.decisionCardHtml({ ticker: "SSI" }, { ticker: "SSI", q3Successor });
  assert.equal(record.entity_class, "securities");
  assert.equal(record.official_fact_admitted, false);
  assert.equal(record.official_store_adoption, "REFUSED");
  assert.equal(record.observations.length, 17);
  assert.match(html, /công ty chứng khoán/);
  assert.match(html, /348\.933\.594\.669/);
  assert.match(html, /Không tính/);
  assert.match(html, /data-official-fact="false"/);
  assert.equal(q3Successor.official_fact_admitted_count, 0);
});

test("the published POW artifact stays research-only", () => {
  const q3Successor = require("../data/q3_successor_research.json");
  const record = ws.q3SuccessorFor({ q3Successor }, "POW");
  const html = ws.decisionCardHtml({ ticker: "POW" }, { ticker: "POW", q3Successor });
  assert.equal(record.observations.length, 12);
  assert.match(html, /Phải trả thương mại PV GAS/);
  assert.match(html, /không gọi phần chênh lệch là tiền đã thu/);
  assert.equal(record.official_fact_admitted, false);
  assert.equal(q3Successor.official_fact_admitted_count, 0);
  assert.match(html, /2\.738\.981\.106\.106/);
  assert.match(html, /data-valuation-use="CLOSED"/);
});

test("durability claims keep fact, derivation, inference and unknown apart", () => {
  const q3Successor = require("../data/q3_successor_research.json");
  const forbidden = /giá mục tiêu|khuyến nghị mua|khuyến nghị bán|BUY|SELL/;
  for (const ticker of ["PAN", "SSI", "POW", "EVF"]) {
    const block = ws.q3SuccessorHtml(ws.q3SuccessorFor({ q3Successor }, ticker));
    const card = ws.decisionCardHtml({ ticker }, { ticker, q3Successor });
    for (const kind of ["FACT", "DERIVATION", "INFERENCE", "UNKNOWN", "CONDITION"]) {
      assert.match(block, new RegExp(`data-claim-class="${kind}"`));
    }
    assert.doesNotMatch(block, forbidden);
    assert.match(block, /data-official-fact="false"/);
    assert.match(card, /q3-claim-list/);
  }
  const pan = ws.q3SuccessorHtml(ws.q3SuccessorFor({ q3Successor }, "PAN"));
  assert.match(pan, /chưa đo chênh lệch thanh khoản hợp nhất/);
  assert.match(pan, /-619\.520\.988\.619/);
  const pow = ws.q3SuccessorHtml(ws.q3SuccessorFor({ q3Successor }, "POW"));
  assert.match(pow, /chưa có tỷ lệ chuyển lợi nhuận thành tiền/);
  assert.match(pow, /Không cộng/);
  const ssi = ws.q3SuccessorHtml(ws.q3SuccessorFor({ q3Successor }, "SSI"));
  assert.match(ssi, /Chưa có dòng tiền kinh doanh/);
  const evf = ws.q3SuccessorHtml(ws.q3SuccessorFor({ q3Successor }, "EVF"));
  assert.match(evf, /Chưa có dư nợ, nợ xấu/);
  assert.match(evf, /không phải bằng chứng lợi nhuận cốt lõi mạnh hơn/);
});

test("PAN retained observations display in the decision card with closed comparator authority", () => {
  const q3Successor = require("../data/q3_successor_research.json");
  const record = ws.q3SuccessorFor({ q3Successor }, "PAN");
  const html = ws.decisionCardHtml({ ticker: "PAN" }, { ticker: "PAN", q3Successor });
  assert.equal(record.observations.length, 23);
  assert.match(html, /thuyết minh bộ phận/);
  assert.match(html, /BCTC riêng/);
  assert.match(html, /19\.968\.968\.615/);
  assert.doesNotMatch(html, /963\.087\.575\.991/);
  assert.match(html, /0,7621×/);
  assert.match(html, /619\.520\.988\.619/);
  assert.match(html, /561\.507\.166\.021/);
  assert.match(html, /data-valuation-use="CLOSED"/);
  assert.match(html, /9 tháng không qua kiểm tra cộng ngang/);
  assert.match(html, /staticfile\.hsx\.vn/);
  assert.equal(ws.q3SuccessorHtml({ ...record, valuation_use: "AVAILABLE" }), "");
});
