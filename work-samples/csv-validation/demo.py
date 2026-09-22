from pathlib import Path
import json
from validate_csv import validate_csv
root = Path(__file__).parent
report = validate_csv((root / "example.csv").read_text(encoding="utf-8"))
print(json.dumps(report, indent=2))
