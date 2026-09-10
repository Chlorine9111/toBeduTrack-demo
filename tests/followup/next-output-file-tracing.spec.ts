import nextConfig from "../../next.config";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
}

function assertTracingIncludes(
  route: string,
  expectedGlobs: string[],
  includes: Record<string, string[]>,
) {
  const routeGlobs = includes[route] ?? [];
  expectedGlobs.forEach((glob) => {
    assert(
      routeGlobs.includes(glob),
      `${route} 缺少 tracing glob: ${glob}`,
    );
  });
}

function main() {
  const includes = (nextConfig.outputFileTracingIncludes ?? {}) as Record<
    string,
    string[]
  >;
  const expectedDocumentPdfGlobs = [
    "./lib/doc-engine/academic-print.css",
    "./node_modules/katex/dist/**/*",
  ];

  assertTracingIncludes("/api/doc/export-pdf", expectedDocumentPdfGlobs, includes);
  assertTracingIncludes("/api/doc/export-rubric-pdf", expectedDocumentPdfGlobs, includes);
  assertTracingIncludes("/api/pdf/generate", expectedDocumentPdfGlobs, includes);

  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
