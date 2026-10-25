# Portfolio evidence and risk investigation workspace (V1)

The Danh mục page now joins browser-local holdings to the published Cơ hội read model.

Enter holdings, read the current published posture, see source-backed gaps, open a dossier, compare a valid alternative, record a question in the existing journal, and download a research review. The page does not score risk, infer market-value weights, or send positions, cash or notes to a server.

## Lineage

- Repository: `tungthanhnguyen2312-wq/stocklookup-dashboard`
- Branch: `feature/portfolio-evidence-risk-workspace-v1`
- Parent: Dashboard PR #16 `455e627b5ab6977601725fcd4fdded52145e6b13`
- PR #16 is stacked on PR #15 `13600821c5c6f610e04672a15112c6d576100fa0`
- Published session used for acceptance: `2026-10-23` (`workspace_index/v1`, 1,683 tickers)
- Not merged and not deployed. The review diff against `main` includes the unmerged parent commits.

## What the page uses

- Personal positions stay under `stocklookup.portfolio-research.v1`.
- Journal questions stay under `stocklookup.investigation-journal.v1`.
- The compact `data/workspace_index.json` is fetched only after at least one holding exists.
- Ticker detail shards load only when a holding is opened or a comparison is run, through the existing shard cache.
- Dossier, comparison refusal and journal writes reuse `investigation-workbench.js`.
- Comparison links carry tickers and the published session only. Weights, cash and notes are not placed in the URL.

A holding whose published posture is `AVOID` stays `AVOID`. `trigger_condition_satisfied` is shown as its own field and is not treated as a fired outcome unless `confirmation_trigger_state` is `TRIGGERED`. A bank with `INSUFFICIENT_DATA` is missing bank-specific evidence, not financially weak. Quantity-only positions are not converted into weights.

The index sector token is an entity-class label. A shared price mechanism is not established from it. Identical published codes are grouped only as the same published code. User-entered explicit weights can be summed and are labelled as user input.

## Measured local acceptance

Chrome 155, headless, local gzip, one run, not a peak-memory or WAN guarantee. `reports` were written outside the repo.

| Width | Plain-visit detail requests | After opening HPG | Viewport fits |
| --- | --- | --- | --- |
| 375 | 0 | one `H.json` | yes |
| 768 | 0 | one `H.json` | yes |
| 1024 | 0 | one `H.json` | yes |
| 1440 | 0 | one `H.json` | yes |

At 1440 the same profile also checked NVL `AVOID` without a fired confirmation, a TCB versus HPG comparison that refused incompatible rows, a hostile import that left storage unchanged and did not run script, cash `987654321` absent from request URLs, rapid FPT/PNJ/NVL selection ending on NVL, and the four positions still present. Post-GC JS heap after that 1440 case was 6,184,876 bytes. That figure includes retained shard bytes from the opened details. It is not OS RSS.

Summarizing 20 real index cards in Node took about 11 ms and did not read a detail shard. Five-name comparison still needs the detail shards; the index does not carry method, period or scope operands.

## Validation already run

- `node --test tests/portfolio-research-model.test.js` — 10 pass, using the real index and TCB/HPG detail shards
- `node --test tests/investigation-workbench.test.js` — 21 pass, including every published ticker
- `node --test tests/workspace-read-model.test.js` — pass, including the 1,683-card byte cache
- `node --test tests/dashboard-home-performance-and-investor-first.test.js tests/investor-first-ux-v1.test.js tests/product-surface-convergence-v1-regression.test.js` — pass
- Python: portfolio editor, navigation, asset cache version, safe web artifacts — pass
- Browser acceptance above — pass
- Published `data/` files were not edited

## Not in this change

No Producer or Consumer edits. No new risk, VaR, beta, correlation, sizing or recommendation. No account backend. Historical portfolio exposures are not invented. Public session manifests are not scraped from this page; the dossier history on Cơ hội remains the existing on-demand reader.
