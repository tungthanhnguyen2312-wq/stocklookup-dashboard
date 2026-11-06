"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const signalsSource = fs.readFileSync(path.join(root, "assets", "js", "signals-product.js"), "utf8");
const patterns = fs.readFileSync(path.join(root, "assets", "js", "candlestick-patterns.js"), "utf8");
const signals = require(path.join(root, "assets", "js", "signals-product.js"));
const buildInfo = JSON.parse(fs.readFileSync(path.join(root, "data", "build_info.json"), "utf8"));
const workspace = JSON.parse(fs.readFileSync(path.join(root, "data", "workspace_index.json"), "utf8"));
const screener = JSON.parse(fs.readFileSync(path.join(root, "data", "screener_master_projection.json"), "utf8"));

test("Signals UI exposes unavailable exact-session evidence instead of silently rendering it", () => {
  assert.match(signalsSource, /classifySidecarAvailability/);
  assert.match(signalsSource, /OPTIONAL_CANDLE_SIGNAL_SIDECAR_UNAVAILABLE|SIGNAL_SOURCE_SESSION_MISMATCH/);
  assert.match(signalsSource, /Chưa có dữ liệu mẫu hình nến phù hợp cho phiên hiện tại/);
});

test("Candlestick fallback is guarded by the published component state", () => {
  assert.match(patterns, /components\.candlestick_patterns/);
  assert.match(patterns, /component\.status !== "CURRENT" && component\.status !== "STALE"/);
});

// TACTICAL_SESSION_DATE_AND_FRESHNESS_CONVERGENCE_V1 regression coverage below: the tactical
// decision table (#tactical-table, fed by data/investment_decision_workspace.json) and the
// candle/SMC sidecars (data/candlestick_patterns.json etc.) are separate freshness components.
// A stale candle sidecar must never downgrade the tactical table, and a missing/absent sidecar
// attestation must never be silently treated as current.

test("classifySidecarAvailability fails closed when build_info carries no component metadata", () => {
  // httpOk=true (the file fetched) but component=null (no published freshness attestation) must
  // never resolve to session-compatible -- that would let a stale file on disk render as current
  // purely because it happened to still be reachable.
  const result = signals.classifySidecarAvailability(true, null, "2026-09-11");
  assert.equal(result.status, "ABSENT_FROM_PUBLICATION");
  assert.equal(result.code, signals.SIDECAR_UNAVAILABLE);
});

test("classifySidecarAvailability marks an older candle component session-stale against the release session", () => {
  const stale = signals.classifySidecarAvailability(true, { status: "STALE", source_session: "2026-08-25", reason_codes: ["SIGNAL_SOURCE_SESSION_MISMATCH"] }, "2026-09-11");
  assert.equal(stale.status, "PRESENT_BUT_STALE");
  assert.equal(stale.code, "SIGNAL_SOURCE_SESSION_MISMATCH");
  const current = signals.classifySidecarAvailability(true, { status: "CURRENT", source_session: "2026-09-11" }, "2026-09-11");
  assert.equal(current.status, "PRESENT_AND_SESSION_COMPATIBLE");
});

test("an unattested candle sidecar never appears in the same domain as the tactical table's own data source", () => {
  // Two valid published states: no candle attestation (sidecar absent-from-publication), or the
  // Producer's post-Daily current_session_candlestick_projection attested CURRENT for exactly
  // this market session (engine #221/#223). Anything in between must never classify as current,
  // and the candle component is never the tactical table's own (Workspace) data source.
  const signalComponent = buildInfo.domains && buildInfo.domains.signals && buildInfo.domains.signals.components
    ? buildInfo.domains.signals.components.candlestick_patterns : null;
  const sidecar = signals.classifySidecarAvailability(true, signalComponent, buildInfo.market_session);
  if (!signalComponent) {
    assert.equal(sidecar.status, "ABSENT_FROM_PUBLICATION");
  } else if (sidecar.status === "PRESENT_AND_SESSION_COMPATIBLE") {
    assert.equal(signalComponent.status, "CURRENT");
    assert.equal(signalComponent.source_session, buildInfo.market_session);
    assert.match(String(signalComponent.projection_identity || ""), /^current_session_candlestick_projection\/v1:/);
    const sidecarPayload = JSON.parse(fs.readFileSync(path.join(root, "data", "candlestick_patterns.json"), "utf8"));
    assert.equal(sidecarPayload.projection_identity, signalComponent.projection_identity);
    assert.equal(sidecarPayload.source_session, buildInfo.market_session);
  } else {
    assert.notEqual(signalComponent.status, "CURRENT");
  }
  assert.notEqual(buildInfo.investment_workspace, signalComponent);
});

test("row-level tactical freshness ignores candle sidecar staleness entirely", () => {
  // records()/freshness() derive purely from each card's own lineage.per_axis_freshness -- never
  // from buildInfo.domains.signals (the candle/SMC component state). Prove this both structurally
  // (the freshness computation never references buildInfo) and behaviorally (a row with every
  // axis CURRENT reports CURRENT even though the candle sidecars are STALE in this same release).
  assert.doesNotMatch(signalsSource.slice(0, signalsSource.indexOf("function renderCandlePanel")), /BUILD_INFO/);
  const allCurrentTicker = Object.keys(workspace.cards).find((ticker) => {
    const freshnessMap = workspace.cards[ticker].lineage?.per_axis_freshness || {};
    return Object.values(freshnessMap).length > 0 && Object.values(freshnessMap).every((v) => v === "CURRENT");
  });
  if (allCurrentTicker) {
    const row = signals.records(workspace).find((r) => r.ticker === allCurrentTicker);
    assert.equal(row.freshness, "CURRENT");
  }
});

test("build_info Workspace and canonical Screener remain exact-session coherent", () => {
  // `investment_workspace` is the current top-level publication envelope.  Do not require the
  // retired domains/components schema: its absence is a fail-closed sidecar condition above.
  assert.equal(buildInfo.investment_workspace.status, "CURRENT");
  assert.equal(buildInfo.investment_workspace.source_session, buildInfo.market_session);
  assert.equal(buildInfo.investment_workspace.artifact_identity, workspace.source_artifact_identity);
  assert.equal(workspace.as_of_session, buildInfo.market_session);
  // The canonical Producer now materializes Investment Workspace and Screener Master together
  // from the same exact-session retained input set, so same-session coherence is the current
  // positive invariant -- a lagging Screener session would be a release/coherence defect, not
  // an expected condition.
  assert.ok(screener.artifact_identity);
  assert.equal(screener.as_of_session, buildInfo.market_session);
});

test("no dashboard source infers a session date from a filename or file mtime", () => {
  const jsDir = path.join(root, "assets", "js");
  for (const file of fs.readdirSync(jsDir)) {
    if (!file.endsWith(".js")) continue;
    const source = fs.readFileSync(path.join(jsDir, file), "utf8");
    assert.doesNotMatch(source, /\.mtime\b|birthtime|statSync/, `${file} must not infer freshness from filesystem timestamps`);
  }
});
