/**
 * Typst PDF 渲染冒烟测试
 * 直接调用 compileTypstPdf 生成一份包含 MC + FRQ + 数学公式 + Answer Key 的 worksheet PDF
 *
 * 运行: node --import tsx scripts/typst-smoke-test.ts
 */
import { writeFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";

// 绕过 "server-only" 限制：在 Node.js 直接运行时该包会抛错
// 通过 preload 覆盖该模块为空模块
try {
  require.resolve("server-only");
} catch {
  // 忽略
}
// @ts-expect-error 直接 mock server-only 模块
globalThis.__server_only_mock__ = true;

// 在运行时 mock "server-only" 模块
type ResolveFilename = (
  request: string,
  parent: NodeJS.Module | null | undefined,
  isMain: boolean,
  options?: unknown,
) => string;

const moduleWithResolve = Module as typeof Module & {
  _resolveFilename: ResolveFilename;
};
const originalResolve = moduleWithResolve._resolveFilename;
moduleWithResolve._resolveFilename = function (
  request: string,
  parent: NodeJS.Module | null | undefined,
  isMain: boolean,
  options?: unknown,
) {
  if (request === "server-only") {
    // 返回当前文件路径（空模块效果）
    return __filename;
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

async function main() {
  // 动态导入以确保 mock 生效
  const { compileTypstPdf } = await import("@/lib/typst/compiler");

  // 构建一份包含各种题型的 worksheet Typst 源码
  const mainFileContent = `
#import "/base.typ": setup-document
#import "/components/header.typ": worksheet-header
#import "/components/section-banner.typ": section-banner

#setup-document(title: "Typst 冒烟测试", paper: "a4", theme: "academic")
#worksheet-header("Typst Smoke Test Worksheet", course_name: "AP Calculus AB", teacher_name: "Mr. Test", date: "2026-03-12", subtitle: "Academic Worksheet", theme: "academic")
#v(12pt)

#section-banner("Practice", subtitle: "完成以下题目并保留必要步骤。", theme: "academic")
#v(10pt)

// MC 题目 1 - 短选项（应该适合两列布局）
#block(width: 100%, breakable: false, inset: 12pt, radius: 8pt, stroke: rgb("#d1d5db"))[
#text(weight: "bold")[1.]
#h(8pt)
#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[3 分]
#v(8pt)
What is the derivative of $f(x) = x^2 + 3x$?
#v(10pt)
#grid(
  columns: (1fr, 1fr),
  column-gutter: 8pt,
  row-gutter: 6pt,
  block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
    #table(columns: (auto, 1fr), stroke: none, column-gutter: 10pt,
      [#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[#text(weight: "bold")[A]]],
      [$2x + 3$],
    )
  ],
  block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
    #table(columns: (auto, 1fr), stroke: none, column-gutter: 10pt,
      [#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[#text(weight: "bold")[B]]],
      [$x^2 + 3$],
    )
  ],
  block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
    #table(columns: (auto, 1fr), stroke: none, column-gutter: 10pt,
      [#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[#text(weight: "bold")[C]]],
      [$2x$],
    )
  ],
  block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
    #table(columns: (auto, 1fr), stroke: none, column-gutter: 10pt,
      [#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[#text(weight: "bold")[D]]],
      [$3x + 2$],
    )
  ],
)
]
#v(10pt)

// MC 题目 2 - 长选项（单列）
#block(width: 100%, breakable: false, inset: 12pt, radius: 8pt, stroke: rgb("#d1d5db"))[
#text(weight: "bold")[2.]
#h(8pt)
#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[3 分]
#v(8pt)
Which of the following statements about limits is true?
#v(10pt)
#block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
  #table(columns: (auto, 1fr), stroke: none, column-gutter: 10pt,
    [#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[#text(weight: "bold")[A]]],
    [If $lim_(x -> a) f(x)$ exists, then $f(a)$ must be defined],
  )
]
#v(6pt)
#block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
  #table(columns: (auto, 1fr), stroke: none, column-gutter: 10pt,
    [#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[#text(weight: "bold")[B]]],
    [If $f(a)$ is defined, then $lim_(x -> a) f(x)$ must exist and equal $f(a)$],
  )
]
#v(6pt)
#block(width: 100%, inset: 8pt, radius: 6pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
  #table(columns: (auto, 1fr), stroke: none, column-gutter: 10pt,
    [#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#eff6ff"))[#text(weight: "bold")[C]]],
    [The limit of a function at a point can exist even if the function is not defined at that point],
  )
]
]
#v(10pt)

// FRQ 题目 - 使用 1fr 自适应空间
#block(width: 100%, breakable: false, inset: 12pt, radius: 8pt, stroke: rgb("#d1d5db"))[
#text(weight: "bold")[3.]
#h(8pt)
#box(inset: (x: 6pt, y: 2pt), radius: 999pt, fill: rgb("#f8fafc"))[5 分]
#v(8pt)
Find the area under the curve $y = x^2$ from $x = 0$ to $x = 3$. Show your work using the Fundamental Theorem of Calculus.
#v(10pt)
#v(1fr)
]

// Answer Key 单独起新页
#pagebreak()
#section-banner("Answer Key", subtitle: "仅供教师参考", theme: "academic")
#v(10pt)

#block(width: 100%, inset: 10pt, radius: 7pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#text(weight: "bold")[1. A]
#v(6pt)
#text(size: 9pt, fill: rgb("#6b7280"))[解析]
#v(4pt)
$f'(x) = 2x + 3$，由幂法则和常数求导可得。
]
#v(8pt)

#block(width: 100%, inset: 10pt, radius: 7pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#text(weight: "bold")[2. C]
#v(6pt)
#text(size: 9pt, fill: rgb("#6b7280"))[解析]
#v(4pt)
极限可以在函数于该点未定义时存在，例如 $lim_(x -> 0) (sin x) / x = 1$。
]
#v(8pt)

#block(width: 100%, inset: 10pt, radius: 7pt, fill: rgb("#f8fafc"), stroke: rgb("#d1d5db"))[
#text(weight: "bold")[3. 9]
#v(6pt)
#text(size: 9pt, fill: rgb("#6b7280"))[解析]
#v(4pt)
$integral_0^3 x^2 d x = [x^3 / 3]_0^3 = 27/3 - 0 = 9$
]
`;

  console.log("开始编译 Typst PDF ...");
  const startTime = Date.now();

  const pdfBuffer = await compileTypstPdf({
    mainFileContent,
  });

  const elapsed = Date.now() - startTime;
  const fileSizeKB = (pdfBuffer.byteLength / 1024).toFixed(1);

  console.log(`编译完成，耗时 ${elapsed}ms`);
  console.log(`PDF 大小: ${fileSizeKB} KB (${pdfBuffer.byteLength} bytes)`);

  // 验证文件大小合理（> 1KB）
  if (pdfBuffer.byteLength < 1024) {
    console.error("FAIL: PDF 文件大小不足 1KB，可能编译异常");
    process.exit(1);
  }

  // 验证 PDF 文件头
  const header = pdfBuffer.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    console.error(`FAIL: PDF 文件头异常: ${header}`);
    process.exit(1);
  }

  // 输出到 tmp 目录
  const outputPath = path.join(process.cwd(), "tmp", "typst-smoke-test.pdf");
  await writeFile(outputPath, pdfBuffer);
  console.log(`PDF 已保存至: ${outputPath}`);
  console.log("PASS: 冒烟测试通过");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exit(1);
});
