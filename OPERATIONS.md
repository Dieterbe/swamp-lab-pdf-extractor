# Operations and data contract

This is the operational reference for the local lab-PDF workflow. It covers
data extraction, review, canonical mapping, and regression checks. It excludes
extension publishing, Git, and generic Swamp administration because they do
not process health records.

## Data stores and states

| Data | Location | State and purpose |
| --- | --- | --- |
| Source PDF | `.private/fixtures/*.pdf` | Private input. The extractor reads it locally. |
| Draft layout document | Swamp model data, spec `document` | Unconfirmed positioned PDF text, including pages, lines, and word coordinates. |
| Candidate report | Swamp report output for one model run | Unconfirmed parsed measurement candidates. It is not a source of truth. |
| Review ledger | `.private/reviewed-records.json` | Private, manually reviewed source data and parser regression baseline. |
| Catalog | `extensions/catalog/analytes.ts` | Version-controlled mapping rules from source provenance to canonical IDs. |
| Canonical export | `.private/canonical-records.json` | Private analysis dataset generated only from complete, fully approved documents. |

The ledger deliberately retains source fields (`sourceLabel`, `sourceSection`,
value, unit, reference, and review status) rather than a canonical ID. This
keeps manual review tied to what the PDF says. The strict export derives
canonical IDs later from those fields without changing the ledger.

## Operations

| Operation | Intended use | Reads | Produces or changes |
| --- | --- | --- | --- |
| `extract` model method | Inspect one digital PDF. | One local PDF. | One unconfirmed `document` model-data resource; configured draft reports may run. |
| `extractBatch` model method | Inspect a directory or explicit list of digital PDFs. | `dirPath`, `filePaths`, and every selected PDF. | One unconfirmed `document` resource per PDF; configured draft reports may run. |
| `@dieter/lab-pdf-extractor-review` report | Inspect raw positioned text after a successful model run. | Draft `document` resources from that run. | Markdown and JSON report showing page lines. Does not parse measurements. |
| `@dieter/lab-pdf-candidate-review` report | Inspect proposed measurement records after a successful model run. | Draft `document` resources and the catalog. | Markdown and JSON report with source fields and a best-effort canonical ID. It does not write the ledger. |
| Review server startup | Open the local review UI. | `LAB_PDF_PRIVATE_FIXTURES_DIR`, `.private/fixtures/`, and optionally the ledger. | Local HTTP server and browser UI. No health data is sent to a cloud service. |
| `GET /api/ledger` (initial page load) | Re-extract fixture PDFs and reconcile them with prior decisions. | Every fixture PDF and the ledger, if present. | In-memory review view: fresh candidates with inherited decisions where every persisted source field matches. It does not write the ledger. |
| Edit row / choose status / add row in UI | Correct candidate data before saving. | Current in-memory review view. | Browser-only changes. `approved`, `edited`, and `added` are confirmed records; `rejected` is excluded from expected parser output. |
| Assert parsing complete | State that a document has been fully reviewed, including a document with zero rows. | Current document rows and assertion state. | Sets `parsingAssertion: "complete"` in the document on the next save. The UI permits it only when no row is pending and no assertion discrepancy is present. |
| Save in UI (`PUT /api/ledger`) | Persist review decisions and corrections. | Browser ledger payload and existing ledger. | Pretty-printed `reviewed-records.json`. Blank units normalize to `null`; transient UI markers are not stored. |
| `exportCanonical` model method | Generate analysis-ready records from confirmed review data. | `reviewed-records.json` and the catalog. | A pretty JSON file at `outputPath` and a Swamp `canonicalRecordSet` resource. Only complete documents with all rows approved are included; other documents are listed as skipped. Run with `--skip-reports`, because draft reports do not apply to this method. |
| `findAnalyte(...)` | Best-effort mapping while generating draft candidates. | Source label, optional source code, source section, and catalog aliases. | An `Analyte` with an ID such as `blood/glucose`, or `null` / report value `unmapped`. |
| `requireAnalyte(...)` | Strict canonicalization for confirmed data. | Same inputs as `findAnalyte`. | An `Analyte`, or a thrown error that includes the source label and section. |
| Private regression test | Ensure reviewed PDFs still extract to confirmed source records and remain canonically mappable. | Private fixture PDFs, `reviewed-records.json`, parser, and catalog. | Test pass/fail only; no ledger write. |
| Public unit tests | Protect generic parser and catalog behavior without private health data. | Public synthetic test cases and source code. | Test pass/fail only. |

## Reconciliation and assertions

On each review-page load, the server extracts candidates afresh. A candidate
inherits a prior row's status only when page, label, section, value, unit,
reference, reference kind, and method all match exactly.

| Condition | Handling | Communication |
| --- | --- | --- |
| New or changed candidate in an unasserted document | It remains `pending`. | Yellow unsaved/review state in the UI. |
| New or changed candidate in a complete document | It is an assertion violation (`unexpected`). | Red document state and assertion-failed message. |
| Confirmed record disappears from a complete document | The saved confirmed row is retained in the in-memory view as `missing`; saving also prevents removal of confirmed rows from an asserted document. | Red row and assertion-failed message. |
| A rejected record disappears | It is not retained as expected output. | No discrepancy; rejected rows represent output that was determined not to be a record. |
| Document has no candidates | It can still be asserted complete. | Once asserted, it is green because the empty set has no unapproved rows. |
| Document is green | Every row is `approved` and `parsingAssertion` is `complete`. | Green document selector state. |

The assertion protects against parser drift, not deliberate user corrections:
the UI still permits editing an asserted document. This matches the current
review workflow; a deliberate correction may change the asserted baseline when
saved.

## Failures and soft failures

| Operation | Condition | Kind | Current communication |
| --- | --- | --- | --- |
| `extractBatch` | Neither `dirPath` nor `filePaths` is supplied. | Hard failure. | Swamp method validation error. |
| `extractBatch` | `dirPath` is not a directory or contains no PDFs. | Hard failure. | Method error: `dirPath must identify a directory` or `No PDF files were supplied.` |
| `extract` / `extractBatch` | A PDF cannot be read or parsed. | Hard failure. A batch uses one concurrent operation, so one failing PDF fails that run. | Swamp method failure and method report diagnostics. |
| Draft reports | The run failed or does not belong to this model type. | Soft failure. | The report says that no applicable review is available. |
| Candidate report | No measurement-shaped lines are found. | Soft failure. | Draft report says `No measurement-shaped lines found.` |
| Candidate report | A label has no unambiguous catalog mapping. | Soft failure. | Candidate remains in the report with canonical ID `unmapped`; extraction continues so it can be reviewed. |
| Candidate or layout report | Required model data is unavailable or has an unexpected shape. | Hard failure. | Report throws; Swamp records the report failure. |
| Review server startup | `LAB_PDF_PRIVATE_FIXTURES_DIR` is unset. | Hard failure. | Process exits with an explicit environment-variable error. |
| Review server load | Ledger is absent, empty, or malformed JSON. | Soft failure. | Server falls back to a fresh draft; it does not repair or overwrite the ledger until Save. |
| Review server load | Fixture directory or a fixture PDF is unreadable. | Hard failure. | The request fails. The current browser UI remains on `Extracting PDFs…`; it has no dedicated error panel yet. |
| Review server save | Invalid JSON, failed write, or unavailable directory. | Hard failure. | Request fails. The current UI does not show a save-error notification; the browser console/network request exposes it. |
| `exportCanonical` | Ledger is malformed, output path cannot be written, or an included record is unmapped. | Hard failure. | Swamp method fails. No partial canonical export is written after an unmapped record; write failures are reported by the method. |
| `findAnalyte` | Mapping is unknown or ambiguous after section context. | Soft failure. | Returns `null`; callers render `unmapped`. |
| `requireAnalyte` | Mapping is unknown or ambiguous. | Hard failure. | Throws an error naming the source label and section. |
| Private regression | PDF hash/page count changed, confirmed source record no longer extracts, or confirmed record no longer resolves canonically. | Hard failure. | Deno test fails. |

## Canonical mapping rules

The catalog emits specimen-qualified IDs, currently `blood/...` and
`urine/...`. `sourceSection` is retained as provenance and used only when a
printed label could mean different things for different specimens. For example,
the section distinguishes blood from urine hemoglobin. If the label is already
unambiguous, the mapping does not require a section.

`findAnalyte` is intentionally permissive because draft extraction must not
discard or block a new label. `requireAnalyte` is intentionally strict because
a canonical analysis dataset must not silently omit or misclassify a confirmed
record. `exportCanonical` uses it for every included ledger row and fails on
the first unmapped row.

Canonical presentation metadata is scoped to each ID: `shortLabel` is the
preferred concise UI label and `canonicalAliases` are additional shorthand
forms. They are intentionally separate from `sourceAliases`, which exist only
to recognize what a lab printed. Shorthands are not global lookup keys because
the same abbreviation can denote different analytes.
