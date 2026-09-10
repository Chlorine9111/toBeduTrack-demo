import { compileTypstPdf } from "../../lib/typst/compiler";
import { convertLatexToTypstMath, renderDisplayTypstMath } from "../../lib/typst/math";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  failures.push(message);
  console.error(`  FAIL: ${message}`);
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

async function compileFormula(latex: string) {
  const source = `
= Typst Math Smoke

${renderDisplayTypstMath(latex)}
`;
  return compileTypstPdf({ mainFileContent: source });
}

async function main() {
  await describe("Typst math conversion", async () => {
    await it("应把隐式乘法拆开，避免 kx 被识别成未定义变量", async () => {
      const converted = convertLatexToTypstMath("F=-kx");
      assert(converted.includes("k x"), `expected implicit multiplication split, got ${converted}`);

      const pdf = await compileFormula("F=-kx");
      assert(pdf.byteLength > 0, "expected compiled pdf buffer");
    });

    await it("应保留希腊字母和函数调用之间的隐式乘法", async () => {
      const converted = convertLatexToTypstMath("x(t)=A \\cos(\\omega t)");
      assert(converted.includes("A cos(omega t)"), `expected function call math, got ${converted}`);

      const pdf = await compileFormula("x(t)=A \\cos(\\omega t)");
      assert(pdf.byteLength > 0, "expected compiled pdf buffer");
    });

    await it("应把文本下标与大写缩写转成 Typst 可接受的文本节点", async () => {
      const converted = convertLatexToTypstMath("E_{total} = \\frac{1}{2}kA^2 = KE + PE");
      assert(converted.includes('E_("total")'), `expected quoted text subscript, got ${converted}`);
      assert(converted.includes('"KE"+"PE"') || converted.includes('"KE" + "PE"'), `expected quoted uppercase abbreviations, got ${converted}`);
      assert(converted.includes("k A^2"), `expected implicit multiplication in energy term, got ${converted}`);

      const pdf = await compileFormula("E_{total} = \\frac{1}{2}kA^2 = KE + PE");
      assert(pdf.byteLength > 0, "expected compiled pdf buffer");
    });

    await it("应给词式运算符前后补空格，避免 times10 和 dot100 这类未定义变量", async () => {
      const timesConverted = convertLatexToTypstMath("\\sqrt{\\frac{80}{5.0 \\times 10^{-3}}}");
      assert(timesConverted.includes("5.0 times 10^(-3)"), `expected spaced times operator, got ${timesConverted}`);

      const dotConverted = convertLatexToTypstMath("f_n = n \\cdot 100");
      assert(dotConverted.includes("n dot 100"), `expected spaced dot operator, got ${dotConverted}`);

      const timesPdf = await compileFormula("\\sqrt{\\frac{80}{5.0 \\times 10^{-3}}}");
      assert(timesPdf.byteLength > 0, "expected compiled pdf for times expression");

      const dotPdf = await compileFormula("f_n = n \\cdot 100");
      assert(dotPdf.byteLength > 0, "expected compiled pdf for dot expression");
    });

    await it("应支持 dfrac 与常见版式命令，避免 Typst 把 dfrac 当成未定义变量", async () => {
      const converted = convertLatexToTypstMath("\\displaystyle E = \\dfrac{1}{2} m v^2");
      assert(converted.includes("(1) / (2)"), `expected dfrac converted into a fraction, got ${converted}`);
      assert(!converted.includes("displaystyle"), `expected displaystyle removed, got ${converted}`);
      assert(converted.includes("m v^2"), `expected implicit multiplication kept, got ${converted}`);

      const pdf = await compileFormula("\\displaystyle E = \\dfrac{1}{2} m v^2");
      assert(pdf.byteLength > 0, "expected compiled pdf for dfrac expression");
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
