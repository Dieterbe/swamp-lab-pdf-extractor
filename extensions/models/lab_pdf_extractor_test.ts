import { testables } from "./lab_pdf_extractor.ts";

function word(text: string, x: number, y: number) {
  return { text, bounds: { x, y, width: 10, height: 10 } };
}

Deno.test("groups PDF items by visual line and orders words left-to-right", () => {
  const lines = testables.groupIntoLines([
    word("second", 40, 100),
    word("line", 0, 80),
    word("first", 0, 100),
  ]);
  if (lines.length !== 2) {
    throw new Error(`Expected two lines, got ${lines.length}`);
  }
  if (lines[0].text !== "first second") {
    throw new Error(`Unexpected first line: ${lines[0].text}`);
  }
  if (lines[1].text !== "line") {
    throw new Error(`Unexpected second line: ${lines[1].text}`);
  }
});

Deno.test("ignores non-text PDF content", () => {
  if (testables.toWord({ str: "", transform: [1, 0, 0, 10, 0, 0] }) !== null) {
    throw new Error("Expected empty text item to be ignored");
  }
});

Deno.test("exports only complete approved documents with canonical provenance", () => {
  const record = {
    status: "approved" as const,
    page: 1,
    sourceLabel: "ALT(SGPT)",
    sourceSection: "BIOCHEMISTRY (blood)",
    valueText: "23",
    unit: "mg/dl",
    referenceText: "0 - 40",
    referenceKind: "range",
    methodText: null,
  };
  const exported = testables.canonicalExport({
    schemaVersion: 1,
    documents: [
      {
        file: "fixtures/complete.pdf",
        sourceSha256: "a".repeat(64),
        pageCount: 1,
        parsingAssertion: "complete",
        records: [record],
      },
      {
        file: "fixtures/incomplete.pdf",
        sourceSha256: "b".repeat(64),
        pageCount: 1,
        records: [record],
      },
    ],
  }, "2026-10-02T00:00:00.000Z");
  if (
    exported.records.length !== 1 ||
    exported.records[0].analyteId !== "blood/alanine-aminotransferase" ||
    exported.records[0].analyteShortLabel !== "ALT" ||
    exported.records[0].sourceUnit !== "mg/dl" ||
    exported.records[0].unit !== "mg/dL" ||
    !exported.records[0].analyteAliases.includes("SGPT") ||
    exported.skippedDocuments[0]?.reasons[0] !== "not-complete"
  ) {
    throw new Error(
      "Expected only strict canonical records from complete documents",
    );
  }
});

Deno.test("fails canonical export when a complete record is unmapped", () => {
  try {
    testables.canonicalExport({
      schemaVersion: 1,
      documents: [{
        file: "fixtures/complete.pdf",
        sourceSha256: "a".repeat(64),
        pageCount: 1,
        parsingAssertion: "complete",
        records: [{
          status: "approved",
          page: 1,
          sourceLabel: "Unknown record",
          sourceSection: null,
          valueText: "1",
          unit: null,
          referenceText: null,
          referenceKind: "missing",
          methodText: null,
        }],
      }],
    }, "2026-10-02T00:00:00.000Z");
    throw new Error("Expected an unmapped complete record to fail export");
  } catch (error) {
    if (
      !(error instanceof Error) || !error.message.includes("Unknown record")
    ) {
      throw error;
    }
  }
});
