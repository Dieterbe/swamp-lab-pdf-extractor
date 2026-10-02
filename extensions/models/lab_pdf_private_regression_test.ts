import {
  type Candidate,
  extractMeasurementCandidates,
} from "../reports/lab_pdf_candidate_review.ts";
import { requireAnalyte } from "../catalog/analytes.ts";
import { testables } from "./lab_pdf_extractor.ts";

type ExpectedCandidate =
  & Pick<
    Candidate,
    | "page"
    | "sourceLabel"
    | "sourceSection"
    | "valueText"
    | "referenceText"
    | "referenceKind"
    | "methodText"
  >
  & {
    unit: string | null;
    sourceSection?: string | null;
    evidenceLineCount?: number;
  };

type ReviewedDocument = {
  file: string;
  sourceSha256: string;
  pageCount: number;
  records: Array<
    ExpectedCandidate & {
      status: "pending" | "approved" | "edited" | "rejected" | "added";
    }
  >;
};

type Ledger = {
  schemaVersion: 1;
  documents: ReviewedDocument[];
};

function optionalEnvironment(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

const privateRoot = optionalEnvironment("LAB_PDF_PRIVATE_FIXTURES_DIR");
const manifestPath = privateRoot
  ? `${privateRoot}/reviewed-records.json`
  : undefined;

function candidates(
  document: Awaited<ReturnType<typeof testables.extractDocument>>,
): Candidate[] {
  return extractMeasurementCandidates(document);
}

function matches(candidate: Candidate, expected: ExpectedCandidate): boolean {
  return candidate.page === expected.page &&
    candidate.sourceLabel === expected.sourceLabel &&
    (expected.sourceSection === undefined ||
      candidate.sourceSection === expected.sourceSection) &&
    candidate.valueText === expected.valueText &&
    (candidate.unit || null) === (expected.unit || null) &&
    candidate.referenceText === expected.referenceText &&
    candidate.referenceKind === expected.referenceKind &&
    candidate.methodText === expected.methodText &&
    (expected.evidenceLineCount === undefined ||
      candidate.referenceEvidence.length === expected.evidenceLineCount);
}

Deno.test({
  name: "private verified PDFs retain their approved draft candidates",
  ignore: !privateRoot || !manifestPath,
  fn: async () => {
    const ledger = JSON.parse(
      await Deno.readTextFile(manifestPath!),
    ) as Ledger;
    if (ledger.schemaVersion !== 1) {
      throw new Error(
        "Private reviewed-records ledger has an unsupported schema.",
      );
    }

    for (const expected of ledger.documents) {
      const document = await testables.extractDocument(
        `${privateRoot!}/${expected.file}`,
      );
      if (document.sourceSha256 !== expected.sourceSha256) {
        throw new Error(
          "A private regression PDF changed; re-validate the reviewed records.",
        );
      }
      if (document.pageCount !== expected.pageCount) {
        throw new Error(
          "A private regression PDF has an unexpected page count.",
        );
      }
      const actual = candidates(document);
      for (
        const required of expected.records.filter((record) =>
          record.status === "approved" || record.status === "edited" ||
          record.status === "added"
        )
      ) {
        requireAnalyte(required.sourceLabel, null, required.sourceSection);
        if (!actual.some((candidate) => matches(candidate, required))) {
          throw new Error(
            "A validated private record no longer matches extraction.",
          );
        }
      }
    }
  },
});
