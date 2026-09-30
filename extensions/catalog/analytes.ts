/**
 * Human-reviewed canonical analyte identities and their source-language
 * labels. IDs are internal stable keys; display names are English labels for
 * downstream analysis. Source labels remain unchanged in the review ledger.
 */
export type Analyte = {
  id: string;
  displayName: string;
  sourceCodes: string[];
  aliases: string[];
  requiredSourceSections?: string[];
};

/** Normalize source punctuation and diacritics for deterministic alias lookup. */
export function normaliseAnalyteLabel(value: string): string {
  return value.toLocaleLowerCase().normalize("NFD").replace(
    /\p{Diacritic}/gu,
    "",
  ).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Look up a reviewed source label without translating or inferring a result. */
export function findAnalyte(
  sourceLabel: string,
  sourceCode: string | null = null,
  sourceSection: string | null = null,
): Analyte | null {
  const label = normaliseAnalyteLabel(sourceLabel);
  return analytes.find((entry) =>
    ((sourceCode !== null && entry.sourceCodes.includes(sourceCode)) ||
      entry.aliases.some((alias) => normaliseAnalyteLabel(alias) === label)) &&
    (entry.requiredSourceSections === undefined ||
      (sourceSection !== null && entry.requiredSourceSections.some((section) =>
        normaliseAnalyteLabel(sourceSection).includes(
          normaliseAnalyteLabel(section),
        )
      )))
  ) ?? null;
}

const analyte = (
  id: string,
  displayName: string,
  aliases: string[],
  sourceCodes: string[] = [],
  requiredSourceSections?: string[],
): Analyte => ({ id, displayName, aliases, sourceCodes, requiredSourceSections });

/**
 * Initial catalog derived from manually approved records. Add aliases only
 * after checking their source PDF and intended clinical meaning.
 */
export const analytes: Analyte[] = [
  analyte("25-hydroxyvitamin-d3", "25-Hydroxyvitamin D3", ["25-OH Vitamin D3"]),
  analyte("alanine-aminotransferase", "Alanine aminotransferase", ["ALT(SGPT)", "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma ( SGPT, ALT)"]),
  analyte("apolipoprotein-b", "Apolipoprotein B", ["Apo B Λιποπρωτεϊνη"]),
  analyte("aspartate-aminotransferase", "Aspartate aminotransferase", ["AST(SGOT)", "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma (SGOT , AST )"]),
  analyte("atherogenic-index", "Atherogenic index", ["Αθηρωματικός δείκτης (Α.Ι.)"]),
  analyte("basophils-absolute", "Basophils, absolute", ["BASO#", "Basophil granulocytes (#) (BASO#)"]),
  analyte("basophils-percent", "Basophils, percent", ["BASO%", "Basophils (BASO%)"]),
  analyte("bilirubin-direct", "Bilirubin, direct", ["Bilirubin Direct"]),
  analyte("bilirubin-indirect", "Bilirubin, indirect", ["Bilirubin Indirect"]),
  analyte("bilirubin-total", "Bilirubin, total", ["Bilirubin [Mass/volume] in Serum or Plasma"]),
  analyte("c-reactive-protein", "C-reactive protein", ["CRP ποσοτική"]),
  analyte("cortisol", "Cortisol", ["Κορτιζόλη"]),
  analyte("creatinine", "Creatinine", ["Creatinine", "Κρεατινίνη (CREATININE)"]),
  analyte("cystatin-c", "Cystatin C", ["Cystatin C"]),
  analyte("egfr", "Estimated glomerular filtration rate", ["eGFR"]),
  analyte("eosinophils-absolute", "Eosinophils, absolute", ["EOS#", "Eosinophils (#) (EOS#)"]),
  analyte("eosinophils-percent", "Eosinophils, percent", ["EOS%", "Eosinophils (EOS%)"]),
  analyte("erythrocyte-sedimentation-rate", "Erythrocyte sedimentation rate", ["ΤΚΕ (ESR)"]),
  analyte("estradiol", "Estradiol", ["Οιστραδιόλη (Ε2)"]),
  analyte("ferritin", "Ferritin", ["Ferritin [Mass/volume] in Serum or Plasma", "Φερριτίνη ορού (FERRITIN)"]),
  analyte("gamma-glutamyl-transferase", "Gamma-glutamyl transferase", ["Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma (GGT)", "γ-GT"]),
  analyte("glucose", "Glucose", ["Γλυκόζη (GLUCOSE)"]),
  analyte("glycated-hemoglobin", "Glycated hemoglobin (HbA1c)", ["Γλυκοζυλιωμένη αιμοσφαιρίνη (HbA1c)"]),
  analyte("hdl-cholesterol", "HDL cholesterol", ["HDL"]),
  analyte("hematocrit", "Hematocrit", ["HCT (Haematocrit) (HCT)", "Αιματοκρίτης (HCT)"]),
  analyte("hemoglobin", "Hemoglobin", ["HGB (Haemoglobin) (HGB)", "Αιμοσφαιρίνη", "Αιμοσφαιρίνη (HGB)"]),
  analyte("immature-granulocytes-absolute", "Immature granulocytes, absolute", ["IG (#) (IG#)"]),
  analyte("immature-granulocytes-percent", "Immature granulocytes, percent", ["IG (IG%)"]),
  analyte("ldl-cholesterol", "LDL cholesterol", ["LDL"]),
  analyte("leptin", "Leptin", ["ΛΕΠΤΙΝΗ"]),
  analyte("lymphocytes-absolute", "Lymphocytes, absolute", ["LYM#", "Lymphocytes (#) (LYM#)"]),
  analyte("lymphocytes-percent", "Lymphocytes, percent", ["LYM%", "Lymphocytes (LYM%)"]),
  analyte("magnesium", "Magnesium", ["Μαγνήσιο"]),
  analyte("mean-corpuscular-hemoglobin", "Mean corpuscular hemoglobin", ["MCH (MCH)", "Μέση περιεκ. Αιμοσφαιρίνης (MCH)"]),
  analyte("mean-corpuscular-hemoglobin-concentration", "Mean corpuscular hemoglobin concentration", ["MCHC (MCHC)", "Μέση πυκν.Αιμοσφαιρίνης (MCHC)"]),
  analyte("mean-corpuscular-volume", "Mean corpuscular volume", ["MCV (MCV)", "Μέσος όγκος Ερυθρών (MCV)"]),
  analyte("mean-platelet-volume", "Mean platelet volume", ["MPV (Mean Platelet Volume) (MPV)", "Μέσος όγκος Αιμοπεταλίων (MPV)"]),
  analyte("monocytes-absolute", "Monocytes, absolute", ["MONO#", "Monocytes (#) (MONO#)"]),
  analyte("monocytes-percent", "Monocytes, percent", ["MONO%", "Monocytes (MONO%)"]),
  analyte("neutrophils-absolute", "Neutrophils, absolute", ["NEU#", "Neutrophils (#) (NEUT#)"]),
  analyte("neutrophils-percent", "Neutrophils, percent", ["NEU%", "Neutrophils (NEUT%)"]),
  analyte("platelet-large-cell-ratio", "Platelet-large cell ratio", ["P-LCR", "P-LCR (Platelet-Larger Cell Ratio) (P-LCR)"]),
  analyte("platelet-distribution-width", "Platelet distribution width", ["PDW (Platelet Distribution Width) (PDW)", "Εύρος κατν. μεγέθους Αιμοπεταλίων (PDW)"]),
  analyte("plateletcrit", "Plateletcrit", ["Plateletcrit (PCT) (PCT)", "Αιμοπεταλιοκρίτης (PCT)"]),
  analyte("platelets", "Platelets", ["Platelets (PLT)", "Αιμοπετάλια (PLT)"]),
  analyte("potassium", "Potassium", ["Κάλιο (Κ-Potassium)"]),
  analyte("procalcitonin", "Procalcitonin", ["PCT Προκαλσιτονίνη"]),
  analyte("red-blood-cells", "Red blood cells", ["RBC (Red Blood Cells) (RBC)", "Ερυθρά αιμοσφαίρια (RBC)"]),
  analyte("red-cell-distribution-width-cv", "Red cell distribution width, CV", ["RDW-CV", "RDW-CV (Red cell Distribution Width) (RDW)"]),
  analyte("red-cell-distribution-width-sd", "Red cell distribution width, SD", ["RDW-SD", "RDW-SD (Red cell Distribution SD) (RDW-SD)"]),
  analyte("serum-iron", "Iron", ["Σίδηρος (IRON)"]),
  analyte("sodium", "Sodium", ["Νάτριο (Νa-Sodium)"]),
  analyte("testosterone", "Testosterone", ["Τεστοστερόνη"]),
  analyte("thyroid-stimulating-hormone", "Thyroid-stimulating hormone", ["TSH"]),
  analyte("total-cholesterol", "Total cholesterol", ["Χοληστερίνη (CHOL)"]),
  analyte("triglycerides", "Triglycerides", ["Τριγλυκερίδια (TRIG)"]),
  analyte("urea", "Urea", ["Urea [Mass/volume] in Serum or Plasma", "Ουρία (UREA)"]),
  analyte("vldl-cholesterol", "VLDL cholesterol", ["VLDL"]),
  analyte("white-blood-cells", "White blood cells", ["WBC (White blood cells) (WBC)", "Λευκά αιμοσφαίρια (WBC)"]),
  analyte("zinc", "Zinc", ["Ψευδάργυρος"]),

  analyte("urine-appearance", "Urine appearance", ["Όψη"]),
  analyte("urine-bacteria", "Urine microorganisms", ["Μικροοργανισμοί"]),
  analyte("urine-bilirubin", "Urine bilirubin", ["Χολοχρωστικές"]),
  analyte("urine-color", "Urine color", ["Χροιά"]),
  analyte("urine-crystals", "Urine crystals", ["Κρύσταλλοι"]),
  analyte("urine-epithelial-cells", "Urine epithelial cells", ["Επιθήλια"]),
  analyte("urine-other-epithelial-cells", "Urine other epithelial cells", ["Επιθήλια λοιπά"]),
  analyte("urine-glucose", "Urine glucose", ["Σάκχαρο"], [], ["ΓΕΝΙΚΗ ΕΞΕΤΑΣΗ ΟΥΡΩΝ"]),
  analyte("urine-casts", "Urine casts", ["Κύλινδροι"]),
  analyte("urine-ketones", "Urine ketones", ["Κετόνες"]),
  analyte("urine-leukocytes", "Urine leukocytes", ["Πυοσφαίρια"]),
  analyte("urine-mucus", "Urine mucus", ["Βλέννη"]),
  analyte("urine-nitrite", "Urine nitrite", ["Νιτρικά"]),
  analyte("urine-ph", "Urine pH", ["pH"]),
  analyte("urine-protein", "Urine protein", ["Λέυκωμα"]),
  analyte("urine-red-blood-cells", "Urine red blood cells", ["Ερυθρά αιμοσφαίρια"]),
  analyte("urine-specific-gravity", "Urine specific gravity", ["Ειδικό βάρος"]),
  analyte("urine-urobilinogen", "Urine urobilinogen", ["Ουροχολινογόνο"]),
  analyte("urine-amorphous-salts", "Urine amorphous salts", ["Άμορφα άλατα"]),
];
