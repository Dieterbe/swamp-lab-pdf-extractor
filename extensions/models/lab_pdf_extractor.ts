/**
 * Extract positional text from digital laboratory-result PDFs.
 *
 * The model is deliberately limited to local PDF parsing. Its output is a
 * draft layout representation; it does not infer, translate, or confirm lab
 * measurements.
 */
import { z } from "npm:zod@4";
import { getDocumentProxy } from "npm:unpdf@0.12.1";
import { requireAnalyte } from "../catalog/analytes.ts";

const GlobalArgsSchema = z.object({});

const BoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

const WordSchema = z.object({
  text: z.string().min(1),
  bounds: BoundsSchema,
});

const LineSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string().min(1),
  bounds: BoundsSchema,
  words: z.array(WordSchema).min(1),
});

const PageSchema = z.object({
  number: z.number().int().positive(),
  coordinateSystem: z.literal("pdf-points-origin-bottom-left"),
  lines: z.array(LineSchema),
});

const DocumentSchema = z.object({
  status: z.literal("draft"),
  sourceFileName: z.string().min(1),
  sourcePath: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  pageCount: z.number().int().positive(),
  pages: z.array(PageSchema).min(1),
  extractedAt: z.iso.datetime(),
});

const ReviewStatusSchema = z.enum([
  "pending",
  "approved",
  "edited",
  "rejected",
  "added",
]);
const ReviewedRecordSchema = z.object({
  status: ReviewStatusSchema,
  page: z.number().int().positive(),
  sourceLabel: z.string(),
  sourceSection: z.string().nullable(),
  valueText: z.string(),
  unit: z.string().nullable(),
  referenceText: z.string().nullable(),
  referenceKind: z.string(),
  methodText: z.string().nullable(),
});
const ReviewedDocumentSchema = z.object({
  file: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  pageCount: z.number().int().positive(),
  records: z.array(ReviewedRecordSchema),
  parsingAssertion: z.literal("complete").optional(),
});
const ReviewedLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  documents: z.array(ReviewedDocumentSchema),
});
const CanonicalRecordSchema = z.object({
  sourceFile: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  page: z.number().int().positive(),
  analyteId: z.string().min(1),
  analyteName: z.string().min(1),
  analyteShortLabel: z.string().nullable(),
  analyteAliases: z.array(z.string()),
  sourceLabel: z.string(),
  sourceSection: z.string().nullable(),
  valueText: z.string(),
  sourceUnit: z.string().nullable(),
  unit: z.string().nullable(),
  referenceText: z.string().nullable(),
  referenceKind: z.string(),
  methodText: z.string().nullable(),
});
const CanonicalExportSchema = z.object({
  status: z.literal("confirmed"),
  generatedAt: z.iso.datetime(),
  includedDocuments: z.array(z.object({
    file: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    pageCount: z.number().int().positive(),
    recordCount: z.number().int().nonnegative(),
  })),
  skippedDocuments: z.array(z.object({
    file: z.string().min(1),
    reasons: z.array(z.enum(["not-complete", "not-all-approved"])).min(1),
  })),
  records: z.array(CanonicalRecordSchema),
});

type Bounds = z.infer<typeof BoundsSchema>;
type Word = z.infer<typeof WordSchema>;
type Line = z.infer<typeof LineSchema>;
type Document = z.infer<typeof DocumentSchema>;
type ReviewedLedger = z.infer<typeof ReviewedLedgerSchema>;
type CanonicalExport = z.infer<typeof CanonicalExportSchema>;

type TextItemLike = {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
};

type MethodContext = {
  writeResource: (
    spec: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
  };
};

/** Return a stable local resource name from a PDF file name. */
function resourceName(filePath: string): string {
  return (filePath.split("/").pop() ?? "document")
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";
}

/** Compute the SHA-256 needed to link a draft to its exact source file. */
async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Convert a PDF.js text item into a word with PDF-coordinate bounds. */
function toWord(item: unknown): Word | null {
  const candidate = item as TextItemLike;
  const text = typeof candidate.str === "string" ? candidate.str.trim() : "";
  const transform = candidate.transform;
  if (!text || !Array.isArray(transform) || transform.length < 6) return null;

  const x = Number(transform[4]);
  const y = Number(transform[5]);
  const transformedHeight = Math.abs(Number(transform[3]));
  const width = Math.abs(Number(candidate.width));
  const itemHeight = Math.abs(Number(candidate.height));
  const height = Number.isFinite(itemHeight) && itemHeight > 0
    ? itemHeight
    : transformedHeight;

  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { text, bounds: { x, y, width, height } };
}

/** The median protects a line-grouping tolerance from an unusually large font. */
function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function combinedBounds(words: Word[]): Bounds {
  const left = Math.min(...words.map((word) => word.bounds.x));
  const right = Math.max(
    ...words.map((word) => word.bounds.x + word.bounds.width),
  );
  const bottom = Math.min(...words.map((word) => word.bounds.y));
  const top = Math.max(
    ...words.map((word) => word.bounds.y + word.bounds.height),
  );
  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

function joinWords(words: Word[]): string {
  return words.reduce((text, word, index) => {
    if (index === 0) return word.text;
    const previous = words[index - 1];
    const gap = word.bounds.x - (previous.bounds.x + previous.bounds.width);
    const typicalHeight = Math.max(
      previous.bounds.height,
      word.bounds.height,
      1,
    );
    const separator = gap > typicalHeight * 0.08 ? " " : "";
    return `${text}${separator}${word.text}`;
  }, "");
}

/**
 * Group positioned PDF text items into visual lines without discarding their
 * word coordinates. PDF y-coordinates increase upwards, so output lines are
 * ordered top-to-bottom and words left-to-right.
 */
function groupIntoLines(words: Word[]): Line[] {
  if (words.length === 0) return [];
  const tolerance = Math.max(
    1.5,
    median(words.map((word) => word.bounds.height)) * 0.55,
  );
  const buckets: Word[][] = [];

  for (
    const word of [...words].sort((left, right) =>
      right.bounds.y - left.bounds.y
    )
  ) {
    const bucket = buckets.find((current) =>
      Math.abs(median(current.map((item) => item.bounds.y)) - word.bounds.y) <=
        tolerance
    );
    if (bucket) bucket.push(word);
    else buckets.push([word]);
  }

  return buckets.map((bucket, index) => {
    const ordered = [...bucket].sort((left, right) =>
      left.bounds.x - right.bounds.x
    );
    return {
      index,
      text: joinWords(ordered),
      bounds: combinedBounds(ordered),
      words: ordered,
    };
  });
}

async function extractDocument(filePath: string): Promise<Document> {
  const stat = await Deno.stat(filePath);
  if (!stat.isFile || !filePath.toLowerCase().endsWith(".pdf")) {
    throw new Error("Each input must be a PDF file.");
  }

  const bytes = await Deno.readFile(filePath);
  const document = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const items = (textContent as { items: unknown[] }).items;
      const words = items.map(toWord).filter((word): word is Word =>
        word !== null
      );
      pages.push({
        number: pageNumber,
        coordinateSystem: "pdf-points-origin-bottom-left" as const,
        lines: groupIntoLines(words),
      });
    }

    return {
      status: "draft",
      sourceFileName: filePath.split("/").pop() ?? filePath,
      sourcePath: filePath,
      sourceSha256: await sha256(bytes),
      pageCount: document.numPages,
      pages,
      extractedAt: new Date().toISOString(),
    };
  } finally {
    document.destroy();
  }
}

async function inputPaths(
  args: { dirPath?: string; filePaths?: string[]; recursive: boolean },
): Promise<string[]> {
  const paths = new Set<string>(args.filePaths ?? []);
  if (!args.dirPath) return [...paths];

  async function visit(directory: string): Promise<void> {
    for await (const entry of Deno.readDir(directory)) {
      const path = `${directory}/${entry.name}`;
      if (entry.isFile && entry.name.toLowerCase().endsWith(".pdf")) {
        paths.add(path);
      }
      if (args.recursive && entry.isDirectory) await visit(path);
    }
  }

  const stat = await Deno.stat(args.dirPath);
  if (!stat.isDirectory) throw new Error("dirPath must identify a directory.");
  await visit(args.dirPath);
  if (paths.size === 0) throw new Error("No PDF files were supplied.");
  return [...paths].sort();
}

async function writeDocuments(
  filePaths: string[],
  context: MethodContext,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  context.logger.info("Extracting layout from {count} PDF(s)", {
    count: filePaths.length,
  });
  const documents = await Promise.all(filePaths.map(extractDocument));
  const handles: Array<{ name: string }> = [];
  const usedNames = new Set<string>();

  for (const document of documents) {
    let name = resourceName(document.sourceFileName);
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${resourceName(document.sourceFileName)}-${suffix++}`;
    }
    usedNames.add(name);
    handles.push(await context.writeResource("document", name, document));
  }

  context.logger.info("Created {count} draft layout document(s)", {
    count: handles.length,
  });
  return { dataHandles: handles };
}

/** Build a fail-closed analysis export from fully confirmed review documents. */
function normaliseCanonicalUnit(unit: string | null): string | null {
  // This is presentation normalization only: preserve the source spelling
  // separately and avoid converting between different physical units.
  return unit?.replace(
    /([mdnpuμ])l\b/gu,
    (_match, prefix: string) => `${prefix}L`,
  ) ?? null;
}

function canonicalExport(
  ledger: ReviewedLedger,
  generatedAt = new Date().toISOString(),
): CanonicalExport {
  const includedDocuments: CanonicalExport["includedDocuments"] = [];
  const skippedDocuments: CanonicalExport["skippedDocuments"] = [];
  const records: CanonicalExport["records"] = [];

  for (const document of ledger.documents) {
    const reasons: Array<"not-complete" | "not-all-approved"> = [];
    if (document.parsingAssertion !== "complete") reasons.push("not-complete");
    if (!document.records.every((record) => record.status === "approved")) {
      reasons.push("not-all-approved");
    }
    if (reasons.length > 0) {
      skippedDocuments.push({ file: document.file, reasons });
      continue;
    }

    includedDocuments.push({
      file: document.file,
      sourceSha256: document.sourceSha256,
      pageCount: document.pageCount,
      recordCount: document.records.length,
    });
    for (const record of document.records) {
      const analyte = requireAnalyte(
        record.sourceLabel,
        null,
        record.sourceSection,
      );
      records.push({
        sourceFile: document.file,
        sourceSha256: document.sourceSha256,
        page: record.page,
        analyteId: analyte.id,
        analyteName: analyte.displayName,
        analyteShortLabel: analyte.shortLabel,
        analyteAliases: analyte.canonicalAliases,
        sourceLabel: record.sourceLabel,
        sourceSection: record.sourceSection,
        valueText: record.valueText,
        sourceUnit: record.unit,
        unit: normaliseCanonicalUnit(record.unit),
        referenceText: record.referenceText,
        referenceKind: record.referenceKind,
        methodText: record.methodText,
      });
    }
  }
  return CanonicalExportSchema.parse({
    status: "confirmed",
    generatedAt,
    includedDocuments,
    skippedDocuments,
    records,
  });
}

async function exportReviewedLedger(
  args: { ledgerPath: string; outputPath: string },
  context: MethodContext,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const ledger = ReviewedLedgerSchema.parse(
    JSON.parse(await Deno.readTextFile(args.ledgerPath)),
  );
  const exported = canonicalExport(ledger);
  await Deno.writeTextFile(
    args.outputPath,
    `${JSON.stringify(exported, null, 2)}\n`,
  );
  const handle = await context.writeResource(
    "canonicalRecordSet",
    "canonical-records",
    exported,
  );
  context.logger.info("Exported {count} confirmed canonical record(s)", {
    count: exported.records.length,
  });
  return { dataHandles: [handle] };
}

/** Local, coordinate-aware digital-PDF layout extraction model. */
export const model = {
  type: "@dieter/lab-pdf-extractor" as const,
  version: "2026.09.30.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    document: {
      description:
        "Unconfirmed, coordinate-aware text layout extracted from one digital PDF",
      schema: DocumentSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    canonicalRecordSet: {
      description:
        "Strict canonical analysis records exported from complete review documents",
      schema: CanonicalExportSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
  },
  reports: [
    "@dieter/lab-pdf-extractor-review",
    "@dieter/lab-pdf-candidate-review",
  ],
  methods: {
    extract: {
      description: "Extract draft positioned text from one local digital PDF",
      arguments: z.object({ filePath: z.string().min(1) }),
      execute: async (args: { filePath: string }, context: MethodContext) =>
        await writeDocuments([args.filePath], context),
    },
    extractBatch: {
      description:
        "Extract draft positioned text from multiple local digital PDFs",
      arguments: z.object({
        dirPath: z.string().min(1).optional(),
        filePaths: z.array(z.string().min(1)).min(1).optional(),
        recursive: z.boolean().default(false),
      }).refine((args) => args.dirPath || args.filePaths, {
        message: "Provide dirPath, filePaths, or both.",
      }),
      execute: async (
        args: { dirPath?: string; filePaths?: string[]; recursive: boolean },
        context: MethodContext,
      ) => await writeDocuments(await inputPaths(args), context),
    },
    exportCanonical: {
      description:
        "Export complete, approved review documents as strict canonical analysis records",
      arguments: z.object({
        ledgerPath: z.string().min(1),
        outputPath: z.string().min(1),
      }),
      execute: async (
        args: { ledgerPath: string; outputPath: string },
        context: MethodContext,
      ) => await exportReviewedLedger(args, context),
    },
  },
};

/** Test seams used only by local regression tests. */
/** Internal extraction helpers exposed solely for local unit and regression tests. */
export const testables = {
  canonicalExport,
  extractDocument,
  groupIntoLines,
  joinWords,
  toWord,
};
