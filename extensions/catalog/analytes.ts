/**
 * Human-reviewed canonical analyte identities and their source-language
 * labels. IDs are specimen-qualified canonical keys for downstream analysis;
 * source labels and source sections remain unchanged in the review ledger.
 */
export type Specimen = "blood" | "urine";
export type Analyte = {
  id: string;
  displayName: string;
  sourceCodes: string[];
  /** Printed labels accepted when parsing reports. */
  sourceAliases: string[];
  /** Preferred concise label for a future UI; null means use displayName. */
  shortLabel: string | null;
  /** Additional UI/query shorthands, scoped to this analyte ID. */
  canonicalAliases: string[];
  requiredSpecimen?: Specimen;
};

/** Normalize source punctuation and diacritics for deterministic alias lookup. */
export function normaliseAnalyteLabel(value: string): string {
  return value.toLocaleLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  ).replace(/[^\p{L}\p{N}#%]+/gu, " ").trim();
}

/** Infer only the broad specimen class needed to resolve ambiguous labels. */
export function specimenFromSourceSection(
  sourceSection: string | null,
): Specimen | null {
  const section = normaliseAnalyteLabel(sourceSection ?? "");
  if (/\burine\b|ουρων|ουρα/iu.test(section)) return "urine";
  if (/\bblood\b|αιματος|αιμα|hemat|haemat|serum|plasma/iu.test(section)) {
    return "blood";
  }
  return null;
}

/** Look up a reviewed source label without translating or inferring a result. */
export function findAnalyte(
  sourceLabel: string,
  sourceCode: string | null = null,
  sourceSection: string | null = null,
): Analyte | null {
  const label = normaliseAnalyteLabel(sourceLabel);
  const matches = analytes.filter((
    entry,
  ) => ((sourceCode !== null && entry.sourceCodes.includes(sourceCode)) ||
    entry.sourceAliases.some((alias) => normaliseAnalyteLabel(alias) === label))
  ).filter((entry) =>
    entry.requiredSpecimen === undefined ||
    entry.requiredSpecimen === specimenFromSourceSection(sourceSection)
  );
  const specimen = specimenFromSourceSection(sourceSection);
  const contextual = specimen === null
    ? []
    : matches.filter((entry) => entry.id.startsWith(`${specimen}/`));
  if (contextual.length === 1) return contextual[0];
  return matches.length === 1 ? matches[0] : null;
}

/** Resolve a reviewed record for canonical output, failing closed if unknown. */
export function requireAnalyte(
  sourceLabel: string,
  sourceCode: string | null = null,
  sourceSection: string | null = null,
): Analyte {
  const analyte = findAnalyte(sourceLabel, sourceCode, sourceSection);
  if (analyte) return analyte;
  throw new Error(
    `Cannot derive a canonical analyte ID for source label ${
      JSON.stringify(sourceLabel)
    } in section ${JSON.stringify(sourceSection)}.`,
  );
}

function canonicalId(name: string): string {
  if (name.startsWith("urine-")) return `urine/${name.slice("urine-".length)}`;
  return `blood/${name === "serum-iron" ? "iron" : name}`;
}

const analyte = (
  id: string,
  displayName: string,
  aliases: string[],
  sourceCodes: string[] = [],
  requiredSpecimen?: Specimen,
): Analyte => ({
  id: canonicalId(id),
  displayName,
  sourceAliases: aliases,
  sourceCodes,
  shortLabel: canonicalPresentation[canonicalId(id)]?.shortLabel ?? null,
  canonicalAliases: canonicalPresentation[canonicalId(id)]?.aliases ?? [],
  requiredSpecimen,
});

const canonicalPresentation: Record<
  string,
  { shortLabel: string; aliases: string[] }
> = {
  "blood/25-hydroxyvitamin-d3": {
    shortLabel: "25-OH D3",
    aliases: ["25-OH D3", "Vitamin D3"],
  },
  "blood/alanine-aminotransferase": {
    shortLabel: "ALT",
    aliases: ["ALT", "SGPT"],
  },
  "blood/apolipoprotein-b": { shortLabel: "ApoB", aliases: ["ApoB", "Apo B"] },
  "blood/aspartate-aminotransferase": {
    shortLabel: "AST",
    aliases: ["AST", "SGOT"],
  },
  "blood/c-reactive-protein": { shortLabel: "CRP", aliases: ["CRP"] },
  "blood/erythrocyte-sedimentation-rate": {
    shortLabel: "ESR",
    aliases: ["ESR"],
  },
  "blood/gamma-glutamyl-transferase": {
    shortLabel: "GGT",
    aliases: ["GGT", "γ-GT"],
  },
  "blood/glycated-hemoglobin": { shortLabel: "HbA1c", aliases: ["HbA1c"] },
  "blood/hdl-cholesterol": { shortLabel: "HDL", aliases: ["HDL"] },
  "blood/hematocrit": { shortLabel: "HCT", aliases: ["HCT"] },
  "blood/hemoglobin": { shortLabel: "HGB", aliases: ["HGB", "Hb"] },
  "blood/ldl-cholesterol": { shortLabel: "LDL", aliases: ["LDL"] },
  "blood/mean-corpuscular-hemoglobin": { shortLabel: "MCH", aliases: ["MCH"] },
  "blood/mean-corpuscular-hemoglobin-concentration": {
    shortLabel: "MCHC",
    aliases: ["MCHC"],
  },
  "blood/mean-corpuscular-volume": { shortLabel: "MCV", aliases: ["MCV"] },
  "blood/mean-platelet-volume": { shortLabel: "MPV", aliases: ["MPV"] },
  "blood/platelet-distribution-width": { shortLabel: "PDW", aliases: ["PDW"] },
  "blood/platelet-large-cell-ratio": {
    shortLabel: "P-LCR",
    aliases: ["P-LCR"],
  },
  "blood/plateletcrit": { shortLabel: "PCT", aliases: ["PCT"] },
  "blood/platelets": { shortLabel: "PLT", aliases: ["PLT"] },
  "blood/procalcitonin": { shortLabel: "PCT", aliases: ["PCT"] },
  "blood/red-blood-cells": { shortLabel: "RBC", aliases: ["RBC"] },
  "blood/red-cell-distribution-width-cv": {
    shortLabel: "RDW-CV",
    aliases: ["RDW-CV"],
  },
  "blood/red-cell-distribution-width-sd": {
    shortLabel: "RDW-SD",
    aliases: ["RDW-SD"],
  },
  "blood/iron": { shortLabel: "Fe", aliases: ["Fe", "Iron"] },
  "blood/sodium": { shortLabel: "Na", aliases: ["Na"] },
  "blood/potassium": { shortLabel: "K", aliases: ["K"] },
  "blood/thyroid-stimulating-hormone": { shortLabel: "TSH", aliases: ["TSH"] },
  "blood/urate": { shortLabel: "UA", aliases: ["UA", "Urate"] },
  "blood/vldl-cholesterol": { shortLabel: "VLDL", aliases: ["VLDL"] },
  "blood/white-blood-cells": { shortLabel: "WBC", aliases: ["WBC"] },
  "urine/ph": { shortLabel: "pH", aliases: ["pH"] },
};

/**
 * Initial catalog derived from manually approved records. Add aliases only
 * after checking their source PDF and intended clinical meaning.
 */
export const analytes: Analyte[] = [
  analyte("25-hydroxyvitamin-d3", "25-Hydroxyvitamin D3", ["25-OH Vitamin D3"]),
  analyte("alanine-aminotransferase", "Alanine aminotransferase", [
    "ALT(SGPT)",
    "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma ( SGPT, ALT)",
  ]),
  analyte("apolipoprotein-b", "Apolipoprotein B", ["Apo B Λιποπρωτεϊνη"]),
  analyte("aspartate-aminotransferase", "Aspartate aminotransferase", [
    "AST(SGOT)",
    "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma (SGOT , AST )",
  ]),
  analyte("atherogenic-index", "Atherogenic index", [
    "Αθηρωματικός δείκτης (Α.Ι.)",
  ]),
  analyte("basophils-absolute", "Basophils, absolute", [
    "BASO#",
    "Basophil granulocytes (#) (BASO#)",
  ]),
  analyte("basophils-percent", "Basophils, percent", [
    "BASO%",
    "Basophils (BASO%)",
  ]),
  analyte("bilirubin-direct", "Bilirubin, direct", ["Bilirubin Direct"]),
  analyte("bilirubin-indirect", "Bilirubin, indirect", ["Bilirubin Indirect"]),
  analyte("bilirubin-total", "Bilirubin, total", [
    "Bilirubin [Mass/volume] in Serum or Plasma",
  ]),
  analyte("c-reactive-protein", "C-reactive protein", [
    "CRP ποσοτική",
    "C reactive protein [Mass/volume] , CRP , in Serum or Plasma",
  ]),
  analyte("cortisol", "Cortisol", ["Κορτιζόλη"]),
  analyte("creatinine", "Creatinine", [
    "Creatinine",
    "Creatinine [Mass/volume] in Blood serum or plasma",
    "Κρεατινίνη (CREATININE)",
    "Κρεατινίνη (CREA)",
  ]),
  analyte("cystatin-c", "Cystatin C", ["Cystatin C"]),
  analyte("egfr", "Estimated glomerular filtration rate", ["eGFR"]),
  analyte("eosinophils-absolute", "Eosinophils, absolute", [
    "EOS#",
    "Eosinophils (#) (EOS#)",
  ]),
  analyte("eosinophils-percent", "Eosinophils, percent", [
    "EOS%",
    "Eosinophils (EOS%)",
  ]),
  analyte("erythrocyte-sedimentation-rate", "Erythrocyte sedimentation rate", [
    "ΤΚΕ (ESR)",
  ]),
  analyte(
    "estradiol",
    "Estradiol",
    ["Οιστραδιόλη (Ε2)", "Oestradiol Ε2 (bl)"],
  ),
  analyte("ferritin", "Ferritin", [
    "Ferritin [Mass/volume] in Serum or Plasma",
    "Φερριτίνη ορού (FERRITIN)",
  ]),
  analyte("gamma-glutamyl-transferase", "Gamma-glutamyl transferase", [
    "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma (GGT)",
    "γ-GT",
  ]),
  analyte("glucose", "Glucose", [
    "Γλυκόζη (GLUCOSE)",
    "Γλυκόζη (GLU)",
    "Glucose fasting [Mass/volume] in Blood in Serum or Plasma",
  ]),
  analyte("glycated-hemoglobin", "Glycated hemoglobin (HbA1c)", [
    "Γλυκοζυλιωμένη αιμοσφαιρίνη (HbA1c)",
  ]),
  analyte("hdl-cholesterol", "HDL cholesterol", ["HDL", "HDL Cholesterol"]),
  analyte("hematocrit", "Hematocrit", [
    "HCT (Haematocrit) (HCT)",
    "Αιματοκρίτης (HCT)",
  ]),
  analyte(
    "hemoglobin",
    "Hemoglobin",
    ["HGB (Haemoglobin) (HGB)", "Αιμοσφαιρίνη", "Αιμοσφαιρίνη (HGB)"],
    [],
    "blood",
  ),
  analyte("immature-granulocytes-absolute", "Immature granulocytes, absolute", [
    "IG (#) (IG#)",
  ]),
  analyte("immature-granulocytes-percent", "Immature granulocytes, percent", [
    "IG (IG%)",
  ]),
  analyte("ldl-cholesterol", "LDL cholesterol", ["LDL", "LDL Cholesterol"]),
  analyte("leptin", "Leptin", ["ΛΕΠΤΙΝΗ"]),
  analyte("follitropin", "Follicle-stimulating hormone", [
    "Follitropin (FSH) [Units/volume]in Serum or Plasma",
  ]),
  analyte("luteinizing-hormone", "Luteinizing hormone", [
    "Lutropin [Units/volume] in Serum or Plasma (luteinizing hormone -LH)",
  ]),
  analyte("lymphocytes-absolute", "Lymphocytes, absolute", [
    "LYM#",
    "Lymphocytes (#) (LYM#)",
  ]),
  analyte("lymphocytes-percent", "Lymphocytes, percent", [
    "LYM%",
    "Lymphocytes (LYM%)",
  ]),
  analyte("magnesium", "Magnesium", ["Μαγνήσιο"]),
  analyte("mean-corpuscular-hemoglobin", "Mean corpuscular hemoglobin", [
    "MCH (MCH)",
    "Μέση περιεκ. Αιμοσφαιρίνης (MCH)",
  ]),
  analyte(
    "mean-corpuscular-hemoglobin-concentration",
    "Mean corpuscular hemoglobin concentration",
    ["MCHC (MCHC)", "Μέση πυκν.Αιμοσφαιρίνης (MCHC)"],
  ),
  analyte("mean-corpuscular-volume", "Mean corpuscular volume", [
    "MCV (MCV)",
    "Μέσος όγκος Ερυθρών (MCV)",
  ]),
  analyte("mean-platelet-volume", "Mean platelet volume", [
    "MPV (Mean Platelet Volume) (MPV)",
    "Μέσος όγκος Αιμοπεταλίων (MPV)",
  ]),
  analyte("monocytes-absolute", "Monocytes, absolute", [
    "MONO#",
    "Monocytes (#) (MONO#)",
  ]),
  analyte("monocytes-percent", "Monocytes, percent", [
    "MONO%",
    "Monocytes (MONO%)",
  ]),
  analyte("neutrophils-absolute", "Neutrophils, absolute", [
    "NEU#",
    "Neutrophils (#) (NEUT#)",
  ]),
  analyte("neutrophils-percent", "Neutrophils, percent", [
    "NEU%",
    "Neutrophils (NEUT%)",
  ]),
  analyte("platelet-large-cell-ratio", "Platelet-large cell ratio", [
    "P-LCR",
    "P-LCR (Platelet-Larger Cell Ratio) (P-LCR)",
  ]),
  analyte("platelet-distribution-width", "Platelet distribution width", [
    "PDW (Platelet Distribution Width) (PDW)",
    "Εύρος κατν. μεγέθους Αιμοπεταλίων (PDW)",
  ]),
  analyte("plateletcrit", "Plateletcrit", [
    "Plateletcrit (PCT) (PCT)",
    "Αιμοπεταλιοκρίτης (PCT)",
  ]),
  analyte("platelets", "Platelets", ["Platelets (PLT)", "Αιμοπετάλια (PLT)"]),
  analyte("potassium", "Potassium", ["Κάλιο (Κ-Potassium)", "Κάλιο (Κ)"]),
  analyte("procalcitonin", "Procalcitonin", ["PCT Προκαλσιτονίνη"]),
  analyte("prolactin", "Prolactin", [
    "Prolactin, PRL, PRL [Units/volume]in Serum or Plasma",
  ]),
  analyte("red-blood-cells", "Red blood cells", [
    "RBC (Red Blood Cells) (RBC)",
    "Ερυθρά αιμοσφαίρια (RBC)",
  ]),
  analyte("red-cell-distribution-width-cv", "Red cell distribution width, CV", [
    "RDW-CV",
    "RDW-CV (Red cell Distribution Width) (RDW)",
  ]),
  analyte("red-cell-distribution-width-sd", "Red cell distribution width, SD", [
    "RDW-SD",
    "RDW-SD (Red cell Distribution SD) (RDW-SD)",
  ]),
  analyte("serum-iron", "Iron", [
    "Σίδηρος (IRON)",
    "Iron [Mass/volume] in Serum or Plasma , (Fe)",
  ]),
  analyte("sodium", "Sodium", [
    "Νάτριο (Νa-Sodium)",
    "Νάτριο (Νa)",
    "Sodium [Moles/volume] in Serum or Plasma",
  ]),
  analyte("testosterone", "Testosterone", [
    "Τεστοστερόνη",
    "Testosterone (bl)",
    "Testosterone [Moles/volume]in Serum or Plasma",
  ]),
  analyte("free-testosterone", "Free testosterone", [
    "Testosterone Free [Mass/volume]in Serum or Plasma",
  ]),
  analyte("thyroid-stimulating-hormone", "Thyroid-stimulating hormone", [
    "TSH",
    "Thyrotropin [Units/volume]in Serum or Plasma by Detection limit <= 0.005 mIU/L (TSH)",
  ]),
  analyte("total-cholesterol", "Total cholesterol", [
    "Χοληστερίνη (CHOL)",
    "Cholesterol",
    "Total Cholesterol [Mass/volume] in Serum or Plasma",
  ]),
  analyte("triglycerides", "Triglycerides", [
    "Τριγλυκερίδια (TRIG)",
    "Triglyceride [Mass/volume] in Serum or Plasma",
  ]),
  analyte("urea", "Urea", [
    "Urea [Mass/volume] in Serum or Plasma",
    "Ουρία (UREA)",
  ]),
  analyte("urate", "Urate", ["Urate (UA) [Mass/volume] in Serum or Plasma"]),
  analyte("vitamin-b12", "Vitamin B12", ["Βιταμίνη B12"]),
  analyte("vldl-cholesterol", "VLDL cholesterol", ["VLDL"]),
  analyte("white-blood-cells", "White blood cells", [
    "WBC (White blood cells) (WBC)",
    "Λευκά αιμοσφαίρια (WBC)",
  ]),
  analyte("zinc", "Zinc", ["Ψευδάργυρος"]),
  analyte(
    "human-chorionic-gonadotropin-beta",
    "Human chorionic gonadotropin, beta subunit",
    ["Choriogonadotropin.beta subunit [Units/volume]in Serum or Plasma β–hCG (Quantitative)"],
  ),

  analyte("urine-appearance", "Urine appearance", ["Όψη"]),
  analyte("urine-bacteria", "Urine microorganisms", ["Μικροοργανισμοί"]),
  analyte("urine-bilirubin", "Urine bilirubin", ["Χολοχρωστικές"]),
  analyte("urine-color", "Urine color", ["Χροιά"]),
  analyte("urine-crystals", "Urine crystals", ["Κρύσταλλοι"]),
  analyte("urine-epithelial-cells", "Urine epithelial cells", ["Επιθήλια"]),
  analyte("urine-other-epithelial-cells", "Urine other epithelial cells", [
    "Επιθήλια λοιπά",
  ]),
  analyte("urine-glucose", "Urine glucose", ["Σάκχαρο"], [], "urine"),
  analyte(
    "urine-hemoglobin",
    "Urine hemoglobin",
    ["Αιμοσφαιρίνη"],
    [],
    "urine",
  ),
  analyte("urine-casts", "Urine casts", ["Κύλινδροι"]),
  analyte("urine-ketones", "Urine ketones", ["Κετόνες"]),
  analyte("urine-leukocytes", "Urine leukocytes", ["Πυοσφαίρια"]),
  analyte("urine-mucus", "Urine mucus", ["Βλέννη"]),
  analyte("urine-nitrite", "Urine nitrite", ["Νιτρικά"]),
  analyte("urine-ph", "Urine pH", ["pH"]),
  analyte("urine-protein", "Urine protein", ["Λέυκωμα"]),
  analyte("urine-red-blood-cells", "Urine red blood cells", [
    "Ερυθρά αιμοσφαίρια",
  ]),
  analyte("urine-specific-gravity", "Urine specific gravity", ["Ειδικό βάρος"]),
  analyte("urine-urobilinogen", "Urine urobilinogen", ["Ουροχολινογόνο"]),
  analyte("urine-amorphous-salts", "Urine amorphous salts", ["Άμορφα άλατα"]),
];
