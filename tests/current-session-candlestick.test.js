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
const visible = (html) => html.replace(/<details[\s\S]*?<\/details>/g, "").replace(/<[^>]+>/g, " ");

test("current-session projection renders for the attested session with the five focus tickers", () => {
  assert.equal(cpx.isCurrentCandleSnapshot(fixture, SESSION), true);
  const html = signals.renderCompatiblePatterns(fixture, SESSION, null);
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
  const html = signals.renderCompatiblePatterns(fixture, SESSION, "AAA");
  assert.ok(html.indexOf('data-ticker="AAA"') < html.indexOf('data-ticker="HPG"'));
});

test("stale or legacy payloads never render as current", () => {
  assert.equal(cpx.isCurrentCandleSnapshot(fixture, "2026-11-06"), false);
  const stale = signals.renderCompatiblePatterns(fixture, "2026-11-06", null);
  assert.match(stale, /data-candle-availability="unavailable"/);
  const legacy = { schema_version: 1, scan_date: SESSION, patterns: [], registry: {} };
  assert.equal(cpx.isCurrentCandleSnapshot(legacy, SESSION), false);
  assert.match(signals.renderCompatiblePatterns(legacy, SESSION, null), /data-candle-availability="unavailable"/);
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
