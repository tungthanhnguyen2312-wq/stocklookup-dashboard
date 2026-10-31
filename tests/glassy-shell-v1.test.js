"use strict";
// GLASSY_SHELL_V1: the glass shell (scene, dock, view transitions) and the removal of the
// arbitrary four-ticker showcase. Presentation contracts only; data and Producer contracts
// are covered by their own suites.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const PAGES = ["dashboard.html", "investment-workspace.html", "portfolio.html", "macro.html", "archive.html", "about.html"];
const NAV = [["dashboard", "Tổng quan"], ["investment-workspace", "Cơ hội"], ["portfolio", "Danh mục"], ["macro", "Vĩ mô"], ["archive", "Lịch sử"]];
const home = require("../assets/js/dashboard-product-summary.js");
const workspace = require("../assets/js/investment-workspace.js");

test("the shell script loads in <head>, undeferred, right after the glass stylesheet", () => {
  for (const page of PAGES) {
    const html = read(page);
    const head = html.slice(0, html.indexOf("</head>"));
    assert.match(head, /<link rel="stylesheet" href="assets\/css\/glass-shell\.css\?v=[^"]+">\n\s*<script src="assets\/js\/glass-shell\.js\?v=[^"]+"><\/script>/, page);
    assert.equal((html.match(/assets\/js\/glass-shell\.js/g) || []).length, 1, `${page} loads the shell once`);
    assert.doesNotMatch(html, /&ui=minimal-glass-v1/, `${page} carries the new presentation cache token`);
  }
});

test("every page has one decorative scene and a dock with a lens and five labelled destinations", () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.equal((html.match(/class="gs-scene" aria-hidden="true"/g) || []).length, 1, page);
    const nav = html.match(/<nav class="vs-topbar-nav" aria-label="Điều hướng chính">([\s\S]*?)<\/nav>/)[1];
    assert.match(nav, /^<span class="gs-lens" aria-hidden="true"><\/span>/, page);
    const links = [...nav.matchAll(/<a [^>]*data-nav="([^"]+)"[^>]*>(<svg class="gs-nav-icon"[^>]*aria-hidden="true"[\s\S]*?<\/svg>)<span class="gs-nav-label">([^<]+)<\/span><\/a>/g)];
    assert.deepEqual(links.map((m) => [m[1], m[3]]), NAV, page);
    const current = [...nav.matchAll(/data-nav="([^"]+)" aria-current="page"/g)].map((m) => m[1]);
    const expected = { "dashboard.html": ["dashboard"], "investment-workspace.html": ["investment-workspace"], "portfolio.html": ["portfolio"], "macro.html": ["macro"], "archive.html": ["archive"], "about.html": [] }[page];
    assert.deepEqual(current, expected, page);
  }
});

test("view transitions name elements only while a transition runs, and reduced motion turns them off", () => {
  const css = read("assets/css/glass-shell.css");
  assert.match(css, /@view-transition \{ navigation: auto; \}/);
  const named = [...css.matchAll(/^([^\n{]*)\{[^}]*view-transition-name: (gs-[\w-]+)/gm)];
  assert.ok(named.length >= 9, "scene, content, bar, dock, lens and the five links are named");
  for (const [, selector, name] of named) assert.match(selector, /^html\.gs-vt /, `${name} must only be named under html.gs-vt`);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*@view-transition \{ navigation: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.vs-content > \* \{ animation: gs-panel-in/);
  const js = read("assets/js/glass-shell.js");
  assert.match(js, /addEventListener\("pageswap"/);
  assert.match(js, /addEventListener\("pagereveal"/);
  assert.match(js, /viewTransition\.finished\.finally\(function \(\) \{ root\.classList\.remove\("gs-vt"\); \}\)/);
});

test("glass keeps the fixed dock out of the bar's containing block and tables legible", () => {
  const css = read("assets/css/glass-shell.css");
  const bar = css.match(/\n\.vs-topbar \{([\s\S]*?)\n\}/)[1];
  assert.match(bar, /backdrop-filter: none;/, "the bar's blur lives on ::before, not on the bar");
  assert.match(css, /\.vs-topbar::before \{[\s\S]*?backdrop-filter: blur\(22px\)/);
  assert.match(css, /\.vs-topbar \.vs-topbar-nav \{\s*position: fixed;/);
  assert.match(css, /\.cockpit-table th, \.ws-compact-table th, \.macro-table th \{ background: rgba\(11, 16, 26, 0\.97\); \}/);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
});

test("Home opens the whole universe by posture instead of four A-Z tickers", () => {
  const summary = JSON.parse(read("data/dashboard_home_summary.json"));
  const html = home.postureEntryHtml(summary);
  const rows = [...html.matchAll(/href="investment-workspace\.html\?filter=([a-z_]+)" data-posture-filter="\1"[^>]*><span class="home-posture-label">([^<]+)<\/span><strong class="home-posture-count">([\d.]+)<\/strong>/g)];
  const postureFilters = workspace.FILTERS.filter((f) => f.group === "posture");
  assert.deepEqual(rows.map((m) => [m[1], m[2]]), postureFilters.map((f) => [f.id, f.label]), "ids and labels match the Cơ hội filters");
  const total = rows.reduce((sum, m) => sum + Number(m[3].replace(/\./g, "")), 0);
  assert.equal(total, summary.research_action_posture.coverage, "every ticker is counted once");
  assert.doesNotMatch(html, /\?ticker=|data-focus-ticker/, "no individual ticker is showcased");
  assert.match(html, /không xếp hạng/);
  const page = read("dashboard.html");
  assert.doesNotMatch(page, /Cổ phiếu đáng chú ý/);
  const script = read("assets/js/dashboard-product-summary.js");
  const boot = script.slice(script.indexOf("function bootDashboardOverview()"), script.indexOf("function investorRiskHtml("));
  assert.match(boot, /renderPostureEntry\(summary\);/);
  assert.doesNotMatch(boot, /bootHomeOpportunities\(/, "Home no longer selects or fetches notable cards");
  assert.match(home.postureEntryHtml({ research_action_posture: { available: false } }), /Chưa có tư thế nghiên cứu/);
});

test("Cơ hội replaces the featured four with posture chips over the full list", () => {
  const html = read("investment-workspace.html");
  assert.doesNotMatch(html, /Cổ phiếu đáng chú ý/);
  assert.match(html, /aria-controls="ws-view-opportunities">Danh sách<\/button>/);
  const script = read("assets/js/investment-workspace.js");
  const focus = script.slice(script.indexOf("let POSTURE_COUNTS"), script.indexOf("function renderList()"));
  assert.doesNotMatch(focus, /notableTickers|slice\(0, 4\)/);
  assert.match(focus, /data-posture-filter=/);
  assert.match(script, /url\.searchParams\.set\("filter", ACTIVE_FILTERS\.join\(","\)\)/);
});

test("?filter= accepts only published filter ids, once each", () => {
  assert.deepEqual(workspace.filtersFromQuery("early_watch"), ["early_watch"]);
  assert.deepEqual(workspace.filtersFromQuery("initiate,bogus,initiate, wait"), ["initiate", "wait"]);
  assert.deepEqual(workspace.filtersFromQuery(""), []);
  assert.deepEqual(workspace.filtersFromQuery(null), []);
  assert.deepEqual(workspace.filtersFromQuery("<script>"), []);
});
