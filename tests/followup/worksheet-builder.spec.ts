import {
  appendExerciseRowsToDraft,
  createEmptyWorksheetBuilderDraft,
} from "../../lib/worksheet/builder-store";
import { documentHtmlToMarkdown } from "../../lib/worksheet/builder-export";
import {
  extractPlainTextFromBuilderAiHtml,
  serializeBuilderTextBlockToHtml,
} from "../../lib/worksheet/builder-ai";
import {
  addMcOptionInBuilderDraft,
  convertQuestionTypeInBuilderDraft,
  deleteQuestionFromBuilderDraft,
  duplicateQuestionInBuilderDraft,
  getQuestionSectionHtmlInBuilderDraft,
  insertBlankQuestionInBuilderDraft,
  insertInstructionBlockInBuilderDraft,
  insertPageBreakInBuilderDraft,
  insertQuestionImageInBuilderDraft,
  insertQuestionTextBlockInBuilderDraft,
  insertSectionTitleInBuilderDraft,
  listQuestionContentTargetsInBuilderDraft,
  listQuestionImagesInBuilderDraft,
  listQuestionTextBlocksInBuilderDraft,
  moveQuestionInBuilderDraft,
  removeQuestionImageFromBuilderDraft,
  removeMcOptionInBuilderDraft,
  replaceQuestionSectionInBuilderDraft,
  replaceQuestionImageInBuilderDraft,
  setMcCorrectOptionInBuilderDraft,
  setTfCorrectAnswerInBuilderDraft,
  updateFrqAnswerSpaceInBuilderDraft,
  updateQuestionDifficultyInBuilderDraft,
  updateQuestionTextBlockInBuilderDraft,
} from "../../lib/worksheet/builder-manipulation";
import { synchronizeWorksheetBuilderDraftFromHtml } from "../../lib/worksheet/builder-sync";

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

async function main() {
  await describe("worksheet builder ai helpers", async () => {
    await it("应把文本块内容序列化为可提交给 AI 的简洁 HTML", () => {
      const html = serializeBuilderTextBlockToHtml("第一行\n第二行\n\n第三段");

      assert(
        html === "<p>第一行<br />第二行</p><p>第三段</p>",
        `unexpected serialized html: ${html}`,
      );
    });

    await it("应把 AI 返回的 HTML 片段提取回纯文本块内容", () => {
      const text = extractPlainTextFromBuilderAiHtml(
        "<p>第一行<br />第二行</p><p>第三段 &amp; 总结</p>",
      );

      assert(
        text === "第一行\n第二行\n第三段 & 总结",
        `unexpected extracted text: ${text}`,
      );
    });
  });

  await describe("worksheet builder draft creation", async () => {
    await it("应把导入题目转换成当前组卷稿中的 question instances", () => {
      const draft = createEmptyWorksheetBuilderDraft({
        title: "Builder Draft",
        courseName: "AP Biology",
        unitName: "Unit 2 · Cell Structure and Function",
      });

      const result = appendExerciseRowsToDraft(draft, [
        {
          id: "exercise-1",
          teacher_id: "teacher-1",
          exercise_type: "MC",
          difficulty: 2,
          question_text:
            "Read the graph and answer.\n\n![Graph](/api/storage/graph-1.png)",
          options: [
            { label: "A", text: "Option A", isCorrect: false },
            { label: "B", text: "Option B", isCorrect: true },
          ],
          correct_answer: "B",
          solution_steps: "Use the highest bar.",
          source_file_name: "unit-2-quiz.pdf",
          source_page_start: 3,
          source_page_end: 3,
        },
      ]);

      assert(result.addedIds.length === 1, `expected 1 added id, got ${result.addedIds.length}`);
      assert(result.draft.questionInstances.length === 1, "should persist one question instance");
      assert(
        result.draft.html.includes('data-question="1"'),
        "rendered html should include question block markup",
      );
      assert(
        result.draft.html.includes("/api/storage/graph-1.png"),
        "rendered html should preserve question image references",
      );
      assert(
        result.draft.html.includes("data-instance-id="),
        "rendered html should preserve question instance ids",
      );
      assert(
        result.draft.html.includes('data-source-exercise-id="exercise-1"'),
        "rendered html should preserve original exercise id",
      );
      assert(
        !result.draft.html.includes("答案：") && !result.draft.html.includes("参考答案："),
        "imported worksheet html should omit answer content",
      );
      assert(
        !result.draft.html.includes("Use the highest bar."),
        "imported worksheet html should omit explanation content",
      );
    });

    await it("重复导入同一道题时应跳过", () => {
      const draft = createEmptyWorksheetBuilderDraft({
        title: "Builder Draft",
      });

      const firstPass = appendExerciseRowsToDraft(draft, [
        {
          id: "exercise-1",
          teacher_id: "teacher-1",
          exercise_type: "FR",
          difficulty: 3,
          question_text: "Explain the process of osmosis.",
          options: null,
          correct_answer: "Water moves from high to low water potential.",
          solution_steps: "Reference membrane permeability.",
          source_file_name: "bio.pdf",
          source_page_start: 2,
          source_page_end: 2,
        },
      ]);

      const secondPass = appendExerciseRowsToDraft(firstPass.draft, [
        {
          id: "exercise-1",
          teacher_id: "teacher-1",
          exercise_type: "FR",
          difficulty: 3,
          question_text: "Explain the process of osmosis.",
          options: null,
          correct_answer: "Water moves from high to low water potential.",
          solution_steps: "Reference membrane permeability.",
          source_file_name: "bio.pdf",
          source_page_start: 2,
          source_page_end: 2,
        },
      ]);

      assert(secondPass.addedIds.length === 0, "duplicate import should not add a new question");
      assert(secondPass.skippedIds.length === 1, "duplicate import should be reported as skipped");
      assert(secondPass.draft.questionInstances.length === 1, "draft should still contain one instance");
    });

    await it("应优先保留导入题目的结构化 content_json", () => {
      const draft = createEmptyWorksheetBuilderDraft({
        title: "Builder Draft",
      });

      const result = appendExerciseRowsToDraft(draft, [
        {
          id: "exercise-structured-1",
          teacher_id: "teacher-1",
          exercise_type: "MC",
          difficulty: 2,
          content_json: {
            version: 1,
            type: "MC",
            stem: [
              { id: "stem-1", kind: "text", text: "Read the graph." },
              { id: "stem-2", kind: "image", src: "/api/storage/graph-2.png", alt: "Graph 2" },
            ],
            options: [
              {
                id: "opt-a",
                label: "A",
                blocks: [{ id: "opt-a-1", kind: "text", text: "Choice A" }],
                isCorrect: false,
              },
              {
                id: "opt-b",
                label: "B",
                blocks: [
                  { id: "opt-b-1", kind: "text", text: "Choice B" },
                  { id: "opt-b-2", kind: "image", src: "/api/storage/choice-b.png", alt: "Choice B figure" },
                ],
                isCorrect: true,
              },
              {
                id: "opt-c",
                label: "C",
                blocks: [{ id: "opt-c-1", kind: "text", text: "Choice C" }],
                isCorrect: false,
              },
              {
                id: "opt-d",
                label: "D",
                blocks: [{ id: "opt-d-1", kind: "text", text: "Choice D" }],
                isCorrect: false,
              },
            ],
            answer: [{ id: "ans-1", kind: "text", text: "B" }],
            explanation: [{ id: "exp-1", kind: "text", text: "Look at the highest point." }],
            answerSpace: null,
            commonMistakes: [],
          },
          question_text: "Read the graph.\n\n![Graph 2](/api/storage/graph-2.png)",
          options: [
            { label: "A", text: "Choice A", isCorrect: false },
            { label: "B", text: "Choice B", isCorrect: true },
          ],
          correct_answer: "B",
          solution_steps: "Look at the highest point.",
          source_file_name: "structured.pdf",
          source_page_start: 4,
          source_page_end: 4,
        },
      ]);

      const block = result.draft.questionInstances[0]?.block.data;
      assert(Boolean(block?.stemBlocks?.length), "question block should preserve structured stem blocks");
      assert(
        Boolean(
          block?.stemBlocks?.some((item) => item.kind === "image" && item.src.includes("graph-2.png")),
        ),
        "stemBlocks should preserve question images from content_json",
      );
      assert(
        Boolean(
          "options" in (block ?? {}) &&
            block?.questionType === "mc" &&
            block.options[1]?.blocks?.some((item) => item.kind === "image" && item.src.includes("choice-b.png")),
        ),
        "option blocks should preserve option images from content_json",
      );
      assert(
        block?.questionType === "mc" && block.correctAnswer == null,
        "structured imports should drop answer content from visible builder blocks",
      );
      assert(
        block?.questionType === "mc" && block.explanationBlocks == null,
        "structured imports should drop explanation content from visible builder blocks",
      );
    });
  });

  await describe("worksheet builder markdown export", async () => {
    await it("应把当前文档 html 转成 markdown 并保留图片", () => {
      const markdown = documentHtmlToMarkdown(`
        <article data-doc-type="worksheet">
          <section data-section="header">
            <h1>Cell Membrane Quiz</h1>
            <p>Name: ______</p>
          </section>
          <div data-question="1">
            <p><strong>1.</strong> Read the graph.</p>
            <img src="/api/storage/graph-1.png" alt="Graph 1" />
            <ol data-options="true" type="A">
              <li>Option A</li>
              <li>Option B</li>
            </ol>
          </div>
        </article>
      `);

      assert(markdown.includes("# Cell Membrane Quiz"), "should export heading markdown");
      assert(markdown.includes("![Graph 1](/api/storage/graph-1.png)"), "should export image markdown");
      assert(markdown.includes("1. Option A"), "should export ordered list items");
    });
  });

  await describe("worksheet builder html synchronization", async () => {
    await it("应把编辑后的 question html 回写成更新后的题目实例", () => {
      const seeded = appendExerciseRowsToDraft(
        createEmptyWorksheetBuilderDraft({
          title: "Builder Draft",
          courseName: "AP Biology",
        }),
        [
          {
            id: "exercise-1",
            teacher_id: "teacher-1",
            exercise_type: "MC",
            difficulty: 2,
            question_text: "Original first question",
            options: [
              { label: "A", text: "Option A", isCorrect: false },
              { label: "B", text: "Option B", isCorrect: true },
            ],
            correct_answer: "B",
            solution_steps: "Original explanation 1",
            source_file_name: "bio-1.pdf",
            source_page_start: 1,
            source_page_end: 1,
          },
          {
            id: "exercise-2",
            teacher_id: "teacher-1",
            exercise_type: "FR",
            difficulty: 3,
            question_text: "Original second question",
            options: null,
            correct_answer: "Original sample answer",
            solution_steps: "Original explanation 2",
            source_file_name: "bio-2.pdf",
            source_page_start: 2,
            source_page_end: 2,
          },
        ],
      ).draft;

      const first = seeded.questionInstances[0];
      const second = seeded.questionInstances[1];

      const synced = synchronizeWorksheetBuilderDraftFromHtml({
        currentDraft: seeded,
        title: "Builder Draft",
        courseName: "AP Biology",
        html: `
          <article data-doc-type="worksheet">
            <section data-section="header"><h1>Builder Draft</h1></section>
            <div
              data-question="2"
              data-difficulty="hard"
              data-instance-id="${second.instanceId}"
              data-source-exercise-id="${second.originExerciseId}"
              data-question-type="frq"
            >
              <p><strong>2.</strong> Edited long response question</p>
              <div data-answer-space="medium"></div>
              <p><strong>参考答案：</strong>Use mitochondria to produce ATP.</p>
              <blockquote><p>Explain cellular respiration clearly.</p></blockquote>
            </div>
            <div
              data-question="1"
              data-difficulty="medium"
              data-instance-id="${first.instanceId}"
              data-source-exercise-id="${first.originExerciseId}"
              data-question-type="mc"
            >
              <p><strong>1.</strong> Edited multiple choice question</p>
              <img src="/api/storage/edited-figure.png" alt="Edited Figure" />
              <ol data-options="true" type="A">
                <li>New option A</li>
                <li>New option B <img src="/api/storage/option-b.png" alt="Option B Figure" /></li>
              </ol>
              <p><strong>答案：</strong>B</p>
              <blockquote><p>Pick the second option.</p></blockquote>
            </div>
          </article>
        `,
      });

      assert(synced.questionInstances.length === 2, "should keep two synchronized instances");
      assert(
        synced.questionInstances[0]?.instanceId === second.instanceId,
        "reordered html should preserve the matched second instance first",
      );
      assert(
        synced.questionInstances[1]?.instanceId === first.instanceId,
        "reordered html should preserve the matched first instance second",
      );
      assert(
        synced.questionInstances[0]?.block.data.questionType === "frq",
        "first synchronized block should remain frq",
      );
      assert(
        synced.questionInstances[1]?.block.data.questionType === "mc",
        "second synchronized block should remain mc",
      );
      assert(
        synced.questionInstances[1]?.block.data.stem.includes("/api/storage/edited-figure.png"),
        "edited stem image should be preserved in synchronized block data",
      );
      assert(
        synced.questionInstances[1]?.block.data.questionType === "mc" &&
          synced.questionInstances[1].block.data.options[1]?.text.includes("/api/storage/option-b.png"),
        "edited option image should be preserved in synchronized option data",
      );
      assert(
        synced.questionInstances[0]?.originExerciseId === "exercise-2",
        "origin exercise id should be preserved for reordered instances",
      );
    });
  });

  await describe("worksheet builder question manipulation", async () => {
    const seededDraft = appendExerciseRowsToDraft(
      createEmptyWorksheetBuilderDraft({
        title: "Builder Draft",
        courseName: "AP Biology",
      }),
      [
        {
          id: "exercise-1",
          teacher_id: "teacher-1",
          exercise_type: "MC",
          difficulty: 2,
          question_text: "Original first question",
          options: [
            { label: "A", text: "Option A", isCorrect: false },
            { label: "B", text: "Option B", isCorrect: true },
          ],
          correct_answer: "B",
          solution_steps: "Original explanation 1",
          source_file_name: "bio-1.pdf",
          source_page_start: 1,
          source_page_end: 1,
        },
        {
          id: "exercise-2",
          teacher_id: "teacher-1",
          exercise_type: "FR",
          difficulty: 3,
          question_text: "Original second question",
          options: null,
          correct_answer: "Original sample answer",
          solution_steps: "Original explanation 2",
          source_file_name: "bio-2.pdf",
          source_page_start: 2,
          source_page_end: 2,
        },
      ],
    ).draft;

    await it("应支持在当前组卷稿中移动题目顺序", () => {
      const moved = moveQuestionInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[1]!.instanceId,
        direction: "up",
      });

      assert(
        moved.questionInstances[0]?.originExerciseId === "exercise-2",
        "move should place the second exercise first",
      );
      assert(
        moved.questionInstances[0]?.number === 1 &&
          moved.questionInstances[1]?.number === 2,
        "move should renumber question instances",
      );
      assert(
        moved.html.indexOf('data-source-exercise-id="exercise-2"') <
          moved.html.indexOf('data-source-exercise-id="exercise-1"'),
        "move should reorder question sections in html",
      );
    });

    await it("应支持复制当前组卷稿中的题目实例而不污染原题 id", () => {
      const duplicated = duplicateQuestionInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
      });

      assert(duplicated.questionInstances.length === 3, "duplicate should create a third instance");
      assert(
        duplicated.questionInstances[0]?.originExerciseId === "exercise-1" &&
          duplicated.questionInstances[1]?.originExerciseId === "exercise-1",
        "duplicate should keep the duplicated question linked to the same source exercise",
      );
      assert(
        duplicated.questionInstances[0]?.instanceId !== duplicated.questionInstances[1]?.instanceId,
        "duplicate should mint a new instance id",
      );
      assert(
        duplicated.html.match(/data-source-exercise-id="exercise-1"/g)?.length === 2,
        "duplicate should serialize both source-linked sections into html",
      );
    });

    await it("应支持从当前组卷稿中删除题目实例", () => {
      const removed = deleteQuestionFromBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
      });

      assert(removed.questionInstances.length === 1, "delete should remove the selected instance");
      assert(
        removed.questionInstances[0]?.originExerciseId === "exercise-2",
        "delete should keep the remaining instance intact",
      );
      assert(
        !removed.html.includes(`data-instance-id="${seededDraft.questionInstances[0]!.instanceId}"`),
        "delete should remove the selected section from html",
      );
      assert(
        removed.questionInstances[0]?.number === 1,
        "delete should renumber the remaining question to 1",
      );
    });

    await it("应支持在当前组卷稿中新增空白题并生成 manual 实例", () => {
      const inserted = insertBlankQuestionInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
      });

      assert(
        inserted.draft.questionInstances.length === 3,
        "insert should append one more question instance",
      );
      assert(
        inserted.draft.questionInstances[2]?.instanceId === inserted.insertedInstanceId,
        "insert should return the created instance id",
      );
      assert(
        inserted.draft.questionInstances[2]?.originExerciseId.startsWith("manual:"),
        "insert should create a manual source id instead of mutating question bank ids",
      );
      assert(
        inserted.draft.questionInstances[2]?.block.data.stem.includes("在这里输入题干"),
        "insert should seed an editable placeholder stem",
      );
    });

    await it("应支持按题型插入空白题模板", () => {
      const inserted = insertBlankQuestionInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        questionType: "mc",
      });

      const insertedQuestion = inserted.draft.questionInstances[2];
      assert(
        insertedQuestion?.block.data.questionType === "mc",
        "manual insertion should support creating an mc template",
      );
      assert(
        insertedQuestion?.block.data.questionType === "mc" &&
          insertedQuestion.block.data.options.length === 4,
        "mc template should seed four editable options",
      );
      assert(
        inserted.draft.html.includes('data-question-type="mc"'),
        "mc template insertion should serialize the question type into html",
      );
    });

    await it("应支持按当前位置在当前题目前插入空白题", () => {
      const targetInstanceId = seededDraft.questionInstances[1]!.instanceId;
      const inserted = insertBlankQuestionInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        questionType: "tf",
        mode: "before-active",
        referenceInstanceId: targetInstanceId,
      });

      assert(
        inserted.draft.questionInstances.length === 3,
        "before-active insertion should add one more question instance",
      );
      assert(
        inserted.draft.questionInstances[1]?.instanceId === inserted.insertedInstanceId,
        "before-active insertion should place the new question before the active question",
      );
      assert(
        inserted.draft.questionInstances[2]?.instanceId === targetInstanceId,
        "before-active insertion should keep the original active question after the inserted one",
      );
      assert(
        inserted.draft.questionInstances[1]?.block.data.questionType === "tf",
        "before-active insertion should preserve the requested question template type",
      );
    });

    await it("应支持在当前 draft 中切换题型并重建对应结构", () => {
      const frqConverted = convertQuestionTypeInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
        questionType: "frq",
      });

      assert(
        frqConverted.questionInstances[0]?.block.data.questionType === "frq",
        "type conversion should update the active question type to frq",
      );
      assert(
        frqConverted.questionInstances[0]?.block.data.questionType === "frq" &&
          frqConverted.questionInstances[0].block.data.answerSpace === "medium",
        "frq conversion should seed a default answer space",
      );
      assert(
        frqConverted.html.includes('data-question-type="frq"'),
        "frq conversion should serialize the updated type into html",
      );

      const tfConverted = convertQuestionTypeInBuilderDraft({
        draft: frqConverted,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
        questionType: "tf",
      });

      assert(
        tfConverted.questionInstances[0]?.block.data.questionType === "tf",
        "type conversion should support converting frq into tf",
      );
      assert(
        tfConverted.questionInstances[0]?.block.data.questionType === "tf" &&
          typeof tfConverted.questionInstances[0].block.data.correctAnswer === "boolean",
        "tf conversion should seed a boolean correct answer",
      );
      assert(
        tfConverted.html.includes("True") || tfConverted.html.includes("False"),
        "tf conversion should rebuild an answer paragraph in html",
      );
    });

    await it("应支持在当前组卷稿里新增、替换和删除题目图片", () => {
      const withInsertedImage = insertQuestionImageInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
        src: "/api/storage/manual-added.png",
        alt: "Manual Added Figure",
      });

      const insertedImages = listQuestionImagesInBuilderDraft({
        draft: withInsertedImage,
        instanceId: seededDraft.questionInstances[0]!.instanceId,
      });
      assert(insertedImages.length === 1, "insert image should append one image ref");
      assert(
        insertedImages[0]?.src === "/api/storage/manual-added.png",
        "insert image should preserve the inserted src",
      );

      const withReplacedImage = replaceQuestionImageInBuilderDraft({
        draft: withInsertedImage,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
        imageIndex: 0,
        src: "/api/storage/manual-replaced.png",
        alt: "Manual Replaced Figure",
      });

      const replacedImages = listQuestionImagesInBuilderDraft({
        draft: withReplacedImage,
        instanceId: seededDraft.questionInstances[0]!.instanceId,
      });
      assert(
        replacedImages[0]?.src === "/api/storage/manual-replaced.png",
        "replace image should update the src in current draft",
      );
      assert(
        withReplacedImage.questionInstances[0]?.block.data.stem.includes("/api/storage/manual-replaced.png"),
        "replace image should sync back into the question block stem",
      );

      const withRemovedImage = removeQuestionImageFromBuilderDraft({
        draft: withReplacedImage,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
        imageIndex: 0,
      });

      const removedImages = listQuestionImagesInBuilderDraft({
        draft: withRemovedImage,
        instanceId: seededDraft.questionInstances[0]!.instanceId,
      });
      assert(removedImages.length === 0, "remove image should clear the image refs");
      assert(
        !withRemovedImage.questionInstances[0]?.block.data.stem.includes("/api/storage/manual-replaced.png"),
        "remove image should sync image removal back into block stem",
      );
    });

    await it("应支持更新题目难度和问答题答题区大小", () => {
      const withDifficultyUpdated = updateQuestionDifficultyInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[1]!.instanceId,
        difficulty: "hard",
      });

      assert(
        withDifficultyUpdated.questionInstances[1]?.difficulty === "hard",
        "difficulty update should sync back into the question instance",
      );
      assert(
        withDifficultyUpdated.questionInstances[1]?.block.data.difficulty === "hard",
        "difficulty update should sync back into the question block data",
      );
      assert(
        withDifficultyUpdated.html.includes('data-difficulty="hard"'),
        "difficulty update should be reflected in rebuilt html",
      );

      const withAnswerSpaceUpdated = updateFrqAnswerSpaceInBuilderDraft({
        draft: withDifficultyUpdated,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[1]!.instanceId,
        answerSpace: "large",
      });

      assert(
        withAnswerSpaceUpdated.questionInstances[1]?.block.data.questionType === "frq" &&
          withAnswerSpaceUpdated.questionInstances[1].block.data.answerSpace === "large",
        "frq answer space update should persist in the draft state",
      );
      assert(
        withAnswerSpaceUpdated.html.includes('data-answer-space="large"'),
        "frq answer space update should be reflected in rebuilt html",
      );
    });

    await it("应支持新增、删除选项并更新选择题正确答案", () => {
      const withAddedOption = addMcOptionInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
      });

      assert(
        withAddedOption.questionInstances[0]?.block.data.questionType === "mc" &&
          withAddedOption.questionInstances[0].block.data.options.length === 3,
        "add option should append one more structured mc option",
      );
      assert(
        withAddedOption.questionInstances[0]?.block.data.questionType === "mc" &&
          withAddedOption.questionInstances[0].block.data.options[2]?.label === "C",
        "add option should assign the next alphabetical label",
      );

      const withCorrectUpdated = setMcCorrectOptionInBuilderDraft({
        draft: withAddedOption,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
        correctLabel: "C",
      });

      assert(
        withCorrectUpdated.questionInstances[0]?.block.data.questionType === "mc" &&
          withCorrectUpdated.questionInstances[0].block.data.correctAnswer === "C",
        "set correct option should update the mc correctAnswer field",
      );
      assert(
        withCorrectUpdated.questionInstances[0]?.block.data.questionType === "mc" &&
          withCorrectUpdated.questionInstances[0].block.data.options[2]?.isCorrect === true,
        "set correct option should mark the selected option as correct",
      );

      const withRemovedOption = removeMcOptionInBuilderDraft({
        draft: withCorrectUpdated,
        title: "Builder Draft",
        instanceId: seededDraft.questionInstances[0]!.instanceId,
        optionLabel: "B",
      });

      assert(
        withRemovedOption.questionInstances[0]?.block.data.questionType === "mc" &&
          withRemovedOption.questionInstances[0].block.data.options.length === 2,
        "remove option should shrink the mc option list",
      );
      assert(
        withRemovedOption.questionInstances[0]?.block.data.questionType === "mc" &&
          withRemovedOption.questionInstances[0].block.data.options[1]?.label === "B",
        "remove option should relabel remaining options sequentially",
      );
      assert(
        withRemovedOption.questionInstances[0]?.block.data.questionType === "mc" &&
          withRemovedOption.questionInstances[0].block.data.correctAnswer === "B",
        "remove option should relabel the preserved correct answer",
      );
    });

    await it("应支持更新判断题的正确答案", () => {
      const tfDraft = synchronizeWorksheetBuilderDraftFromHtml({
        currentDraft: createEmptyWorksheetBuilderDraft({
          title: "TF Draft",
        }),
        title: "TF Draft",
        html: `
          <article data-doc-type="worksheet">
            <section data-section="question-1">
              <div
                data-question="1"
                data-difficulty="medium"
                data-instance-id="tf-instance-1"
                data-source-exercise-id="manual:tf-1"
                data-question-type="tf"
              >
                <p><strong>1.</strong> The statement is correct.</p>
                <p><strong>答案：</strong>False</p>
                <blockquote><p>Judge whether the statement is true.</p></blockquote>
              </div>
            </section>
          </article>
        `,
      });

      const updated = setTfCorrectAnswerInBuilderDraft({
        draft: tfDraft,
        title: "TF Draft",
        instanceId: "tf-instance-1",
        correctAnswer: true,
      });

      assert(
        updated.questionInstances[0]?.block.data.questionType === "tf" &&
          updated.questionInstances[0].block.data.correctAnswer === true,
        "tf answer update should persist in question block data",
      );
      assert(
        updated.html.includes("True"),
        "tf answer update should be reflected in rebuilt html",
      );
    });

    await it("应支持按结构化目标新增文本块和图片块", () => {
      const structuredDraft = appendExerciseRowsToDraft(
        createEmptyWorksheetBuilderDraft({
          title: "Builder Draft",
        }),
        [
          {
            id: "exercise-structured-insert",
            teacher_id: "teacher-1",
            exercise_type: "MC",
            difficulty: 2,
            content_json: {
              version: 1,
              type: "MC",
              stem: [{ id: "stem-insert-1", kind: "text", text: "Original stem" }],
              options: [
                {
                  id: "opt-insert-a",
                  label: "A",
                  blocks: [{ id: "opt-insert-a-1", kind: "text", text: "Original option A" }],
                  isCorrect: false,
                },
                {
                  id: "opt-insert-b",
                  label: "B",
                  blocks: [{ id: "opt-insert-b-1", kind: "text", text: "Original option B" }],
                  isCorrect: true,
                },
                {
                  id: "opt-insert-c",
                  label: "C",
                  blocks: [{ id: "opt-insert-c-1", kind: "text", text: "Original option C" }],
                  isCorrect: false,
                },
                {
                  id: "opt-insert-d",
                  label: "D",
                  blocks: [{ id: "opt-insert-d-1", kind: "text", text: "Original option D" }],
                  isCorrect: false,
                },
              ],
              answer: [{ id: "ans-insert-1", kind: "text", text: "B" }],
              explanation: [{ id: "exp-insert-1", kind: "text", text: "Original explanation" }],
              answerSpace: null,
              commonMistakes: [],
            },
            question_text: "Original stem",
            options: [
              { label: "A", text: "Original option A", isCorrect: false },
              { label: "B", text: "Original option B", isCorrect: true },
              { label: "C", text: "Original option C", isCorrect: false },
              { label: "D", text: "Original option D", isCorrect: false },
            ],
            correct_answer: "B",
            solution_steps: "Original explanation",
            source_file_name: "structured-insert.pdf",
            source_page_start: 1,
            source_page_end: 1,
          },
        ],
      ).draft;

      const instanceId = structuredDraft.questionInstances[0]?.instanceId ?? "";
      const targets = listQuestionContentTargetsInBuilderDraft({
        draft: structuredDraft,
        instanceId,
      });
      assert(
        targets.some((target) => target.key === "option:B"),
        "structured targets should expose option-specific insertion slots",
      );
      assert(
        targets.some((target) => target.key === "explanation"),
        "structured targets should expose explanation insertion slot",
      );

      const withTextBlock = insertQuestionTextBlockInBuilderDraft({
        draft: structuredDraft,
        title: "Builder Draft",
        instanceId,
        targetKey: "option:B",
        text: "Added option B note",
      });

      const optionB = withTextBlock.questionInstances[0]?.block.data.questionType === "mc"
        ? withTextBlock.questionInstances[0].block.data.options[1]
        : null;
      assert(
        Boolean(
          optionB?.blocks?.some((block) => block.kind === "text" && block.text.includes("Added option B note")),
        ),
        "insert text block should append a new structured text leaf into the chosen option",
      );

      const withExplanationImage = insertQuestionImageInBuilderDraft({
        draft: withTextBlock,
        title: "Builder Draft",
        instanceId,
        targetKey: "explanation",
        src: "/api/storage/explanation-added.png",
        alt: "Explanation Figure",
      });

      const insertedImages = listQuestionImagesInBuilderDraft({
        draft: withExplanationImage,
        instanceId,
      });
      assert(
        insertedImages.some(
          (image) =>
            image.label.includes("解析图片") &&
            image.src === "/api/storage/explanation-added.png",
        ),
        "insert image should attach the new image to the selected structured target",
      );
      assert(
        Boolean(
          "explanationBlocks" in (withExplanationImage.questionInstances[0]?.block.data ?? {}) &&
            withExplanationImage.questionInstances[0]?.block.data.explanationBlocks?.some(
              (block) =>
                block.kind === "image" && block.src === "/api/storage/explanation-added.png",
            ),
        ),
        "insert image should sync back into explanation blocks",
      );
    });

    await it("应支持替换单题 section html 并保留实例元信息", () => {
      const instanceId = seededDraft.questionInstances[0]?.instanceId ?? "";
      const originalSectionHtml = getQuestionSectionHtmlInBuilderDraft({
        draft: seededDraft,
        instanceId,
      });

      assert(Boolean(originalSectionHtml), "should locate the original question section html");
      if (!originalSectionHtml) return;

      const replaced = replaceQuestionSectionInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        instanceId,
        sectionHtml: `
          <div data-question="99">
            <p><strong>99.</strong> Rewritten question stem</p>
            <ol data-options="true" type="A">
              <li>Rewritten option A</li>
              <li>Rewritten option B</li>
            </ol>
            <p><strong>答案：</strong>B</p>
            <blockquote><p>Updated explanation</p></blockquote>
          </div>
        `,
      });

      const replacedSectionHtml = getQuestionSectionHtmlInBuilderDraft({
        draft: replaced,
        instanceId,
      });
      assert(
        Boolean(replacedSectionHtml?.startsWith("<section")),
        "replace question should normalize the replacement back into a section container",
      );
      assert(
        Boolean(replacedSectionHtml?.includes(`data-instance-id="${instanceId}"`)),
        "replace question should preserve the existing instance id",
      );
      assert(
        Boolean(replacedSectionHtml?.includes('data-source-exercise-id="exercise-1"')),
        "replace question should preserve the source exercise id",
      );
      assert(
        Boolean(replacedSectionHtml?.includes('data-question-type="mc"')),
        "replace question should preserve the question type metadata",
      );
      assert(
        Boolean(replacedSectionHtml?.includes('data-question="1"')),
        "replace question should keep the original question numbering metadata",
      );
      assert(
        replaced.questionInstances[0]?.block.data.stem.includes("Rewritten question stem"),
        "replace question should sync the rewritten stem back into the draft state",
      );
    });

    await it("应支持只编辑某个结构化文本块，而不丢失同题中的图片块", () => {
      const structuredDraft = appendExerciseRowsToDraft(
        createEmptyWorksheetBuilderDraft({
          title: "Builder Draft",
        }),
        [
          {
            id: "exercise-structured-edit",
            teacher_id: "teacher-1",
            exercise_type: "MC",
            difficulty: 2,
            content_json: {
              version: 1,
              type: "MC",
              stem: [
                { id: "stem-edit-1", kind: "text", text: "Original stem text" },
                { id: "stem-edit-2", kind: "image", src: "/api/storage/stem-keep.png", alt: "Keep" },
              ],
              options: [
                {
                  id: "opt-edit-a",
                  label: "A",
                  blocks: [{ id: "opt-edit-a-1", kind: "text", text: "Original option A" }],
                  isCorrect: false,
                },
                {
                  id: "opt-edit-b",
                  label: "B",
                  blocks: [{ id: "opt-edit-b-1", kind: "text", text: "Original option B" }],
                  isCorrect: true,
                },
                {
                  id: "opt-edit-c",
                  label: "C",
                  blocks: [{ id: "opt-edit-c-1", kind: "text", text: "Original option C" }],
                  isCorrect: false,
                },
                {
                  id: "opt-edit-d",
                  label: "D",
                  blocks: [{ id: "opt-edit-d-1", kind: "text", text: "Original option D" }],
                  isCorrect: false,
                },
              ],
              answer: [{ id: "ans-edit-1", kind: "text", text: "B" }],
              explanation: [{ id: "exp-edit-1", kind: "text", text: "Original explanation" }],
              answerSpace: null,
              commonMistakes: [],
            },
            question_text: "Original stem text\n\n![Keep](/api/storage/stem-keep.png)",
            options: [
              { label: "A", text: "Original option A", isCorrect: false },
              { label: "B", text: "Original option B", isCorrect: true },
              { label: "C", text: "Original option C", isCorrect: false },
              { label: "D", text: "Original option D", isCorrect: false },
            ],
            correct_answer: "B",
            solution_steps: "Original explanation",
            source_file_name: "structured-edit.pdf",
            source_page_start: 1,
            source_page_end: 1,
          },
        ],
      ).draft;

      const instanceId = structuredDraft.questionInstances[0]?.instanceId ?? "";
      const textBlocks = listQuestionTextBlocksInBuilderDraft({
        draft: structuredDraft,
        instanceId,
      });
      const stemTextBlock = textBlocks.find((block) => block.label.includes("题干文本"));
      assert(Boolean(stemTextBlock), "should expose a stem text block for editing");
      if (!stemTextBlock) return;

      const updated = updateQuestionTextBlockInBuilderDraft({
        draft: structuredDraft,
        title: "Builder Draft",
        instanceId,
        leafId: stemTextBlock.leafId,
        text: "Updated stem text",
      });

      const updatedBlock = updated.questionInstances[0]?.block.data;
      assert(
        Boolean(
          updatedBlock?.stemBlocks?.some((item) => item.kind === "text" && item.text.includes("Updated stem text")),
        ),
        "updating a text block should change the structured stem text",
      );
      assert(
        Boolean(
          updatedBlock?.stemBlocks?.some((item) => item.kind === "image" && item.src.includes("stem-keep.png")),
        ),
        "updating a text block should preserve existing stem images",
      );
      assert(
        updated.html.includes("/api/storage/stem-keep.png"),
        "rebuilt html should still contain preserved question images",
      );
    });

    await it("题目级操作重建 draft 时应保留题目之间的自由内容", () => {
      const seeded = appendExerciseRowsToDraft(
        createEmptyWorksheetBuilderDraft({
          title: "Builder Draft",
          courseName: "AP Biology",
        }),
        [
          {
            id: "exercise-shell-1",
            teacher_id: "teacher-1",
            exercise_type: "MC",
            difficulty: 2,
            question_text: "Original first question",
            options: [
              { label: "A", text: "Option A", isCorrect: true },
              { label: "B", text: "Option B", isCorrect: false },
            ],
            correct_answer: "A",
            solution_steps: "Original explanation 1",
            source_file_name: "bio-shell-1.pdf",
            source_page_start: 1,
            source_page_end: 1,
          },
          {
            id: "exercise-shell-2",
            teacher_id: "teacher-1",
            exercise_type: "FR",
            difficulty: 2,
            question_text: "Original second question",
            options: null,
            correct_answer: "Sample answer",
            solution_steps: "Original explanation 2",
            source_file_name: "bio-shell-2.pdf",
            source_page_start: 2,
            source_page_end: 2,
          },
        ],
      ).draft;

      const first = seeded.questionInstances[0]!;
      const second = seeded.questionInstances[1]!;
      const shellDraft = synchronizeWorksheetBuilderDraftFromHtml({
        currentDraft: seeded,
        title: "Builder Draft",
        courseName: "AP Biology",
        html: `
          <article data-doc-type="worksheet">
            <section data-section="header"><h1>Builder Draft</h1></section>
            <section data-section="intro-note"><p>Part A 说明：先完成选择题。</p></section>
            <section data-section="question-1">
              <div
                data-question="1"
                data-difficulty="medium"
                data-instance-id="${first.instanceId}"
                data-source-exercise-id="${first.originExerciseId}"
                data-question-type="mc"
              >
                <p><strong>1.</strong> Original first question</p>
                <ol data-options="true" type="A">
                  <li>Option A</li>
                  <li>Option B</li>
                </ol>
                <p><strong>答案：</strong>A</p>
                <blockquote><p>Original explanation 1</p></blockquote>
              </div>
            </section>
            <section data-section="between-note"><p>Part B 说明：下面是问答题。</p></section>
            <section data-section="question-2">
              <div
                data-question="2"
                data-difficulty="medium"
                data-instance-id="${second.instanceId}"
                data-source-exercise-id="${second.originExerciseId}"
                data-question-type="frq"
              >
                <p><strong>2.</strong> Original second question</p>
                <div data-answer-space="medium"></div>
                <p><strong>参考答案：</strong>Sample answer</p>
                <blockquote><p>Original explanation 2</p></blockquote>
              </div>
            </section>
          </article>
        `,
      });

      const updated = updateQuestionDifficultyInBuilderDraft({
        draft: shellDraft,
        title: "Builder Draft",
        instanceId: first.instanceId,
        difficulty: "hard",
      });

      assert(
        updated.html.includes("Part A 说明：先完成选择题。"),
        "rebuilding draft should preserve custom content before the first question",
      );
      assert(
        updated.html.includes("Part B 说明：下面是问答题。"),
        "rebuilding draft should preserve custom content between question sections",
      );
      assert(
        updated.html.includes('data-difficulty="hard"'),
        "rebuilding draft should still apply the question-level change",
      );
    });

    await it("应支持插入分组标题、说明块和分页标记", () => {
      const firstInstanceId = seededDraft.questionInstances[0]!.instanceId;

      const withSectionTitle = insertSectionTitleInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        sectionTitle: "Part B",
        mode: "after-active",
        referenceInstanceId: firstInstanceId,
      });

      assert(
        withSectionTitle.questionInstances.length === seededDraft.questionInstances.length,
        "inserting a section title should not change question instances",
      );
      assert(
        withSectionTitle.html.includes('<section data-section="part-b"><h2>Part B</h2></section>'),
        "section title insertion should serialize a section block",
      );

      const withInstruction = insertInstructionBlockInBuilderDraft({
        draft: withSectionTitle,
        title: "Builder Draft",
        text: "本部分为基础题，请先完成。",
        mode: "after-active",
        referenceInstanceId: firstInstanceId,
      });

      assert(
        withInstruction.html.includes("本部分为基础题，请先完成。"),
        "instruction insertion should preserve the inserted helper text",
      );

      const withPageBreak = insertPageBreakInBuilderDraft({
        draft: withInstruction,
        title: "Builder Draft",
        mode: "after-active",
        referenceInstanceId: firstInstanceId,
      });

      assert(
        withPageBreak.html.includes('data-page-break="true"'),
        "page break insertion should preserve the dedicated page-break marker",
      );
      assert(
        withPageBreak.html.indexOf('data-page-break="true"') <
          withPageBreak.html.indexOf(`data-instance-id="${seededDraft.questionInstances[1]!.instanceId}"`),
        "page break should be inserted before the following question when targeting after-active",
      );
    });

    await it("应支持在当前题目前插入结构块", () => {
      const secondInstanceId = seededDraft.questionInstances[1]!.instanceId;
      const withSectionTitle = insertSectionTitleInBuilderDraft({
        draft: seededDraft,
        title: "Builder Draft",
        sectionTitle: "Part A",
        mode: "before-active",
        referenceInstanceId: secondInstanceId,
      });

      assert(
        withSectionTitle.html.indexOf("<h2>Part A</h2>") <
          withSectionTitle.html.indexOf(`data-instance-id="${secondInstanceId}"`),
        "before-active structure insertion should place the block before the active question",
      );
      assert(
        withSectionTitle.html.indexOf("<h2>Part A</h2>") >
          withSectionTitle.html.indexOf(`data-instance-id="${seededDraft.questionInstances[0]!.instanceId}"`),
        "before-active structure insertion should keep earlier questions before the inserted block",
      );
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
