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

## Status

The extension is in local development. It has not been published to GitHub or
the Swamp registry.
