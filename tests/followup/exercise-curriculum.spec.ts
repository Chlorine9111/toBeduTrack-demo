import { resolveApExerciseCurriculum } from "../../lib/agent/exercise-curriculum";

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

type Row = Record<string, unknown>;
type TableData = Record<string, Row[]>;

class FakeQueryBuilder {
  private rows: Row[];

  constructor(rows: Row[]) {
    this.rows = [...rows];
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.rows = this.rows.filter((row) => values.includes(row[column]));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    const ascending = options?.ascending !== false;
    this.rows.sort((left, right) => {
      const leftValue = `${left[column] ?? ""}`;
      const rightValue = `${right[column] ?? ""}`;
      return ascending
        ? leftValue.localeCompare(rightValue, undefined, { numeric: true })
        : rightValue.localeCompare(leftValue, undefined, { numeric: true });
    });
    return this;
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

function createFakeSupabase(data: TableData) {
  return {
    from(table: string) {
      return new FakeQueryBuilder(data[table] ?? []);
    },
  } as never;
}

async function main() {
  await describe("resolveApExerciseCurriculum", async () => {
    await it("chainrule 在没有课程种子时也应先生成并延后归档", async () => {
      const supabase = createFakeSupabase({
        courses: [],
        units: [],
        topics: [],
      });

      const result = await resolveApExerciseCurriculum({
        supabase,
        promptText: "帮我生成三道chainrule习题",
      });

      assert(result.missing.length === 0, `expected no blocking missing fields, got ${result.missing.join(",")}`);
      assert(result.saveMode === "defer_until_curriculum", `expected defer_until_curriculum, got ${result.saveMode}`);
      assert(result.courseId === null, `expected no courseId, got ${result.courseId}`);
      assert(
        (result.saveHint ?? "").includes("先生成"),
        `expected deferred save hint, got ${result.saveHint}`,
      );
    });

    await it("课程已确定但没有 unit 时不应再被追问 unit", async () => {
      const supabase = createFakeSupabase({
        courses: [
          { id: "calc-bc", name: "AP Calculus BC", code: "CALC-BC", framework: "AP" },
        ],
        units: [],
        topics: [],
      });

      const result = await resolveApExerciseCurriculum({
        supabase,
        promptText: "帮我生成三道 AP Calculus BC chain rule 习题",
      });

      assert(result.courseId === "calc-bc", `expected calc-bc, got ${result.courseId}`);
      assert(result.unitId === null, `expected null unitId, got ${result.unitId}`);
      assert(result.missing.length === 0, `expected no missing fields, got ${result.missing.join(",")}`);
      assert(result.saveMode === "save_now", `expected save_now, got ${result.saveMode}`);
    });

    await it("topic 明确时应优先反推课程和 unit", async () => {
      const supabase = createFakeSupabase({
        courses: [
          { id: "calc-combined", name: "AP Calculus AB and BC", code: "CALC-ABC", framework: "AP" },
          { id: "bio", name: "AP Biology", code: "BIO", framework: "AP" },
        ],
        units: [
          {
            id: "unit-3",
            course_id: "calc-combined",
            title: "Applying Derivatives to Analyze Functions",
            unit_number: "3",
          },
          {
            id: "unit-bio",
            course_id: "bio",
            title: "Cell Structure and Function",
            unit_number: "2",
          },
        ],
        topics: [
          { id: "topic-1", title: "The Chain Rule", topic_number: "3.5", unit_id: "unit-3" },
          { id: "topic-2", title: "Cell Communication", topic_number: "2.1", unit_id: "unit-bio" },
        ],
      });

      const result = await resolveApExerciseCurriculum({
        supabase,
        promptText: "帮我生成三道chainrule习题",
      });

      assert(result.courseId === "calc-combined", `expected calc-combined, got ${result.courseId}`);
      assert(result.unitId === "unit-3", `expected unit-3, got ${result.unitId}`);
      assert(result.topicId === "topic-1", `expected topic-1, got ${result.topicId}`);
      assert(result.saveMode === "save_now", `expected save_now, got ${result.saveMode}`);
    });
  });

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
  }
  console.log(`${"=".repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main();
