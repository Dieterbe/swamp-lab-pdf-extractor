# Swamp lab PDF extractor

`@dieter/lab-pdf-extractor` is a local [Swamp](https://swamp-club.com)
extension for turning digital laboratory-result PDFs into measurement
candidates that a person reviews before accepting.

![Local review UI with fictional data](https://raw.githubusercontent.com/Dieterbe/swamp-lab-pdf-extractor/main/assets/review-ui.png)

## What it does

- Extracts positioned text—pages, lines, words, and PDF coordinates—from
  digital PDFs on the local machine.
- Identifies common result-row layouts, including either unit/reference column
  order and multi-line reference tables.
- Produces a candidate report and a local browser review console for approving,
  editing, rejecting, or adding records.
- Keeps reviewed records and optional private regression fixtures in ignored
  local files.

Candidate labels stay in the source language. This preserves what the PDF says;
translation is not implemented yet.

## Limits

The current implementation reads digital PDF text only. OCR for scanned PDFs,
translation, and automatic confirmation of health records are not implemented
yet. Manual review remains required because a layout match is evidence, not
proof that a candidate represents the source correctly.

## Use

Install the extension, create a model, and extract a directory of PDFs:

```sh
swamp extension pull @dieter/lab-pdf-extractor
swamp model create @dieter/lab-pdf-extractor lab-pdf
swamp model method run lab-pdf extractBatch \
  --input dirPath=/path/to/pdfs \
  --input recursive=false \
  --report @dieter/lab-pdf-candidate-review
```

For a local editable review ledger, keep PDFs and the ledger outside version
control:

```text
.private/
  fixtures/
    report.pdf
  reviewed-records.json
```

Run the review console:

```sh
LAB_PDF_PRIVATE_FIXTURES_DIR=.private \
  ~/.swamp/deno/deno run --allow-env --allow-read --allow-write \
  extensions/private_review_server.ts
```

The ledger is the private source of truth. A validated ledger can also drive
local regression checks, so future parser changes are checked against reviewed
PDFs without publishing health data:

```sh
LAB_PDF_PRIVATE_FIXTURES_DIR=.private \
  ~/.swamp/deno/deno test --allow-env --allow-read \
  extensions/models/lab_pdf_private_regression_test.ts
```

The private directory is ignored rather than anonymized because it is useful
for a single-user local workflow. Public fixtures would require deliberate
anonymization before being added.

## Development

```sh
~/.swamp/deno/deno test extensions/models/lab_pdf_extractor_test.ts \
  extensions/reports/lab_pdf_candidate_review_test.ts
```

Licensed under [MIT](LICENSE).
