import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type QuestionTarget = {
  id: string;
  sourceAssessment: string;
  questionNumber: number;
  expectedStemCue: string;
  expectedStimulusId: string;
  reason: string;
};

type StimulusTarget = {
  id: string;
  expectedImageUrlSuffix: string;
  expectedDescriptionCue: string;
  reason: string;
};

function parseArgs(argv: string[]) {
  return {
    dryRun: !argv.includes("--write"),
  };
}

const BAD_QUESTION: QuestionTarget = {
  id: "269cfaf6-0a70-4ef6-8692-450bc605b3d7",
  sourceAssessment: "Unit 2 Unit 2 Progress Check Part A.pdf",
  questionNumber: 4,
  expectedStemCue: "The graph of the function f, shown above, consists of three line segments.",
  expectedStimulusId: "23bd5a26-5090-433a-9f4e-c9ed6abf3f63",
  reason:
    "The attached image is an exam cover page, not the graph required to answer the average-rate-of-change question.",
};

const BAD_STIMULUS: StimulusTarget = {
  id: "23bd5a26-5090-433a-9f4e-c9ed6abf3f63",
  expectedImageUrlSuffix: "/23bd5a26-5090-433a-9f4e-c9ed6abf3f63.png",
  expectedDescriptionCue: "Line graph with three connected line segments",
  reason:
    "The stored file content is the AP Calculus Midterm cover sheet while the metadata claims it is a three-segment line graph.",
};

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
  if (`${data.stimulus_id ?? ""}` !== target.expectedStimulusId) {
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
    .select("id, description, image_url, status")
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
  if (!`${data.description ?? ""}`.includes(target.expectedDescriptionCue)) {
    throw new Error(`stimulus ${target.id} description 不匹配，已中止`);
  }

  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = createAdminSupabaseClient();

  console.log(`[deprecate-bad-cover-stimulus-question] mode=${args.dryRun ? "dry-run" : "write"}`);

  const question = await verifyQuestion(db, BAD_QUESTION);
  console.log(
    `[question] ${question.id} course=${question.course} q=${question.question_number} status=${question.status} stimulus=${question.stimulus_id}`,
  );
  console.log(`  reason: ${BAD_QUESTION.reason}`);

  const stimulus = await verifyStimulus(db, BAD_STIMULUS);
  console.log(
    `[stimulus] ${stimulus.id} status=${stimulus.status} image=${stimulus.image_url}`,
  );
  console.log(`  reason: ${BAD_STIMULUS.reason}`);

  if (args.dryRun) {
    return;
  }

  if (question.status !== "deprecated") {
    const { error } = await db.from("questions").update({ status: "deprecated" }).eq("id", question.id);
    if (error) {
      throw new Error(`更新问题 ${question.id} 失败: ${error.message}`);
    }
    console.log(`  question deprecated=${question.id}`);
  }

  if (stimulus.status !== "deprecated") {
    const { error } = await db.from("stimuli").update({ status: "deprecated" }).eq("id", stimulus.id);
    if (error) {
      throw new Error(`更新 stimulus ${stimulus.id} 失败: ${error.message}`);
    }
    console.log(`  stimulus deprecated=${stimulus.id}`);
  }
}

main().catch((error) => {
  console.error("[deprecate-bad-cover-stimulus-question] failed");
  console.error(error);
  process.exit(1);
});
