# Minimal glass UX V1

Milestone: DASHBOARD_MINIMAL_GLASS_UX_REDESIGN_V1.
Authority: NONE / INVESTOR_FACING_PRESENTATION_ONLY. No data file, JSON interface,
calculation, selection or publication identity changes.

## What each page answers

| Page | Question |
|---|---|
| Tổng quan | What happened this session, which sectors dominate coverage, which stocks merit a look, which risks matter? |
| Cơ hội | Which securities merit further research, why, and what would confirm or invalidate the thesis? |
| Danh mục | Which states, adverse evidence and data gaps affect the positions I entered? |
| Vĩ mô | Which macro conditions frame every thesis (context, not a per-stock signal)? |
| Lịch sử | What did earlier sessions publish, unchanged since publication? |

Every page opens with the same header: one title and one sentence of purpose.

## Consolidation

- Top bar: the same five destinations on every width (the mobile drawer menu on
  some pages and an inline row on others became one inline row). One secondary
  link, `Giới thiệu`, replaces `Dữ liệu & phương pháp` in the bar, which shared its
  label with the in-page methods disclosures. Reload buttons and the duplicate
  `Lịch sử` link on the archive page were removed.
- Tổng quan: session status and the three breadth figures are one panel; the
  counts sentence remains for assistive technology only. The featured block uses
  the same name as in Cơ hội (`Cổ phiếu đáng chú ý`) and links to it.
- Cơ hội: each of the 1,683 rows had a ticker button and a `Chi tiết` button with
  the same action; the ticker (plus row click) is now the single control. Tabs are
  grouped into research views and personal views (`Của bạn`); the in-page
  `Danh mục` tab is renamed `Tác động danh mục` so it no longer repeats the primary
  navigation, and the portfolio-file import moved from the page header into that
  view. The research-only marker moved from the top bar into the page's disclaimer
  line. The drawer has one primary action (`Hồ sơ điều tra`).
- Danh mục: one primary (`Thêm vị thế`), one secondary (`Lưu trên trình duyệt`) and
  text actions for import/export/clear; positions and allocation sit side by side;
  comparison, questions and review are grouped under `Công cụ nghiên cứu`.
- Vĩ mô: the large hero became a compact header with status, data date and creation
  time. Indicator cards keep period and source; frequency and per-indicator update
  time are read once in `Toàn bộ chỉ báo`. A successful load is a quiet line; error
  and stale notices keep their full banner.
- Lịch sử: developer notes were replaced with an investor-facing purpose. Session
  reports (`report-YYYY-MM-DD.html`, written by every Daily publication) are found
  with HEAD requests for weekdays from the current session back to 2026-08-25, so
  new sessions appear without editing the list. Legacy playbooks stay listed.

## Visual system

`assets/css/minimal-glass.css` loads last on the six investor pages. Generated
reports and legacy pages keep `style.css` only. Neutral graphite canvas, one
restrained teal accent, translucent cards without hover lift, glow or entrance
animation, blur only on the top bar and drawer, opaque data tables with sticky
headers and tabular numbers, one badge shape with low-saturation semantic colours,
visible focus rings and reduced-motion support. The site remains dark-only; no theme
control existed before.

## Publication

HTML/CSS/JS are source-managed; the Daily publisher only rewrites `?v=` tokens. This
release appends `&ui=minimal-glass-v1` to the current build token so browsers fetch
the new presentation before the next Daily; the next publication restamps tokens.
`tests/minimal-glass-ux-v1.test.js` pins the consolidation in CI.
