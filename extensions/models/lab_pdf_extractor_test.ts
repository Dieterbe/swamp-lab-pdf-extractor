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
  if (lines.length !== 2) throw new Error(`Expected two lines, got ${lines.length}`);
  if (lines[0].text !== "first second") throw new Error(`Unexpected first line: ${lines[0].text}`);
  if (lines[1].text !== "line") throw new Error(`Unexpected second line: ${lines[1].text}`);
});

Deno.test("ignores non-text PDF content", () => {
  if (testables.toWord({ str: "", transform: [1, 0, 0, 10, 0, 0] }) !== null) {
    throw new Error("Expected empty text item to be ignored");
  }
});
