# Workbench performance and reliability — local acceptance

Continuation of `INVESTOR_EVIDENCE_INVESTIGATION_WORKBENCH_V1`, from exact PR15
commit `13600821c5c6f610e04672a15112c6d576100fa0`. Branch:
`feature/investigation-workbench-performance-v1`. PR15 is unchanged. No push, PR,
merge, deploy, generated-data rewrite or Producer/Consumer modification.

## What changed

- Retain lossless source Blobs, compress sequentially using native gzip after the
  requesting view is built, and cache at most 32 original ticker cards. Concurrent
  callers share one fetch/parse per shard. No derived financial compact contract.
- Drop the parsed shard tree after handing every waiter its exact requested card.
  An evicted/new ticker can require local decompression and reparse. It never
  requires another successful network download within the same page/release.
  Browsers without native compression retain original Blobs; no total-memory
  improvement is claimed for that fallback.
- Ticker selection toggles row classes instead of rebuilding 1,683 hidden rows
  and unchanged focus cards. Repeated dossier renders reuse the current model.
- Pending comparison clear, invalid request, selection and view/session changes
  invalidate old completions; they cannot paint stale research or steal focus.
- Hypotheses update in memory immediately; only storage writes are debounced.
  Rendering/export/import/pagehide flush current drafts. Import completions use
  last-request tokens and merge the current journal, not captured stale entries.
- Missing, malformed, stale-identity/session and offline detail remain explicit
  partial/unavailable research with an on-demand retry. Shared loads continue
  rather than aborting other callers; obsolete render results are discarded.

## Measurement method

Chrome `Chrome/155.0.8059.86`, 1,683 real tickers, published session `2026-10-23`.
Local gzip HTTP, cold per-target network cache, unchanged published data, desktop
CPU at 375/768/1024/1440px viewports. This is not a physical mobile-device/WAN test.
Response JSON is instrumented as text + timed native JSON.parse in both versions.
Heap is JSHeapUsedSize after explicit GC; the after measurement separately counts
live native Blob sizes after two seconds of idle cache settling. Neither is OS RSS
or a proven peak-memory bound. The unmodified contract still needs up to 79 MB raw
JSON / 9.8 MB gzip for a cold five-shard detailed comparison. Parse cost is not eliminated.

## Before / after (milliseconds; decimal MB)

Five-shard comparison: VCB, SSI, TCB, PNJ, HPG. Latency starts in an initialized
page and ends at visible comparison. Repeated dossiers: eight PNJ/HPG round trips.

| Width | Cold five-shard ms before → after | JS heap MB before → after | Retained Blob MB after | Repeated dossiers ms before → after |
|---:|---:|---:|---:|---:|
| 375 | 2029 → 1791 | 82.12 → 5.99 | 9.81 | 2685 → 550 |
| 768 | 1471 → 1143 | 82.13 → 5.99 | 9.81 | 2827 → 573 |
| 1024 | 1272 → 1722 | 82.13 → 5.99 | 9.81 | 2355 → 470 |
| 1440 | 1372 → 1988 | 82.13 → 5.99 | 9.81 | 2808 → 485 |

**Tradeoff:** retained JS heap is about 93% lower; heap plus source Blob bytes is
about 15.8 MB versus 82.1 MB of baseline heap (not an RSS comparison). Repeated
dossier navigation improves substantially. Cold comparison improves at two widths
and regresses at two in this run; no universal cold-latency improvement is claimed.

| Width | Five-shard parse ms before → after | Cold same-shard page ms before → after | Same-shard heap MB before → after | Rapid switches ms before → after |
|---:|---:|---:|---:|---:|
| 375 | 489 → 444 | 1007 → 792 | 22.17 → 5.96 | 1769 → 763 |
| 768 | 472 → 474 | 1101 → 753 | 22.18 → 5.96 | 1696 → 805 |
| 1024 | 359 → 388 | 1053 → 802 | 22.17 → 5.96 | 1706 → 862 |
| 1440 | 390 → 535 | 969 → 956 | 22.17 → 5.96 | 1688 → 798 |

Same-shard cold page includes bootstrap and compares SSI/SHB/STB/SAB/SBT.
Rapid switches are HPG/FPT/PNJ/NVL/VNM; the final ticker and adversarial reverse
completion are checked. Measurements are single local runs, not statistical
performance guarantees. All full parse samples, request bytes, retention after
repeated openings, long tasks and acceptance booleans are retained in
[the machine-readable evidence](benchmarks/investigation-workbench-performance-v1.json).

Actual browser screenshots: [375px dossier](benchmarks/workbench-375-dossier.png)
and [1440px comparison](benchmarks/workbench-1440-comparison.png). The harness also
retains screenshots for every viewport in its local output directory.

## Browser and data acceptance

At every width: zero heavy requests on plain Cơ hội; five distinct requests for
five shards; one request/parse for the same-shard comparison; correct latest ticker;
no horizontal page overflow; exact comparison export parity to the original full
Producer cards, including method/session refusals. No missing field becomes zero.
Thirteen interaction checks pass per viewport: draft rerender, immediate export,
pending clear, invalid request, leaving view, older ticker completion, import
races, 404/malformed/identity/session/offline retry and keyboard navigation.
Baseline reproduces stale-clear/invalid-result and journal/import/export failures;
it also permanently caches failed fetch/JSON promises. No assertions were weakened.

Index cards contain published posture/header fields but only valuation state/count
and deterministic reason summaries. They lack `valuation.method_diagnostics` and
`why.financial_analysis.compact.feature_fitness` operands. Detailed comparisons
continue to load original shards; no lighter calculation or authority is substituted.

## Commands and test results

```powershell
$env:BENCH_BASELINE = "1"
node tests/workbench-browser-benchmark.cjs reports/workbench-baseline-accepted
Remove-Item Env:BENCH_BASELINE
node tests/workbench-browser-benchmark.cjs reports/workbench-accepted
node --test tests/workspace-read-model.test.js tests/investigation-workbench.test.js
git diff --exit-code 13600821c5c6f610e04672a15112c6d576100fa0 -- data/
git diff --check
```

The browser harness uses native CDP, a temporary isolated browser profile and a
local read-only gzip server, then closes them. Set CHROME_PATH to a Chrome/Chromium
executable on another host. It writes JSON and PNG evidence into the chosen local
output directory. No production services or browser profile are used.

- Exact Dashboard CI-selected Node lane: **363 PASS, 2 existing skips, 0 FAIL**
  (365 tests). The skips have no qualified Altman Z-prime result or available
  historical valuation multiple in this release; no evidence is manufactured.
- All six CI Python suites: **83 PASS**. All asset JavaScript syntax checks PASS.
- Existing 1,683-ticker research-contract suite PASS. An additional loader test
  checks every original field of all 1,683 cards, 25 source shard downloads total,
  concurrent requests beyond LRU capacity, eviction recovery and release isolation.
- Expanded all-Node run: **508 PASS, 2 skips, 5 baseline FAIL**. All five are in
  `tests/dashboard-home-payload-efficiency.test.js`, outside the CI-selected lane.
  The exact base test source reproduces the same five failures against unchanged
  Home code and published inputs (7 tests: 2 PASS, 5 FAIL). These older assertions
  expect a full-index fallback/older notable cards that the published Home no longer
  uses. No Home code/data/test changes are made to hide them.
- Generated `data/` is byte-unchanged from the base. Producer canonical values and
  comparability calculations are unchanged. No financial score/authority is added.

## Local disposition

Bounded Workbench performance/reliability continuation is ready for local review;
working tree checkpoint only. Existing unrelated Home-test debt is explicit above.
Cold full-shard bandwidth/parse cost, local reparse on LRU miss and native gzip
CPU work remain limits. A smaller published comparison payload would require a
separate Producer-owned contract; it is not implemented or assumed here.
