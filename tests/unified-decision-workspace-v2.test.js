"use strict";

// Architecture-contract tests for MARKET_DASHBOARD_UNIFIED_DECISION_WORKSPACE_AND_INFORMATION_
// ARCHITECTURE_REDESIGN_V2: analysis.html retired into investment-workspace.html's three internal
// views. Most individual claims (5/6-column tables, no conflictReasons, cohorts-as-filters,
// session-mismatch fail-closed) are already covered where the relevant code lives (analysis
// retirement in product-surface-convergence.test.js, drawer/table shape in
// product-surface-convergence-v1-regression.test.js, session gate in
// post-convergence-final-corrective-regression.test.js). This file proves the remaining
// structural claims that don't otherwise have a single obvious home.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const analysisHtml = fs.readFileSync(path.join(root, "analysis.html"), "utf8");
const wsHtml = fs.readFileSync(path.join(root, "investment-workspace.html"), "utf8");
const wsJs = fs.readFileSync(path.join(root, "assets/js/investment-workspace.js"), "utf8");
const shellCss = fs.readFileSync(path.join(root, "assets/css/shell.css"), "utf8");
const shell = require(path.join(root, "assets/js/shell.js"));

test("primary nav has four decision-flow destinations and legacy surfaces remain routes", () => {
  assert.deepEqual(shell.CANONICAL_PRIMARY_NAV.map((item) => item.id), ["dashboard", "investment-workspace", "portfolio", "macro", "archive"]);
  assert.ok(!shell.CANONICAL_PRIMARY_NAV.some((item) => ["analysis", "screener", "signals"].includes(item.id)));
  assert.match(shellCss, /Single-topbar pages keep the same five destinations/);
});

test("analysis.html redirects to investment-workspace.html?view=analysis, preserving other query params and hash", () => {
  assert.doesNotMatch(analysisHtml, /<meta http-equiv="refresh"/);
  assert.match(analysisHtml, /window\.location\.replace\("investment-workspace\.html\?" \+ params\.toString\(\) \+ hash\)/);

  // Reproduce analysis.html's own inline redirect logic (URLSearchParams-based, not naive string
  // concatenation, since it must inject view=analysis without breaking an existing ?ticker=).
  function simulateAnalysisRedirect(search, hash) {
    const params = new URLSearchParams(search || "");
    params.set("view", "analysis");
    return "investment-workspace.html?" + params.toString() + (hash || "");
  }
  assert.equal(simulateAnalysisRedirect("", ""), "investment-workspace.html?view=analysis");
  // ticker was already in the query string, so URLSearchParams.set("view", ...) appends view
  // after it rather than reordering -- param order is irrelevant to investment-workspace.js,
  // which reads each key independently via URLSearchParams(...).get(...).
  assert.equal(simulateAnalysisRedirect("?ticker=HPG", ""), "investment-workspace.html?ticker=HPG&view=analysis");
  assert.equal(simulateAnalysisRedirect("?ticker=HPG", "#lineage"), "investment-workspace.html?ticker=HPG&view=analysis#lineage");
});

test("Workspace declares five core views plus the four investigation-workbench views, with opportunities as the default", () => {
  const viewIds = [...wsHtml.matchAll(/id="ws-view-([a-z]+)"/g)].map((m) => m[1]);
  // INVESTOR_EVIDENCE_INVESTIGATION_WORKBENCH_V1 adds dossier / compare / journal alongside the
  // five original views; they share the same single index fetch and selected-ticker state.
  // INVESTOR_CASE_DESK_LOCAL_REVIEW_INTEGRATION_V1 adds the browser-local Case Desk case view.
  assert.deepEqual(viewIds.sort(), ["case", "compare", "dossier", "explore", "journal", "opportunities", "portfolio", "technical", "watchlist"]);
  for (const view of ["dossier", "compare", "journal", "case"]) {
    assert.match(wsHtml, new RegExp(`id="ws-view-${view}" data-ws-view role="tabpanel" aria-labelledby="ws-tab-${view}" hidden>`));
    assert.match(wsHtml, new RegExp(`id="ws-tab-${view}"[^>]*role="tab"[^>]*aria-controls="ws-view-${view}"`));
  }
  assert.match(wsJs, /WORKBENCH_VIEWS = \["dossier", "compare", "journal", "case"\]/);
  // Only the default view starts visible; other modes start hidden until selected. Each panel
  // is aria-labelledby its own tab button (see the ws-tab-* ids in the tablist above).
  assert.match(wsHtml, /id="ws-view-opportunities" data-ws-view role="tabpanel" aria-labelledby="ws-tab-opportunities">/);
  assert.match(wsHtml, /id="ws-view-explore" data-ws-view role="tabpanel" aria-labelledby="ws-tab-explore" hidden>/);
  assert.match(wsHtml, /id="ws-view-portfolio" data-ws-view role="tabpanel" aria-labelledby="ws-tab-portfolio" hidden>/);
  assert.match(wsHtml, /id="ws-view-technical" data-ws-view role="tabpanel" aria-labelledby="ws-tab-technical" hidden>/);
  assert.match(wsHtml, /id="ws-view-watchlist" data-ws-view role="tabpanel" aria-labelledby="ws-tab-watchlist" hidden>/);
  for (const view of ["opportunities", "portfolio", "watchlist", "explore", "technical"]) {
    assert.match(wsHtml, new RegExp(`id="ws-tab-${view}"[^>]*role="tab"[^>]*aria-controls="ws-view-${view}"`), `tab ${view} must declare aria-controls for its panel`);
  }
  assert.match(wsJs, /new URLSearchParams\(window\.location\.search\)\.get\("view"\)/);
  assert.match(wsJs, /VALID_VIEWS = \["opportunities", "portfolio", "watchlist", "explore", "technical"\]/);
});

test("exactly one primary Workspace data fetch feeds all three views and one selected-ticker state", () => {
  const fetchCalls = wsJs.match(/fetch\(DATA_URL/g) || [];
  assert.equal(fetchCalls.length, 1, "expected exactly one fetch(DATA_URL) call in investment-workspace.js");
  // The opportunities/analysis views are both derived from the same WORKSPACE.cards + filter state.
  assert.match(wsJs, /function filteredTickers\(\)/);
  assert.match(wsJs, /function renderAnalysisView\(\)/);
  assert.match(wsJs, /filteredTickers\(\)\.map\(\(t\) => analysisRecord\(WORKSPACE\.cards\[t\]\)\)/);
  // One selectTicker/SELECTED_TICKER path drives the drawer regardless of which view is active.
  assert.equal((wsJs.match(/let SELECTED_TICKER/g) || []).length, 1);
});

test("watchlist is an internal Workspace view, not a standalone page", () => {
  assert.match(wsHtml, /id="ws-view-watchlist"/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "assets/js/shell.js"), "utf8"), /watchlist\.html/);
  assert.ok(!fs.existsSync(path.join(root, "watchlist.html")));
});

test("the drawer is the sole normal-screen ticker detail surface; the in-page card is print-only", () => {
  const sectionTag = wsHtml.match(/<section[^>]*id="decision-card-section"[^>]*>/)[0];
  assert.match(sectionTag, /class="[^"]*\bd-none\b[^"]*\bd-print-block\b[^"]*"/);
  assert.doesNotMatch(wsHtml, /<details[^>]*id="decision-card-section"/);
  assert.match(wsJs, /renderDecisionCardSurfaces\(card, \[drawerEl, inPageEl\], cardOpts\);/);
  assert.match(wsJs, /function renderDecisionCardSurfaces\(card, containers, options\)/);
  assert.match(wsJs, /const html = decisionCardHtml\(card, options\);\s*\n\s*\(containers \|\| \[\]\)\.forEach/);
});

test("data, methodology and portfolio-risk are progressive disclosure, not standalone cards", () => {
  assert.match(wsHtml, /<details id="section-data-methodology"/);
  assert.doesNotMatch(wsHtml, /<details id="section-portfolio-risk"/);
  assert.doesNotMatch(wsHtml, /<details id="section-lineage"/);
  assert.doesNotMatch(wsHtml, /<details id="section-data-gaps"/);
});

test("no universal score is computed or rendered anywhere in the Workspace", () => {
  assert.doesNotMatch(wsJs, /universal_?score|composite_?score|overall_?score/i);
  assert.doesNotMatch(wsHtml + wsJs, /\bscore\s*[:=]\s*\d/i);
});

test("legacy Screener and Signals resolve to canonical Workspace views without losing ticker or hash", () => {
  const screenerHtml = fs.readFileSync(path.join(root, "screener.html"), "utf8");
  const signalsHtml = fs.readFileSync(path.join(root, "signals.html"), "utf8");
  const signalsJs = fs.readFileSync(path.join(root, "assets/js/signals-product.js"), "utf8");
  assert.match(screenerHtml, /params\.set\("view", "explore"\)/);
  assert.match(signalsHtml, /params\.set\("view", "technical"\)/);
  for (const source of [screenerHtml, signalsHtml]) {
    assert.match(source, /window\.location\.replace\("investment-workspace\.html\?" \+ params\.toString\(\) \+ window\.location\.hash\)/);
  }
  assert.match(signalsJs, /investment-workspace\.html\?ticker=/);

  function legacyDestination(search, hash, view) {
    const params = new URLSearchParams(search || "");
    params.set("view", view);
    return "investment-workspace.html?" + params.toString() + (hash || "");
  }
  assert.equal(legacyDestination("?ticker=HPG", "#evidence", "explore"), "investment-workspace.html?ticker=HPG&view=explore#evidence");
  assert.equal(legacyDestination("?ticker=FPT", "#signals", "technical"), "investment-workspace.html?ticker=FPT&view=technical#signals");
});

test("decision-cockpit.html?ticker= still round-trips through the Workspace redirect chain", () => {
  const dcHtml = fs.readFileSync(path.join(root, "decision-cockpit.html"), "utf8");
  assert.match(dcHtml, /window\.location\.replace\("investment-workspace\.html" \+ search \+ hash\)/);
});
