import { findAnalyte } from "../catalog/analytes.ts";

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
function escape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

/** An unconfirmed result-shaped line recovered from a PDF layout draft. */
export type Candidate = {
  sourceFileName: string;
  page: number;
  line: number;
  sourceCode: string | null;
  sourceLabel: string;
  sourceSection: string | null;
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
  unitX: number | null;
  referenceStartX: number | null;
  referenceBeforeUnit: boolean;
};

type ResultColumns = {
  valueX: number;
  unitX: number;
  referenceX: number;
  methodX: number | null;
};

export type LayoutDocument = {
  sourceFileName: string;
  pages: Array<{ number: number; lines: Line[] }>;
};

function referenceKind(referenceText: string): "range" | "text" {
  return /^(?:[<>≤≥]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)/u
      .test(referenceText)
    ? "range"
    : "text";
}

/**
 * Recover a displayed unit from a reference table only when every numeric
 * reference row that supplies one agrees. This preserves units printed in a
 * vertically merged reference cell without guessing a unit from the analyte.
 */
function sharedReferenceUnit(referenceText: string): string | null {
  const units = referenceText.split("\n").flatMap((line) => {
    const match =
      /(?:[<>≤≥]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)\s+(?<unit>[^\s]+)/u
        .exec(line);
    return match?.groups?.unit ? [match.groups.unit] : [];
  });
  return units.length > 0 && units.every((unit) => unit === units[0])
    ? units[0]
    : null;
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
  const withoutUnit =
    /^(?<label>.+?)\s+(?<value>[<>≤≥]?\s*\d+(?:[.,]\d+)?)\s+(?<reference>(?:[<>≤≥]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?))$/u
      .exec(line.text);
  const match = unitBeforeReference ?? referenceBeforeUnit ?? withoutUnit;
  if (!match?.groups) return null;
  const isUnitless = withoutUnit !== null;
  const rawLabel = match.groups.label.trim();
  const sourceCode = /^(\d{1,5}-\d)\b/u.exec(rawLabel)?.[1] ?? null;
  const sourceLabel = rawLabel.replace(/^\d{1,5}-\d\s*(?:\(\*\)\s*)?/u, "")
    .trim();
  const analyte = findAnalyte(sourceLabel, sourceCode);
  const referenceText = match.groups.reference.trim();
  const valueX = wordX(line, match.groups.value);
  const referenceX = unitBeforeReference
    ? referenceStartX(line, match.groups.unit)
    : firstWordX(line, match.groups.reference);
  const unitX = unitBeforeReference
    ? firstWordX(line, match.groups.unit)
    : isUnitless || referenceX === null
    ? null
    : firstWordXAtOrAfter(line, match.groups.unit, referenceX);
  // A positional parser needs result and reference columns. A unit is optional
  // only when its cell is empty; this admits unitless results without accepting
  // prose that merely resembles a result row.
  if (
    valueX === null || referenceX === null ||
    (!isUnitless && unitX === null)
  ) return null;
  return {
    candidate: {
      sourceFileName,
      page,
      line: line.index + 1,
      sourceCode,
      sourceLabel,
      sourceSection: null,
      valueText: match.groups.value,
      unit: match.groups.unit ?? "",
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

/**
 * Recover a numeric result whose unit and reference cells are vertically
 * merged around a line containing only the label and value. The neighbouring
 * reference cell is required; a bare number is never sufficient.
 */
function parseAlignedValueOnly(
  sourceFileName: string,
  page: number,
  line: Line,
  columns: ResultColumns | null,
): ParsedMeasurement | null {
  if (columns === null || line.text.includes(":")) return null;
  const value = line.words.find((word) =>
    /^[<>≤≥]?\d+(?:[.,]\d+)?$/u.test(word.text) &&
    Math.abs(word.bounds.x - columns.valueX) <= 24
  );
  if (!value) return null;
  const labelWords = line.words.filter((word) =>
    word.bounds.x < columns.valueX - 12
  );
  // This form has no other populated cells. A line with content to the right
  // is a different layout and must be handled by an explicit structural rule.
  if (
    labelWords.length === 0 ||
    line.words.some((word) => word !== value && !labelWords.includes(word))
  ) return null;
  const rawLabel = labelWords.map((word) => word.text).join(" ").trim();
  if (!rawLabel) return null;
  const sourceCode = /^(\d{1,5}-\d)\b/u.exec(rawLabel)?.[1] ?? null;
  const sourceLabel = rawLabel.replace(/^\d{1,5}-\d\s*(?:\(\*\)\s*)?/u, "")
    .trim();
  const analyte = findAnalyte(sourceLabel, sourceCode);
  return {
    candidate: {
      sourceFileName,
      page,
      line: line.index + 1,
      sourceCode,
      sourceLabel,
      sourceSection: null,
      valueText: value.text,
      unit: "",
      referenceText: null,
      referenceKind: "missing",
      methodText: null,
      referenceEvidence: [{ line: line.index + 1, text: line.text }],
      analyteId: analyte?.id ?? null,
      mappingStatus: analyte ? "matched" : "unmapped",
    },
    labelX: labelStartX(line, sourceCode),
    valueX: value.bounds.x,
    unitX: null,
    referenceStartX: columns.referenceX,
    referenceBeforeUnit: false,
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
    unitX: median(
      trusted.map((item) => item.parsed.unitX).filter((
        value,
      ): value is number => value !== null),
    ),
    referenceX,
    methodX: rightmostX !== null && rightmostX > referenceX + 24
      ? rightmostX
      : null,
  };
}

/**
 * Identify a major source heading by its layout: a left-side description
 * immediately followed by a table's value-column heading. This deliberately
 * preserves the PDF wording and does not classify text by language or lab.
 */
function isMajorSectionHeading(
  lines: Line[],
  index: number,
  columns: ResultColumns | null,
): boolean {
  const line = lines[index];
  const following = lines[index + 1];
  if (
    !columns || !following || line.text.includes(":") ||
    line.words.length === 0 || line.bounds.x >= columns.referenceX - 64 ||
    line.words.some((word) => /\d/u.test(word.text))
  ) {
    return false;
  }
  if (isTextualTableHeader(line, columns)) return false;
  if (
    index > 0 && isTextualTableHeader(lines[index - 1], columns) &&
    (index < 2 || !isMajorSectionHeading(lines, index - 2, columns))
  ) {
    return true;
  }
  const followingMeasurement = parseMeasurement("", 0, following);
  const titleIsCentredOverResultColumns = line.bounds.x >= columns.valueX - 64;
  const beginsNewTableWithResult = followingMeasurement !== null &&
    columnRelation(followingMeasurement, columns) !== null &&
    // A title immediately below a table header is a subsection within the
    // table, not the beginning of an unrelated result table.
    (index === 0 || !isTableHeaderAfterTitle(lines[index - 1], columns)) &&
    // A heading directly beneath a detected major title belongs to that
    // section. It is a grouping within the table, even when it uses the same
    // left alignment as the title.
    (index === 0 || !isMajorSectionHeading(lines, index - 1, columns)) &&
    line.bounds.y - following.bounds.y <=
      Math.max(line.bounds.height, following.bounds.height) * 3 &&
    (index === 0 || titleIsCentredOverResultColumns ||
      lines[index - 1].bounds.y - line.bounds.y >
        Math.max(lines[index - 1].bounds.height, line.bounds.height) * 2.25);
  if (beginsNewTableWithResult) return true;
  const verticalGap = line.bounds.y - following.bounds.y;
  const maximumGap = Math.max(line.bounds.height, following.bounds.height) *
    3.5;
  return verticalGap >= 0 && verticalGap <= maximumGap &&
    isTableHeaderAfterTitle(following, columns);
}

function isTextualTableHeader(line: Line, columns: ResultColumns): boolean {
  const textual = line.words.length > 0 &&
    line.words.every((word) => !/\d/u.test(word.text));
  const allInValueArea = line.words.length >= 2 &&
    line.words.every((word) => word.bounds.x >= columns.valueX - 24);
  const spansLabelAndValueAreas = line.words.length >= 3 &&
    line.words.some((word) => word.bounds.x < columns.valueX - 24) &&
    line.words.some((word) => word.bounds.x >= columns.valueX - 24);
  return textual && (allInValueArea || spansLabelAndValueAreas);
}

/**
 * A major title may be followed by a compact two-column table header. The
 * first heading can sit a little left of the values, so this looser variant
 * is used only for that title-to-header relationship, never to classify an
 * arbitrary line as a table header.
 */
function isTableHeaderAfterTitle(line: Line, columns: ResultColumns): boolean {
  return isTextualTableHeader(line, columns) ||
    (line.words.length >= 2 &&
      line.words.every((word) => !/\d/u.test(word.text)) &&
      line.words.every((word) => word.bounds.x >= columns.valueX - 64));
}

/** Return the nearest preceding major heading on the same PDF page. */
function isSubsectionHeading(
  lines: Line[],
  index: number,
  columns: ResultColumns | null,
): boolean {
  const line = lines[index];
  const following = lines[index + 1];
  if (
    !columns || !following || line.text.includes(":") ||
    line.words.length === 0 || line.bounds.x >= columns.valueX - 64 ||
    line.words.some((word) => /\d/u.test(word.text)) ||
    /^\([^)]*\)$/u.test(line.text.trim())
  ) return false;
  const isColumnHeader = isTextualTableHeader(line, columns);
  if (isColumnHeader || qualitativeCells(line, columns.valueX) !== null) {
    return false;
  }
  const verticalGap = line.bounds.y - following.bounds.y;
  const maximumGap = Math.max(line.bounds.height, following.bounds.height) *
    2.5;
  if (verticalGap < 0 || verticalGap > maximumGap) return false;
  const numeric = parseMeasurement("", 0, following);
  if (numeric !== null && columnRelation(numeric, columns) !== null) {
    return true;
  }
  return qualitativeCells(following, columns.valueX) !== null;
}

/**
 * Return the printed heading/subheading path. Letter-spaced headings are
 * normalized only by removing the typography spaces between individual letters.
 */
function sourceSectionFor(
  lines: Line[],
  index: number,
  columns: ResultColumns | null,
): string | null {
  let path: string[] = [];
  for (let previous = 0; previous < index; previous++) {
    if (isMajorSectionHeading(lines, previous, columns)) {
      path = [sourceHeadingText(lines[previous])];
    } else if (
      columns !== null && isTextualTableHeader(lines[previous], columns) &&
      (previous === 0 || !isMajorSectionHeading(lines, previous - 1, columns))
    ) {
      path = [];
    } else if (isSubsectionHeading(lines, previous, columns)) {
      const subsection = sourceHeadingText(lines[previous]);
      path = path.length > 0 ? [path[0], subsection] : [subsection];
    }
  }
  return path.length > 0 ? path.join(" / ") : null;
}

function sourceHeadingText(line: Line): string {
  return line.words.map((word) =>
    word.text.replace(
      /(?:\p{L}\s+){2,}\p{L}/gu,
      (match) => match.replace(/\s/gu, ""),
    )
  ).join(" ").trim();
}

function attachSourceSection(
  candidate: Candidate,
  lines: Line[],
  index: number,
  columns: ResultColumns | null,
): Candidate {
  candidate.sourceSection = sourceSectionFor(lines, index, columns);
  const analyte = findAnalyte(
    candidate.sourceLabel,
    candidate.sourceCode,
    candidate.sourceSection,
  );
  candidate.analyteId = analyte?.id ?? null;
  candidate.mappingStatus = analyte ? "matched" : "unmapped";
  return candidate;
}

function assignSourceSection(
  candidate: Candidate,
  sourceSection: string,
): void {
  candidate.sourceSection = sourceSection;
  const analyte = findAnalyte(
    candidate.sourceLabel,
    candidate.sourceCode,
    candidate.sourceSection,
  );
  candidate.analyteId = analyte?.id ?? null;
  candidate.mappingStatus = analyte ? "matched" : "unmapped";
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
  const unitSharesReferenceCell = parsed.unitX !== null &&
    parsed.referenceStartX !== null &&
    Math.abs(parsed.unitX - parsed.referenceStartX) <= tolerance;
  if (
    Math.abs(parsed.valueX - columns.valueX) > tolerance ||
    (parsed.unitX !== null && !unitSharesReferenceCell &&
      Math.abs(parsed.unitX - columns.unitX) > tolerance)
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

/** Infer a measurement column from repeated, widely separated label/value pairs. */
function inferQualitativeValueX(lines: Line[]): number | null {
  const starts = lines.flatMap((line) => {
    if (line.text.includes(":") || line.words.length < 2) return [];
    const words = [...line.words].sort((left, right) =>
      left.bounds.x - right.bounds.x
    );
    if (words[0].bounds.x > 160) return [];
    let widestGap = 0;
    let valueIndex = -1;
    for (let index = 1; index < words.length; index++) {
      const gap = words[index].bounds.x -
        (words[index - 1].bounds.x + words[index - 1].bounds.width);
      if (gap > widestGap) {
        widestGap = gap;
        valueIndex = index;
      }
    }
    return widestGap >= 72 && valueIndex >= 0
      ? [words[valueIndex].bounds.x]
      : [];
  });
  return starts.length >= 3 ? median(starts) : null;
}

/** Recover a text-valued result from a spatially inferred measurement column. */
function qualitativeCells(line: Line, valueX: number | null): {
  labelWords: Word[];
  valueWords: Word[];
} | null {
  if (valueX === null || line.text.includes(":")) return null;
  // Text values in a centred measurement cell can begin left of a numeric
  // value. Keep a layout-derived margin while requiring a separate label cell.
  const valueStartX = valueX - 64;
  const labelWords = line.words.filter((word) => word.bounds.x < valueStartX);
  const valueWords = line.words.filter((word) => word.bounds.x >= valueStartX);
  if (labelWords.length === 0 || valueWords.length === 0) return null;
  const valueSpread = Math.max(...valueWords.map((word) => word.bounds.x)) -
    Math.min(...valueWords.map((word) => word.bounds.x));
  // A qualitative result occupies one cell. Multiple widely spaced cells are
  // metadata or a table heading, even if their first gap resembles a result.
  if (valueSpread > 48) return null;
  return { labelWords, valueWords };
}

function hasQualitativeNeighbour(
  lines: Line[],
  index: number,
  valueX: number,
): boolean {
  return [lines[index - 1], lines[index + 1]].some((neighbour) => {
    if (!neighbour) return false;
    const verticalGap = Math.abs(lines[index].bounds.y - neighbour.bounds.y);
    const maximumGap =
      Math.max(lines[index].bounds.height, neighbour.bounds.height) *
      2.5;
    if (verticalGap > maximumGap) return false;
    if (qualitativeCells(neighbour, valueX) !== null) return true;
    const parsed = parseMeasurement("", 0, neighbour);
    return parsed !== null && Math.abs(parsed.valueX - valueX) <= 64;
  });
}

function parseQualitativeMeasurement(
  sourceFileName: string,
  page: number,
  lines: Line[],
  index: number,
  valueX: number | null,
): Candidate | null {
  const line = lines[index];
  const cells = qualitativeCells(line, valueX);
  if (
    cells === null || valueX === null ||
    !hasQualitativeNeighbour(lines, index, valueX)
  ) return null;
  const { labelWords, valueWords } = cells;

  const sourceLabel = labelWords.map((word) => word.text).join(" ").trim();
  const valueText = valueWords.map((word) => word.text).join(" ").trim();
  if (!sourceLabel || !valueText) return null;
  const sourceCode = /^(\d{1,5}-\d)\b/u.exec(sourceLabel)?.[1] ?? null;
  const analyte = findAnalyte(sourceLabel, sourceCode);
  return {
    sourceFileName,
    page,
    line: line.index + 1,
    sourceCode,
    sourceLabel,
    sourceSection: null,
    valueText,
    unit: "",
    referenceText: null,
    referenceKind: "missing",
    methodText: null,
    referenceEvidence: [{ line: line.index + 1, text: line.text }],
    analyteId: analyte?.id ?? null,
    mappingStatus: analyte ? "matched" : "unmapped",
  };
}

type ReferenceContinuation = { lines: Line[]; endIndex: number };

function isReferenceContinuation(
  line: Line,
  previous: Line,
  parsed: ParsedMeasurement,
  columns: ResultColumns | null,
): boolean {
  const verticalGap = previous.bounds.y - line.bounds.y;
  const maximumGap = Math.max(previous.bounds.height, line.bounds.height) *
    2.5;
  const leftTolerance = Math.max(12, previous.bounds.height * 2);
  return verticalGap >= 0 && verticalGap <= maximumGap &&
    line.bounds.x >= parsed.referenceStartX! - leftTolerance &&
    (columns?.methodX === null || columns?.methodX === undefined ||
      line.bounds.x < columns.methodX - leftTolerance);
}

function followingReferenceLines(
  lines: Line[],
  index: number,
  parsed: ParsedMeasurement,
  columns: ResultColumns | null,
): ReferenceContinuation {
  const continuation: Line[] = [];
  let previous = lines[index];
  let endIndex = index;
  for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex++) {
    const next = lines[nextIndex];
    if (!isReferenceContinuation(next, previous, parsed, columns)) break;
    continuation.push(next);
    previous = next;
    endIndex = nextIndex;
  }
  return { lines: continuation, endIndex };
}

function precedingReferenceLines(
  lines: Line[],
  index: number,
  parsed: ParsedMeasurement,
  columns: ResultColumns | null,
): Line[] {
  const continuation: Line[] = [];
  let previous = lines[index];
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex--) {
    const next = lines[previousIndex];
    const verticalGap = next.bounds.y - previous.bounds.y;
    const maximumGap = Math.max(next.bounds.height, previous.bounds.height) *
      2.5;
    const leftTolerance = Math.max(12, previous.bounds.height * 2);
    if (
      verticalGap < 0 || verticalGap > maximumGap ||
      next.bounds.x < parsed.referenceStartX! - leftTolerance ||
      (columns?.methodX !== null && columns?.methodX !== undefined &&
        next.bounds.x >= columns.methodX - leftTolerance)
    ) break;
    continuation.push(next);
    previous = next;
  }
  return continuation.reverse();
}

function isVerticallyMergedReferenceRow(
  lines: Line[],
  index: number,
  columns: ResultColumns | null,
): boolean {
  const parsed = parseMeasurement("", 0, lines[index]);
  return parsed !== null && columnRelation(parsed, columns) === "reference" &&
    followingReferenceLines(lines, index, parsed, columns).lines.length > 0;
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
  let parsed = parseMeasurement(sourceFileName, page, lines[index]);
  if (!parsed) {
    const valueOnly = parseAlignedValueOnly(
      sourceFileName,
      page,
      lines[index],
      columns,
    );
    if (
      valueOnly &&
      (followingReferenceLines(lines, index, valueOnly, columns).lines.length >
          0 ||
        precedingReferenceLines(lines, index, valueOnly, columns).length > 0)
    ) {
      parsed = valueOnly;
    }
  }
  if (!parsed) {
    const candidate = parseQualitativeMeasurement(
      sourceFileName,
      page,
      lines,
      index,
      columns?.valueX ?? inferQualitativeValueX(lines),
    );
    return candidate
      ? {
        candidate: attachSourceSection(candidate, lines, index, columns),
        endIndex: index,
      }
      : null;
  }
  const relation = columnRelation(parsed, columns);
  if (relation === null) return null;
  if (relation === "missing") {
    parsed.candidate.referenceKind = "missing";
    parsed.candidate.methodText = parsed.candidate.referenceText;
    parsed.candidate.referenceText = null;
    return {
      candidate: attachSourceSection(parsed.candidate, lines, index, columns),
      endIndex: index,
    };
  }
  if (parsed.referenceStartX === null) {
    return {
      candidate: attachSourceSection(parsed.candidate, lines, index, columns),
      endIndex: index,
    };
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

  const following = followingReferenceLines(lines, index, parsed, columns);
  const nextMeasurementIndex = following.endIndex + 1;
  // A result whose reference-only lines occur both above and below its own
  // line is vertically centred in a merged reference cell. Those upper lines
  // visually follow the preceding row, but structurally belong to that result.
  const followingBelongsToNextMergedRow = following.lines.length > 0 &&
    nextMeasurementIndex < lines.length &&
    isVerticallyMergedReferenceRow(lines, nextMeasurementIndex, columns);
  const forwardLines = followingBelongsToNextMergedRow ? [] : following.lines;
  const backwardLines = following.lines.length > 0
    ? precedingReferenceLines(lines, index, parsed, columns)
    : [];
  const evidenceLines = [...backwardLines, lines[index], ...forwardLines];
  const evidence = evidenceLines.map((line) => ({
    line: line.index + 1,
    text: line.text,
  }));

  if (evidence.length > 1) {
    parsed.candidate.referenceKind = "table";
    parsed.candidate.referenceEvidence = evidence;
    parsed.candidate.referenceText = evidenceLines.flatMap((line) => {
      if (line !== lines[index]) return [line.text];
      const ownReference = referenceColumnText(
        lines[index],
        parsed.referenceStartX!,
        columns?.methodX ?? null,
        // A table can place both its unit and category in the reference
        // cell. Keep the entire cell; the unit field remains separate.
        null,
      );
      // A value-only row has no reference text on its own line; its merged
      // reference cell is represented entirely by the adjacent lines.
      return ownReference === null ? [] : [ownReference];
    }).join("\n");
    if (!parsed.candidate.unit && parsed.candidate.referenceText) {
      parsed.candidate.unit = sharedReferenceUnit(
        parsed.candidate.referenceText,
      ) ?? "";
    }
  }
  return {
    candidate: attachSourceSection(parsed.candidate, lines, index, columns),
    endIndex: index + forwardLines.length,
  };
}

/**
 * Extract candidates from one document, preserving a section only across a
 * page break that repeats the result-table header before otherwise unlabelled
 * rows. This models a visually continuous table without carrying context into
 * unrelated pages.
 */
export function extractMeasurementCandidates(
  document: LayoutDocument,
): Candidate[] {
  const candidates: Candidate[] = [];
  let precedingSection: string | null = null;

  for (const page of document.pages) {
    const columns = inferResultColumns(page.lines);
    const pageCandidates: Candidate[] = [];
    for (let index = 0; index < page.lines.length; index++) {
      const block = parseMeasurementBlock(
        document.sourceFileName,
        page.number,
        page.lines,
        index,
        columns,
      );
      if (!block) continue;
      pageCandidates.push(block.candidate);
      index = block.endIndex;
    }

    const firstCandidateLine = pageCandidates[0]?.line;
    const repeatsTableHeader = firstCandidateLine !== undefined &&
      columns !== null &&
      page.lines.slice(0, firstCandidateLine - 1).some((line) =>
        isTextualTableHeader(line, columns)
      );
    if (precedingSection !== null && repeatsTableHeader) {
      for (const candidate of pageCandidates) {
        if (candidate.sourceSection !== null) break;
        assignSourceSection(candidate, precedingSection);
      }
    }

    const lastSection = pageCandidates.toReversed().find((candidate) =>
      candidate.sourceSection !== null
    )?.sourceSection;
    if (lastSection !== undefined) precedingSection = lastSection;
    candidates.push(...pageCandidates);
  }
  return candidates;
}

/** Render unconfirmed measurement candidates for a completed local extraction. */
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
      candidates.push(...extractMeasurementCandidates(document));
    }
    const rows = (items: Candidate[]) =>
      items.map((item) =>
        `| ${escape(item.sourceFileName)} | ${item.page}:${item.line} | ${
          escape(item.sourceLabel)
        } | ${escape(item.sourceSection ?? "—")} | ${
          escape(item.valueText)
        } | ${escape(item.unit)} | ${
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
        }\n\n| Line | Label | Source section | Value | Unit | Reference | Method | Mapping |\n| ---: | --- | --- | ---: | --- | --- | --- | --- |\n${
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
