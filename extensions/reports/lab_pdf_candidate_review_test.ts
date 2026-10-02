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
    line(4, "1975-2 Bilirubin total : 0.47 mg/dL 0.08 - 1.30", 40, 600, [
      ["1975-2", 40],
      ["Bilirubin", 80],
      ["total", 130],
      [":", 170],
      ["0.47", 190],
      ["mg/dL", 230],
      ["0.08", 300],
      ["-", 330],
      ["1.30", 350],
    ]),
  );
  if (
    !candidate || candidate.valueText !== "0.47" ||
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

Deno.test("removes decorative markers and dot leaders from a source label", () => {
  const candidate = parseLine(
    "example.pdf",
    1,
    line(4, "(*) Cholesterol . . . . : 212 mg/dL < 190", 40, 600, [
      ["(*)", 40],
      ["Cholesterol", 65],
      [".", 130],
      [".", 140],
      [".", 150],
      [".", 160],
      [":", 170],
      ["212", 190],
      ["mg/dL", 230],
      ["<", 300],
      ["190", 315],
    ]),
  );
  if (!candidate || candidate.sourceLabel !== "Cholesterol") {
    throw new Error("Expected decorative label text to be removed");
  }
});

Deno.test("accepts a unit extracted in the same cell as an aligned reference", () => {
  const lines = [
    line(4, "Platelet width 12.4 8 - 18 %", 40, 600, [
      ["Platelet", 40],
      ["width", 85],
      ["12.4", 280],
      ["8", 355],
      ["-", 370],
      ["18", 380],
      ["%", 355],
    ]),
    line(5, "(PDW)", 40, 588, [["(PDW)", 40]]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    0,
    { valueX: 278, unitX: 390, referenceX: 355, methodX: null },
  );
  if (
    !block || block.candidate.sourceLabel !== "Platelet width (PDW)" ||
    block.candidate.valueText !== "12.4" || block.candidate.unit !== "%" ||
    block.candidate.referenceText !== "8 - 18"
  ) throw new Error("Expected an aligned shared reference/unit cell");
});

Deno.test("extracts a position-validated result with an empty unit cell", () => {
  const candidate = parseLine(
    "example.pdf",
    1,
    line(4, "Example index 2.8 < 5", 40, 600, [
      ["Example", 40],
      ["index", 85],
      ["2.8", 180],
      ["<", 260],
      ["5", 275],
    ]),
  );
  if (
    !candidate || candidate.sourceLabel !== "Example index" ||
    candidate.valueText !== "2.8" || candidate.unit !== "" ||
    candidate.referenceText !== "< 5"
  ) throw new Error("Expected a unitless draft candidate");
});

Deno.test("extracts a qualitative result from a known measurement column", () => {
  const lines = [
    line(4, "Example finding NEGATIVE", 40, 600, [
      ["Example", 40],
      ["finding", 85],
      ["NEGATIVE", 350],
    ]),
    line(5, "Other finding CLEAR", 40, 588, [
      ["Other", 40],
      ["finding", 80],
      ["CLEAR", 355],
    ]),
    line(6, "Third finding PRESENT", 40, 576, [
      ["Third", 40],
      ["finding", 80],
      ["PRESENT", 348],
    ]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    0,
    null,
  );
  if (
    !block || block.candidate.sourceLabel !== "Example finding" ||
    block.candidate.valueText !== "NEGATIVE" || block.candidate.unit !== "" ||
    block.candidate.referenceKind !== "missing"
  ) throw new Error("Expected a qualitative result candidate");
});

Deno.test("attaches the nearest major source section to a result row", () => {
  const lines = [
    line(0, "URINE EXAMINATION", 40, 640, [["URINE", 40], ["EXAMINATION", 80]]),
    line(1, "MEASUREMENT REFERENCE", 350, 628, [["MEASUREMENT", 350], [
      "REFERENCE",
      420,
    ]]),
    line(2, "Sugar NEGATIVE", 40, 610, [["Sugar", 40], ["NEGATIVE", 350]]),
    line(3, "Protein NEGATIVE", 40, 598, [["Protein", 40], ["NEGATIVE", 350]]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    2,
    { valueX: 360, unitX: 400, referenceX: 440, methodX: null },
  );
  if (!block || block.candidate.sourceSection !== "URINE EXAMINATION") {
    throw new Error(
      "Expected the major heading to be retained as source context",
    );
  }
});

Deno.test("does not treat demographic text before a number as a section", () => {
  const lines = [
    line(0, "Sex Male", 40, 660, [["Sex", 40], ["Male", 90]]),
    line(1, "Visit 123456", 350, 648, [["Visit", 350], ["123456", 400]]),
    line(2, "BIOCHEMISTRY", 40, 630, [["BIOCHEMISTRY", 40]]),
    line(3, "RESULT UNIT REFERENCE", 350, 618, [
      ["RESULT", 350],
      ["UNIT", 410],
      ["REFERENCE", 470],
    ]),
    line(4, "Example 4.2 3 - 5 mmol/L", 40, 600, [
      ["Example", 40],
      ["4.2", 360],
      ["3", 470],
      ["-", 485],
      ["5", 500],
      ["mmol/L", 530],
    ]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    4,
    { valueX: 360, unitX: 530, referenceX: 470, methodX: null },
  );
  if (!block || block.candidate.sourceSection !== "BIOCHEMISTRY") {
    throw new Error("Expected the actual table heading, not demographic text");
  }
});

Deno.test("preserves the printed major section and subsection", () => {
  const lines = [
    line(0, "URINE EXAMINATION", 40, 660, [["URINE", 40], ["EXAMINATION", 80]]),
    line(1, "MEASUREMENT REFERENCE", 350, 648, [["MEASUREMENT", 350], [
      "REFERENCE",
      420,
    ]]),
    line(2, "CHEMICAL CHARACTERISTICS", 40, 630, [["CHEMICAL", 40], [
      "CHARACTERISTICS",
      95,
    ]]),
    line(3, "Sugar NEGATIVE", 40, 612, [["Sugar", 40], ["NEGATIVE", 350]]),
    line(4, "Protein NEGATIVE", 40, 600, [["Protein", 40], ["NEGATIVE", 350]]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    3,
    { valueX: 360, unitX: 400, referenceX: 440, methodX: null },
  );
  if (
    !block ||
    block.candidate.sourceSection !==
      "URINE EXAMINATION / CHEMICAL CHARACTERISTICS"
  ) throw new Error("Expected the verbatim source heading/subheading path");
});

Deno.test("keeps adjacent result-group headings as siblings", () => {
  const lines = [
    line(0, "MEASUREMENT REFERENCE", 260, 660, [
      ["MEASUREMENT", 260],
      ["REFERENCE", 350],
    ]),
    line(1, "BLOOD EXAMINATION", 40, 640, [["BLOOD", 40], ["EXAMINATION", 80]]),
    line(2, "WHITE CELL DIFFERENTIALS", 40, 620, [
      ["WHITE", 40],
      ["CELL", 80],
      ["DIFFERENTIALS", 110],
    ]),
    line(3, "WBC 4.2 3 - 5", 40, 602, [
      ["WBC", 40],
      ["4.2", 260],
      ["3", 350],
      ["-", 365],
      ["5", 380],
    ]),
    line(4, "RED CELLS", 40, 580, [["RED", 40], ["CELLS", 70]]),
    line(5, "RBC 4.8 3 - 5", 40, 562, [
      ["RBC", 40],
      ["4.8", 260],
      ["3", 350],
      ["-", 365],
      ["5", 380],
    ]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    5,
    { valueX: 260, unitX: 400, referenceX: 350, methodX: null },
  );
  if (
    !block || block.candidate.sourceSection !== "BLOOD EXAMINATION / RED CELLS"
  ) {
    throw new Error("Expected the second result group to replace its sibling");
  }
});

Deno.test("keeps centred result-group headings as siblings", () => {
  const lines = [
    line(0, "TEST RESULT REFERENCE", 40, 660, [
      ["TEST", 40],
      ["RESULT", 300],
      ["REFERENCE", 400],
    ]),
    line(1, "RED CELLS", 260, 640, [["RED", 260], ["CELLS", 290]]),
    line(2, "RBC 4.8 3 - 5", 40, 620, [
      ["RBC", 40],
      ["4.8", 300],
      ["3", 400],
      ["-", 415],
      ["5", 430],
    ]),
    line(3, "WHITE CELLS", 250, 600, [["WHITE", 250], ["CELLS", 290]]),
    line(4, "WBC 4.2 3 - 5", 40, 580, [
      ["WBC", 40],
      ["4.2", 300],
      ["3", 400],
      ["-", 415],
      ["5", 430],
    ]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    4,
    { valueX: 300, unitX: 350, referenceX: 400, methodX: null },
  );
  if (!block || block.candidate.sourceSection !== "WHITE CELLS") {
    throw new Error("Expected the centred group to replace the prior section");
  }
});

Deno.test("does not treat a panel label after procedure metadata as a section", () => {
  const lines = [
    line(0, "TEST RESULT REFERENCE", 40, 660, [
      ["TEST", 40],
      ["RESULT", 300],
      ["REFERENCE", 400],
    ]),
    line(1, "BIOCHEMISTRY", 40, 640, [["BIOCHEMISTRY", 40]]),
    line(2, "Method: diazo assay", 40, 620, [
      ["Method:", 40],
      ["diazo", 300],
      ["assay", 340],
    ]),
    line(3, "BILIRUBIN PANEL", 40, 600, [["BILIRUBIN", 40], ["PANEL", 90]]),
    line(4, "Bilirubin 0.3 < 1.2", 40, 580, [
      ["Bilirubin", 40],
      ["0.3", 300],
      ["<", 400],
      ["1.2", 415],
    ]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    4,
    { valueX: 300, unitX: 350, referenceX: 400, methodX: null },
  );
  if (!block || block.candidate.sourceSection !== "BIOCHEMISTRY") {
    throw new Error(
      "Expected procedure metadata to leave the source section unchanged",
    );
  }
});

Deno.test("retains a centred source heading above a textual table header", () => {
  const lines = [
    line(0, "BIOCHEMISTRY (blood)", 240, 640, [["BIOCHEMISTRY", 240], [
      "(blood)",
      320,
    ]]),
    line(1, "TEST RESULT UNIT REFERENCE", 30, 628, [
      ["TEST", 30],
      ["RESULT", 270],
      ["UNIT", 350],
      ["REFERENCE", 430],
    ]),
    line(2, "Example : 4.2 mmol/L 3 - 5", 40, 610, [
      ["Example", 40],
      [":", 100],
      ["4.2", 270],
      ["mmol/L", 350],
      ["3", 430],
      ["-", 445],
      ["5", 460],
    ]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    2,
    { valueX: 270, unitX: 350, referenceX: 430, methodX: null },
  );
  if (!block || block.candidate.sourceSection !== "BIOCHEMISTRY (blood)") {
    throw new Error("Expected centred source heading to be retained");
  }
});

Deno.test("extracts a value-only row surrounded by a merged reference cell", () => {
  const lines = [
    line(4, "< 21 mm/h Adults", 400, 612, [
      ["<", 400],
      ["21", 415],
      ["mm/h", 435],
      ["Adults", 470],
    ]),
    line(5, "ESR 7", 40, 600, [["ESR", 40], ["7", 360]]),
    line(6, "< 11 mm/h Children", 400, 588, [
      ["<", 400],
      ["11", 415],
      ["mm/h", 435],
      ["Children", 470],
    ]),
  ];
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    lines,
    1,
    { valueX: 360, unitX: 460, referenceX: 400, methodX: null },
  );
  if (
    !block || block.candidate.sourceLabel !== "ESR" ||
    block.candidate.valueText !== "7" || block.candidate.unit !== "mm/h" ||
    block.candidate.referenceKind !== "table" ||
    block.candidate.referenceText !== "< 21 mm/h Adults\n< 11 mm/h Children"
  ) throw new Error("Expected a value-only result with table reference");
});

Deno.test("rejects a value-only row without an adjacent reference cell", () => {
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    [line(4, "Unrelated count 6", 40, 600, [
      ["Unrelated", 40],
      ["count", 90],
      ["6", 360],
    ])],
    0,
    { valueX: 360, unitX: 460, referenceX: 400, methodX: null },
  );
  if (block !== null) {
    throw new Error("Expected bare numeric text to be rejected");
  }
});

Deno.test("rejects a spread-out metadata line as a qualitative result", () => {
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    [
      line(4, "Person name Branch location", 40, 600, [
        ["Person", 40],
        ["name", 95],
        ["Branch", 390],
        ["location", 490],
      ]),
    ],
    0,
    { valueX: 320, unitX: 350, referenceX: 410, methodX: 530 },
  );
  if (block !== null) throw new Error("Expected metadata to be rejected");
});

Deno.test("rejects an isolated compact footer as a qualitative result", () => {
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    [
      line(4, "Contact details help@example.test", 40, 600, [
        ["Contact", 40],
        ["details", 90],
        ["help@example.test", 350],
      ]),
    ],
    0,
    { valueX: 365, unitX: 0, referenceX: 410, methodX: null },
  );
  if (block !== null) {
    throw new Error("Expected an isolated footer to be rejected");
  }
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

Deno.test("keeps dot-led reference continuations in the reference column", () => {
  const block = parseMeasurementBlock(
    "example.pdf",
    1,
    [
      line(4, "Cholesterol : 212 mg/dL Desired: < 190", 40, 600, [
        ["Cholesterol", 40],
        [":", 150],
        ["212", 300],
        ["mg/dL", 350],
        ["Desired: < 190", 400],
      ]),
      line(5, ". . . Borderline - High: 200-239", 40, 588, [
        [". . .", 40],
        ["Borderline - High: 200-239", 400],
      ]),
      line(6, "High Risk: > 240", 400, 576, [["High Risk: > 240", 400]]),
    ],
    0,
    { valueX: 300, unitX: 350, referenceX: 400, methodX: null },
  );
  if (
    !block || block.candidate.referenceKind !== "table" ||
    block.candidate.referenceText !==
      "Desired: < 190\nBorderline - High: 200-239\nHigh Risk: > 240"
  ) throw new Error("Expected dot leaders to be excluded from reference text");
});

Deno.test("assigns a vertically merged reference cell to its centred result", () => {
  const lines = [
    line(4, "HDL 71 > 42 mg/dL", 40, 600, [
      ["HDL", 40],
      ["71", 180],
      ["> 42", 270],
      ["mg/dL", 320],
    ]),
    line(5, "< 95 mg/dL moderate risk", 270, 588),
    line(6, "high risk", 270, 576),
    line(7, "LDL 146 110 - 128 mg/dL", 40, 564, [
      ["LDL", 40],
      ["146", 180],
      ["110", 270],
      ["-", 290],
      ["128", 305],
      ["mg/dL", 340],
    ]),
    line(8, "129 - 158 mg/dL", 270, 552),
  ];
  const columns = { valueX: 180, unitX: 340, referenceX: 270, methodX: null };
  const hdl = parseMeasurementBlock("example.pdf", 1, lines, 0, columns);
  const ldl = parseMeasurementBlock("example.pdf", 1, lines, 3, columns);
  if (
    !hdl || hdl.candidate.referenceText !== "> 42" ||
    !ldl || ldl.candidate.referenceKind !== "table" ||
    ldl.candidate.referenceText !==
      "< 95 mg/dL moderate risk\nhigh risk\n110 - 128 mg/dL\n129 - 158 mg/dL"
  ) throw new Error("Expected the merged reference cell to stay with LDL");
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
      line(4, "Example analyte : 27.3 % method text", 40, 600, [
        ["Example", 40],
        ["analyte", 85],
        [":", 135],
        ["27.3", 155],
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
