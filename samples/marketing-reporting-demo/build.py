"""Build an offline, deterministic two-report demo; no network calls or secrets."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent
data=json.loads((ROOT/'data/reports.json').read_text(encoding='utf-8'))
template=(ROOT/'index.template.html').read_text(encoding='utf-8')
assert template.count('__REPORT_DATA__')==1
encoded=json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
(ROOT/'index.html').write_text(template.replace('__REPORT_DATA__',encoded),encoding='utf-8')
print('Built index.html with synthetic Meta and GA4 reports.')
