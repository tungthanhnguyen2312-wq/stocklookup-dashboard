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

### Financial quality (Consumer PR #13, optional)

A case built with Producer `research financial-quality` outputs carries
`financial_quality_research`. The viewer shows it in its own section, "Chất lượng lợi nhuận
và dòng tiền", between the decision distinctions and the thesis challenge. A case without
the block renders byte-for-byte as before. For each source and ticker, the section shows the
Producer's state and exact rows for:

- reported profit;
- source-labelled unusual or provision components (recurrence `UNKNOWN`, normalization
  `NOT_CALCULATED`);
- whether operating cash can be compared with profit, with the blockers and any cash
  figures from other periods (listed, never paired);
- recurring-earnings evidence, cautions and unknowns;
- the limits of the valuation denominator;
- the evidence that would confirm or invalidate the financial thesis;
- any other Producer source figures that no answer cites.

Each fact keeps its period dates, scope, assurance, line and page, knowledge time and
document hash. Producer text is shown verbatim beside the Vietnamese label.

The source boundary is explicit:

- **Exact binding is re-checked, not trusted.** `EXACT_CASE_RUN_SOURCE_PROJECTION` is
  accepted only when it names the case's own session, run identity and bundle hash.
- **Exact binding is still a later consultation.** It is labelled as figures from the run's
  own source, with an explanation looked up later (with its consultation time). It is never
  an original T0 conclusion or a delivered Daily card.
- **Every other binding is separate context.** It is shown under a warning as later/current
  context outside every case session. The same ticker or date is not proof of the same run.

A malformed or inconsistent block refuses the file with `BAD_FINANCIAL_QUALITY` and
leaves any open case in place. That covers an unknown binding, a binding that doesn't match
the case run, pins that don't match the request, a bridge referencing an unknown output, and
rows of the wrong ticker. Malformed answer values inside an accepted block degrade to
placeholders. The page computes no normalized earnings, EPS, multiple, score or instruction.
Every figure in the section is a value from the file.

When a case is open, the dossier of any member ticker shows a notice linking back to the
case. The case view links to the current dossier of each member that is published.

## Fixtures

`tests/fixtures/case_desk/` holds trimmed excerpts of the three Consumer PR #12
acceptance cases: HPG, NVL and the five-company FPT/HPG/PNJ/TPB/VNM basis case.
`build_case_desk_review_fixtures.py` regenerates them byte-for-byte from the output of
`python tools/run_investment_case_excerpt_acceptance.py --output-dir <dir>`. It only
removes content; the case identities match the Consumer acceptance receipt.

Three more fixtures come from Consumer PR #13 (`3f47640`):

- `case_fq_exact.json`: FPT/HPG/PNJ/VNM. Both October 22/23 outputs bind exactly.
- `case_fq_separate.json`: the same request with three sessions. The October 23 output stays
  separate context.
- `case_fq_cross_sector.json`: the full retained original bundles for 2026-10-20..23, with
  QNS, POW and VCI added. All four outputs bind exactly.

The same builder regenerates them from `python tools/run_case_financial_quality_acceptance.py
--output-dir <dir>` (with `--retained-root` for the cross-sector case), and keeps the
`financial_quality_research` block whole.
