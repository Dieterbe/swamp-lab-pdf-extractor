# Swamp lab PDF extractor

`@dieter/lab-pdf-extractor` is a local [Swamp](https://swamp-club.com) extension
for extracting positioned text from digital PDFs containing laboratory results.

It currently preserves page, line, word, and PDF-coordinate information as an
unconfirmed draft. It does not yet support OCR, translation, lab-measurement
parsing, or confirmed health records. Those capabilities require further work
and a user review step.

It also includes a local review report that renders an extraction run as
page-by-page Markdown. The report is presentation only: it does not change the
draft or confirm any value.

The candidate report identifies result-shaped lines and resolves names only
through the versioned, human-approved catalog. An empty or unmatched catalog
entry stays `unmapped`; automatic fuzzy matching was not chosen because it can
silently assign a measurement to the wrong analyte.

## Private regression checks

Verified personal PDFs may be tested locally without entering this repository.
Keep both the PDFs and `reviewed-records.json` in the ignored `.private/`
directory, using a `fixtures/` subdirectory for the PDFs, then run:

```sh
LAB_PDF_PRIVATE_FIXTURES_DIR=.private \
  /home/dieter/.swamp/deno/deno test --allow-env --allow-read \
  extensions/models/lab_pdf_private_regression_test.ts
```

`reviewed-records.json` is the only private source of truth. Once manually
validated, it holds the final approved, edited, and added records together
with their source hashes. The regression test reads that same table. It is
skipped when the environment variable is absent, so public tests contain no
health data.

To edit the private review table locally, run:

```sh
LAB_PDF_PRIVATE_FIXTURES_DIR=.private \
  /home/dieter/.swamp/deno/deno run --allow-env --allow-read --allow-write \
  extensions/private_review_server.ts
```

Open the printed local address in a browser. The editor initializes pending
rows from the PDFs, lets the reviewer edit or add rows and set each decision,
and saves only `reviewed-records.json`.

## Status

The extension is in local development. It has not been published to GitHub or
the Swamp registry.
