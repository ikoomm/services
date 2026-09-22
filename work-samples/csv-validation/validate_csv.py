"""Validate CSV input before an orchestration task consumes it. Standard library only."""
import csv
import io
import re
from decimal import Decimal, InvalidOperation


def validate_csv(text):
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff"), newline=""), strict=True)
    if reader.fieldnames != ["id", "description", "amount"]:
        raise ValueError("Expected exactly: id,description,amount")
    records, rejected, seen = [], [], set()
    for row_number, row in enumerate(reader, start=1):
        reason = None
        if None in row or any(value is None for value in row.values()):
            reason = "wrong_column_count"
        elif not row["id"].strip():
            reason = "missing_id"
        elif row["id"] in seen:
            reason = "duplicate_id"
        elif not re.fullmatch(r"-?[0-9]+(?:\.[0-9]{1,2})?", row["amount"]):
            reason = "invalid_amount"
        else:
            try:
                amount = Decimal(row["amount"])
            except InvalidOperation:
                reason = "invalid_amount"
        if reason:
            rejected.append({"record": row_number, "reason": reason})
            continue
        seen.add(row["id"])
        records.append({"id": row["id"], "description": row["description"], "amount": str(amount)})
    return {"accepted": records, "rejected": rejected, "can_continue": bool(records) and not rejected}
