import {
  findAnalyte,
  normaliseAnalyteLabel,
  requireAnalyte,
} from "./analytes.ts";

Deno.test("maps reviewed Greek and English source labels to stable identities", () => {
  const cases = [
    ["ALT(SGPT)", "blood/alanine-aminotransferase"],
    ["Αιμοσφαιρίνη (HGB)", "blood/hemoglobin", "ΓΕΝΙΚΗ ΕΞΕΤΑΣΗ ΑΙΜΑΤΟΣ"],
    ["ΤΚΕ (ESR)", "blood/erythrocyte-sedimentation-rate"],
    [
      "Εύρος κατν. μεγέθους Αιμοπεταλίων (PDW)",
      "blood/platelet-distribution-width",
    ],
    ["Λέυκωμα", "urine/protein"],
  ];
  for (const [label, id, section] of cases) {
    if (findAnalyte(label, null, section)?.id !== id) {
      throw new Error(`Expected ${label} to map to ${id}`);
    }
  }
});

Deno.test("normalizes harmless source punctuation without translating labels", () => {
  if (
    normaliseAnalyteLabel("  ALT (SGPT) ") !==
      normaliseAnalyteLabel("ALT(SGPT)")
  ) {
    throw new Error("Expected punctuation-insensitive alias normalization");
  }
  if (findAnalyte("Unreviewed source label") !== null) {
    throw new Error("Expected unknown labels to stay unmapped");
  }
});

Deno.test("retains result-type punctuation that distinguishes aliases", () => {
  if (findAnalyte("BASO#")?.id !== "blood/basophils-absolute") {
    throw new Error("Expected BASO# to remain an absolute count");
  }
  if (findAnalyte("BASO%")?.id !== "blood/basophils-percent") {
    throw new Error("Expected BASO% to remain a percentage");
  }
});

Deno.test("keeps canonical UI shorthands separate from printed source aliases", () => {
  const analyte = findAnalyte("ALT(SGPT)");
  if (
    !analyte || analyte.shortLabel !== "ALT" ||
    !analyte.canonicalAliases.includes("SGPT") ||
    !analyte.sourceAliases.includes("ALT(SGPT)")
  ) throw new Error("Expected distinct source and canonical alias metadata");
});

Deno.test("requires source context for context-dependent aliases", () => {
  if (findAnalyte("Σάκχαρο") !== null) {
    throw new Error(
      "Expected generic sugar label to remain unmapped without context",
    );
  }
  if (
    findAnalyte("Σάκχαρο", null, "ΓΕΝΙΚΗ ΕΞΕΤΑΣΗ ΟΥΡΩΝ")?.id !==
      "urine/glucose"
  ) throw new Error("Expected urine section to map sugar to urine glucose");
});

Deno.test("uses section specimen context for otherwise ambiguous labels", () => {
  if (
    findAnalyte("Αιμοσφαιρίνη", null, "ΓΕΝΙΚΗ ΕΞΕΤΑΣΗ ΟΥΡΩΝ")?.id !==
      "urine/hemoglobin"
  ) throw new Error("Expected urine context to select urine hemoglobin");
  if (
    findAnalyte("Αιμοσφαιρίνη", null, "ΓΕΝΙΚΗ ΕΞΕΤΑΣΗ ΑΙΜΑΤΟΣ")?.id !==
      "blood/hemoglobin"
  ) throw new Error("Expected blood context to select blood hemoglobin");
});

Deno.test("fails closed when canonical output encounters an unknown label", () => {
  try {
    requireAnalyte("Unreviewed source label", null, "BIOCHEMISTRY");
    throw new Error("Expected an unmapped label to throw");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("Unreviewed source label")
    ) {
      throw error;
    }
  }
});
