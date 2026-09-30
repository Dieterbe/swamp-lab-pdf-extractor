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

Deno.test("accepts a unit extracted in the same cell as an aligned reference", () => {
  const lines = [
    line(4, "Platelet width 11.0 9 - 17.5 %", 40, 600, [
      ["Platelet", 40],
      ["width", 85],
      ["11.0", 280],
      ["9", 355],
      ["-", 370],
      ["17.5", 380],
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
    block.candidate.valueText !== "11.0" || block.candidate.unit !== "%" ||
    block.candidate.referenceText !== "9 - 17.5"
  ) throw new Error("Expected an aligned shared reference/unit cell");
});

Deno.test("extracts a position-validated result with an empty unit cell", () => {
  const candidate = parseLine(
    "example.pdf",
    1,
    line(4, "Example index 3.16 < 6", 40, 600, [
      ["Example", 40],
      ["index", 85],
      ["3.16", 180],
      ["<", 260],
      ["6", 275],
    ]),
  );
  if (
    !candidate || candidate.sourceLabel !== "Example index" ||
    candidate.valueText !== "3.16" || candidate.unit !== "" ||
    candidate.referenceText !== "< 6"
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
    line(4, "< 20 mm/h Adults", 400, 612, [
      ["<", 400],
      ["20", 415],
      ["mm/h", 435],
      ["Adults", 470],
    ]),
    line(5, "ESR 6", 40, 600, [["ESR", 40], ["6", 360]]),
    line(6, "< 10 mm/h Children", 400, 588, [
      ["<", 400],
      ["10", 415],
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
    block.candidate.valueText !== "6" || block.candidate.unit !== "mm/h" ||
    block.candidate.referenceKind !== "table" ||
    block.candidate.referenceText !== "< 20 mm/h Adults\n< 10 mm/h Children"
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

Deno.test("assigns a vertically merged reference cell to its centred result", () => {
  const lines = [
    line(4, "HDL 75 > 40 mg/dL", 40, 600, [
      ["HDL", 40],
      ["75", 180],
      ["> 40", 270],
      ["mg/dL", 320],
    ]),
    line(5, "< 100 mg/dL moderate risk", 270, 588),
    line(6, "high risk", 270, 576),
    line(7, "LDL 152 116 - 129 mg/dL", 40, 564, [
      ["LDL", 40],
      ["152", 180],
      ["116", 270],
      ["-", 290],
      ["129", 305],
      ["mg/dL", 340],
    ]),
    line(8, "130 - 159 mg/dL", 270, 552),
  ];
  const columns = { valueX: 180, unitX: 340, referenceX: 270, methodX: null };
  const hdl = parseMeasurementBlock("example.pdf", 1, lines, 0, columns);
  const ldl = parseMeasurementBlock("example.pdf", 1, lines, 3, columns);
  if (
    !hdl || hdl.candidate.referenceText !== "> 40" ||
    !ldl || ldl.candidate.referenceKind !== "table" ||
    ldl.candidate.referenceText !==
      "< 100 mg/dL moderate risk\nhigh risk\n116 - 129 mg/dL\n130 - 159 mg/dL"
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
