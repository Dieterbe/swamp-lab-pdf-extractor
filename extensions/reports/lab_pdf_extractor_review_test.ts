import { renderDocument, testables } from "./lab_pdf_extractor_review.ts";

Deno.test("escapes table delimiters in extracted text", () => {
  if (testables.markdownCell("A|B") !== "A\\|B") throw new Error("Expected pipe escaping");
});

Deno.test("accepts Swamp's structured model type", () => {
  const typeName = testables.modelTypeName({ normalized: "@dieter/lab-pdf-extractor" });
  if (typeName !== "@dieter/lab-pdf-extractor") throw new Error("Expected normalized model type");
});

Deno.test("renders source lines as an explicitly draft review", () => {
  const markdown = renderDocument({
    status: "draft",
    sourceFileName: "example.pdf",
    sourceSha256: "a".repeat(64),
    pageCount: 1,
    pages: [{ number: 1, lines: [{ index: 0, text: "Example line" }] }],
  });
  if (!markdown.includes("not confirmed health data")) throw new Error("Missing draft warning");
  if (!markdown.includes("| 1 | Example line |")) throw new Error("Missing line table");
});
