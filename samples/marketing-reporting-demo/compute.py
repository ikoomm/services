"""Compute two independent reports from explicitly synthetic weekly CSV fixtures.

Standard library only; no credentials, external APIs or n8n execution. Decimal
arithmetic precedes presentation rounding. Source money values have <=2 decimal
places; derived ratios and changes are rounded to 6 places, half up.
"""
from __future__ import annotations

import argparse
import csv
import json
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
ZERO = Decimal(0)
MONEY = {"spend", "revenue"}
SPEC = {
    "meta": {"dimension": "campaign", "metrics": ("spend", "impressions", "clicks", "purchases", "revenue")},
    "ga4": {"dimension": "channel", "metrics": ("sessions", "engaged_sessions", "purchases", "revenue")},
}
FORMULAS = {
    "meta": {
        "ctr_pct": ("clicks", "impressions", 100),
        "cpc": ("spend", "clicks", 1),
        "cpm": ("spend", "impressions", 1000),
        "cpa": ("spend", "purchases", 1),
        "roas": ("revenue", "spend", 1),
    },
    "ga4": {
        "engagement_rate_pct": ("engaged_sessions", "sessions", 100),
        "purchase_rate_pct": ("purchases", "sessions", 100),
        "revenue_per_session": ("revenue", "sessions", 1),
    },
}


def number(value: Decimal | None, places: int = 6) -> float | None:
    if value is None:
        return None
    result = value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    return float(result) if result else 0.0


def divide(numerator: Decimal, denominator: Decimal, scale: int = 1) -> Decimal | None:
    return numerator * scale / denominator if denominator else None


def change(current: Decimal, previous: Decimal) -> dict:
    delta = current - previous
    result = {"absolute": number(delta), "percent_change": number(divide(delta, previous, 100))}
    if previous == 0:
        result["reason"] = "zero_previous_baseline"
    return result


def validate_periods(periods: dict) -> None:
    parsed = {}
    for key in ("previous", "current"):
        try:
            start = date.fromisoformat(periods[key]["start"])
            end = date.fromisoformat(periods[key]["end"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Invalid {key} reporting period") from exc
        if start.weekday() != 0 or end.weekday() != 6 or (end - start).days != 6:
            raise ValueError("Reporting periods must be complete Monday-Sunday weeks")
        parsed[key] = (start, end)
    if parsed["current"][0] != parsed["previous"][1] + timedelta(days=1):
        raise ValueError("Reporting periods must be adjacent and non-overlapping")


def metric_value(raw: str | None, metric: str) -> Decimal:
    if raw is None or not raw.strip():
        raise ValueError(f"Missing metric: {metric}")
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid metric: {metric}") from exc
    if not value.is_finite() or value < 0:
        raise ValueError(f"Metric must be finite and non-negative: {metric}")
    if metric not in MONEY and value != value.to_integral_value():
        raise ValueError(f"Count metric must be an integer: {metric}")
    if metric in MONEY and value != value.quantize(Decimal("0.01")):
        raise ValueError(f"Money metric has more than two decimal places: {metric}")
    return value


def load_rows(path: Path, source: str, metadata: dict) -> dict:
    spec = SPEC[source]
    required = {"period_start", "period_end", "currency", "timezone", "synthetic", spec["dimension"], *spec["metrics"]}
    period_lookup = {(v["start"], v["end"]): k for k, v in metadata["periods"].items()}
    grouped = {"previous": {}, "current": {}}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"Missing required CSV columns for {source}")
        if len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError(f"Duplicate CSV columns for {source}")
        for row in reader:
            period = period_lookup.get((row["period_start"], row["period_end"]))
            if period is None:
                raise ValueError(f"Row period does not match configured full weeks: {source}")
            if row["currency"] != metadata["currency"] or row["timezone"] != metadata["timezone"]:
                raise ValueError(f"Currency or timezone mismatch: {source}")
            if row["synthetic"] != "true":
                raise ValueError("Fixture row must explicitly identify synthetic data")
            label = row[spec["dimension"]].strip()
            if not label or label in grouped[period]:
                raise ValueError(f"Missing or duplicate dimension within a period: {source}")
            metrics = {name: metric_value(row.get(name), name) for name in spec["metrics"]}
            if source == "ga4" and metrics["engaged_sessions"] > metrics["sessions"]:
                raise ValueError("Engaged sessions cannot exceed sessions")
            grouped[period][label] = metrics
    if not grouped["previous"] or set(grouped["previous"]) != set(grouped["current"]):
        raise ValueError(f"Both periods must contain the same non-empty dimension set: {source}")
    return grouped


def raw_ratios(totals: dict, source: str) -> dict:
    return {key: divide(totals[n], totals[d], scale) for key, (n, d, scale) in FORMULAS[source].items()}


def snapshot(totals: dict, source: str) -> dict:
    ratios = raw_ratios(totals, source)
    return {
        "totals": {k: number(v, 2) if k in MONEY else int(v) for k, v in totals.items()},
        "ratios": {k: number(v) for k, v in ratios.items()},
        "ratio_notes": {k: "zero_denominator" for k, v in ratios.items() if v is None},
    }


def summary_lines(report: dict, source: str) -> list[str]:
    prev, curr = report["previous"], report["current"]
    p, c = prev["totals"], curr["totals"]
    fmt = lambda value: "undefined" if value is None else f"{value:.2f}"
    if source == "meta":
        return [
            f"Ad spend was ${c['spend']:,.2f}, compared with ${p['spend']:,.2f} in the previous week.",
            f"Meta-attributed purchases were {c['purchases']:,}, compared with {p['purchases']:,}; attributed revenue was ${c['revenue']:,.2f} versus ${p['revenue']:,.2f}.",
            f"Total-based ROAS was {fmt(curr['ratios']['roas'])}x versus {fmt(prev['ratios']['roas'])}x. It excludes non-ad costs and does not measure profit.",
        ]
    engagement_delta = report["ratio_deltas"]["engagement_rate_pct"]["percentage_points"]
    return [
        f"GA4 sessions were {c['sessions']:,}, compared with {p['sessions']:,} in the previous week.",
        f"Engaged sessions were {c['engaged_sessions']:,} of {c['sessions']:,}: {fmt(curr['ratios']['engagement_rate_pct'])}% engagement, a {fmt(engagement_delta)} percentage-point change.",
        f"GA4-attributed purchases were {c['purchases']:,} versus {p['purchases']:,}; revenue was ${c['revenue']:,.2f} versus ${p['revenue']:,.2f}. These totals are separate from Meta attribution.",
    ]


def section(rows: dict, source: str, metadata: dict) -> dict:
    totals = {
        period: {metric: sum((r[metric] for r in dimension.values()), ZERO) for metric in SPEC[source]["metrics"]}
        for period, dimension in rows.items()
    }
    ratios = {period: raw_ratios(values, source) for period, values in totals.items()}
    deltas = {}
    for metric in FORMULAS[source]:
        current, previous = ratios["current"][metric], ratios["previous"][metric]
        if metric.endswith("_pct"):
            deltas[metric] = {"percentage_points": number(current - previous) if current is not None and previous is not None else None}
            if current is None or previous is None:
                deltas[metric]["reason"] = "undefined_source_ratio"
        elif current is None or previous is None:
            deltas[metric] = {"absolute": None, "percent_change": None, "reason": "undefined_source_ratio"}
        else:
            deltas[metric] = change(current, previous)
    result = {
        "title": "Meta Ads — weekly performance" if source == "meta" else "GA4 — weekly acquisition",
        "attribution_note": metadata["measurement_notes"][source],
        "previous": snapshot(totals["previous"], source),
        "current": snapshot(totals["current"], source),
        "deltas": {key: change(totals["current"][key], totals["previous"][key]) for key in SPEC[source]["metrics"]},
        "ratio_deltas": deltas,
        "rows": [{"label": label, "previous": snapshot(rows["previous"][label], source), "current": snapshot(rows["current"][label], source)} for label in sorted(rows["previous"])],
        "summary": [],
    }
    result["summary"] = summary_lines(result, source)
    return result


def build_report(data_dir: Path = DATA) -> dict:
    metadata = json.loads((data_dir / "fixture-metadata.json").read_text(encoding="utf-8-sig"))
    if metadata.get("provenance", {}).get("synthetic") is not True:
        raise ValueError("Synthetic provenance must be explicit")
    if metadata.get("currency") != "USD" or metadata.get("timezone") != "Asia/Kolkata":
        raise ValueError("This demo requires USD and Asia/Kolkata")
    validate_periods(metadata["periods"])
    report = {key: metadata[key] for key in ("provenance", "currency", "timezone", "periods", "measurement_notes")}
    report["calculation_notes"] = {
        "precision": "Decimal input arithmetic; currency inputs and totals have two decimal places. Derived values rounded half-up to six decimal places only after calculation.",
        "weighted_ratios": "Compute all aggregate ratios from summed numerators and denominators, never by averaging campaign/channel ratios.",
        "missing_data": "Missing or invalid input metrics fail validation; they are never silently replaced with zero.",
        "zero_baseline": "Undefined ratios and percentage changes are null, with an explicit reason. A zero-to-zero percent change is also undefined.",
        "rates": "Rates ending in _pct are numeric percentages, not fractions. Rate differences are percentage points.",
        "purchase_rate_pct": "Purchases divided by sessions times 100; this is an event-per-session calculation, not GA4 session key-event rate or distinct purchasing-session rate.",
    }
    for source in SPEC:
        report[source] = section(load_rows(data_dir / metadata["sources"][source], source, metadata), source, metadata)
    return report


def encoded_report(data_dir: Path = DATA) -> bytes:
    return (json.dumps(build_report(data_dir), ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA)
    parser.add_argument("--output", type=Path, default=DATA / "reports.json")
    args = parser.parse_args()
    args.output.write_bytes(encoded_report(args.data_dir))
    print(f"Wrote synthetic reports: {args.output}")


if __name__ == "__main__":
    main()
