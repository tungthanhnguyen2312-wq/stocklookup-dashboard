#!/usr/bin/env node
"use strict";
// Codex F4: local release binding for the current-session candlestick sidecar.
// Proves, before and independently of public-byte proof, that
//   build_info.json == build_info.js payload,
//   candlestick_patterns.json == candlestick_patterns.js payload (canonical JSON),
//   and the payload is the exact projection the CURRENT component attests
//   (session, projection identity, source snapshot identity, scanned count).
// Prints the files the public-byte proof must cover. Exit 0 = bound or component not CURRENT
// (then nothing candlestick is claimed); exit 1 = mismatch (refuse the release).
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function scriptPayload(file, globalName) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file, timeout: 60000 });
  return sandbox.window[globalName];
}

function verify(root) {
  const errors = [];
  const at = (rel) => path.join(root, rel);
  const buildInfo = JSON.parse(fs.readFileSync(at("data/build_info.json"), "utf8"));
  const proofFiles = ["data/build_info.js"];
  const buildInfoJs = fs.existsSync(at("data/build_info.js")) ? scriptPayload(at("data/build_info.js"), "STOCK_LOOKUP_BUILD_INFO") : null;
  if (!buildInfoJs || canonical(buildInfoJs) !== canonical(buildInfo)) errors.push("BUILD_INFO_JS_JSON_PARITY_FAILED");
  const component = buildInfo && buildInfo.domains && buildInfo.domains.signals &&
    buildInfo.domains.signals.components && buildInfo.domains.signals.components.candlestick_patterns;
  if (!component || component.status !== "CURRENT") {
    return { status: errors.length ? "REFUSED" : "NOT_CLAIMED", errors, proofFiles, component_status: component ? component.status : null };
  }
  proofFiles.push("data/candlestick_patterns.json", "data/candlestick_patterns.js", "signals.html",
    "assets/js/candlestick-patterns.js", "assets/js/signals-product.js", "assets/js/investment-workspace.js");
  let payload = null;
  try { payload = JSON.parse(fs.readFileSync(at("data/candlestick_patterns.json"), "utf8")); }
  catch (_) { errors.push("CANDLESTICK_JSON_MISSING_OR_INVALID"); }
  let payloadJs = null;
  try { payloadJs = scriptPayload(at("data/candlestick_patterns.js"), "CANDLESTICK_PATTERNS"); }
  catch (_) { errors.push("CANDLESTICK_JS_MISSING_OR_INVALID"); }
  if (payload && payloadJs && canonical(payload) !== canonical(payloadJs)) errors.push("CANDLESTICK_JS_JSON_PARITY_FAILED");
  if (payload) {
    const session = buildInfo.market_session;
    if (!component.source_session || component.source_session !== session) errors.push("COMPONENT_SESSION_NOT_MARKET_SESSION");
    if (payload.source_session !== component.source_session || payload.scan_date !== component.source_session) errors.push("PAYLOAD_SESSION_MISMATCH");
    if (!component.projection_identity || payload.projection_identity !== component.projection_identity) errors.push("PROJECTION_IDENTITY_MISMATCH");
    if (component.source_snapshot_identity &&
      !(payload.source && payload.source.snapshot_identity === component.source_snapshot_identity)) errors.push("SOURCE_SNAPSHOT_IDENTITY_MISMATCH");
    if (typeof component.scanned_count === "number" &&
      !(payload.coverage && payload.coverage.scanned_count === component.scanned_count)) errors.push("SCANNED_COUNT_MISMATCH");
  }
  return {
    status: errors.length ? "REFUSED" : "BOUND",
    errors, proofFiles,
    component_status: component.status,
    source_session: component.source_session,
    projection_identity: component.projection_identity || null,
  };
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || ".");
  const listOnly = process.argv.includes("--proof-files");
  let result;
  try { result = verify(root); } catch (error) { result = { status: "REFUSED", errors: [String(error && error.message || error)], proofFiles: [] }; }
  if (listOnly) {
    if (result.status === "REFUSED") { console.error(JSON.stringify(result)); process.exit(1); }
    process.stdout.write(result.proofFiles.join("\n") + "\n");
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  process.exit(result.status === "REFUSED" ? 1 : 0);
}

module.exports = { verify, canonical };
