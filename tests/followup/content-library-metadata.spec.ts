import {
  formatUnitNameFromOption,
  mergeListItemWithOverride,
  normalizeMetadataSaveDraft,
} from "../../lib/content-library/metadata-helpers";
import type { ContentLibraryListItem } from "../../lib/content-library/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
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
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  FAIL: ${name}: ${message}`);
  }
}

const courses = [
  { id: "course-a", name: "AP Calculus AB", code: "AB" },
  { id: "course-b", name: "AP Physics 1", code: "PHYS1" },
];

const units = [
  { id: "unit-a1", course_id: "course-a", unit_number: 1, title: "Limits" },
  { id: "unit-a2", course_id: "course-a", unit_number: 2, title: "Derivatives" },
  { id: "unit-b1", course_id: "course-b", unit_number: 1, title: "Kinematics" },
];

function makeItem(): ContentLibraryListItem {
  return {
    id: "item-1",
    documentId: null,
    contentType: "question",
    rendererType: "exercise",
    originEntityType: "exercise",
    originEntityId: "exercise-1",
    title: "原始标题",
    displayTitle: "原始标题",
    note: null,
    summaryText: "原始摘要内容",
    courseId: null,
    unitId: null,
    courseName: null,
    unitName: null,
    createdAt: "2026-03-14T09:00:00.000Z",
    updatedAt: "2026-03-14T09:00:00.000Z",
    sourceConversationId: null,
    sourceConversationTitle: null,
    sourceMessageId: null,
  };
}

async function main() {
  await describe("content library metadata normalization", async () => {
    await it("标题和备注应在保存前被 trim，并保留合法课程/单元", async () => {
      const result = normalizeMetadataSaveDraft({
        draftTitle: "  U3 数学  ",
        draftNote: "  明天上课讲  ",
        detailCourseId: "course-a",
        detailUnitId: "unit-a2",
        currentCourseId: null,
        currentUnitId: null,
        courses,
        units,
      });

      assert(result.ok, "expected normalization to succeed");
      if (!result.ok) return;
      assert(result.normalizedTitle === "U3 数学", `unexpected title ${result.normalizedTitle}`);
      assert(result.normalizedNote === "明天上课讲", `unexpected note ${result.normalizedNote}`);
      assert(result.normalizedCourseId === "course-a", `unexpected course ${result.normalizedCourseId}`);
      assert(result.normalizedUnitId === "unit-a2", `unexpected unit ${result.normalizedUnitId}`);
      assert(result.classificationChanged, "classification should be marked as changed");
    });

    await it("清空标题和备注时应转成 null，而不是非法空字符串", async () => {
      const result = normalizeMetadataSaveDraft({
        draftTitle: "   ",
        draftNote: "   ",
        detailCourseId: "course-a",
        detailUnitId: "",
        currentCourseId: "course-a",
        currentUnitId: null,
        courses,
        units,
      });

      assert(result.ok, "expected normalization to succeed");
      if (!result.ok) return;
      assert(result.normalizedTitle === null, "blank title should normalize to null");
      assert(result.normalizedNote === null, "blank note should normalize to null");
      assert(!result.classificationChanged, "classification should remain unchanged");
    });

    await it("失效课程应直接报错，而不是继续发送请求", async () => {
      const result = normalizeMetadataSaveDraft({
        draftTitle: "Title",
        draftNote: "Note",
        detailCourseId: "missing-course",
        detailUnitId: "",
        currentCourseId: null,
        currentUnitId: null,
        courses,
        units,
      });

      assert(!result.ok && result.error === "course_not_found", `unexpected result ${JSON.stringify(result)}`);
    });

    await it("失效单元应直接报错，而不是继续发送请求", async () => {
      const result = normalizeMetadataSaveDraft({
        draftTitle: "Title",
        draftNote: "Note",
        detailCourseId: "course-a",
        detailUnitId: "missing-unit",
        currentCourseId: "course-a",
        currentUnitId: null,
        courses,
        units,
      });

      assert(!result.ok && result.error === "unit_not_found", `unexpected result ${JSON.stringify(result)}`);
    });

    await it("单元不属于当前课程时应阻止保存", async () => {
      const result = normalizeMetadataSaveDraft({
        draftTitle: "Title",
        draftNote: "Note",
        detailCourseId: "course-a",
        detailUnitId: "unit-b1",
        currentCourseId: "course-a",
        currentUnitId: null,
        courses,
        units,
      });

      assert(!result.ok && result.error === "unit_course_mismatch", `unexpected result ${JSON.stringify(result)}`);
    });

    await it("只选单元不选课程时应要求先选课程", async () => {
      const result = normalizeMetadataSaveDraft({
        draftTitle: "Title",
        draftNote: "Note",
        detailCourseId: "",
        detailUnitId: "unit-a1",
        currentCourseId: "course-a",
        currentUnitId: "unit-a1",
        courses,
        units,
      });

      assert(!result.ok && result.error === "unit_without_course", `unexpected result ${JSON.stringify(result)}`);
    });

    await it("清空课程和单元应被视为合法保存值", async () => {
      const result = normalizeMetadataSaveDraft({
        draftTitle: "Title",
        draftNote: "Note",
        detailCourseId: "",
        detailUnitId: "",
        currentCourseId: "course-a",
        currentUnitId: "unit-a1",
        courses,
        units,
      });

      assert(result.ok, `unexpected result ${JSON.stringify(result)}`);
      if (!result.ok) return;
      assert(result.normalizedCourseId === "", `unexpected course ${result.normalizedCourseId}`);
      assert(result.normalizedUnitId === "", `unexpected unit ${result.normalizedUnitId}`);
      assert(result.classificationChanged, "clearing classification should count as a change");
    });
  });

  await describe("content library card overrides", async () => {
    await it("已保存的卡片 override 应覆盖标题、备注、课程和单元", async () => {
      const merged = mergeListItemWithOverride(makeItem(), {
        displayTitle: "U3 数学",
        note: "明天上课讲",
        courseId: "course-a",
        unitId: "unit-a2",
        courseName: "AP Calculus AB",
        unitName: "Unit 2 · Derivatives",
        updatedAt: "2026-03-14T10:00:00.000Z",
      });

      assert(merged.displayTitle === "U3 数学", `unexpected displayTitle ${merged.displayTitle}`);
      assert(merged.note === "明天上课讲", `unexpected note ${merged.note}`);
      assert(merged.courseName === "AP Calculus AB", `unexpected course ${merged.courseName}`);
      assert(merged.unitName === "Unit 2 · Derivatives", `unexpected unit ${merged.unitName}`);
    });

    await it("没有 override 时应保留原始标题和摘要回退能力", async () => {
      const original = makeItem();
      const merged = mergeListItemWithOverride(original, null);

      assert(merged.displayTitle === "原始标题", `unexpected displayTitle ${merged.displayTitle}`);
      assert(merged.summaryText === "原始摘要内容", `unexpected summary ${merged.summaryText}`);
    });

    await it("单元名称格式应保持 Unit 编号 + 标题", async () => {
      const label = formatUnitNameFromOption(units[1]);
      assert(label === "Unit 2 · Derivatives", `unexpected unit label ${label}`);
    });
  });

  if (failed > 0) {
    console.error(`\n${failed} assertions failed.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nAll ${passed} assertions passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
