import {
  parseLine,
  parseMeasurementBlock,
} from "./lab_pdf_candidate_review.ts";

function line(
  index: number,
  text: string,
  x: number,
  y: number,
  words: Array<[string, number]> = [],
): {
  index: number;
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
  words: Array<
    {
      text: string;
      bounds: { x: number; y: number; width: number; height: number };
    }
  >;
} {
  return {
    index,
    text,
    bounds: { x, y, width: 400, height: 10 },
    words: words.map(([word, wordX]) => ({
      text: word,
      bounds: { x: wordX, y, width: word.length * 5, height: 10 },
    })),
  };
}
Deno.test("extracts an unmapped measurement candidate from a result row", () => {
  const candidate = parseLine(
    "example.pdf",
    1,
    line(4, "1975-2 Bilirubin total : 0.40 mg/dL 0.10 - 1.20", 40, 600, [
      ["1975-2", 40],
      ["Bilirubin", 80],
      ["total", 130],
      [":", 170],
      ["0.40", 190],
      ["mg/dL", 230],
      ["0.10", 300],
      ["-", 330],
      ["1.20", 350],
    ]),
  );
  if (
    !candidate || candidate.valueText !== "0.40" ||
    candidate.mappingStatus !== "unmapped"
  ) throw new Error("Expected an unmapped draft candidate");
});

Deno.test("extracts a value-reference-unit result row", () => {
  const candidate = parseLine(
    "example.pdf",
    1,
    line(4, "Example analyte 4.2 3.5 - 5.2 mmol/L", 40, 600, [
      ["Example", 40],
      ["analyte", 85],
      ["4.2", 180],
      ["3.5", 260],
      ["-", 280],
      ["5.2", 295],
      ["mmol/L", 340],
    ]),
  );
  if (
    !candidate || candidate.sourceLabel !== "Example analyte" ||
    candidate.valueText !== "4.2" || candidate.referenceText !== "3.5 - 5.2" ||
    candidate.unit !== "mmol/L"
  ) throw new Error("Expected a value-reference-unit candidate");
});

Deno.test("extracts reference and unit from one positioned result cell", () => {
  const candidate = parseLine(
    "example.pdf",
    1,
    line(4, "Example (%) 4.2 3.5 - 5.2 %", 40, 600, [
      ["Example (%)", 40],
      ["4.2", 180],
      ["3.5 - 5.2 %", 260],
    ]),
  );
  if (
    !candidate || candidate.referenceText !== "3.5 - 5.2" ||
    candidate.unit !== "%"
  ) throw new Error("Expected a combined reference-unit cell");
});

Deno.test("preserves a multiline reference block from its shared reference column", () => {
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    [
      line(4, "Example analyte : 102 mL/min GFR and the stages of", 40, 600, [
        ["Example", 40],
        ["analyte", 85],
        [":", 135],
        ["102", 155],
        ["mL/min", 185],
        ["GFR", 270],
        ["and", 295],
        ["the", 320],
        ["stages", 345],
        ["of", 380],
      ]),
      line(5, "chronic disease", 270, 588),
      line(6, "1 90+ Healthy", 270, 576),
      line(7, "Next result : 4 mg/dL 1 - 5", 40, 564, [
        ["Next", 40],
        ["result", 65],
        [":", 105],
        ["4", 125],
        ["mg/dL", 145],
        ["1", 210],
        ["-", 225],
        ["5", 240],
      ]),
    ],
    0,
    { valueX: 155, unitX: 185, referenceX: 270, methodX: null },
  );
  if (
    !block || block.candidate.referenceKind !== "table" ||
    block.candidate.referenceEvidence.length !== 3 || block.endIndex !== 2 ||
    block.candidate.referenceText !==
      "GFR and the stages of\nchronic disease\n1 90+ Healthy"
  ) throw new Error("Expected generic table evidence");
});

Deno.test("appends a continuation aligned after a source code", () => {
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    [
      line(4, "1234-5 Example analyte : 4 mg/dL 1 - 5", 40, 600, [
        ["1234-5", 40],
        ["Example", 74],
        ["analyte", 119],
        [":", 169],
        ["4", 189],
        ["mg/dL", 219],
        ["1", 270],
        ["-", 285],
        ["5", 300],
      ]),
      line(5, "continuation", 74, 588),
    ],
    0,
    { valueX: 189, unitX: 219, referenceX: 270, methodX: null },
  );
  if (
    !block || block.candidate.sourceLabel !== "Example analyte continuation"
  ) {
    throw new Error("Expected the source-code-aligned continuation");
  }
});

Deno.test("does not append a centered section heading to an analyte label", () => {
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    [
      line(4, "Example analyte : 4 mg/dL 1 - 5", 40, 600, [
        ["Example", 40],
        ["analyte", 85],
        [":", 135],
        ["4", 155],
        ["mg/dL", 185],
        ["1", 270],
        ["-", 285],
        ["5", 300],
      ]),
      line(5, "NEXT SECTION", 245, 588),
    ],
    0,
    { valueX: 155, unitX: 185, referenceX: 270, methodX: null },
  );
  if (!block || block.candidate.sourceLabel !== "Example analyte") {
    throw new Error("Expected the centered heading to remain separate");
  }
});

Deno.test("rejects prose that mimics a result row but has no result-table columns", () => {
  const candidate = parseLine(
    "example.pdf",
    1,
    line(4, "Code: 900004 - Name: full blood count", 40, 600, [
      ["Code: 900004 - Name: full blood count", 40],
    ]),
  );
  if (candidate !== null) {
    throw new Error("Expected a prose header to be rejected");
  }
});

Deno.test("retains an aligned result with an empty reference cell", () => {
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    [
      line(4, "Example analyte : 26.60 % method text", 40, 600, [
        ["Example", 40],
        ["analyte", 85],
        [":", 135],
        ["26.60", 155],
        ["%", 185],
        ["method text", 360],
      ]),
    ],
    0,
    { valueX: 155, unitX: 185, referenceX: 270, methodX: 360 },
  );
  if (
    !block || block.candidate.referenceKind !== "missing" ||
    block.candidate.methodText !== "method text"
  ) {
    throw new Error("Expected a result with an empty reference cell");
  }
});

Deno.test("separates a numeric reference from its method column", () => {
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    [
      line(4, "Example analyte : 4 mg/dL 1 - 5 method text", 40, 600, [
        ["Example", 40],
        ["analyte", 85],
        [":", 135],
        ["4", 155],
        ["mg/dL", 185],
        ["1", 270],
        ["-", 285],
        ["5", 300],
        ["method text", 360],
      ]),
    ],
    0,
    { valueX: 155, unitX: 185, referenceX: 270, methodX: 360 },
  );
  if (
    !block || block.candidate.referenceText !== "1 - 5" ||
    block.candidate.methodText !== "method text"
  ) throw new Error("Expected separate reference and method fields");
});
