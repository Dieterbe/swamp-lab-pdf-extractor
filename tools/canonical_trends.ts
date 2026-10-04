/** Render selected canonical analytes as a local Markdown trend report. */

type CanonicalRecord = {
  sourceDate: string;
  sourceFile: string;
  sourceIssuer: string;
  analyteId: string;
  analyteName: string;
  valueText: string;
  unit: string | null;
  sourceUnit: string | null;
  referenceText: string | null;
};

type CanonicalExport = { records: CanonicalRecord[] };

type Conversion = {
  fromUnit: string;
  toUnit: string;
  factor: number;
};

const defaultAnalyteIds = [
  "blood/testosterone",
  "blood/ldl-cholesterol",
  "blood/hdl-cholesterol",
  "blood/apolipoprotein-b",
  "blood/triglycerides",
];

// Only convert measurements where both the analyte identity and source unit are
// explicit. Other values remain exactly as reported.
const conversions: Record<string, Conversion> = {
  "blood/25-hydroxyvitamin-d3": {
    fromUnit: "nmol/L",
    toUnit: "ng/mL",
    factor: 0.40064,
  },
  "blood/testosterone": {
    fromUnit: "nmol/L",
    toUnit: "ng/mL",
    factor: 0.28842,
  },
  "blood/progesterone": {
    fromUnit: "nmol/L",
    toUnit: "ng/mL",
    factor: 0.31447,
  },
};

function usage(): never {
  console.error(
    "Usage: deno run --allow-read tools/canonical_trends.ts " +
      "[--input path] [--analytes id,id,...]",
  );
  Deno.exit(1);
}

function parseArgs(args: string[]): { input: string; analyteIds: string[] } {
  let input = ".private/canonical-records.json";
  let analyteIds = defaultAnalyteIds;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--input") {
      input = args[++index] ?? usage();
    } else if (argument === "--analytes") {
      analyteIds = (args[++index] ?? usage()).split(",").filter(Boolean);
    } else {
      usage();
    }
  }
  return { input, analyteIds };
}

function escapeCell(value: string | null): string {
  return (value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function normaliseUnit(unit: string | null): string | null {
  return unit?.replaceAll("µ", "u").toLowerCase() ?? null;
}

function convertedValue(record: CanonicalRecord): string {
  const conversion = conversions[record.analyteId];
  if (
    !conversion ||
    normaliseUnit(record.unit) !== normaliseUnit(conversion.fromUnit)
  ) {
    return `${record.valueText} ${record.unit ?? ""}`.trim();
  }
  const value = Number(record.valueText);
  if (!Number.isFinite(value)) {
    return `${record.valueText} ${record.unit ?? ""}`.trim();
  }
  const converted = (value * conversion.factor).toFixed(2).replace(
    /\.00$/u,
    "",
  );
  return `${converted} ${conversion.toUnit} (from ${record.valueText} ${record.unit})`;
}

function displayFile(file: string): string {
  return file.replace(/^fixtures\//u, "");
}

function render(records: CanonicalRecord[], analyteIds: string[]): string {
  const selected = records.filter((record) =>
    analyteIds.includes(record.analyteId)
  );
  const output = ["# Canonical lab trends", ""];
  for (const analyteId of analyteIds) {
    const rows = selected.filter((record) => record.analyteId === analyteId)
      .sort((a, b) => a.sourceDate.localeCompare(b.sourceDate));
    const heading = rows[0]?.analyteName ?? analyteId;
    output.push(`## ${heading}`, "");
    if (rows.length === 0) {
      output.push("No canonical records.", "");
      continue;
    }
    output.push(
      "| Date | Result | Reference | Issuer | Source |",
      "|---|---|---|---|---|",
    );
    for (const record of rows) {
      output.push(
        [
          record.sourceDate,
          convertedValue(record),
          escapeCell(record.referenceText),
          escapeCell(record.sourceIssuer),
          escapeCell(displayFile(record.sourceFile)),
        ].map((value) => ` ${value} `).join("|").replace(/^/u, "|").concat("|"),
      );
    }
    output.push("");
  }
  return output.join("\n");
}

if (import.meta.main) {
  const { input, analyteIds } = parseArgs(Deno.args);
  const canonical = JSON.parse(
    await Deno.readTextFile(input),
  ) as CanonicalExport;
  console.log(render(canonical.records, analyteIds));
}

export const testables = { convertedValue, render };
