import { analytes } from "../catalog/analytes.ts";

const EXTRACTOR_TYPE = "@dieter/lab-pdf-extractor";
type Handle = { name: string; specName?: string; version?: number };
type Context = {
  modelType: unknown;
  modelId: string;
  executionStatus: string;
  dataHandles: Handle[];
  dataRepository: {
    getContent: (
      type: string,
      id: string,
      name: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
  };
};
type Bounds = { x: number; y: number; width: number; height: number };
type Word = { text: string; bounds: Bounds };
type Line = { index: number; text: string; bounds: Bounds; words: Word[] };
type Document = {
  status: "draft";
  sourceFileName: string;
  pages: Array<{ number: number; lines: Line[] }>;
};

function typeName(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const item = value as { normalized?: unknown; raw?: unknown };
  return typeof item.normalized === "string"
    ? item.normalized
    : typeof item.raw === "string"
    ? item.raw
    : "";
}
function normalise(value: string): string {
  return value.toLocaleLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  ).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function escape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export type Candidate = {
  sourceFileName: string;
  page: number;
  line: number;
  sourceCode: string | null;
  sourceLabel: string;
  valueText: string;
  unit: string;
  referenceText: string | null;
  referenceKind: "range" | "text" | "table" | "missing";
  methodText: string | null;
  referenceEvidence: Array<{ line: number; text: string }>;
  analyteId: string | null;
  mappingStatus: "matched" | "unmapped";
};

type ParsedMeasurement = {
  candidate: Candidate;
  labelX: number;
  valueX: number;
  unitX: number;
  referenceStartX: number | null;
  referenceBeforeUnit: boolean;
};

type ResultColumns = {
  valueX: number;
  unitX: number;
  referenceX: number;
  methodX: number | null;
};

function referenceKind(referenceText: string): "range" | "text" {
  return /^(?:[<>≤≥]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)/u
      .test(referenceText)
    ? "range"
    : "text";
}

/** Find the first word printed after the unit; its x-coordinate begins the reference column. */
function referenceStartX(line: Line, unit: string): number | null {
  const unitIndex = line.words.findIndex((word) => word.text === unit);
  return unitIndex >= 0 && line.words[unitIndex + 1]
    ? line.words[unitIndex + 1].bounds.x
    : null;
}

function wordX(line: Line, text: string): number | null {
  return line.words.find((word) => word.text === text)?.bounds.x ?? null;
}

function firstWordX(line: Line, text: string): number | null {
  return wordX(line, text) ?? wordX(line, text.trim().split(/\s+/u)[0]) ??
    line.words.find((word) => word.text.includes(text))?.bounds.x ?? null;
}

function firstWordXAtOrAfter(
  line: Line,
  text: string,
  minimumX: number,
): number | null {
  return line.words.find((word) =>
    word.bounds.x >= minimumX &&
    (word.text === text || word.text.includes(text))
  )?.bounds.x ?? null;
}

function labelStartX(line: Line, sourceCode: string | null): number {
  if (sourceCode !== null) {
    const codeIndex = line.words.findIndex((word) => word.text === sourceCode);
    if (codeIndex >= 0 && line.words[codeIndex + 1]) {
      return line.words[codeIndex + 1].bounds.x;
    }
  }
  return line.words[0]?.bounds.x ?? line.bounds.x;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function parseMeasurement(
  sourceFileName: string,
  page: number,
  line: Line,
): ParsedMeasurement | null {
  const unitBeforeReference =
    /^(?<label>.+?)\s*:\s*(?<value>[<>≤≥]?\s*\d+(?:[.,]\d+)?)\s+(?<unit>[^\s]+)\s+(?<reference>.+)$/u
      .exec(line.text);
  const referenceBeforeUnit =
    /^(?<label>.+?)\s+(?<value>[<>≤≥]?\s*\d+(?:[.,]\d+)?)\s+(?<reference>(?:[<>≤≥]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?))\s+(?<unit>[^\s]+)(?:\s+.*)?$/u
      .exec(line.text);
  const match = unitBeforeReference ?? referenceBeforeUnit;
  if (!match?.groups) return null;
  const rawLabel = match.groups.label.trim();
  const sourceCode = /^(\d{1,5}-\d)\b/u.exec(rawLabel)?.[1] ?? null;
  const sourceLabel = rawLabel.replace(/^\d{1,5}-\d\s*(?:\(\*\)\s*)?/u, "")
    .trim();
  const normalized = normalise(sourceLabel);
  const analyte = analytes.find((entry) =>
    (sourceCode !== null && entry.sourceCodes.includes(sourceCode)) ||
    entry.aliases.some((alias) => normalise(alias) === normalized)
  );
  const referenceText = match.groups.reference.trim();
  const valueX = wordX(line, match.groups.value);
  const referenceX = unitBeforeReference
    ? referenceStartX(line, match.groups.unit)
    : firstWordX(line, match.groups.reference);
  const unitX = unitBeforeReference
    ? firstWordX(line, match.groups.unit)
    : referenceX === null
    ? null
    : firstWordXAtOrAfter(line, match.groups.unit, referenceX);
  // A positional parser must see separate value, unit, and reference fields.
  // Otherwise a prose header can mimic the text grammar of a result row.
  if (valueX === null || unitX === null || referenceX === null) return null;
  return {
    candidate: {
      sourceFileName,
      page,
      line: line.index + 1,
      sourceCode,
      sourceLabel,
      valueText: match.groups.value,
      unit: match.groups.unit,
      referenceText,
      referenceKind: referenceKind(referenceText),
      methodText: null,
      referenceEvidence: [{ line: line.index + 1, text: line.text }],
      analyteId: analyte?.id ?? null,
      mappingStatus: analyte ? "matched" : "unmapped",
    },
    labelX: labelStartX(line, sourceCode),
    valueX,
    unitX,
    referenceStartX: referenceX,
    referenceBeforeUnit: referenceBeforeUnit !== null,
  };
}

/** Extract a measurement-shaped line; it never infers data absent from source text. */
export function parseLine(
  sourceFileName: string,
  page: number,
  line: Line,
): Candidate | null {
  return parseMeasurement(sourceFileName, page, line)?.candidate ?? null;
}

/** Infer result-table columns from rows with an explicit numeric reference. */
function inferResultColumns(lines: Line[]): ResultColumns | null {
  const trusted = lines.map((line) => ({
    line,
    parsed: parseMeasurement("", 0, line),
  }))
    .filter((item): item is { line: Line; parsed: ParsedMeasurement } =>
      item.parsed !== null && item.parsed.candidate.referenceKind === "range"
    );
  if (trusted.length === 0) return null;
  const referenceX = median(
    trusted.map((item) => item.parsed.referenceStartX ?? 0),
  );
  const methodRows = trusted.filter((item) => !item.parsed.referenceBeforeUnit);
  const rightmostX = methodRows.length === 0 ? null : median(
    methodRows.map((item) =>
      Math.max(...item.line.words.map((word) => word.bounds.x))
    ),
  );
  return {
    valueX: median(trusted.map((item) => item.parsed.valueX)),
    unitX: median(trusted.map((item) => item.parsed.unitX)),
    referenceX,
    methodX: rightmostX !== null && rightmostX > referenceX + 24
      ? rightmostX
      : null,
  };
}

function wordsFromColumn(line: Line, columnX: number): string | null {
  const text = line.words.filter((word) => word.bounds.x >= columnX - 12)
    .map((word) => word.text).join(" ").trim();
  return text || null;
}

function referenceColumnText(
  line: Line,
  referenceX: number,
  methodX: number | null,
  unitX: number | null,
): string | null {
  const text = line.words.filter((word) =>
    word.bounds.x >= referenceX - 12 &&
    (methodX === null || word.bounds.x < methodX - 12) &&
    (unitX === null || word.bounds.x < unitX - 12)
  ).map((word) => word.text).join(" ").trim();
  return text || null;
}

function isolateInlineRange(
  candidate: Candidate,
  line: Line,
  columns: ResultColumns,
): void {
  if (candidate.referenceKind !== "range" || candidate.referenceText === null) {
    return;
  }
  const match =
    /^(?<range>(?:[<>≤≥]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?))(?:\s+.*)?$/u
      .exec(candidate.referenceText);
  if (!match?.groups) return;
  candidate.referenceText = match.groups.range;
  if (columns.methodX !== null) {
    candidate.methodText = wordsFromColumn(line, columns.methodX);
  }
}

function columnRelation(
  parsed: ParsedMeasurement,
  columns: ResultColumns | null,
): "reference" | "missing" | null {
  if (columns === null) return null;
  const tolerance = 24;
  if (
    Math.abs(parsed.valueX - columns.valueX) > tolerance ||
    Math.abs(parsed.unitX - columns.unitX) > tolerance
  ) return null;
  if (
    Math.abs((parsed.referenceStartX ?? 0) - columns.referenceX) <= tolerance
  ) {
    return "reference";
  }
  // Text beginning in the later method column means the reference cell is
  // empty. Preserve the result, but never reinterpret its method as a range.
  if (
    parsed.candidate.referenceKind === "text" &&
    (parsed.referenceStartX ?? 0) > columns.referenceX + tolerance
  ) return "missing";
  return null;
}

/**
 * Extend a result row only with adjacent lines that begin in its reference
 * column. This is a positional layout rule: it has no analyte or language
 * exceptions.
 */
export function parseMeasurementBlock(
  sourceFileName: string,
  page: number,
  lines: Line[],
  index: number,
  columns: ResultColumns | null = inferResultColumns(lines),
): { candidate: Candidate; endIndex: number } | null {
  const parsed = parseMeasurement(sourceFileName, page, lines[index]);
  if (!parsed) return null;
  const relation = columnRelation(parsed, columns);
  if (relation === null) return null;
  if (relation === "missing") {
    parsed.candidate.referenceKind = "missing";
    parsed.candidate.methodText = parsed.candidate.referenceText;
    parsed.candidate.referenceText = null;
    return { candidate: parsed.candidate, endIndex: index };
  }
  if (parsed.referenceStartX === null) {
    return { candidate: parsed.candidate, endIndex: index };
  }

  const labelContinuation = lines[index + 1];
  const labelAlignmentTolerance = Math.max(
    lines[index].bounds.height,
    labelContinuation?.bounds.height ?? 0,
  ) * 0.5;
  if (
    labelContinuation &&
    lines[index].bounds.y - labelContinuation.bounds.y <=
      Math.max(lines[index].bounds.height, labelContinuation.bounds.height) *
        1.5 &&
    Math.abs(labelContinuation.bounds.x - parsed.labelX) <=
      labelAlignmentTolerance &&
    !labelContinuation.text.includes(":")
  ) {
    parsed.candidate.sourceLabel =
      `${parsed.candidate.sourceLabel} ${labelContinuation.text}`;
  }

  if (!parsed.referenceBeforeUnit) {
    isolateInlineRange(parsed.candidate, lines[index], columns!);
  }

  const evidence = [...parsed.candidate.referenceEvidence];
  let previous = lines[index];
  const leftTolerance = Math.max(12, previous.bounds.height * 2);
  for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex++) {
    const next = lines[nextIndex];
    const verticalGap = previous.bounds.y - next.bounds.y;
    const maximumGap = Math.max(previous.bounds.height, next.bounds.height) *
      2.5;
    if (
      verticalGap < 0 || verticalGap > maximumGap ||
      next.bounds.x < parsed.referenceStartX - leftTolerance ||
      (columns?.methodX !== null && columns?.methodX !== undefined &&
        next.bounds.x >= columns.methodX - leftTolerance)
    ) break;
    evidence.push({ line: next.index + 1, text: next.text });
    previous = next;
  }

  if (evidence.length > 1) {
    parsed.candidate.referenceKind = "table";
    parsed.candidate.referenceEvidence = evidence;
    parsed.candidate.referenceText = evidence.map((item, evidenceIndex) =>
      evidenceIndex === 0 && parsed.referenceBeforeUnit
        ? parsed.candidate.referenceText ?? item.text
        : evidenceIndex === 0
        ? referenceColumnText(
          lines[index],
          parsed.referenceStartX!,
          columns?.methodX ?? null,
          parsed.referenceBeforeUnit ? parsed.unitX : null,
        ) ?? item.text
        : item.text
    ).join("\n");
  }
  return { candidate: parsed.candidate, endIndex: index + evidence.length - 1 };
}

export const report = {
  name: "@dieter/lab-pdf-candidate-review",
  description:
    "Extract unconfirmed measurement candidates from local PDF layout drafts using a human-approved catalog",
  scope: "method" as const,
  labels: ["health", "local", "draft", "candidates"],
  execute: async (context: Context) => {
    const modelType = typeName(context.modelType);
    if (
      modelType !== EXTRACTOR_TYPE || context.executionStatus !== "succeeded"
    ) {
      return {
        markdown: "No candidate review is available for this execution.",
        json: { available: false },
      };
    }
    const candidates: Candidate[] = [];
    for (
      const handle of context.dataHandles.filter((item) =>
        item.specName === "document"
      )
    ) {
      const raw = await context.dataRepository.getContent(
        modelType,
        context.modelId,
        handle.name,
        handle.version,
      );
      if (!raw) {
        throw new Error(
          "Candidate review cannot read an extracted draft document.",
        );
      }
      const document = JSON.parse(new TextDecoder().decode(raw)) as Document;
      if (document.status !== "draft" || !Array.isArray(document.pages)) {
        throw new Error(
          "Candidate review received an unexpected draft document.",
        );
      }
      for (const page of document.pages) {
        const columns = inferResultColumns(page.lines);
        for (let index = 0; index < page.lines.length; index++) {
          const block = parseMeasurementBlock(
            document.sourceFileName,
            page.number,
            page.lines,
            index,
            columns,
          );
          if (block) {
            candidates.push(block.candidate);
            index = block.endIndex;
          }
        }
      }
    }
    const rows = (items: Candidate[]) =>
      items.map((item) =>
        `| ${escape(item.sourceFileName)} | ${item.page}:${item.line} | ${
          escape(item.sourceLabel)
        } | ${escape(item.valueText)} | ${escape(item.unit)} | ${
          escape(
            item.referenceKind === "table"
              ? `table: ${item.referenceEvidence.length} lines`
              : item.referenceText ?? "—",
          )
        } | ${escape(item.methodText ?? "—")} | ${
          item.analyteId ?? "unmapped"
        } |`
      ).join("\n");
    const tables = [...new Set(candidates.map((item) => item.sourceFileName))]
      .map((sourceFileName) => {
        const tableRows = rows(
          candidates.filter((item) => item.sourceFileName === sourceFileName),
        );
        return `## ${
          escape(sourceFileName)
        }\n\n| Line | Label | Value | Unit | Reference | Method | Mapping |\n| ---: | --- | ---: | --- | --- | --- | --- |\n${
          tableRows.replaceAll(`| ${escape(sourceFileName)} | `, "|")
        }`;
      }).join("\n\n");
    return {
      markdown:
        `# Draft measurement candidates\n\nThese are extracted candidates, not confirmed health records.\n\n${
          tables || "No measurement-shaped lines found."
        }`,
      json: { status: "draft", candidates },
    };
  },
};
