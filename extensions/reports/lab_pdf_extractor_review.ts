/**
 * Render draft positional PDF extraction output for human review.
 *
 * This report does not parse, translate, or confirm medical measurements.
 */

const EXTRACTOR_TYPE = "@dieter/lab-pdf-extractor";

type DataHandle = {
  name: string;
  specName?: string;
  version?: number;
};

type ReportContext = {
  modelType: unknown;
  modelId: string;
  executionStatus: "succeeded" | "failed";
  dataHandles: DataHandle[];
  dataRepository: {
    getContent: (
      type: string,
      modelId: string,
      name: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
  };
};

type DraftLine = {
  index: number;
  text: string;
};

type DraftPage = {
  number: number;
  lines: DraftLine[];
};

type DraftDocument = {
  status: "draft";
  sourceFileName: string;
  sourceSha256: string;
  pageCount: number;
  pages: DraftPage[];
};

function markdownCell(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function modelTypeName(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const candidate = value as { normalized?: unknown; raw?: unknown };
  if (typeof candidate.normalized === "string") return candidate.normalized;
  return typeof candidate.raw === "string" ? candidate.raw : "";
}

function isDraftDocument(value: unknown): value is DraftDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<DraftDocument>;
  return document.status === "draft" && typeof document.sourceFileName === "string" &&
    Array.isArray(document.pages);
}

/** Render one draft document as a readable, page-by-page Markdown review. */
export function renderDocument(document: DraftDocument): string {
  const pages = document.pages.map((page) => {
    const rows = page.lines.map((line) => `| ${line.index + 1} | ${markdownCell(line.text)} |`)
      .join("\n");
    return `### Page ${page.number}\n\n| Line | Extracted text |\n| ---: | --- |\n${rows}`;
  }).join("\n\n");

  return `## ${markdownCell(document.sourceFileName)}\n\n` +
    `Status: **draft — not confirmed health data**.  \n` +
    `Source SHA-256: \`${document.sourceSha256}\`\n\n${pages}`;
}

/** Local human-readable review of one extractor method execution. */
export const report = {
  name: "@dieter/lab-pdf-extractor-review",
  description: "Render local draft PDF layout extraction as page-by-page Markdown for human review",
  scope: "method" as const,
  labels: ["health", "local", "review"],
  execute: async (context: ReportContext) => {
    const modelType = modelTypeName(context.modelType);
    if (modelType !== EXTRACTOR_TYPE) {
      return {
        markdown: "This report applies only to @dieter/lab-pdf-extractor.",
        json: { applicable: false },
      };
    }

    if (context.executionStatus !== "succeeded") {
      return {
        markdown: "No review is available because extraction did not succeed.",
        json: { applicable: true, available: false },
      };
    }

    const documents: DraftDocument[] = [];
    for (const handle of context.dataHandles.filter((item) => item.specName === "document")) {
      const content = await context.dataRepository.getContent(
        modelType,
        context.modelId,
        handle.name,
        handle.version,
      );
      if (!content) throw new Error("The extractor produced a document that the review report cannot read.");
      const parsed: unknown = JSON.parse(new TextDecoder().decode(content));
      if (!isDraftDocument(parsed)) throw new Error("The extractor produced an unexpected document format.");
      documents.push(parsed);
    }

    if (documents.length === 0) {
      return {
        markdown: "No draft documents were produced for review.",
        json: { applicable: true, available: false },
      };
    }

    return {
      markdown: `# PDF extraction review\n\n${documents.map(renderDocument).join("\n\n---\n\n")}`,
      json: {
        applicable: true,
        available: true,
        status: "draft",
        documents,
      },
    };
  },
};

export const testables = { markdownCell, modelTypeName };
