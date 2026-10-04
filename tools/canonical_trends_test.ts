import { testables } from "./canonical_trends.ts";

Deno.test("converts testosterone only from its explicit molar unit", () => {
  const converted = testables.convertedValue({
    sourceDate: "2022-06-29",
    sourceFile: "fixtures/test.pdf",
    sourceIssuer: "Example laboratory",
    analyteId: "blood/testosterone",
    analyteName: "Testosterone",
    valueText: "9.23",
    unit: "nmol/L",
    sourceUnit: "nmol/L",
    referenceText: null,
  });
  if (converted !== "2.66 ng/mL (from 9.23 nmol/L)") {
    throw new Error(`Unexpected conversion: ${converted}`);
  }
});

Deno.test("renders selected trend rows in date order", () => {
  const output = testables.render([
    {
      sourceDate: "2025-02-19",
      sourceFile: "fixtures/newer.pdf",
      sourceIssuer: "Example laboratory",
      analyteId: "blood/hdl-cholesterol",
      analyteName: "HDL cholesterol",
      valueText: "47",
      unit: "mg/dL",
      sourceUnit: "mg/dL",
      referenceText: "> 40",
    },
    {
      sourceDate: "2024-11-25",
      sourceFile: "fixtures/older.pdf",
      sourceIssuer: "Example laboratory",
      analyteId: "blood/hdl-cholesterol",
      analyteName: "HDL cholesterol",
      valueText: "51",
      unit: "mg/dL",
      sourceUnit: "mg/dL",
      referenceText: "> 40",
    },
  ], ["blood/hdl-cholesterol"]);
  if (
    !output.includes("| 2024-11-25 | 51 mg/dL") ||
    output.indexOf("2024-11-25") > output.indexOf("2025-02-19")
  ) {
    throw new Error(`Unexpected trend report:\n${output}`);
  }
});
