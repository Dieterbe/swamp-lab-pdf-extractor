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

Candidate reports also include a canonical analyte ID such as
`blood/glucose` or `urine/glucose`. The specimen prefix prevents values with
the same printed label from being combined across samples. The source label and
source section remain alongside that ID as provenance. The private review
ledger deliberately keeps only those source fields; downstream code resolves
the canonical ID from the reviewed record using the catalog.

### Greek urine nitrite label

When a lab uses `Νιτρικά`, literally “nitrates”, our catalog maps it to `urine/nitrite`, because
they probably meant nitrite (`Νιτρώδη`).  The original printed label remains in every source
record, and `Νιτρώδη` is accepted as the conventional Greek spelling for future reports.

Important: swamp model output may not be reliable. Only `reviewed-records.json`
(manually reviewed through the web UI) records with status "approved"
should be considered reliable.

## Limits

The current implementation reads digital PDF text only. OCR for scanned PDFs,
translation, and automatic confirmation of health records are not implemented
yet. Manual review remains required because a layout match is evidence, not
proof that a candidate represents the source correctly.

Some reports omit a unit. We preserve that omission in extraction and review.
Downstream consumers may opt to apply heuristics during analysis or processing.
E.g.:

- a unitless VLDL result with a `< 32` reference is most likely in mg/dL.

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

The ledger is the private source of truth. Reviewed records also drive local
regression checks, so future parser changes are checked against reviewed PDFs
without publishing health data:

```sh
LAB_PDF_PRIVATE_FIXTURES_DIR=.private \
  ~/.swamp/deno/deno test --allow-env --allow-read \
  extensions/models/lab_pdf_private_regression_test.ts
```

Export only fully approved, parsing-complete documents for analysis. Run this
from the Swamp project directory, not this extension directory:

```sh
cd /home/dieter/code/personal-health-data-platform

swamp model method run @dieter/lab-pdf-extractor exportCanonical lab-pdf \
  --input ledgerPath=/home/dieter/code/swamp-lab-pdf-extractor/.private/reviewed-records.json \
  --input outputPath=/home/dieter/code/swamp-lab-pdf-extractor/.private/canonical-records.json \
  --skip-reports
```

The export preserves source provenance and adds the canonical ID, display name,
preferred short label, and scoped canonical aliases. It fails if an included
record cannot be mapped unambiguously.

The private directory is ignored rather than anonymized because it is useful
for a single-user local workflow. Public fixtures would require deliberate
anonymization before being added.

See [Operations and data contract](OPERATIONS.md) for every health-data
operation, its inputs and outputs, and current failure behavior.

## Development

```sh
~/.swamp/deno/deno test extensions/models/lab_pdf_extractor_test.ts \
  extensions/reports/lab_pdf_candidate_review_test.ts
```

Licensed under [MIT](LICENSE).
