import {
  buildChunkBackedAssetMaterials,
  type ContentAssetChunkMatchRow,
} from "../../lib/content-assets/reference-context-helpers";

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

const rows = [
  {
    id: "asset-a",
    title: "细胞呼吸讲义",
    file_type: "pdf",
  },
  {
    id: "asset-b",
    title: "光合作用总结",
    file_type: "docx",
  },
];

function makeChunk(
  overrides: Partial<ContentAssetChunkMatchRow>,
): ContentAssetChunkMatchRow {
  return {
    id: "chunk-default",
    asset_id: "asset-a",
    chunk_index: 0,
    title: "默认标题",
    content: "默认内容",
    token_count: 42,
    page_start: null,
    page_end: null,
    similarity: 0.8,
    ...overrides,
  };
}

async function main() {
  await describe("content asset reference context", async () => {
    await it("应按资产聚合匹配段落，并忽略未选中的资产", async () => {
      const materials = buildChunkBackedAssetMaterials({
        rows,
        chunks: [
          makeChunk({
            id: "chunk-b-1",
            asset_id: "asset-b",
            chunk_index: 3,
            title: "Light-Dependent Reactions",
            content: "光反应发生在类囊体膜，需要光能驱动。",
            similarity: 0.96,
          }),
          makeChunk({
            id: "chunk-a-1",
            asset_id: "asset-a",
            chunk_index: 1,
            title: "有氧呼吸",
            content: "有氧呼吸主要在线粒体内进行。",
            page_start: 2,
            page_end: 2,
            similarity: 0.91,
          }),
          makeChunk({
            id: "chunk-a-2",
            asset_id: "asset-a",
            chunk_index: 4,
            title: "ATP 生成",
            content: "电子传递链产生大量 ATP。",
            page_start: 3,
            page_end: 4,
            similarity: 0.88,
          }),
          makeChunk({
            id: "chunk-other",
            asset_id: "asset-c",
            chunk_index: 0,
            title: "不相关资料",
            content: "这段内容不应进入结果。",
            similarity: 0.99,
          }),
        ],
        budget: 12_000,
      });

      assert(materials.length === 2, `expected 2 materials, got ${materials.length}`);
      assert(
        materials[0]?.fileName === "引用文件 · 细胞呼吸讲义",
        `expected asset-a to stay in row order, got ${materials[0]?.fileName}`,
      );
      assert(
        materials[1]?.fileName === "引用文件 · 光合作用总结",
        `expected asset-b to stay in row order, got ${materials[1]?.fileName}`,
      );
      assert(
        materials[0]?.textContent.includes("【相关段落 1｜分块 #2｜第 2 页｜有氧呼吸】"),
        `expected page label and title for asset-a chunk, got: ${materials[0]?.textContent}`,
      );
      assert(
        materials[0]?.textContent.includes("【相关段落 2｜分块 #5｜第 3-4 页｜ATP 生成】"),
        `expected range page label for asset-a chunk, got: ${materials[0]?.textContent}`,
      );
      assert(
        materials[1]?.textContent.includes("Light-Dependent Reactions"),
        `expected asset-b chunk title, got: ${materials[1]?.textContent}`,
      );
      assert(
        !materials.some((item) => item.textContent.includes("不相关资料")),
        "unexpected unrelated chunk content in selected asset materials",
      );
    });

    await it("预算不足时应压缩 chunk 材料正文，而不是原样放大进入上下文", async () => {
      const longChunk = makeChunk({
        id: "chunk-long",
        asset_id: "asset-a",
        title: "长段落",
        content: "细胞呼吸".repeat(240),
        similarity: 0.95,
      });

      const full = buildChunkBackedAssetMaterials({
        rows: [rows[0]],
        chunks: [longChunk],
        budget: 12_000,
      });
      const budgeted = buildChunkBackedAssetMaterials({
        rows: [rows[0]],
        chunks: [longChunk],
        budget: 120,
      });

      assert(full.length === 1, `expected full material, got ${full.length}`);
      assert(budgeted.length === 1, `expected budgeted material, got ${budgeted.length}`);
      assert(
        budgeted[0].textContent.length < full[0].textContent.length,
        `expected budgeted text to be shorter, got ${budgeted[0].textContent.length} >= ${full[0].textContent.length}`,
      );
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
