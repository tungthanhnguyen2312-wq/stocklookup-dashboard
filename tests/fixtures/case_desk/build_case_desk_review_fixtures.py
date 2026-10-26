"""Build the sanitized Case Desk fixtures used by tests/case-desk-review.test.js.

INVESTOR_CASE_DESK_LOCAL_REVIEW_INTEGRATION_V1. The inputs are the genuine
`investment_research_case.json` files written by the Consumer acceptance command
(stocklookup-ai-research, `python tools/run_investment_case_excerpt_acceptance.py
--output-dir <dir>`). This script only removes content: it keeps the sections the
Dashboard case viewer renders, keeps the evidence rows those sections reference and
drops `findings`, `temporal_review`, `source_transport` and every unreferenced row.
No value, code, text or identity is rewritten, so the fixtures stay faithful excerpts
(their `case_identity` is the original identity of the full case, not of the excerpt).

Financial-quality cases (Consumer PR #13) come from `python tools/run_case_financial_quality_acceptance.py
--output-dir <dir> [--retained-root <daily-producer-runs root>]`; their optional
`financial_quality_research` block is kept whole. `fq-separate` is the same excerpt
request with three sessions and only the October 23 output, so it stays separate context.
A case directory missing from the given output dir is skipped, so each acceptance
output dir rebuilds only its own fixtures.

Usage: python tests/fixtures/case_desk/build_case_desk_review_fixtures.py <acceptance-output-dir>
"""
import json
import sys
from pathlib import Path

CASES = {
    "hpg-business-vs-technical": "case_hpg.json",
    "nvl-thesis-challenge": "case_nvl.json",
    "mixed-company-basis": "case_mixed_basis.json",
    "excerpt-after": "case_fq_exact.json",
    "fq-separate": "case_fq_separate.json",
    "retained-after": "case_fq_cross_sector.json",
}
OUT_DIR = Path(__file__).resolve().parent
PER_LIST = 6


def _ids(value, found):
    if isinstance(value, str):
        if value.startswith("case_evidence:"):
            found.add(value)
    elif isinstance(value, list):
        for item in value:
            _ids(item, found)
    elif isinstance(value, dict):
        for item in value.values():
            _ids(item, found)


def _cap_lists(value):
    if isinstance(value, list):
        return [_cap_lists(v) for v in value[:PER_LIST]]
    if isinstance(value, dict):
        return {k: _cap_lists(v) for k, v in value.items()}
    return value


def trim(case):
    latest = case["session_basis"][-1]["session"]
    out = {key: case[key] for key in (
        "contract_version", "case_identity", "status", "coverage", "authority_boundary",
        "conclusion_limits", "request", "session_basis", "overview", "decision_distinctions",
        "grouped_next_investigation",
    )}
    out["thesis_challenges"] = _cap_lists(case["thesis_challenges"])
    out["question_investigations"] = _cap_lists(case["question_investigations"])
    out["comparisons"] = [
        {"session": c["session"], "pairs": [
            {k: p.get(k) for k in ("tickers", "status", "blockers", "cautions", "winner", "superiority")}
            for p in c["pairs"]
        ]}
        for c in case["comparisons"] if c["session"] == latest
    ]
    out["current_profiles"] = [
        {
            "ticker": p["ticker"],
            "research_role": p.get("research_role"),
            "economics": p.get("economics"),
            "evidence_limits": {
                "missing_evidence": p.get("evidence_limits", {}).get("missing_evidence", [])[:PER_LIST],
                "narrative_guards": p.get("evidence_limits", {}).get("narrative_guards", []),
            },
        }
        for p in case["current_profiles"]
    ]
    if "financial_quality_research" in case:
        out["financial_quality_research"] = case["financial_quality_research"]
    referenced = set()
    _ids([out["decision_distinctions"], out["thesis_challenges"], out["question_investigations"],
          out["grouped_next_investigation"]], referenced)
    out["evidence_catalogue"] = [e for e in case["evidence_catalogue"] if e["evidence_identity"] in referenced]
    return out


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    root = Path(argv[1])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, target in CASES.items():
        source = root / name / "investment_research_case.json"
        if not source.exists():
            print(f"{target}: skipped, {name} not in this output dir")
            continue
        case = json.loads(source.read_text(encoding="utf-8"))
        text = json.dumps(trim(case), ensure_ascii=False, indent=1, sort_keys=True) + "\n"
        (OUT_DIR / target).write_text(text, encoding="utf-8", newline="\n")
        print(f"{target}: {len(text.encode('utf-8'))} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
