# CSV validation sample

Independent Python project. Synthetic data; no client data or credentials.

**Problem solved:** a repeatable file intake should flag malformed rows before downstream work consumes them. This sample returns accepted rows, precise rejection reasons, and a `can_continue` flag so a workflow can stop on bad input instead of silently passing it along.

Run `python demo.py` to see the accepted rows, rejection reasons and continuation flag.
Run `python -m unittest discover -p test_validate_csv.py -v` for the 12 regression tests.
Python standard library only; no installation, external requests or paid services.

The example accepts two rows and rejects a duplicate ID and a NaN amount. The
continuation flag stays false when any row is rejected. Exact required columns:
`id,description,amount`. Invalid headers or structurally malformed CSV raise an
error. IDs are compared as supplied; this is validation, not universal cleansing.
Adapt validation rules to the agreed input format and business requirements.

The validator was also used in an earlier Kestra demonstration. This portable
sample runs independently of Kestra and does not include machine-specific flows.
