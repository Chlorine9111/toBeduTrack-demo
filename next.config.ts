import path from "node:path";
import { createRequire } from "node:module";
import type { NextConfig } from "next";
import { loadProjectEnvFallback } from "./lib/env/project-env";

const loadedEnvPath = loadProjectEnvFallback(process.cwd());
if (loadedEnvPath) {
  console.info(`[next.config] loaded env fallback from ${loadedEnvPath}`);
}

const typstTracingGlobs = ["./lib/typst/**/*.typ"];
const pdfTracingGlobs = [
  "./lib/doc-engine/academic-print.css",
  "./node_modules/katex/dist/katex.min.css",
  "./node_modules/katex/dist/fonts/**/*",
];
const require = createRequire(import.meta.url);

function hasOptionalPackage(name: string) {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

const tiptapProAlias: Record<string, string> = {};

if (!hasOptionalPackage("@tiptap-pro/extension-ai")) {
  tiptapProAlias["@tiptap-pro/extension-ai"] = path.resolve(
    process.cwd(),
    "lib/doc-engine/tiptap-pro-shims/extension-ai.ts",
  );
}

if (!hasOptionalPackage("@tiptap-pro/extension-export-docx")) {
  tiptapProAlias["@tiptap-pro/extension-export-docx"] = path.resolve(
    process.cwd(),
    "lib/doc-engine/tiptap-pro-shims/extension-export-docx.ts",
  );
}

const nextConfig: NextConfig = {
  transpilePackages: [
    "@tiptap/core",
    "@tiptap/react",
    "@tiptap/pm",
    "@tiptap/starter-kit",
    "@tiptap/extension-table",
    "@tiptap/extension-table-row",
    "@tiptap/extension-table-header",
    "@tiptap/extension-table-cell",
    "@tiptap/extension-image",
    "@tiptap/extension-underline",
    "@tiptap/extension-text-align",
    "@tiptap/extension-text-style",
    "@tiptap/extension-color",
    "@tiptap/extension-highlight",
    "@tiptap/extension-link",
    "@tiptap/extension-font-family",
    "@tiptap/extension-character-count",
    "@tiptap/extension-placeholder",
    "@tiptap/extension-code-block-lowlight",
    "tiptap-markdown",
  ],
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  typescript: {
    // Pre-existing type errors in AI/API code; landing page code is clean
    ignoreBuildErrors: true,
  },
  eslint: {
    // Pre-existing lint issues in AI/API code
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { hostname: "favicon.im" },
      { hostname: "upload.wikimedia.org" },
    ],
  },
  serverExternalPackages: [
    "@napi-rs/canvas",
    "@myriaddreamin/typst-ts-node-compiler",
    "@myriaddreamin/typst.ts",
    "@sparticuz/chromium",
    "puppeteer-core",
    "@resvg/resvg-js",
  ],
  outputFileTracingIncludes: {
    "/api/agent/chat": typstTracingGlobs,
    "/api/doc/export-document-typst-pdf": typstTracingGlobs,
    "/api/doc/export-lesson-typst-pdf": typstTracingGlobs,
    "/api/doc/export-pdf": pdfTracingGlobs,
    "/api/doc/export-rubric-pdf": pdfTracingGlobs,
    "/api/pdf/generate": pdfTracingGlobs,
    "/api/pdf/export-markdown": typstTracingGlobs,
    "/api/question-bank/builder/export-preview": typstTracingGlobs,
  },
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      ...tiptapProAlias,
    };

    return config;
  },
};

export default nextConfig;
