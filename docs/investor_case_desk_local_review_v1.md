# Investor Case Desk local review V1

Milestone `INVESTOR_CASE_DESK_LOCAL_REVIEW_INTEGRATION_V1`. The Cơ hội page gains a
**Hồ sơ Case Desk** view. It opens one `investment_research_case.json` written by the
Consumer Investment Research Case Desk (stocklookup-ai-research `research-case`,
contract `investment_research_case/v1`) and shows it inside the existing investigation
workflow. The Dashboard does not analyse anything new: it validates, regroups and labels
what the case already states.

## Privacy

- The file is read with `FileReader` in the open tab only. No upload, server call, URL
  parameter, `localStorage`, `sessionStorage` or IndexedDB write. A reload forgets it.
- `tests/case-desk-review.test.js` fails if the module gains a network, storage or URL
  write path.
- Nothing about the case is published. GitHub Pages serves only the viewer code.

## Import rules

A file is rejected, and any case already open stays open, when:

- it is over 8 MB, empty, not JSON, or not a JSON object;
- `contract_version` is not `investment_research_case/v1`, or `case_identity` is malformed;
- `authority_boundary.is_actionable` is not `false`, or the Producer is not the sole
  factual and numerical authority;
- it has 0 or more than 20 members, or a duplicate or malformed ticker;
- `session_basis` has 0 or more than 10 sessions, is not strictly increasing, lacks a run
  identity or bundle hash, or disagrees with `request.sessions`;
- an overview, decision-distinction or thesis-challenge row names a ticker outside the
  members, or a decision-distinction session is not one of the case sessions;
- an evidence row has a malformed or duplicate identity, or cites a ticker or session
  outside the case.

The case identity is shown verbatim. The browser does not recompute it.

## What is shown for each member

- **Session comparison.** The case's latest session, posture and integrated trigger state
  sit beside the currently published session, posture and trigger state. An older case is
  labelled as older research. The Dashboard does not publish a Producer run identity, so a
  case with the same date is labelled `SAME_DATE_RUN_NOT_VERIFIED`, never "same run".
- **Decision distinctions:**
  - reported vs non-recurring earnings, with the Producer components and their `valuation_use`;
  - profit vs comprehensive income (OCI is shown as not supplied, never filled in);
  - cash conversion;
  - sector-compatible valuation, with every bank/corporate refusal;
  - qualified observations vs attributed source inferences;
  - each condition's exact Producer state, or the explicit absence of one.
- **Triggered conditions.** A `TRIGGERED` state carries a fixed notice: it is a technical
  condition, not confirmation of the fundamental thesis, not a buy recommendation, and it
  does not replace the research posture. The posture at the case session is shown next to it.
- **Thesis challenge.** Producer support with its qualifications, the strongest grounded
  counter-thesis (selected by fixed precedence, not a strength score), unresolved
  contradictions and what may not be concluded.
- **The investor's questions and hypotheses.** These are shown as human framing that has
  not been verified, with the evidence the case delivered in each chosen domain and the
  input still needed.
- **Evidence gaps, comparison blockers and the case's conclusion limits.**

When a case is open, the dossier of any member ticker shows a notice linking back to the
case. The case view links to the current dossier of each member that is published.

## Fixtures

`tests/fixtures/case_desk/` holds trimmed excerpts of the three Consumer PR #12
acceptance cases: HPG, NVL and the five-company FPT/HPG/PNJ/TPB/VNM basis case.
`build_case_desk_review_fixtures.py` regenerates them byte-for-byte from the output of
`python tools/run_investment_case_excerpt_acceptance.py --output-dir <dir>`. It only
removes content; the case identities match the Consumer acceptance receipt.
