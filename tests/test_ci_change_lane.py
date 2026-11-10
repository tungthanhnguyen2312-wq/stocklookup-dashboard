"""Lane classification for Dashboard CI: only pure publication payload takes the data lane."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import ci_change_lane as lane  # noqa: E402

STAMP_ONLY = lambda path: False  # noqa: E731
REAL_EDIT = lambda path: True  # noqa: E731

DAILY = [
    ("M", "data/workspace_index.json"), ("A", "data/sessions/2026-11-10.json"),
    ("M", "analysis_bundle.json"), ("M", "screen_snapshot.csv"), ("M", "ai_report_latest.md"),
    ("A", "report-2026-11-10.html"), ("M", "report-2026-11-09.html"), ("M", "index.html"),
]


class ChangeLaneTest(unittest.TestCase):
    def test_daily_publication_commit_takes_the_data_lane(self):
        self.assertEqual(lane.classify(DAILY, STAMP_ONLY)[0], lane.DATA)

    def test_any_code_test_workflow_or_tool_path_takes_the_full_lane(self):
        for path in ("assets/js/investigation-workbench.js", "assets/css/tailwind.generated.css",
                     "tests/release-smoke.test.js", ".github/workflows/dashboard-ci.yml",
                     "tools/ci_change_lane.py", "publish_dashboard.py", "app.js", "style.css",
                     "README.md", "config/x.json", "docs/a.md"):
            self.assertEqual(lane.classify(DAILY + [("M", path)], STAMP_ONLY), (lane.FULL, f"M {path}"))

    def test_a_page_edited_beyond_its_cache_token_takes_the_full_lane(self):
        self.assertEqual(lane.classify([("M", "index.html")], REAL_EDIT)[0], lane.FULL)
        self.assertEqual(lane.classify([("A", "new-page.html")], STAMP_ONLY)[0], lane.FULL)
        self.assertEqual(lane.classify([("D", "index.html")], STAMP_ONLY)[0], lane.FULL)

    def test_unknown_statuses_and_empty_diffs_take_the_full_lane(self):
        self.assertEqual(lane.classify([], STAMP_ONLY)[0], lane.FULL)
        self.assertEqual(lane.classify([("T", "data/x.json")], STAMP_ONLY)[0], lane.FULL)
        self.assertEqual(lane.classify([("D", "analysis_bundle.json")], STAMP_ONLY)[0], lane.FULL)

    def test_only_the_cache_token_is_ignored_when_comparing_pages(self):
        a = b'<link href="style.css?v=2026-11-09-aa132ca-1"><script src="a.js?v=1"></script>'
        b = b'<link href="style.css?v=2026-11-10-aa132ca-2"><script src="a.js?v=2"></script>'
        self.assertEqual(lane.strip_stamp(a), lane.strip_stamp(b))
        self.assertNotEqual(lane.strip_stamp(a), lane.strip_stamp(b.replace(b"a.js", b"b.js")))


if __name__ == "__main__":
    unittest.main()
