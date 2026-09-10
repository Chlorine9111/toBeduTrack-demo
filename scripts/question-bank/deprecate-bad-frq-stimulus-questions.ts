import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type QuestionTarget = {
  id: string;
  sourceAssessment: string;
  questionNumber: number;
  expectedStemCue: string;
  expectedStimulusId: string | null;
  reason: string;
};

type StimulusTarget = {
  id: string;
  expectedImageUrlSuffix: string;
  reason: string;
};

function parseArgs(argv: string[]) {
  return {
    dryRun: !argv.includes("--write"),
  };
}

const BAD_STIMULUS: StimulusTarget = {
  id: "2839749c-75c8-4c05-ab4f-8d9844a94cdd",
  expectedImageUrlSuffix: "/2839749c-75c8-4c05-ab4f-8d9844a94cdd.png",
  reason:
    "The stored image is a SECTION II FRQ directions banner, not the graph described in metadata, so every dependent question is unreliable.",
};

const QUESTION_TARGETS: QuestionTarget[] = [
  {
    id: "0a8bacfe-3216-4311-9a1a-9d7cfaf206bd",
    sourceAssessment: "Unit 1 Unit 1 Progress Check  Part A.pdf",
    questionNumber: 2,
    expectedStemCue: "A particle is moving on the x-axis and the position of the particle at time t is given by x(t)",
    expectedStimulusId: BAD_STIMULUS.id,
    reason:
      "The question depends on the missing graph, but the only attached image is the mis-captured FRQ directions banner.",
  },
  {
    id: "c72554f1-d6fc-41e7-8543-3cae6b5085da",
    sourceAssessment: "Unit 1 Unit 1 Progress Check  Part A.pdf",
    questionNumber: 13,
    expectedStemCue: "If f is the function defined above, then lim f(x) is",
    expectedStimulusId: BAD_STIMULUS.id,
    reason:
      "This duplicate row points at the same bad FRQ directions banner instead of a valid prompt figure.",
  },
  {
    id: "dc4f889e-d478-4975-ac9f-fa8cc7444100",
    sourceAssessment: "Unit 1 Unit 1 Progress Check  Part A.pdf",
    questionNumber: 13,
    expectedStemCue: "If f is the function defined above, then lim f(x) is",
    expectedStimulusId: null,
    reason:
      "This duplicate row conflicts with the stimulus-bound Q13 row on both topic and correct answer, so the source question cannot be trusted without a verified original figure.",
  },
];

async function verifyQuestion(
  db: ReturnType<typeof createAdminSupabaseClient>,
  target: QuestionTarget,
) {
  const { data, error } = await db
    .from("questions")
    .select("id, course, source_assessment, question_number, stem, stimulus_id, status")
    .eq("id", target.id)
    .single();

  if (error) {
    throw new Error(`读取问题 ${target.id} 失败: ${error.message}`);
  }
  if (!data) {
    throw new Error(`问题 ${target.id} 不存在`);
  }
  if (`${data.source_assessment ?? ""}` !== target.sourceAssessment) {
    throw new Error(`问题 ${target.id} source_assessment 不匹配，已中止`);
  }
  if (Number(data.question_number) !== target.questionNumber) {
    throw new Error(`问题 ${target.id} question_number 不匹配，已中止`);
  }
  if (!`${data.stem ?? ""}`.includes(target.expectedStemCue)) {
    throw new Error(`问题 ${target.id} 题干线索不匹配，已中止`);
  }
  if ((data.stimulus_id ?? null) !== target.expectedStimulusId) {
    throw new Error(`问题 ${target.id} stimulus_id 不匹配，已中止`);
  }

  return data;
}

async function verifyStimulus(
  db: ReturnType<typeof createAdminSupabaseClient>,
  target: StimulusTarget,
) {
  const { data, error } = await db
    .from("stimuli")
    .select("id, image_url, description, status")
    .eq("id", target.id)
    .single();

  if (error) {
    throw new Error(`读取 stimulus ${target.id} 失败: ${error.message}`);
  }
  if (!data) {
    throw new Error(`stimulus ${target.id} 不存在`);
  }
  if (!`${data.image_url ?? ""}`.endsWith(target.expectedImageUrlSuffix)) {
    throw new Error(`stimulus ${target.id} image_url 不匹配，已中止`);
  }

  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = createAdminSupabaseClient();

  console.log(`[deprecate-bad-frq-stimulus-questions] mode=${args.dryRun ? "dry-run" : "write"}`);

  const verifiedQuestions = [];
  for (const target of QUESTION_TARGETS) {
    const row = await verifyQuestion(db, target);
    verifiedQuestions.push({ target, row });
    console.log(
      `[question] ${row.id} course=${row.course} q=${row.question_number} status=${row.status} stimulus=${row.stimulus_id ?? "null"}`,
    );
    console.log(`  reason: ${target.reason}`);
  }

  const verifiedStimulus = await verifyStimulus(db, BAD_STIMULUS);
  console.log(
    `[stimulus] ${verifiedStimulus.id} status=${verifiedStimulus.status} image=${verifiedStimulus.image_url}`,
  );
  console.log(`  reason: ${BAD_STIMULUS.reason}`);

  if (args.dryRun) {
    return;
  }

  for (const { row } of verifiedQuestions) {
    if (row.status === "deprecated") {
      continue;
    }
    const { error } = await db.from("questions").update({ status: "deprecated" }).eq("id", row.id);
    if (error) {
      throw new Error(`更新问题 ${row.id} 失败: ${error.message}`);
    }
    console.log(`  question deprecated=${row.id}`);
  }

  if (verifiedStimulus.status !== "deprecated") {
    const { error } = await db
      .from("stimuli")
      .update({ status: "deprecated" })
      .eq("id", verifiedStimulus.id);
    if (error) {
      throw new Error(`更新 stimulus ${verifiedStimulus.id} 失败: ${error.message}`);
    }
    console.log(`  stimulus deprecated=${verifiedStimulus.id}`);
  }
}

main().catch((error) => {
  console.error("[deprecate-bad-frq-stimulus-questions] failed");
  console.error(error);
  process.exit(1);
});
