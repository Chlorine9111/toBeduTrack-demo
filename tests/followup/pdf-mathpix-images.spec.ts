import { rewriteMathpixImageReferences } from "../../lib/pdf-scan/mathpix-images";

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
  await describe("rewriteMathpixImageReferences", async () => {
    await it("应保留 figure caption 中的选项标签，把图片块改写成可回填的 markdown 选项", () => {
      const input = [
        "4. Select the odd one out.",
        "",
        "\\begin{figure}",
        "\\captionsetup{labelformat=empty}",
        "\\caption{(A)}",
        "\\includegraphics{https://cdn.mathpix.com/a.jpg}",
        "\\end{figure}",
        "",
        "\\begin{figure}",
        "\\captionsetup{labelformat=empty}",
        "\\caption{(B)}",
        "\\includegraphics{https://cdn.mathpix.com/b.jpg}",
        "\\end{figure}",
      ].join("\n");

      const output = rewriteMathpixImageReferences(input, {
        "https://cdn.mathpix.com/a.jpg": "/api/pdf/scan-image?path=a",
        "https://cdn.mathpix.com/b.jpg": "/api/pdf/scan-image?path=b",
      });

      assert(output.includes("(A) ![选项 A](/api/pdf/scan-image?path=a)"), "A 选项应保留 caption 标签");
      assert(output.includes("(B) ![选项 B](/api/pdf/scan-image?path=b)"), "B 选项应保留 caption 标签");
      assert(!output.includes("\\caption{(A)}"), "原始 caption 应被清理");
    });

    await it("即使没有本地持久化映射，也应保留原始 Mathpix CDN URL 并写回选项标签", () => {
      const input = [
        "4. Select the odd one out.",
        "",
        "\\begin{figure}",
        "\\caption{(A)}",
        "\\includegraphics{https://cdn.mathpix.com/a.jpg}",
        "\\end{figure}",
      ].join("\n");

      const output = rewriteMathpixImageReferences(input, {});

      assert(
        output.includes("(A) ![选项 A](https://cdn.mathpix.com/a.jpg)"),
        "下载失败时仍应保留原始 CDN URL，不能把选项标签一起丢掉",
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
