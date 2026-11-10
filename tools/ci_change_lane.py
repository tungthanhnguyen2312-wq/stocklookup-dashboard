"""Decide which Dashboard CI lane a change needs.

A Daily publication commit changes published data and re-stamps the ``?v=`` cache
token in every page; it changes no code. Code-behaviour tests that were green on the
code commit cannot tell anything new about such a commit, and the ones written around
a named ticker's market state on the day they were authored (PAN is AVOID, TPB holds
a specific posture, HPG has one particular blocked question) turn red as soon as the
market moves. That stopped five of seven Daily publications between 2026-11-02 and
2026-11-10 without a single defect in the published bytes.

Lanes:

* ``data`` - every changed path is publication payload. CI runs the publication
  integrity gate only: checks quantified over all published data.
* ``full`` - anything else, and anything this module cannot classify. CI runs every
  step. Unknown is always ``full``.

Usage: ``python tools/ci_change_lane.py <base> <head>`` prints ``lane=<lane>`` and one
``reason=`` line; with ``GITHUB_OUTPUT`` set it also writes ``lane`` there.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from typing import Callable, Iterable

DATA = "data"
FULL = "full"

_STAMP = re.compile(rb"\?v=[^\"'&\s<>]+")
_GENERATED_REPORT = re.compile(r"^report-\d{4}-\d{2}-\d{2}\.html$")
_ROOT_PAYLOAD = re.compile(r"^[A-Za-z0-9_.-]+\.(json|csv)$|^[A-Za-z0-9_.-]+_latest\.md$")

_ROOT_CODE = {"package.json", "package-lock.json", "vercel.json", "tsconfig.json"}


def strip_stamp(content: bytes) -> bytes:
    return _STAMP.sub(b"", content)


def classify(
    changes: Iterable[tuple[str, str]],
    html_differs_beyond_stamp: Callable[[str], bool],
) -> tuple[str, str]:
    """Return ``(lane, reason)`` for ``(status, path)`` rows of a first-parent diff."""
    rows = list(changes)
    if not rows:
        return FULL, "empty diff"
    for status, path in rows:
        if path.startswith("data/"):
            if status[:1] in {"A", "M", "D"}:
                continue
            return FULL, f"{status} {path}"
        if "/" in path:
            return FULL, f"{status} {path}"
        if _ROOT_PAYLOAD.match(path) and path not in _ROOT_CODE:
            if status[:1] in {"A", "M"}:
                continue
            return FULL, f"{status} {path}"
        if path.endswith(".html"):
            if status in {"A", "M"} and _GENERATED_REPORT.match(path):
                continue
            if status == "M" and not html_differs_beyond_stamp(path):
                continue
            return FULL, f"{status} {path}"
        return FULL, f"{status} {path}"
    return DATA, f"{len(rows)} publication payload paths"


def _git(*args: str) -> bytes:
    return subprocess.run(["git", *args], check=True, capture_output=True).stdout


def lane_for_range(base: str, head: str) -> tuple[str, str]:
    try:
        raw = _git("diff", "--name-status", "--no-renames", "-z", base, head).decode("utf-8")
    except (subprocess.CalledProcessError, UnicodeDecodeError) as exc:
        return FULL, f"diff unavailable: {type(exc).__name__}"
    parts = [p for p in raw.split("\0") if p]
    if len(parts) % 2:
        return FULL, "unparseable diff"
    changes = list(zip(parts[0::2], parts[1::2]))

    def differs(path: str) -> bool:
        try:
            return strip_stamp(_git("show", f"{base}:{path}")) != strip_stamp(_git("show", f"{head}:{path}"))
        except subprocess.CalledProcessError:
            return True

    return classify(changes, differs)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: ci_change_lane.py <base> <head>", file=sys.stderr)
        return 2
    lane, reason = lane_for_range(argv[1], argv[2])
    print(f"lane={lane}")
    print(f"reason={reason}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"lane={lane}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
