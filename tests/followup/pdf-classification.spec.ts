import {
  classifyExerciseTaxonomySync,
  inferExerciseTaxonomyHeuristically,
} from "../../lib/question-bank/taxonomy";
import { inferDocumentSubjectHeuristically } from "../../lib/pdf-scan/classify-document-subject";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  FAIL: ${message}`);
  }
}

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n${name}`);
  return Promise.resolve(fn());
}

async function it(name: string, fn: () => void | Promise<void>) {
  const failedBefore = failed;
  try {
    await fn();
    if (failed === failedBefore) {
      console.log(`  PASS: ${name}`);
    }
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  FAIL: ${name}: ${message}`);
  }
}

const courseCandidates = [
  { id: "1", name: "AP Calculus AB and BC", code: "APCALCAB_BC" },
  { id: "2", name: "AP Chemistry", code: "AP_CHEM" },
  { id: "3", name: "AP Physics C: Mechanics", code: "AP_PHYS_C_MECH" },
  { id: "4", name: "AP Statistics", code: "AP_STATISTICS" },
];

async function main() {
  await describe("inferDocumentSubjectHeuristically", async () => {
    await it("应把 USNCO 化学竞赛卷识别为 AP Chemistry", () => {
      const result = inferDocumentSubjectHeuristically({
        fileName: "2025-usnco-local-exam.pdf",
        textPreview: [
          "How many nitrogen atoms are present in 486 g of N2O5?",
          "What is the empirical formula of a compound that is 50% S and 50% O by mass?",
          "What is the Ksp of AgBr at 298 K?",
        ].join("\n"),
        sampleQuestions: [
          "What is the standard potential of a fuel cell?",
          "Which molecule is trigonal planar?",
          "The rate constant is measured at a variety of temperatures.",
        ].join("\n"),
        courses: courseCandidates,
      });

      assert(result.courseName === "AP Chemistry", `expected AP Chemistry, got ${result.courseName}`);
      assert((result.confidence ?? 0) >= 70, `expected confidence >= 70, got ${result.confidence}`);
    });
  });

  await describe("inferExerciseTaxonomyHeuristically", async () => {
    await it("应把 Ksp 题识别为溶解平衡", () => {
      const result = inferExerciseTaxonomyHeuristically({
        questionText: "What is the Ksp of AgBr at 298 K?",
        optionsText: "A. 3.3e-13\nB. 3.1e-14\nC. 1.0e-17\nD. 3.2e-22",
        subjectHint: "AP Chemistry",
      });

      assert(result.knowledgeCluster === "equilibrium_acid_base", `unexpected cluster: ${result.knowledgeCluster}`);
      assert(result.knowledgeSubskillKey === "solubility_equilibrium", `unexpected subskill: ${result.knowledgeSubskillKey}`);
    });

    await it("应把 SN1 机理题识别为有机化学", () => {
      const result = inferExerciseTaxonomyHeuristically({
        questionText: "The tertiary alcohol 2-methyl-2-propanol reacts with concentrated aqueous hydrochloric acid to form 2-chloro-2-methylpropane. How is the mechanism best described? SN1, SN2, E1, or E2?",
        subjectHint: "AP Chemistry",
      });

      assert(result.knowledgeCluster === "organic_chemistry", `unexpected cluster: ${result.knowledgeCluster}`);
      assert(result.knowledgeSubskillKey === "reaction_mechanism_pattern", `unexpected subskill: ${result.knowledgeSubskillKey}`);
    });

    await it("应把电离能题识别为原子结构与化学键", () => {
      const result = inferExerciseTaxonomyHeuristically({
        questionText: "Which atom has the smallest first ionization energy? Mg, Al, Si, or P?",
        subjectHint: "AP Chemistry",
      });

      assert(result.knowledgeCluster === "atomic_structure_bonding", `unexpected cluster: ${result.knowledgeCluster}`);
      assert(result.knowledgeSubskillKey === "periodic_trends", `unexpected subskill: ${result.knowledgeSubskillKey}`);
    });

    await it("应把 Arrhenius 图像题识别为热力学/动力学", () => {
      const result = inferExerciseTaxonomyHeuristically({
        questionText: "The rate constant is measured at a variety of temperatures, and the variation of ln(k) with 1/T is shown below. What is the activation energy of this reaction?",
        subjectHint: "AP Chemistry",
      });

      assert(result.knowledgeCluster === "thermodynamics_kinetics", `unexpected cluster: ${result.knowledgeCluster}`);
      assert(result.knowledgeSubskillKey === "activation_energy", `unexpected subskill: ${result.knowledgeSubskillKey}`);
      assert(result.assessmentStyle === "graph_interpretation", `unexpected style: ${result.assessmentStyle}`);
    });

    await it("应在 OCR 拼题时优先保留原子结构信号，而不是被 photon/frequency 带偏", () => {
      const result = inferExerciseTaxonomyHeuristically({
        questionText: "Which atom has the smallest first ionization energy? (A)Mg(B)Al(C)Si(D)P 44. How many electrons in a ground-state atom of uranium (U) have the principal quantum number n=4 ? (A)4(B)16(C)18(D)32 45. Which property of a photon is directly proportional to its frequency?",
        optionsText: "A. Energy\nB. Momentum\nC. Velocity\nD. Wavelength",
        subjectHint: "AP Chemistry · 物理",
      });

      assert(result.knowledgeCluster === "atomic_structure_bonding", `unexpected cluster: ${result.knowledgeCluster}`);
      assert(result.knowledgeSubskillKey === "electron_configuration", `unexpected subskill: ${result.knowledgeSubskillKey}`);
    });

    await it("应在选项被后题污染时仍优先识别 SN1/SN2 机理题", () => {
      const result = inferExerciseTaxonomyHeuristically({
        questionText: "The tertiary alcohol 2-methyl-2-propanol reacts with concentrated aqueous hydrochloric acid at 0 C to form 2-chloro-2-methylpropane. How is the mechanism of this reaction best described?",
        optionsText: "A. SN1\nB. SN2 (C)E1(D)E2 59. Which statement most accurately describes the properties of ketones and esters?\nC. Ketones are readily reduced; esters are readily oxidized.\nD. The carbonyl group of a ketone is resonance stabilized; the carbonyl group of an ester is not resonance stabilized.",
        subjectHint: "AP Chemistry · 英语",
      });

      assert(result.knowledgeCluster === "organic_chemistry", `unexpected cluster: ${result.knowledgeCluster}`);
      assert(result.knowledgeSubskillKey === "reaction_mechanism_pattern", `unexpected subskill: ${result.knowledgeSubskillKey}`);
    });

    await it("应把矿石质量分数题识别为反应计量，而不是空落到其它化学簇", () => {
      const result = inferExerciseTaxonomyHeuristically({
        questionText: "The only source of copper in an ore sample is the mineral malachite, Cu2CO3(OH)2(M=221.1). A 1.00 kg sample of this ore is smelted to obtain 47.0 g of metallic copper. Assuming a complete recovery of the copper, what percentage by mass of the ore is malachite?",
        optionsText: "A. 4.70%\nB. 8.18%\nC. 16.4%\nD. 32.8%",
        subjectHint: "AP Chemistry · 化学",
      });

      assert(result.knowledgeCluster === "chemical_reactions", `unexpected cluster: ${result.knowledgeCluster}`);
      assert(result.knowledgeSubskillKey === "reaction_stoichiometry", `unexpected subskill: ${result.knowledgeSubskillKey}`);
    });
  });

  await describe("classifyExerciseTaxonomySync", async () => {
    await it("同步分类不应把明显化学题退回 general", () => {
      const result = classifyExerciseTaxonomySync({
        questionText: "For a chemical reaction at equilibrium, which statements must be true? II. ΔGrxn = 0",
        subjectHint: "AP Chemistry",
      });

      assert(result.knowledgeCluster !== "general", "expected non-general cluster");
      assert((result.classificationConfidence ?? 0) >= 50, `unexpected confidence: ${result.classificationConfidence}`);
    });
  });

  console.log("\n==================================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
