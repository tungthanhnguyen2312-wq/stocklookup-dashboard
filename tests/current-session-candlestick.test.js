"use strict";

// CURRENT_SESSION_CANDLESTICK_PROJECTION_V1: the fixture is the real Producer bridge output for
// session 2026-11-05 (HPG/PAN/SSI/EVF/POW + AAA scanned, A32 excluded: no exact-session bar).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const signals = require(path.join(root, "assets", "js", "signals-product.js"));
const cpx = require(path.join(root, "assets", "js", "candlestick-patterns.js")).currentProjection;
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "candlestick-current-20261105", "candlestick_patterns.json"), "utf8"));
const SESSION = "2026-11-05";
const ATTESTED = Object.freeze({
  status: "CURRENT", source_session: SESSION, freshness: "EXACT_SESSION",
  projection_identity: fixture.projection_identity,
  source_snapshot_identity: fixture.source.snapshot_identity,
  scanned_count: fixture.coverage.scanned_count, reason_codes: [],
});
const visible = (html) => html.replace(/<details[\s\S]*?<\/details>/g, "").replace(/<[^>]+>/g, " ");

test("current-session projection renders for the attested session with the five focus tickers", () => {
  assert.equal(cpx.isCurrentCandleSnapshot(fixture, SESSION), true);
  const html = signals.renderCompatiblePatterns(fixture, SESSION, null, ATTESTED);
  for (const ticker of ["HPG", "PAN", "SSI", "EVF", "POW"]) {
    assert.match(html, new RegExp(`data-ticker="${ticker}"`));
  }
  assert.match(html, /RSI14/);
  assert.match(html, /SMA50/);
  assert.match(html, /Bollinger/);
  assert.match(html, /ATR14/);
  assert.match(html, /Điều kiện vô hiệu/);
  assert.match(html, /Đang hình thành \(kỳ chưa đóng\)/);
  assert.match(html, /không phải tín hiệu mua\/bán/);
  // No 1D pattern closed on 2026-11-05 for these tickers: say so instead of showing older rows.
  assert.match(html, /Không có mẫu hình nến ngày đã đóng ở phiên này/);
});

test("excluded ticker shows its reason, not an empty or zero state", () => {
  const html = cpx.focusTickerHtml(fixture, "A32");
  assert.match(html, /data-candle-status="EXCLUDED"/);
  assert.match(visible(html), /Không có nến đúng phiên/);
});

test("a ticker requested by query string is shown first", () => {
  const html = signals.renderCompatiblePatterns(fixture, SESSION, "AAA", ATTESTED);
  assert.ok(html.indexOf('data-ticker="AAA"') < html.indexOf('data-ticker="HPG"'));
});

test("stale or legacy payloads never render as current", () => {
  assert.equal(cpx.isCurrentCandleSnapshot(fixture, "2026-11-06"), false);
  const stale = signals.renderCompatiblePatterns(fixture, "2026-11-06", null, ATTESTED);
  assert.match(stale, /data-candle-availability="unavailable"/);
  const legacy = { schema_version: 1, scan_date: SESSION, patterns: [], registry: {} };
  assert.equal(cpx.isCurrentCandleSnapshot(legacy, SESSION), false);
  assert.match(signals.renderCompatiblePatterns(legacy, SESSION, null, ATTESTED), /data-candle-availability="unavailable"/);
});

test("published component gate still decides before the payload is read", () => {
  const absent = signals.classifySidecarAvailability(true, null, SESSION);
  assert.equal(absent.status, "ABSENT_FROM_PUBLICATION");
  const stale = signals.classifySidecarAvailability(true, { status: "STALE", source_session: "2026-11-04", reason_codes: ["SIGNAL_SOURCE_SESSION_MISMATCH"] }, SESSION);
  assert.equal(stale.status, "PRESENT_BUT_STALE");
  const current = signals.classifySidecarAvailability(true, { status: "CURRENT", source_session: SESSION }, SESSION);
  assert.equal(current.status, "PRESENT_AND_SESSION_COMPATIBLE");
});

test("invalidation wording follows the pattern direction", () => {
  assert.match(cpx.invalidationText({ rule: "CLOSE_BELOW_PATTERN_LOW", level: 11.9 }), /dưới 11,9/);
  assert.match(cpx.invalidationText({ rule: "CLOSE_ABOVE_PATTERN_HIGH", level: 12.05 }), /trên 12,05/);
  assert.equal(cpx.invalidationText(null), "—");
});

test("Cơ hội reads the attested current projection before the legacy candle_signals file", () => {
  const source = fs.readFileSync(path.join(root, "assets", "js", "investment-workspace.js"), "utf8");
  const current = source.indexOf("cpx.componentIsCurrent(window.BUILD_INFO, WORKSPACE.as_of_session)");
  const legacy = source.indexOf('fetch("data/candle_signals.json"');
  assert.ok(current > 0 && legacy > current);
  assert.match(source, /investment-workspace\.html\?view=technical&amp;ticker=/);
});

test("componentIsCurrent requires CURRENT for the exact session", () => {
  const bi = (status, session) => ({ domains: { signals: { components: { candlestick_patterns: { status, source_session: session } } } } });
  assert.equal(cpx.componentIsCurrent(bi("CURRENT", SESSION), SESSION), true);
  assert.equal(cpx.componentIsCurrent(bi("CURRENT", "2026-11-04"), SESSION), false);
  assert.equal(cpx.componentIsCurrent(bi("STALE", SESSION), SESSION), false);
  assert.equal(cpx.componentIsCurrent({}, SESSION), false);
  assert.equal(cpx.componentIsCurrent(null, SESSION), false);
});

test("P/B research-proxy value renders with its research label (engine PR #222)", () => {
  const ws = require(path.join(root, "assets", "js", "investment-workspace.js"));
  const card = {
    valuation: { method_diagnostics: {
      "P/B": { availability_state: "NOT_AVAILABLE", status: "INPUT_BLOCKED", blocker_reason_codes: ["X"], value: null },
      "P/B_CURRENT_RESEARCH": { availability_state: "AVAILABLE_REFERENCE_ONLY", status: "RESEARCH_USABLE", share_basis: "CURRENT_SHARE_RESEARCH_PROXY", limitations: ["CURRENT_RESEARCH_ONLY"], value: 0.4473 },
    } },
    display_metrics: { pb: { display_state: "AVAILABLE", value: 0.4473, basis: "RESEARCH_PROXY" } },
  };
  const html = ws.investorMetricsGridHtml(card, { displayMetricCatalog: { pb: { label: "P/B" } } }, ["pb"], "Định giá");
  assert.match(html, /0,4473x/);
  assert.match(html, /Proxy nghiên cứu|tham khảo nghiên cứu/);
  assert.doesNotMatch(html, /Bị chặn/);
});

test("a week/month closed on the session is labelled confirmed, never as forming (Friday 2026-11-06)", () => {
  const friday = JSON.parse(JSON.stringify(fixture));
  friday.tickers.SSI = Object.assign({}, friday.tickers.SSI, { status: "CONFIRMED_HIGHER_TIMEFRAME_ON_SESSION" });
  const html = cpx.focusTickerHtml(friday, "SSI");
  assert.match(html, /data-candle-status="CONFIRMED_HIGHER_TIMEFRAME_ON_SESSION"/);
  assert.match(visible(html), /mẫu hình tuần\/tháng đã đóng kỳ ở phiên này/);
  assert.doesNotMatch(visible(html), /Chỉ có mẫu hình tuần\/tháng đang hình thành/);
});

// Codex F3 regressions: identity binding, not just session equality.
const unavailable = /data-candle-availability="unavailable"/;

test("same_session_different_projection_identity_is_unavailable", () => {
  const other = Object.assign({}, ATTESTED, { projection_identity: "current_session_candlestick_projection/v1:" + "0".repeat(64) });
  assert.equal(cpx.snapshotBindsComponent(fixture, other, SESSION), false);
  const html = signals.renderCompatiblePatterns(fixture, SESSION, null, other);
  assert.match(html, unavailable);
  assert.match(html, /CANDLESTICK_PROJECTION_IDENTITY_NOT_ATTESTED/);
  assert.doesNotMatch(html, /data-ticker="HPG"/);
});

test("right projection but wrong source snapshot is unavailable", () => {
  const other = Object.assign({}, ATTESTED, { source_snapshot_identity: "p3f9_exact_session_snapshot:" + "f".repeat(64) });
  assert.equal(cpx.snapshotBindsComponent(fixture, other, SESSION), false);
  assert.match(signals.renderCompatiblePatterns(fixture, SESSION, null, other), unavailable);
});

test("stale component never renders as CURRENT even with matching identity", () => {
  const stale = Object.assign({}, ATTESTED, { status: "STALE" });
  assert.equal(cpx.snapshotBindsComponent(fixture, stale, SESSION), false);
  assert.match(signals.renderCompatiblePatterns(fixture, SESSION, null, stale), unavailable);
});

test("valid exact match renders", () => {
  assert.equal(cpx.snapshotBindsComponent(fixture, ATTESTED, SESSION), true);
  assert.doesNotMatch(signals.renderCompatiblePatterns(fixture, SESSION, null, ATTESTED), unavailable);
});

test("missing_identity_is_unavailable on either side and does not throw", () => {
  const noComponentId = Object.assign({}, ATTESTED); delete noComponentId.projection_identity;
  assert.equal(cpx.snapshotBindsComponent(fixture, noComponentId, SESSION), false);
  assert.equal(cpx.snapshotBindsComponent(fixture, null, SESSION), false);
  assert.match(signals.renderCompatiblePatterns(fixture, SESSION, null, undefined), unavailable);
  const noPayloadId = JSON.parse(JSON.stringify(fixture)); delete noPayloadId.projection_identity;
  assert.equal(cpx.snapshotBindsComponent(noPayloadId, ATTESTED, SESSION), false);
  const scanned = Object.assign({}, ATTESTED, { scanned_count: ATTESTED.scanned_count + 1 });
  assert.equal(cpx.snapshotBindsComponent(fixture, scanned, SESSION), false);
});

test("fallback_payload_must_match_attested_identity through the real loader", async () => {
  const saved = { window: global.window, document: global.document, fetch: global.fetch };
  const mod = path.join(root, "assets", "js", "candlestick-patterns.js");
  try {
    const mismatched = JSON.parse(JSON.stringify(fixture));
    mismatched.projection_identity = "current_session_candlestick_projection/v1:" + "1".repeat(64);
    // readyState "loading": init() waits for DOMContentLoaded, which never fires here.
    global.document = { readyState: "loading", head: { appendChild(node) { global.window.CANDLESTICK_PATTERNS = mismatched; node.onload && node.onload(); } },
      createElement() { return {}; }, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
      addEventListener() {} };
    global.window = { location: { protocol: "https:", search: "" }, BUILD_INFO: { domains: { signals: { components: { candlestick_patterns: ATTESTED } } } } };
    global.fetch = async () => ({ ok: true, json: async () => mismatched });
    delete require.cache[require.resolve(mod)];
    require(mod);
    const api = global.window.VSCandlestickPatterns;
    assert.ok(api && api.loadSnapshot);
    await assert.rejects(() => api.loadSnapshot());
    global.fetch = async () => ({ ok: true, json: async () => fixture });
    const ok = await api.loadSnapshot();
    assert.equal(ok.projection_identity, ATTESTED.projection_identity);
  } finally {
    Object.assign(global, saved);
    delete require.cache[require.resolve(mod)];
  }
});

test("Cơ hội refuses a mismatched projection instead of falling back to the legacy file", () => {
  const source = fs.readFileSync(path.join(root, "assets", "js", "investment-workspace.js"), "utf8");
  const bind = source.indexOf("cpx.snapshotBindsComponent(current, cpx.candleComponent(window.BUILD_INFO), WORKSPACE.as_of_session)");
  const legacy = source.indexOf('fetch("data/candle_signals.json"');
  assert.ok(bind > 0 && legacy > bind);
  assert.match(source.slice(bind, legacy), /CANDLESTICK_PROJECTION_IDENTITY_NOT_ATTESTED[\s\S]*?return;/);
});
