# Investor evidence investigation workbench (V1)

The Cơ hội page (`investment-workspace.html`) has three workbench views next to the existing ones:

| View | Deep link | What it does |
| --- | --- | --- |
| Hồ sơ điều tra | `?view=dossier&ticker=HPG` | One ticker: Producer posture and strategy, evidence for and against, technical and market context, what fundamentals and valuation establish or lack, confirmation / weakening / invalidation conditions, verification questions derived from published gaps, freshness, provenance, public history. |
| So sánh | `?view=compare&tickers=HPG,FPT&session=2026-10-23` | 2–5 tickers from one session. Values sit side by side only when method, period, share basis, entity class and statement scope match; everything else is marked not comparable with the reason. |
| Sổ nghiên cứu | `?view=journal` | Personal hypothesis, questions (open / reviewed) and conditions, stored in this browser only under `stocklookup.investigation-journal.v1`. Export / import as JSON. |

All logic lives in `assets/js/investigation-workbench.js`. It regroups, labels and counts published
Producer fields; it does not derive postures, scores, ranks, targets, probabilities or sizes. A
cross-security statistic is computed only if the index declares it in
`permitted_cross_security_statistics`; `workspace_index/v1` declares none, so none is computed.

## Data loading cost

Per-ticker detail lives in 25 shard files (`data/workspace_detail/<letter>.json`) of 0.2–18 MB
each (2026-10-23 release: 162 MB raw in total, about 20 MB gzip). Measured for that release:

| Action | Shards fetched | Raw JSON | Gzip on the wire |
| --- | --- | --- | --- |
| Open Cơ hội, no ticker opened | none | 0 | 0 |
| Open one ticker (drawer or dossier) | 1 | up to 18 MB | up to 2.2 MB |
| Compare HPG, FPT, PNJ, NVL, VNM | F, H, N, P, V | 55.9 MB | 7.0 MB |
| Compare HPG, FPT, PNJ, TCB, VCB | F, H, P, T, V | 64.4 MB | 8.0 MB |
| Compare five tickers in the five largest shards (worst case) | 5 | 79.0 MB | 9.8 MB |
| Compare SSI, SHB, STB, SAB, SBT (one shard) | S | 17.2 MB | 2.2 MB |

- Shards are fetched only on demand (opening a ticker's details, a dossier, a comparison, or
  printing). Selecting a ticker without opening its details fetches nothing.
- `workspace-read-model.js` shares downloads and concurrent parses per shard/release. It keeps
  lossless source Blobs (natively gzipped after the requesting view is built) and an LRU of 32
  original ticker cards, instead of retaining every parsed ticker in a shard. Failed transfers
  and malformed/identity-mismatched responses can be retried explicitly.
- The original full detail remains accessible. Opening an uncached ticker or revisiting an
  evicted card reparses retained local bytes, without a second successful shard download.
  Browsers without native compression keep original Blobs. Initial transfer/parse volume is
  unchanged: the index lacks the detailed method/period/scope operands needed for comparison.
- [Measured performance and interaction acceptance](investigation_workbench_performance_v1.md)
  records the real-data results, memory/latency tradeoffs and reproducible browser commands.

## Public history

The only per-ticker history the public Dashboard publishes is the rotating set of about 12 thesis
focus cards in each `data/session_YYYY_MM_DD_manifest.json` (lens states only). The dossier loads it
on demand by probing about 30 recent weekdays; days without a published manifest return 404 and
are skipped. Posture history per ticker is not published, and the page says so.
