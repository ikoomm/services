"""Validate finance arithmetic, weighted rates, rejected malformed inputs and repeatability."""
import csv
import json
import shutil
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

import compute


class ReportingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.data = Path(self.tmp.name)
        for name in ("fixture-metadata.json", "meta-ads-weekly.csv", "ga4-acquisition-weekly.csv"):
            shutil.copyfile(compute.DATA / name, self.data / name)

    def modify_csv(self, filename, mutation):
        path = self.data / filename
        with path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            headers, rows = reader.fieldnames, list(reader)
        mutation(rows)
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)

    def test_fixture_totals_and_attribution_remain_separate(self):
        report = compute.build_report(self.data)
        self.assertEqual(report["meta"]["previous"]["totals"], {"spend": 420.0, "impressions": 76000, "clicks": 1820, "purchases": 35, "revenue": 1750.0})
        self.assertEqual(report["meta"]["current"]["totals"], {"spend": 490.0, "impressions": 88000, "clicks": 2135, "purchases": 46, "revenue": 2300.0})
        self.assertEqual(report["ga4"]["current"]["totals"], {"sessions": 3850, "engaged_sessions": 2468, "purchases": 72, "revenue": 3600.0})
        self.assertNotEqual(report["meta"]["current"]["totals"]["purchases"], report["ga4"]["current"]["totals"]["purchases"])
        self.assertTrue(report["provenance"]["synthetic"])

    def test_ratios_use_summed_inputs_not_unweighted_average(self):
        meta = compute.build_report(self.data)["meta"]
        self.assertAlmostEqual(meta["current"]["ratios"]["ctr_pct"], 2135 / 88000 * 100, places=6)
        self.assertAlmostEqual(meta["current"]["ratios"]["roas"], 2300 / 490, places=6)
        unweighted = sum(row["current"]["ratios"]["ctr_pct"] for row in meta["rows"]) / 2
        self.assertNotAlmostEqual(meta["current"]["ratios"]["ctr_pct"], unweighted, places=2)

    def test_engagement_change_is_percentage_points_not_percent_change(self):
        report = compute.build_report(self.data)
        delta = report["ga4"]["ratio_deltas"]["engagement_rate_pct"]
        self.assertAlmostEqual(delta["percentage_points"], (2468 / 3850 - 2020 / 3400) * 100, places=6)
        self.assertNotIn("percent_change", delta)

    def test_revenue_percent_change_and_decimal_money(self):
        meta = compute.build_report(self.data)["meta"]
        self.assertEqual(meta["deltas"]["revenue"]["absolute"], 550.0)
        self.assertAlmostEqual(meta["deltas"]["revenue"]["percent_change"], 550 / 1750 * 100, places=6)
        self.assertEqual(compute.number(Decimal("0.10") + Decimal("0.20"), 2), 0.3)

    def test_zero_baseline_is_explicit_even_when_both_zero(self):
        for current in (Decimal(0), Decimal(5)):
            delta = compute.change(current, Decimal(0))
            self.assertIsNone(delta["percent_change"])
            self.assertEqual(delta["reason"], "zero_previous_baseline")

    def test_zero_denominators_produce_null_and_reason(self):
        values = {name: Decimal(0) for name in compute.SPEC["meta"]["metrics"]}
        result = compute.snapshot(values, "meta")
        self.assertTrue(all(value is None for value in result["ratios"].values()))
        self.assertTrue(all(value == "zero_denominator" for value in result["ratio_notes"].values()))

    def test_missing_metric_fails_instead_of_zero_filling(self):
        self.modify_csv("meta-ads-weekly.csv", lambda rows: rows[0].update(spend=""))
        with self.assertRaisesRegex(ValueError, "Missing metric: spend"):
            compute.build_report(self.data)

    def test_mismatched_row_period_fails(self):
        self.modify_csv("ga4-acquisition-weekly.csv", lambda rows: rows[0].update(period_end="2026-09-19"))
        with self.assertRaisesRegex(ValueError, "Row period"):
            compute.build_report(self.data)

    def test_incomplete_or_nonadjacent_weeks_fail(self):
        for periods in (
            {"previous": {"start": "2026-09-15", "end": "2026-09-20"}, "current": {"start": "2026-09-21", "end": "2026-09-27"}},
            {"previous": {"start": "2026-09-07", "end": "2026-09-13"}, "current": {"start": "2026-09-21", "end": "2026-09-27"}},
        ):
            with self.subTest(periods=periods), self.assertRaises(ValueError):
                compute.validate_periods(periods)

    def test_duplicate_or_missing_dimension_is_rejected(self):
        self.modify_csv("meta-ads-weekly.csv", lambda rows: rows.pop())
        with self.assertRaisesRegex(ValueError, "same non-empty dimension set"):
            compute.build_report(self.data)

    def test_nonfinite_negative_fractional_count_is_rejected(self):
        for raw in ("NaN", "Infinity", "-1", "1.5"):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                compute.metric_value(raw, "sessions")

    def test_engaged_sessions_cannot_exceed_sessions(self):
        self.modify_csv("ga4-acquisition-weekly.csv", lambda rows: rows[0].update(engaged_sessions="9999"))
        with self.assertRaisesRegex(ValueError, "Engaged sessions"):
            compute.build_report(self.data)

    def test_output_is_deterministic_and_finite_json(self):
        first = compute.encoded_report(self.data)
        second = compute.encoded_report(self.data)
        self.assertEqual(first, second)
        parsed = json.loads(first)
        self.assertEqual(len(parsed["meta"]["summary"]), 3)
        self.assertEqual(len(parsed["ga4"]["summary"]), 3)
        self.assertNotIn(b"NaN", first)
        self.assertNotIn(b"Infinity", first)


if __name__ == "__main__":
    unittest.main()
