import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";

type TypstSourceFile = {
  path: string;
  content: string;
};

export type TypstBinaryAsset = {
  path: string;
  data: Buffer;
};

const TYPST_ROOT = path.join(process.cwd(), "lib/typst");

let bundledSourcesPromise: Promise<TypstSourceFile[]> | null = null;

async function walkTypstFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTypstFiles(absolutePath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".typ")) {
      files.push(absolutePath);
    }
  }

  return files;
}

function toCompilerPath(absolutePath: string) {
  const relative = path.relative(TYPST_ROOT, absolutePath).split(path.sep).join("/");
  return `/${relative}`;
}

async function loadBundledSources() {
  if (!bundledSourcesPromise) {
    bundledSourcesPromise = (async () => {
      const files = await walkTypstFiles(TYPST_ROOT);
      return Promise.all(
        files.map(async (absolutePath) => ({
          path: toCompilerPath(absolutePath),
          content: await readFile(absolutePath, "utf8"),
        })),
      );
    })();
  }

  return bundledSourcesPromise;
}

export async function compileTypstPdf(params: {
  mainFileContent: string;
  assets?: TypstBinaryAsset[];
}) {
  const compiler = NodeCompiler.create({ workspace: "/" });
  const mainFilePath = "/main.typ";

  try {
    const sources = await loadBundledSources();
    for (const source of sources) {
      await compiler.addSource(source.path, source.content);
    }
    await compiler.addSource(mainFilePath, params.mainFileContent);

    for (const asset of params.assets ?? []) {
      compiler.mapShadow(asset.path, asset.data);
    }

    const compiled = compiler.compile({
      mainFilePath,
    });
    if (compiled.hasError() || !compiled.result) {
      const diagnostics =
        compiled.takeDiagnostics() ?? compiled.takeError() ?? compiled.takeWarnings();
      const detail = diagnostics?.shortDiagnostics
        ? JSON.stringify(diagnostics.shortDiagnostics)
        : "Typst compile failed";
      throw new Error(detail);
    }

    const pdf = await compiler.pdf(compiled.result);

    return Buffer.from(pdf);
  } finally {
    compiler.resetShadow();
  }
}
