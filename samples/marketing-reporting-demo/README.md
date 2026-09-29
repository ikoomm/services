# Two weekly reporting examples

[Meta Ads example](https://ikoomm.github.io/services/marketing-reporting-demo/#meta) · [GA4 example](https://ikoomm.github.io/services/marketing-reporting-demo/#ga4)

Original independent work by Hazim Alsalmi, September 2026. **Northstar Demo and every metric are invented.** These examples demonstrate the calculation and presentation layer, not a live Meta/GA4 integration, native Looker Studio file, deployed n8n workflow or previous client engagement.

## Reproduce

Python 3.10+; standard library only. No credentials or paid services.

```sh
python -m unittest -v test_compute.py
python compute.py
python build.py
```

Open `index.html` in a browser. Each report compares two complete Monday–Sunday weeks, September 14–20 and 21–27, 2026, using USD and Asia/Kolkata (IST).

## Example 1: Meta Ads

Two invented campaigns. Summed inputs produce $490 spend, 88,000 impressions, 2,135 clicks, 46 attributed purchases and $2,300 attributed revenue for the current week. ROAS is 2,300 / 490, not an average of campaign ROAS. Attribution window is not represented by these invented fixtures. ROAS excludes non-ad costs and is not profit.

## Example 2: GA4 acquisition

Three invented channels. Current week: 3,850 sessions, 2,468 engaged sessions, 72 purchases, $3,600 attributed revenue. Engagement rate is engaged sessions / sessions. The displayed purchase event rate is purchase events / sessions, **not** distinct purchasing sessions or GA4 session key-event rate.

Meta and GA4 totals use different synthetic attribution figures. They must not be added together or treated as a real reconciliation discrepancy.

## Checks and boundaries

- Thirteen tests cover expected totals, weighted ratios, percentage-point changes, money arithmetic, undefined denominators and baselines, missing values, invalid dates, missing dimensions, malformed counts, and deterministic output.
- Source rows must cover adjacent full weeks, match currency/timezone, and explicitly identify synthetic data. Missing metrics fail instead of becoming zero.
- Decimal arithmetic precedes presentation rounding; undefined results are null with reasons.
- The three-line summaries are deterministic facts, not an executed LLM integration or causal analysis.
- Requiring identical campaign/channel sets is a demo simplification. Real deployments need an explicit policy for new/retired channels, late-arriving conversions, API pagination, permissions and attribution.
- Live account access, API permissions, n8n retries/scheduling, Sheets writes and Looker Studio delivery remain separate implementation work.

No claim of client results, verified revenue or advertising effectiveness.
