"use strict";
// DASHBOARD_MINIMAL_GLASS_UX_REDESIGN_V1: keeps the consolidation from silently regressing.
// Presentation-only contracts; data, schemas and investor semantics are covered elsewhere.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const PAGES = ["dashboard.html", "investment-workspace.html", "portfolio.html", "macro.html", "archive.html", "about.html"];

test("every investor page loads the shared layout layer, then the glass shell last", () => {
  for (const page of PAGES) {
    const html = read(page);
    const head = html.slice(0, html.indexOf("</head>"));
    const sheets = [...head.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    assert.match(sheets[sheets.length - 2], /^assets\/css\/minimal-glass\.css\?v=/, `${page} must load minimal-glass.css before the glass shell`);
    assert.match(sheets[sheets.length - 1], /^assets\/css\/glass-shell\.css\?v=/, `${page} must load glass-shell.css last`);
  }
});

test("one secondary top-bar link with one label, no reload button, no duplicate nav link", () => {
  for (const page of PAGES) {
    const header = read(page).match(/<header class="vs-topbar">[\s\S]*?<\/header>/)[0];
    const links = [...header.matchAll(/class="vs-topbar-link[^"]*" href="([^"]+)"[^>]*>([^<]+)</g)];
    assert.deepEqual(links.map((m) => [m[1], m[2]]), [["about.html", "Giới thiệu"]], page);
    assert.doesNotMatch(header, /location\.reload|refresh-cw/, page);
    assert.doesNotMatch(header, /CHỈ MANG TÍNH NGHIÊN CỨU/, `${page}: the research-only marker lives in page content, not the bar`);
  }
});

test("Cơ hội rows expose one detail control (the ticker), not a second identical button", () => {
  const script = read("assets/js/investment-workspace.js");
  const row = script.slice(script.indexOf("function renderRow(ticker)"), script.indexOf("let POSTURE_COUNTS"));
  assert.equal((row.match(/data-select-ticker=/g) || []).length, 1);
  assert.match(row, /aria-label="Xem chi tiết \$\{esc\(ticker\)\}"/);
  assert.doesNotMatch(row, />Chi tiết<\/button>/);
  const html = read("investment-workspace.html");
  const thead = html.match(/<table class="cockpit-table ws-compact-table" id="opportunity-table">[\s\S]*?<\/thead>/)[0];
  assert.equal((thead.match(/<th[\s>]/g) || []).length, 9);
});

test("Cơ hội separates research views from personal views and keeps every deep link", () => {
  const html = read("investment-workspace.html");
  const tablist = html.match(/<div class="ws-view-tabs"[\s\S]*?<\/div>/)[0];
  const order = [...tablist.matchAll(/id="ws-tab-(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["opportunities", "explore", "technical", "dossier", "compare", "watchlist", "journal", "portfolio", "case"]);
  assert.ok(tablist.indexOf("ws-tab-divider") > tablist.indexOf('id="ws-tab-compare"'));
  assert.ok(tablist.indexOf("ws-tab-divider") < tablist.indexOf('id="ws-tab-watchlist"'));
  assert.match(tablist, />Tác động danh mục</, "the in-page view must not reuse the primary nav label Danh mục");
  // Portfolio import belongs to the view it updates, not the page header.
  const portfolioView = html.slice(html.indexOf('id="ws-view-portfolio"'), html.indexOf('id="ws-view-explore"'));
  assert.match(portfolioView, /id="import-portfolio-research"/);
  assert.doesNotMatch(html.slice(0, html.indexOf('class="ws-view-tabs"')), /import-portfolio-research/);
});

test("Home merges market status and breadth into one panel", () => {
  const html = read("dashboard.html");
  assert.match(html, /<section aria-label="Nhịp thị trường" class="home-pulse mb-4">\s*<div id="dashboard-hero-banner"><\/div>\s*<div class="home-breadth"/);
  assert.match(html, /href="investment-workspace.html">Xem toàn bộ trong Cơ hội/);
  const css = read("assets/css/minimal-glass.css");
  assert.match(css, /\.home-pulse-summary \{\s*position: absolute;/, "the repeated counts sentence stays only for assistive technology");
});

test("Lịch sử discovers published session reports and shows no developer notes", () => {
  const html = read("archive.html");
  assert.match(html, /<h1 class="page-title">Lịch sử<\/h1>/);
  assert.doesNotMatch(html, /GitHub Pages|ghi tay|API/);
  const script = read("assets/js/archive.js");
  assert.match(script, /method: "HEAD"/);
  assert.match(script, /report-\$\{date\}\.html/);
  assert.match(script, /DAILY_REPORT_FLOOR = "2026-08-25"/);
});

test("design layer keeps reduced motion, visible focus and opaque data tables", () => {
  const css = read("assets/css/minimal-glass.css");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible[\s\S]{0,400}outline: 2px solid var\(--primary\)/);
  assert.match(css, /\.cockpit-table th, \.ws-compact-table th, \.macro-table th \{\s*background: var\(--mg-solid\);/);
  // Blur only on the top bar and the drawer.
  assert.equal((css.match(/^\s*backdrop-filter:/gm) || []).length, 2);
});
