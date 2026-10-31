# Glassy shell V1

The Owner approved this direction after reviewing the interactive prototype (branch
`prototype/glassy-v5-interaction`). It is an interpretation of the interaction in @settigation's
"Glasssy Dashboard V5" (TikTok video 7701369625056906517), built for Stock Lookup's own pages.
It is not a copy of that product's code or assets.

## What changed

| Area | Change |
|---|---|
| Scene | Each investor page draws a fixed dusk "window" behind the content (CSS and inline SVG, no image file). Each page has its own light colour: amber for Tổng quan, teal for Cơ hội, violet for Danh mục, blue for Vĩ mô, silver for Lịch sử. |
| Glass | Top-level cards get a frosted fill, a 20 px backdrop blur, a lit top edge and a tinted under-glow; the sheen follows the pointer. Nested cards and data tables stay on near-opaque surfaces. |
| Navigation | The existing five links become a dock with icons: left on desktop, bottom on phones. A white glass lens marks the current page. Labels stay in the links and show as a tooltip on desktop. |
| Page change | Cross-document view transitions. The lens glides with a short stretch, the scene pans and relights, the old content dissolves and the new content re-forms. Browsers without the feature load pages normally with the same look. |
| Cơ hội tabs | The same glass lens glides between tabs. |
| Four-ticker showcase | Removed from Tổng quan and from Cơ hội. Both now show every ticker grouped by published `research_action_posture`, with exact counts, linking to or applying the matching Cơ hội posture filter. |
| Deep link | `investment-workspace.html?filter=<id>[,<id>]` opens the list with those published filters on. The URL follows later filter changes. |

## Files

- `assets/css/glass-shell.css`: loaded after `minimal-glass.css`, which still provides the layout.
- `assets/js/glass-shell.js`: loaded in `<head>`, not deferred. It switches view-transition names on only
  while a transition runs (`html.gs-vt`); at rest those names would cut the glass off from the
  scene behind it. It also drives the tab lens and the pointer sheen.
- `tests/glassy-shell-v1.test.js`: the CI contract for the above.

## Unchanged

- Data files, JSON contracts, labels and lookups, element IDs, deep links, session and freshness labels.
- The Producer notable-card helpers stay exported and tested; Home simply no longer calls them.

## Accessibility and motion

- `prefers-reduced-motion: reduce` turns off view transitions and every entrance animation.
- Dock links keep their text, `aria-current` and focus styles. Icons are `aria-hidden`.
- Without `backdrop-filter`, surfaces fall back to solid, readable panels.
