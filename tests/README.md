# Dashboard tests: two lanes

Dashboard CI runs on two kinds of change, and they need different proof.

| Lane | When | What gates it |
| --- | --- | --- |
| `data` | A Daily publication commit: only `data/`, root `*.json` / `*.csv` / `*_latest.md`, generated `report-YYYY-MM-DD.html`, and pages whose only change is the `?v=` cache token; on top of a commit that already has a green Dashboard CI run | The publication integrity gate: the workflow steps without an `if:` |
| `full` | Everything else, every pull request, and anything `tools/ci_change_lane.py` cannot classify | Every step |

## Rules for a test that reads `data/`

1. **A check that must hold for every session goes over all published data.** Name it
   `every published ticker: ...` and it joins the integrity gate. It must not assume a
   market state: no "PAN is AVOID", no "more than 100 tickers are AVOID", no "HPG has at
   least 40 unusable figures". Counts, postures, and gaps are the session's facts.
2. **A scenario about one ticker's state reads a frozen card.** Copy the published card
   verbatim into `tests/fixtures/dossier-scenarios/<TICKER>_<session>_<state>.json`
   (see `PAN_2026-11-09_avoid.json`) and build from that. Do not read the live card and
   assert the state it had on the day the test was written.
3. **When a scenario test fails on a new session, the fix is rule 2**, not editing the
   expectation to match today.

On the `data` lane the code-behaviour tests still run as an advisory step, so drift is
visible on the publication commit without blocking it.
