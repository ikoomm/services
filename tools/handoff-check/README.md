# Handoff Check / تسليم مرتب

A small, free browser-local tool for organizing Arabic/English design deliveries. An independent prototype, not a paid client project.

Live version: https://ikoomm.github.io/services/handoff-check/

## What it does

- Define expected deliverables as `asset,language,format` CSV/TSV (Arabic headers also supported).
- Select local design files. Infer unambiguous asset/language/version/status hints from names, then review or change them.
- Flag missing variants, unmatched files, format mismatches, drafts and multiple versions assigned to one deliverable.
- Download renamed copies in one ZIP, plus a JSON manifest, spreadsheet-safe CSV mapping and README.
- Keep original bytes unchanged. No upload, account, API, analytics or persistent file storage. The hosting provider receives normal page requests; selected file contents stay in the browser.

Example expected list:

```csv
asset,language,format
social-square,AR,png
social-square,EN,png
story,AR,png
story,EN,png
brochure-source,BI,indd
brochure-export,BI,pdf
```

Use separate asset names for sizes and source/export pairs. A suggested input name is `social-square_AR_v2_final.png`. The `final` label is metadata inferred from a filename or selected by the user; **it is not proof of client approval**. Conflicts require a deliberate choice; the tool never silently selects the newest file.

## Limits

50 expected variants; 50 asset files; 50 MiB per asset and 100 MiB combined assets. Generated ZIP metadata has a separate 1 MiB allowance. Files with unsupported or unsafe names cannot be exported. Supported extensions: PNG, JPG/JPEG, WEBP, PDF, SVG, PSD, AI, EPS, INDD, TIF/TIFF. A filename extension is not content validation.

**Not a design or print preflight.** It does not open or verify file contents, fonts, linked assets, translation, aspect ratios, resolution, colour profiles, editability, malware, artwork quality or client approval. It does not replace Adobe Package or a designer's content review. No automatic delivery to customers. Reloading the page clears the session; keep your originals.

The two built-in examples contain clearly marked synthetic SVG artwork. They demonstrate the workflow, not client work.

## Run and test

No dependencies or build step. Serve this directory with a local static server, then open its localhost URL. ES modules require serving over HTTP(S).

```sh
python -m http.server 8023 --bind 127.0.0.1
node --test core.test.mjs
```

Automated checks cover parser edge cases, ambiguous inference, duplicate/missing variants, draft/version validation, safe paths, formula-safe CSV, UTF-8 ZIP metadata/CRC and size boundaries. Browser testing additionally checked examples, local file selection, Arabic filenames, ZIP extraction and byte equality.

## Optional setup service

The tool is free. Optional setup for one campaign: naming convention, expected-deliverable list, first-package check up to 50 assets, brief guide and one revision. USD 25, scope confirmed first, two business days after materials and agreement. Excludes content/translation/print review and custom integrations. Marketplace-originated communication and payments stay on that marketplace.

Contact: hamammalsalmy9@gmail.com
