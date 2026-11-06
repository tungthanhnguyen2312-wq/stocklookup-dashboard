"use strict";
/* Post-publication smoke over the artifacts this repository actually serves.
 *
 * Every other test in this directory runs against fixtures. This one runs against the
 * committed analysis_bundle.json / bundle_manifest.json, so it fails when a release lands
 * that the panel would render wrongly or that does not verify against its own manifest.
 * It asserts what the published release must never do -- show a score for a filer the
 * model excludes, present historical multiples as current, claim actionable output on an
 * unverified price basis -- and renders the real entries through the real panel functions.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const panel = require("../assets/js/company-panel.js");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, name), "utf8"));
}
function sha256(name) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, name))).digest("hex");
}

const bundle = readJson("analysis_bundle.json");
const manifest = readJson("bundle_manifest.json");
const proof = manifest.trusted_subset;
const entryFor = (ticker) => (bundle.tickers || {})[ticker];

test("the published release verifies against its own manifest", () => {
  assert.equal(proof.bundle_sha256, sha256("analysis_bundle.json"));
  assert.equal(proof.bundle_reference_session_date, bundle.reference_session_date);
  assert.equal(proof.bundle_generated_at, bundle.generated_at);
  assert.equal(manifest.generated_at, bundle.generated_at);
  for (const artifact of proof.required_artifacts) {
    assert.ok(fs.existsSync(path.join(ROOT, artifact.file)), `${artifact.file} is not published`);
    assert.equal(sha256(artifact.file), artifact.sha256, `${artifact.file} differs from the manifest`);
  }
});

test("current-market analytics stay fail-closed on an unverified price basis", () => {
  assert.equal(bundle.is_actionable, false);
  assert.equal(bundle.price_basis_verified, false);
  assert.equal(bundle.volume_basis_verified, false);
  assert.notEqual(proof.trust_state, "exact_session_qualified");
  for (const [ticker, entry] of Object.entries(bundle.tickers || {})) {
    const methods = (entry.relative_valuation || {}).methods || {};
    for (const [name, method] of Object.entries(methods)) {
      if (method.state !== "available") continue;
      assert.equal(method.historical_only, true, `${ticker}.${name} is presented as current`);
      assert.ok(method.price_as_of_date, `${ticker}.${name} has no price date`);
    }
  }
});

test("no financial institution receives an Altman score", () => {
  const financial = new Set(["bank", "securities", "insurance", "finance_company", "credit_institution"]);
  for (const [ticker, entry] of Object.entries(bundle.tickers || {})) {
    if (!financial.has(entry.entity_type)) continue;
    const distress = entry.financial_distress_evidence || {};
    assert.equal(distress.status, "not_applicable", `${ticker} should be not_applicable`);
    assert.equal(distress.score, null, `${ticker} was given a distress score`);
    const html = panel.renderFinancialDistress(distress, entry.statement_taxonomy_evidence);
    assert.doesNotMatch(html, /Điểm Z'/, `${ticker} rendered a score`);
    assert.match(html, /Không áp dụng/);
    assert.doesNotMatch(html, /not_applicable/);
  }
});

// These two tests deliberately do not hardcode which ticker carries which Altman
// status: a specific ticker's evidence sufficiency is a fact about the currently
// retained/verified citation store, not a stable identity of the ticker itself. HPG
// and VNM originally qualified (2026-08-01, docs/altman_z_prime_qualification.md) from
// current_liabilities/retained_earnings citations plus EBITDA components tied to
// evidence_id a7c3711d...ddcd2a8; that evidence_id is no longer present in the current
// manifest.json (superseded by the 2026-08-09 bounded legacy-cohort recovery, which
// restored a different five-fact set for a different, narrower contract), so every one
// of the 8 identities altman_z_score.py requires is honestly absent and
// insufficient_evidence is the correct, fail-closed result -- not a bug to work around.
test("Altman Z-prime renders a score exactly when the model itself reports one available", (t) => {
  const withScore = Object.entries(bundle.tickers || {}).filter(([, entry]) =>
    (entry.financial_distress_evidence || {}).status === "available");
  if (withScore.length === 0) {
    t.skip("no ticker in this release currently has a qualified Altman Z-prime result");
    return;
  }
  for (const [ticker, entry] of withScore) {
    const distress = entry.financial_distress_evidence;
    assert.equal(distress.variant, "altman_z_prime_1983_private_firm", `${ticker} variant`);
    assert.equal(typeof distress.score, "number", `${ticker} score`);
    assert.ok(["distress", "grey", "safe"].includes(distress.zone), `${ticker} unexpected zone ${distress.zone}`);
    const html = panel.renderFinancialDistress(distress, entry.statement_taxonomy_evidence);
    assert.match(html, /Điểm Z'/, `${ticker} did not render a score`);
    assert.match(html, /altman_z_prime_1983_private_firm/, `${ticker} did not render its variant`);
    assert.match(html, /không phải là xác suất phá sản/i);
    // The near-threshold warning is rendered exactly when the model itself flagged
    // proximity, never inferred by the test from the raw score.
    const proximity = distress.zone_proximity || {};
    if (proximity.near_threshold) assert.match(html, /dễ thay đổi khi số liệu đầu vào thay đổi nhỏ/i, `${ticker} missing near-threshold warning`);
    else assert.doesNotMatch(html, /dễ thay đổi khi số liệu đầu vào thay đổi nhỏ/i, `${ticker} unwarranted near-threshold warning`);
  }
});

test("a non-financial ticker with insufficient Altman evidence never shows a fabricated score", (t) => {
  const financial = new Set(["bank", "securities", "insurance", "finance_company", "credit_institution"]);
  const insufficient = Object.entries(bundle.tickers || {}).filter(([, entry]) => {
    const distress = entry.financial_distress_evidence;
    return distress && distress.status === "insufficient_evidence" && !financial.has(entry.entity_type);
  });
  if (insufficient.length === 0) {
    t.skip("no non-financial ticker in this release is currently insufficient_evidence");
    return;
  }
  for (const [ticker, entry] of insufficient) {
    const distress = entry.financial_distress_evidence;
    assert.equal(distress.score, null, `${ticker} scored despite insufficient_evidence`);
    assert.equal(distress.zone, null, `${ticker} zoned despite insufficient_evidence`);
    assert.ok(Array.isArray(distress.missing_inputs) && distress.missing_inputs.length > 0,
      `${ticker} insufficient_evidence must name what is missing`);
    const html = panel.renderFinancialDistress(distress, entry.statement_taxonomy_evidence);
    assert.doesNotMatch(html, /Điểm Z'/, `${ticker} rendered a score despite insufficient evidence`);
    assert.match(html, /Thiếu dữ liệu/, `${ticker} did not render why no score is shown`);
    assert.match(html, /không phải là xác suất phá sản/i);
  }
});

test("SSI is excluded from the distress model as a financial institution", { skip: !entryFor("SSI") }, () => {
  const entry = entryFor("SSI");
  const distress = entry.financial_distress_evidence;
  assert.equal(distress.status, "not_applicable");
  assert.equal(distress.score, null);
  assert.match(String((distress.applicability || {}).reason), /financial institution/i);
});

test("historical valuation renders its period and price date, never a current multiple", (t) => {
  const withMultiples = Object.entries(bundle.tickers || {}).filter(([, entry]) =>
    Object.values(((entry.relative_valuation || {}).methods) || {}).some((m) => m.state === "available"));
  if (withMultiples.length === 0) {
    t.skip("no ticker in this release has an available historical multiple");
    return;
  }
  for (const [ticker, entry] of withMultiples) {
    const html = panel.renderHistoricalValuation(entry);
    assert.match(html, /Chỉ là hệ số định giá lịch sử — không phải hệ số hiện tại\/trực tiếp\./,
      `${ticker} did not label its multiples historical`);
    assert.match(html, /Báo cáo tài chính FY\d{4} · giá thị trường đã xác nhận tính đến \d{4}-\d{2}-\d{2}/,
      `${ticker} did not render both date labels`);
  }
});

test("a ticker with no qualified price shows an explicit unavailable state", () => {
  const withoutMultiples = Object.entries(bundle.tickers || {}).filter(([, entry]) => {
    const methods = ((entry.relative_valuation || {}).methods) || {};
    return Object.keys(methods).length > 0
      && !Object.values(methods).some((m) => m.state === "available");
  });
  for (const [ticker, entry] of withoutMultiples) {
    const html = panel.renderHistoricalValuation(entry);
    assert.match(html, /Không suy ra định giá hiện tại\/trực tiếp\./, `${ticker} inferred a multiple`);
  }
});

test("the statement taxonomy is published as generated evidence, below the manual profile", () => {
  assert.equal(manifest.statement_taxonomy_sidecar.authority_level, "generated_evidence");
  assert.equal(manifest.statement_taxonomy_sidecar.present, true);
  assert.equal(manifest.statement_taxonomy_sidecar.session_identity, proof.session_identity);
  const classified = Object.entries(bundle.tickers || {})
    .filter(([, entry]) => (entry.statement_taxonomy_evidence || {}).statement_taxonomy);
  assert.ok(classified.length > 0, "no ticker carries statement-taxonomy evidence");
  for (const [ticker, entry] of classified) {
    const evidence = entry.statement_taxonomy_evidence;
    assert.equal(evidence.authority_level, "generated_evidence", `${ticker} claims higher authority`);
    const html = panel.renderStatementTaxonomy(evidence);
    assert.match(html, /Loại báo cáo tài chính \(tự động nhận diện\)/);
    assert.match(html, /không phải loại hình doanh nghiệp đã được kiểm tra thủ công/i);
  }
});

const { spawnSync } = require("node:child_process");

const DEPLOY_WORKFLOW = path.join(ROOT, ".github/workflows/deploy-pages.yml");

function sessionUnderscore(session) {
  return session.replaceAll("-", "_");
}

function findBash() {
  const candidates = process.platform === "win32"
    ? ["bash", "C:\\Program Files\\Git\\bin\\bash.exe"]
    : ["bash"];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-n", "-c", "true"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function extractRunBlocks(yamlText) {
  const blocks = [];
  const lines = yamlText.split(/\r?\n/);
  let collecting = false;
  let current = [];
  let indent = 0;
  for (const line of lines) {
    if (!collecting) {
      if (/^\s+run:\s*\|\s*$/.test(line)) {
        collecting = true;
        current = [];
        indent = line.search(/\S/);
        continue;
      }
    } else if (line.trim() === "") {
      current.push("");
    } else {
      const leading = line.search(/\S/);
      if (leading > indent) {
        current.push(line.slice(indent + 2));
      } else {
        blocks.push(current.join("\n"));
        collecting = false;
        current = [];
        if (/^\s+run:\s*\|\s*$/.test(line)) {
          collecting = true;
          indent = line.search(/\S/);
        }
      }
    }
  }
  if (collecting) blocks.push(current.join("\n"));
  return blocks;
}

test("checked-out source session is coherent for public verification", () => {
  const buildInfo = readJson("data/build_info.json");
  const analysis = readJson("analysis_latest.json");
  const expectedSession = buildInfo.market_session;
  assert.match(expectedSession, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(manifest.freshness.reference_session, expectedSession);
  assert.equal(analysis.summary.session_date, expectedSession);
  const sessionManifestName = `data/session_${sessionUnderscore(expectedSession)}_manifest.json`;
  const sessionManifest = readJson(sessionManifestName);
  assert.equal(sessionManifest.dashboard_session, expectedSession);
  const publicFiles = [
    "data/build_info.json",
    "bundle_manifest.json",
    "analysis_latest.json",
    "screen_snapshot.csv",
    "market_breadth.csv",
    sessionManifestName,
    `report-${expectedSession}.html`,
    "dashboard.html",
  ];
  for (const file of publicFiles) {
    const full = path.join(ROOT, file);
    assert.ok(fs.existsSync(full), `${file} is missing`);
    assert.ok(fs.statSync(full).size > 0, `${file} is empty`);
    const digest = sha256(file);
    assert.match(digest, /^[0-9a-f]{64}$/, `${file} sha256`);
    assert.equal(digest, sha256(file), `${file} hash comparison is not stable`);
  }
  assert.notEqual(sha256("dashboard.html"), sha256("analysis_latest.json"));
});

function manualDispatchAllowed(run, sourceSha, runId, compareStatus) {
  return (
    String(run.id) === String(runId)
    && run.name === "Dashboard CI"
    && run.status === "completed"
    && run.conclusion === "success"
    && run.head_branch === "main"
    && run.head_sha === sourceSha
    && /^[0-9a-fA-F]{40}$/.test(sourceSha)
    && (compareStatus === "identical" || compareStatus === "ahead")
  );
}

test("Deploy Pages workflow verifies cache-busted public bytes before SUCCESS", () => {
  const yamlText = fs.readFileSync(DEPLOY_WORKFLOW, "utf8");
  assert.match(yamlText, /workflow_run:/);
  assert.match(yamlText, /workflows:\s*\[["']Dashboard CI["']\]/);
  assert.match(yamlText, /branches:\s*\[main\]/);
  assert.match(yamlText, /types:\s*\[completed\]/);
  assert.match(yamlText, /workflow_dispatch:/);
  assert.match(yamlText, /source_sha:/);
  assert.match(yamlText, /validated_ci_run_id:/);
  assert.match(yamlText, /source_sha:[\s\S]*?required:\s*true/);
  assert.match(yamlText, /validated_ci_run_id:[\s\S]*?required:\s*true/);
  assert.match(yamlText, /github\.event_name == 'workflow_dispatch'/);
  assert.match(yamlText, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(yamlText, /SOURCE_SHA:/);
  assert.match(yamlText, /github\.event\.workflow_run\.head_sha/);
  assert.match(yamlText, /github\.event\.inputs\.source_sha/);
  assert.match(yamlText, /ref:\s*\$\{\{\s*env\.SOURCE_SHA\s*\}\}/);
  assert.match(yamlText, /HEAD_SHA:\s*\$\{\{\s*env\.SOURCE_SHA\s*\}\}/);
  assert.doesNotMatch(yamlText, /ref:\s*\$\{\{\s*github\.event\.workflow_run\.head_sha\s*\}\}/);
  assert.match(yamlText, /uses:\s*actions\/configure-pages@/);
  assert.match(yamlText, /uses:\s*actions\/upload-pages-artifact@/);
  assert.match(yamlText, /uses:\s*actions\/deploy-pages@/);
  assert.match(yamlText, /id:\s*deployment/);
  assert.match(yamlText, /PAGE_URL:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/);
  assert.match(yamlText, /jq -r '\.market_session/);
  assert.doesNotMatch(yamlText, /\bdate\s+\+%Y-%m-%d\b/);
  assert.doesNotMatch(yamlText, /github\.event\.workflow_run\.(created_at|run_started_at|updated_at)/);
  assert.match(yamlText, /PAGE_URL="\$\{PAGE_URL%\/\}"/);
  assert.match(yamlText, /MAX_ATTEMPTS=12/);
  assert.match(yamlText, /SLEEP_SECONDS=10/);
  assert.match(yamlText, /while \[ "\$attempt" -le "\$MAX_ATTEMPTS" \]/);
  assert.doesNotMatch(yamlText, /while\s+true/);
  assert.match(yamlText, /\$\{url\}\?verify=\$\{HEAD_SHA\}-\$\{attempt\}/);
  assert.match(yamlText, /sha256sum -- "\$f"/);
  assert.match(yamlText, /sha256sum -- "\$tmp"/);
  assert.match(yamlText, /public_sha" != "\$expected_sha"/);
  assert.match(yamlText, /set -euo pipefail/);
  assert.match(yamlText, /mktemp -d "\$\{RUNNER_TEMP:-\/tmp\}\/pages-verify\.XXXXXX"/);
  assert.match(yamlText, /trap 'rm -rf "\$WORKDIR"' EXIT/);
  assert.match(yamlText, /actions:\s*read/);
  assert.match(yamlText, /contents:\s*read/);
  assert.match(yamlText, /pages:\s*write/);
  assert.match(yamlText, /id-token:\s*write/);
  assert.doesNotMatch(yamlText, /contents:\s*write/);
  assert.match(yamlText, /session_\$\{EXPECTED_SESSION\/\/-\/_\}_manifest\.json/);
  assert.match(yamlText, /report-\$\{EXPECTED_SESSION\}\.html/);
  assert.match(yamlText, /run_name" != "Dashboard CI"/);
  assert.match(yamlText, /run_status" != "completed"/);
  assert.match(yamlText, /run_conclusion" != "success"/);
  assert.match(yamlText, /run_branch" != "main"/);
  assert.match(yamlText, /run_sha" != "\$SOURCE_SHA"/);
  assert.match(yamlText, /compare\/\$\{SOURCE_SHA\}\.\.\.main/);
  assert.match(yamlText, /compare_status" != "identical"/);
  assert.match(yamlText, /compare_status" != "ahead"/);
  for (const file of [
    "data/build_info.json",
    "bundle_manifest.json",
    "analysis_latest.json",
    "screen_snapshot.csv",
    "market_breadth.csv",
    "dashboard.html",
  ]) {
    assert.ok(yamlText.includes(`"${file}"`), `workflow must verify ${file}`);
  }
  assert.match(yamlText, /echo "  expected_sha256=/);
  assert.match(yamlText, /echo "  observed=/);
  assert.match(yamlText, /echo "  attempts=\$\{MAX_ATTEMPTS\}"/);
  assert.match(yamlText, /PUBLIC_BYTE_IDENTITY_FAIL after \$\{MAX_ATTEMPTS\} attempts/);
  const failExit = yamlText.lastIndexOf("exit 1");
  const failBanner = yamlText.lastIndexOf("PUBLIC_BYTE_IDENTITY_FAIL");
  assert.ok(failBanner >= 0 && failExit > failBanner, "terminal failure must exit non-zero");

  const runBlocks = extractRunBlocks(yamlText);
  assert.equal(runBlocks.length, 3, "expected manual-CI-gate, local-coherence, and public-verify run blocks");
  const bash = findBash();
  assert.ok(bash, "bash is required to syntax-check the deploy workflow scripts");
  for (const block of runBlocks) {
    assert.match(block, /set -euo pipefail/);
    const checked = spawnSync(bash, ["-n", "-c", block], { encoding: "utf8" });
    assert.equal(checked.status, 0, checked.stderr || "bash -n failed");
  }

  const validatedSha = "534e4971edf2b9be62467ce89758b6625544558d";
  const validatedRunId = "32986483019";
  const acceptedRun = {
    id: 32986483019,
    name: "Dashboard CI",
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    head_sha: validatedSha,
  };
  assert.equal(manualDispatchAllowed(acceptedRun, validatedSha, validatedRunId, "identical"), true);
  assert.equal(manualDispatchAllowed(acceptedRun, validatedSha, validatedRunId, "ahead"), true);
  assert.equal(manualDispatchAllowed({ ...acceptedRun, conclusion: "failure" }, validatedSha, validatedRunId, "ahead"), false);
  assert.equal(manualDispatchAllowed({ ...acceptedRun, status: "in_progress", conclusion: null }, validatedSha, validatedRunId, "ahead"), false);
  assert.equal(manualDispatchAllowed({ ...acceptedRun, name: "Deploy Pages" }, validatedSha, validatedRunId, "ahead"), false);
  assert.equal(manualDispatchAllowed({ ...acceptedRun, head_branch: "release" }, validatedSha, validatedRunId, "ahead"), false);
  assert.equal(manualDispatchAllowed(acceptedRun, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", validatedRunId, "ahead"), false);
  assert.equal(manualDispatchAllowed(acceptedRun, validatedSha, validatedRunId, "behind"), false);
  assert.equal(manualDispatchAllowed(acceptedRun, validatedSha, validatedRunId, "diverged"), false);

  const maxAttempts = 12;
  let attemptsUsed = 0;
  let matched = false;
  const expected = "abc";
  const staleThenFresh = ["stale", "stale", "abc"];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsUsed = attempt;
    const token = `deadbeef-${attempt}`;
    assert.match(token, /-[0-9]+$/);
    const observed = staleThenFresh[attempt - 1] || "abc";
    if (observed === expected) {
      matched = true;
      break;
    }
  }
  assert.equal(matched, true);
  assert.equal(attemptsUsed, 3);

  let exhausted = 0;
  let exhaustedMatch = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    exhausted = attempt;
    if ("stale" === expected) {
      exhaustedMatch = true;
      break;
    }
  }
  assert.equal(exhaustedMatch, false);
  assert.equal(exhausted, maxAttempts);
});

// Codex F4: public-byte proof covers the candlestick sidecar pair, build_info.js and renderers,
// behind a local binding gate that refuses a mismatched release.
test("deploy-pages proves candlestick JSON/JS, build_info.js and renderer bytes behind a binding gate", () => {
  const yamlText = fs.readFileSync(DEPLOY_WORKFLOW, "utf8").replace(/\r\n/g, "\n");
  assert.match(yamlText, /node tools\/verify_candlestick_release_binding\.cjs \. --proof-files/);
  assert.match(yamlText, /candlestick release binding refused[\s\S]*exit 1/);
  const binding = require(path.join(ROOT, "tools", "verify_candlestick_release_binding.cjs"));
  const os = require("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "candle-bind-"));
  fs.mkdirSync(path.join(tmp, "data"));
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "candlestick-current-20261105", "candlestick_patterns.json"), "utf8"));
  const component = { status: "CURRENT", source_session: "2026-11-05", projection_identity: fixture.projection_identity,
    source_snapshot_identity: fixture.source.snapshot_identity, scanned_count: fixture.coverage.scanned_count };
  const write = (bi, payload, js) => {
    fs.writeFileSync(path.join(tmp, "data", "build_info.json"), JSON.stringify(bi));
    fs.writeFileSync(path.join(tmp, "data", "build_info.js"), `window.STOCK_LOOKUP_BUILD_INFO = ${JSON.stringify(bi)};\nwindow.BUILD_INFO = window.STOCK_LOOKUP_BUILD_INFO;\n`);
    fs.writeFileSync(path.join(tmp, "data", "candlestick_patterns.json"), JSON.stringify(payload));
    fs.writeFileSync(path.join(tmp, "data", "candlestick_patterns.js"), `window.CANDLESTICK_PATTERNS = ${JSON.stringify(js)};\n`);
  };
  const bi = { market_session: "2026-11-05", domains: { signals: { components: { candlestick_patterns: component } } } };
  write(bi, fixture, fixture);
  const ok = binding.verify(tmp);
  assert.equal(ok.status, "BOUND");
  for (const f of ["data/build_info.js", "data/candlestick_patterns.json", "data/candlestick_patterns.js", "signals.html"]) {
    assert.ok(ok.proofFiles.includes(f), f);
  }
  const other = JSON.parse(JSON.stringify(fixture)); other.projection_identity = "x";
  write(bi, other, other);
  assert.deepEqual(binding.verify(tmp).errors, ["PROJECTION_IDENTITY_MISMATCH"]);
  const drift = JSON.parse(JSON.stringify(fixture)); drift.patterns = [];
  write(bi, fixture, drift);
  assert.ok(binding.verify(tmp).errors.includes("CANDLESTICK_JS_JSON_PARITY_FAILED"));
  write(bi, fixture, fixture);
  fs.writeFileSync(path.join(tmp, "data", "build_info.js"), "window.STOCK_LOOKUP_BUILD_INFO = {};\n");
  assert.ok(binding.verify(tmp).errors.includes("BUILD_INFO_JS_JSON_PARITY_FAILED"));
  const stale = { market_session: "2026-11-06", domains: { signals: { components: { candlestick_patterns: Object.assign({}, component, { status: "STALE" }) } } } };
  write(stale, fixture, fixture);
  assert.equal(binding.verify(tmp).status, "NOT_CLAIMED");
  fs.rmSync(tmp, { recursive: true, force: true });
});
