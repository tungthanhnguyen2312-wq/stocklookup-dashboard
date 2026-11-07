"""Test suite for DASHBOARD_CANONICAL_DAILY_COHERENCE_AND_VI_LOCALIZATION_V1.

Verifies:
1. Session coherence and fail-closed contract.
2. Static scan for forbidden hardcoded current-session dates and metrics in UI source.
3. Centralized Vietnamese localization layer mappings and behavior.
4. Screener controls and structure presentation layer.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

DASHBOARD_ROOT = Path(__file__).resolve().parents[1]
if str(DASHBOARD_ROOT) not in sys.path:
    sys.path.insert(0, str(DASHBOARD_ROOT))

import release_session_contract


class CanonicalDailyCoherenceAndViLocalizationTests(unittest.TestCase):
    def test_value_format_node_export(self):
        """Verify value-format.js loads in Node.js and exports all required formatters."""
        script = """
        const vf = require('./assets/js/value-format.js');
        const assert = require('assert');

        // 1. Structure
        assert.strictEqual(vf.formatStructure('UP').label, 'Tăng giá');
        assert.strictEqual(vf.formatStructure('side').label, 'Đi ngang');
        assert.strictEqual(vf.formatStructure('DOWN').label, 'Giảm giá');
        assert.strictEqual(vf.formatStructure(null).label, '–');
        assert(vf.formatStructureBadge('UP').includes('Tăng giá'));
        assert(vf.formatStructureBadge('UP').includes('bs-green'));
        assert.strictEqual(vf.formatStructure('BELOW_MA20_MOMENTUM_NEGATIVE').label, 'Dưới MA20, động lượng tiêu cực');
        assert.strictEqual(vf.formatMomentum('BELOW_MA20_MOMENTUM_NEGATIVE'), 'Dưới MA20, động lượng tiêu cực');
        assert(vf.formatStructureBadge('BELOW_MA20_MOMENTUM_NEGATIVE').includes('Dưới MA20, động lượng tiêu cực'));
        assert(vf.formatStructureBadge('BELOW_MA20_MOMENTUM_NEGATIVE').includes('data-structure="BELOW_MA20_MOMENTUM_NEGATIVE"'));
        assert(vf.formatStructureBadge('NOT_AVAILABLE').includes('Chưa có'));
        assert(vf.formatSectorLineage('QUALIFIED_CLASSIFICATION|QUALIFIED_ENTITY_CLASS|corporate').label === 'Doanh nghiệp');
        assert.strictEqual(vf.formatRuleCondition('TACTICAL_STATE_AWAITING_CONFIRMATION'), 'Chưa có đủ tín hiệu xác nhận xu hướng');

        // 2. Directions - NEVER Bò / Gấu
        assert.strictEqual(vf.formatDirection('bullish'), 'Tăng giá');
        assert.strictEqual(vf.formatDirection('bearish'), 'Giảm giá');
        assert.strictEqual(vf.formatDirection('neutral'), 'Trung tính');
        assert(!vf.formatDirection('bullish').toLowerCase().includes('bò'));
        assert(!vf.formatDirection('bearish').toLowerCase().includes('gấu'));

        // 3. Momentum phrases
        assert.strictEqual(vf.formatMomentum('Above MA20 momentum positive'), 'Trên MA20, động lượng tích cực');
        assert.strictEqual(vf.formatMomentum('Below MA20 momentum negative'), 'Dưới MA20, động lượng tiêu cực');
        assert.strictEqual(vf.formatMomentum('momentum'), 'Động lượng');
        assert.strictEqual(vf.formatMomentum('watch'), 'Theo dõi');

        // 4. Freshness
        assert.strictEqual(vf.formatFreshness('current'), 'Hiện tại');
        assert.strictEqual(vf.formatFreshness('stale'), 'Đã cũ');
        assert.strictEqual(vf.formatFreshness('unavailable'), 'Chưa có dữ liệu');

        // 5. Research States
        assert.strictEqual(vf.formatResearchState('BREAKOUT_READY'), 'Sẵn sàng bứt phá');
        assert.strictEqual(vf.formatResearchState('BASE_BUILDING'), 'Đang tạo nền');
        assert.strictEqual(vf.formatResearchState('EARLY_REVERSAL_CANDIDATE'), 'Ứng viên đảo chiều sớm');
        assert.strictEqual(vf.formatResearchState('WAIT_FOR_CONFIRMATION'), 'Chờ xác nhận');
        assert.strictEqual(vf.formatResearchState('AVOID_NEW_ENTRY'), 'Tránh mở vị thế mới');
        assert.strictEqual(vf.formatResearchState('HIGH_RISK_SPECULATION_ONLY'), 'Chỉ đầu cơ rủi ro cao');

        // 5b. Governed domain formatter
        assert.strictEqual(vf.formatResearchStance('INITIATE_RESEARCH_CANDIDATE'), 'Ứng viên nghiên cứu mở vị thế');
        assert.strictEqual(vf.formatTacticalState('SELLING_PRESSURE_EASING'), 'Áp lực bán đang hạ nhiệt');
        assert.strictEqual(vf.formatDomainState('WAIT_FOR_CONFIRMATION', 'research_stance').raw, 'WAIT_FOR_CONFIRMATION');
        assert.strictEqual(vf.formatDomainState('LIQUIDITY_RESEARCH_PROXY', 'liquidity_state').label, 'Thanh khoản nghiên cứu');
        assert.ok(!/Mua|Nên mua/.test(vf.formatConfirmationState('READY')));

        // 6. Screener labels
        assert.strictEqual(vf.SCREENER_UI_LABELS.presets.leaders, 'Dẫn đầu');
        assert.strictEqual(vf.SCREENER_UI_LABELS.presets.momentum, 'Động lượng');
        assert.strictEqual(vf.SCREENER_UI_LABELS.presets.liquid, 'Thanh khoản');
        assert.strictEqual(vf.SCREENER_UI_LABELS.presets.clean, 'Mã sạch');
        assert.strictEqual(vf.SCREENER_UI_LABELS.controls.exchange, 'Sàn');
        assert.strictEqual(vf.SCREENER_UI_LABELS.controls.signal, 'Tín hiệu');

        console.log('PASS_VALUE_FORMAT_NODE');
        """
        res = subprocess.run(
            ["node", "-e", script],
            cwd=str(DASHBOARD_ROOT),
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"Node script failed: {res.stderr}")
        self.assertIn("PASS_VALUE_FORMAT_NODE", res.stdout)

    def test_no_hardcoded_current_session_dates_in_html_source(self):
        """Verify HTML sources do not contain hardcoded current-session banners or fixed counts."""
        dashboard_html = (DASHBOARD_ROOT / "dashboard.html").read_text(encoding="utf-8")
        self.assertNotIn("Phiên 25/08/2026", dashboard_html)
        self.assertNotIn("95 Cơ hội chiến thuật", dashboard_html)
        self.assertNotIn("888/893 Khảo sát", dashboard_html)
        self.assertIn('id="dashboard-hero-banner"', dashboard_html)

    def test_screener_controls_localized_in_html(self):
        """Verify current master-projection Screener controls are presented in Vietnamese."""
        screener_html = (DASHBOARD_ROOT / "screener.html").read_text(encoding="utf-8")
        localized_controls = (
            "<label>Tìm<input",
            "<label>Sàn<select",
            "<label>Ngành<select",
            # CURRENT_DECISION_SURFACE_CONVERGENCE_V1: the primary decision control is the action
            # posture; the research stance survives as a secondary research-screen control.
            "<label>Quyết định hành động<select",
            "<label>Độ mới bằng chứng<select",
            "<label>Sàng lọc nghiên cứu (phụ)<select",
            "<label>Trạng thái kỹ thuật<select",
            "<label>Tài chính<select",
            "<label>Thanh khoản nghiên cứu<select",
            "<label>Độ mới<select",
        )
        for markup in localized_controls:
            self.assertIn(markup, screener_html)

        english_regressions = (
            "<label>Search",
            "<label>Exchange",
            "<label>Industry",
            "<label>Research stance",
            "<label>Technical status",
            "<label>Financials",
            "<label>Research liquidity",
            "<label>Freshness",
        )
        for markup in english_regressions:
            self.assertNotIn(markup, screener_html)

        self.assertIn('<option value="CURRENT">Hiện tại</option>', screener_html)
        self.assertIn('<option value="NOT_CURRENT">Không hiện tại</option>', screener_html)
        self.assertIn('<option value="ABSENT">Chưa có dữ liệu tài chính</option>', screener_html)
        self.assertIn('<option value="PROXY">Proxy nghiên cứu</option>', screener_html)

    def test_release_session_contract_mismatch_fails_closed(self):
        """Verify release_session_contract fails closed on mixed sessions."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            snap = tmp_path / "screen_snapshot.csv"
            snap.write_text("ticker,exchange,date\nVNM,HSX,2026-08-28\n", encoding="utf-8")
            breadth = tmp_path / "market_breadth.csv"
            breadth.write_text("ticker,exchange,date\nVNM,HSX,2026-08-28\n", encoding="utf-8")
            analysis = tmp_path / "analysis_latest.json"
            analysis.write_text(json.dumps({"summary": {"session_date": "2026-08-27"}}), encoding="utf-8")

            manifest = tmp_path / "bundle_manifest.json"
            manifest.write_text(json.dumps({"freshness": {"reference_session": "2026-08-28"}}), encoding="utf-8")

            report = release_session_contract.resolve_release_session(
                tmp_path,
                ["screen_snapshot.csv", "market_breadth.csv", "analysis_latest.json"],
            )
            self.assertFalse(report.ready)
            mismatches = report.mismatch_lines()
            self.assertTrue(any("analysis_latest.json" in m for m in mismatches))


if __name__ == "__main__":
    unittest.main()
