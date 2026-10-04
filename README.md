# Swamp lab PDF extractor

`@dieter/lab-pdf-extractor` is a toolkit for parsing laboratory result pdf's into
a canonical result dataset. It does this via:

* a local [Swamp](https://swamp-club.com) extension
* a web UI for reviewing/editing results.

![Local review UI with fictional data](https://raw.githubusercontent.com/Dieterbe/swamp-lab-pdf-extractor/main/assets/review-ui.png)

## What it does

1) Extracts positioned text—pages, lines, words, and PDF coordinates—from
   digital PDFs on the local machine.
2) Identifies common result-row layouts, including either unit/reference column
   order and multi-line reference tables.
3) Produces a candidate report in `reviewed-records` and a local browser review
   console for approving, editing, rejecting, or adding records therein.
   This allows for an iterative cycle between reviewing/editing results in order
   to make the code converge to fully accurately parsing all input PDF's
   into the desired representation. Approved records are used as regression test.
4) Exports parsing-complete, fully approved documents as canonical results
   for downstream processing (`canonical-records.json`).

All input PDF's, reviewed records, and canonical records are kept in a
git-ignored directory such as `.private`.

## Usage

### Extraction, review, refinement, and testing

Clone this repository and run these commands from its root. The review console
and private regression test are repository-local tools; installing the extension
alone does not provide them.

```sh
mkdir .private/fixtures # put all your PDF files here
LAB_PDF_PRIVATE_FIXTURES_DIR=.private \
  ~/.swamp/deno/deno run --allow-env --allow-read --allow-write \
  extensions/private_review_server.ts
```

This will automatically do the extraction, and allow you to validate records
and gradually write them to `.private/reviewed-records.json`. Adjust the code
as needed until the reviewed representation matches the input PDFs.
(though you don't need to do all this work at once, you can just do one or
more documents to get started)

At any time, you can reuse this data to power the regression tests:

```sh
LAB_PDF_PRIVATE_FIXTURES_DIR=.private \
  ~/.swamp/deno/deno test --allow-env --allow-read \
  extensions/models/lab_pdf_private_regression_test.ts
```

Or run the normal tests:

```sh
~/.swamp/deno/deno test extensions/models/lab_pdf_extractor_test.ts \
  extensions/reports/lab_pdf_candidate_review_test.ts
```

The private directory is ignored rather than anonymized because it is useful
for a single-user local workflow. Public fixtures would require deliberate
anonymization before being added. Which is more work, something to consider if
more people start collaborating on this project.

### Set up the Swamp model

From your Swamp project, install the extension and create the model once:

```sh
swamp extension pull @dieter/lab-pdf-extractor
swamp model create @dieter/lab-pdf-extractor lab-pdf
```

### Export canonical records

Export only fully approved, parsing-complete documents as canonical records,
for further analysis. Run this from the Swamp project that has a `lab-pdf`
model configured for this extension:

```sh
swamp model method run @dieter/lab-pdf-extractor exportCanonical lab-pdf \
  --input ledgerPath=<path>/.private/reviewed-records.json \
  --input outputPath=<path>/.private/canonical-records.json \
  --skip-reports
```

The export:

* preserves source provenance
* adds the canonical analyte ID, display name, preferred short label, normalized
  unit, and scoped aliases
* fails if an included record cannot be mapped unambiguously

The canonical analyte ID combines a high-level specimen prefix with the analyte, e.g.:
`blood/fasting-glucose` or `urine/glucose`.

## Limits

### New lab result formats and analyte terminology requires further development

The current implementation recognizes layouts and labels represented in reviewed
reports. A new layout or source label needs review and, where necessary,
extractor or catalog changes.

There is no general-purpose translation.

### Digital PDF text only

OCR for image-based/scanned PDFs is not supported.

### Dealing with inaccurate reports

Some lab result reports may use inconsistent terminology, headers, or omit units.
The review ledger preserves the extracted source evidence. Canonical export also
normalizes unit spelling without converting quantities:

* litre units and derivatives use uppercase `L` (`mg/dl` becomes `mg/dL`)
* the printed spelling remains available as `sourceUnit`

Other interpretation remains downstream work. For example, a unitless VLDL
result with a `< 32` reference is most likely in mg/dL.

### Atherogenic index

The formula behind an A.I. result is not recorded, so values from different
labs may not be comparable. Future work may detect the laboratory and track
its formula separately.

### LDL cholesterol

LDL results do not state whether they are directly measured or calculated, so
the method must not be assumed. Future work may detect the laboratory or record
an explicit method.

### Greek urine nitrite label

When a lab uses `Νιτρικά`, literally “nitrates”, in a urine-chemistry/dipstick
panel, the catalog maps it to `urine/nitrite`. A dipstick's infection indicator
is nitrite (`Νιτρώδη`), produced when bacteria convert urinary nitrates; a
literal nitrate mapping would misrepresent that measurement. The original
printed label remains in every source record, and `Νιτρώδη` is accepted as the
conventional Greek spelling for future reports.

### Fasting glucose assumption

Basod on the reviewed corpus so far, it seems to make sense to map all
blood-glucose labels to a uniform `blood/fasting-glucose`.
A future non-fasting result must be
explicit, such as Random Blood Glucose (RBG), and receive a distinct ID. HbA1c
is already a separate longer-term glycaemic measurement.

## Development

Development is tied into the process to obtain the results you need,
therefore see the usage instructions.

Licensed under [MIT](LICENSE).
