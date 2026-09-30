import { findAnalyte, normaliseAnalyteLabel } from "./analytes.ts";

Deno.test("maps reviewed Greek and English source labels to stable identities", () => {
  const cases = [
    ["ALT(SGPT)", "alanine-aminotransferase"],
    ["Αιμοσφαιρίνη (HGB)", "hemoglobin"],
    ["ΤΚΕ (ESR)", "erythrocyte-sedimentation-rate"],
    ["Εύρος κατν. μεγέθους Αιμοπεταλίων (PDW)", "platelet-distribution-width"],
    ["Λέυκωμα", "urine-protein"],
  ];
  for (const [label, id] of cases) {
    if (findAnalyte(label)?.id !== id) {
      throw new Error(`Expected ${label} to map to ${id}`);
    }
  }
});

Deno.test("normalizes harmless source punctuation without translating labels", () => {
  if (normaliseAnalyteLabel("  ALT (SGPT) ") !== normaliseAnalyteLabel("ALT(SGPT)")) {
    throw new Error("Expected punctuation-insensitive alias normalization");
  }
  if (findAnalyte("Unreviewed source label") !== null) {
    throw new Error("Expected unknown labels to stay unmapped");
  }
});

Deno.test("requires source context for context-dependent aliases", () => {
  if (findAnalyte("Σάκχαρο") !== null) {
    throw new Error("Expected generic sugar label to remain unmapped without context");
  }
  if (
    findAnalyte("Σάκχαρο", null, "ΓΕΝΙΚΗ ΕΞΕΤΑΣΗ ΟΥΡΩΝ")?.id !==
      "urine-glucose"
  ) throw new Error("Expected urine section to map sugar to urine glucose");
});
