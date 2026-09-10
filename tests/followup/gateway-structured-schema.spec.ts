import { sanitizeStructuredJsonSchemaForGateway } from "../../lib/ai/gateway";

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

async function main() {
  await describe("sanitizeStructuredJsonSchemaForGateway", async () => {
    await it("应递归移除 Anthropic/OpenRouter 不支持的 numeric 与 array 约束", async () => {
      const sanitized = sanitizeStructuredJsonSchemaForGateway({
        type: "object",
        properties: {
          index: {
            type: "integer",
            minimum: 1,
            maximum: 6,
          },
          scores: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              type: "number",
              minimum: 0,
              maximum: 10,
            },
          },
        },
        $defs: {
          nested: {
            type: "object",
            properties: {
              level: {
                type: "integer",
                minimum: 0,
                maximum: 3,
              },
            },
          },
        },
      });

      const indexSchema = (sanitized.properties as Record<string, unknown>).index as Record<
        string,
        unknown
      >;
      const scoresSchema = (sanitized.properties as Record<string, unknown>).scores as Record<
        string,
        unknown
      >;
      const itemSchema = scoresSchema.items as Record<string, unknown>;
      const nestedSchema = (
        ((sanitized.$defs as Record<string, unknown>).nested as Record<string, unknown>)
          .properties as Record<string, unknown>
      ).level as Record<string, unknown>;

      assert(!("minimum" in indexSchema), "index.minimum 应被剥离");
      assert(!("maximum" in indexSchema), "index.maximum 应被剥离");
      assert(!("minItems" in scoresSchema), "scores.minItems 应被剥离");
      assert(!("maxItems" in scoresSchema), "scores.maxItems 应被剥离");
      assert(!("minimum" in itemSchema), "scores.items.minimum 应被剥离");
      assert(!("maximum" in itemSchema), "scores.items.maximum 应被剥离");
      assert(!("minimum" in nestedSchema), "$defs.nested.level.minimum 应被剥离");
      assert(!("maximum" in nestedSchema), "$defs.nested.level.maximum 应被剥离");
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
