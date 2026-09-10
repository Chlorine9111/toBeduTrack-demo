import assert from "node:assert/strict";
import { inferKnowledgeChunkStructure } from "@/lib/assistant/chunk-structure";
import { buildKnowledgeContentPreview } from "@/lib/assistant/chunk-preview";
import { chunkMarkdown } from "@/lib/assistant/chunker";
import { normalizeVisionExtractedText } from "@/lib/assistant/ocr-normalize";
import {
  assessKnowledgeRetrievalQuality,
  buildKnowledgeDocumentChunks,
  buildCorrectiveKnowledgeQueries,
  getKnowledgeEmbeddingModel,
} from "@/lib/assistant/knowledge-rag";
import { normalizeSemanticContentText } from "@/lib/semantic-index/store";
import type { KnowledgeSearchResult } from "@/lib/assistant/types";

function withEnv<T>(patch: Record<string, string | undefined>, run: () => T) {
  const previous = Object.fromEntries(
    Object.keys(patch).map((key) => [key, process.env[key]]),
  );

  Object.entries(patch).forEach(([key, value]) => {
    if (typeof value === "string") {
      process.env[key] = value;
      return;
    }
    delete process.env[key];
  });

  try {
    return run();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (typeof value === "string") {
        process.env[key] = value;
        return;
      }
      delete process.env[key];
    });
  }
}

function runPdfPageChunkCase() {
  const chunks = buildKnowledgeDocumentChunks({
    filename: "chain-rule-note.pdf",
    parsedDocument: {
      fileName: "chain-rule-note.pdf",
      fileType: "pdf",
      textContent: "第一页讲 chain rule，第二页讲常见错误。",
      fullTextContent: "第一页讲 chain rule，第二页讲常见错误。",
      pageTexts: [
        "Chain rule definition.\nDerivative of composite functions.",
        "Common mistakes.\nStudents forget the inner derivative.",
      ],
    },
    subject: "AP Calculus",
    unit: "Unit 3",
    tags: ["derivative"],
  });

  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0]?.pageStart, 1);
  assert.equal(chunks[1]?.pageStart, 2);
  assert.ok(chunks[0]?.content.includes("Chain rule"));
  assert.ok(chunks[1]?.content.includes("inner derivative"));
}

function runLongFallbackChunkCase() {
  const repeated = "平衡常数、反应商、勒夏特列原理。".repeat(240);
  const chunks = buildKnowledgeDocumentChunks({
    filename: "chemistry-notes.txt",
    fallbackText: repeated,
    subject: "AP Chemistry",
    unit: "Unit 7",
  });

  assert.ok(chunks.length > 1);
  assert.equal(chunks[0]?.pageStart, null);
  assert.ok(chunks.every((item) => item.content.length <= 1400));
}

function runMarkdownTableChunkCase() {
  const chunks = chunkMarkdown(
    [
      "# Photosynthesis Lesson Plan",
      "",
      "## Experiment Table",
      "",
      "| Condition | Setup | Expected outcome |",
      "| --- | --- | --- |",
      "| Low light | Lamp 20 cm away | Few oxygen bubbles per minute |",
      "| High light | Lamp 5 cm away | More oxygen bubbles per minute |",
      "| High CO2 | Add sodium bicarbonate | Faster bubble production than control |",
      "",
      "## Teacher Notes",
      "",
      "Explain why the High CO2 condition produces more oxygen bubbles than the control.",
    ].join("\n"),
    {
      maxChunkSize: 320,
      minChunkSize: 60,
      overlap: 100,
      splitBy: "heading",
    },
  );

  const tableChunk = chunks.find((item) => item.heading === "Experiment Table");
  const notesChunk = chunks.find((item) => item.heading === "Teacher Notes");

  assert.ok(tableChunk);
  assert.ok(notesChunk);
  assert.match(tableChunk!.content, /\| High CO2 \| Add sodium bicarbonate \|/);
  assert.doesNotMatch(notesChunk!.content, /\| High CO2 \| Add sodium bicarbonate \|/);
}

function runChunkStructureCase() {
  const markdownTable = inferKnowledgeChunkStructure({
    content: [
      "| Condition | Setup |",
      "| --- | --- |",
      "| High CO2 | Add sodium bicarbonate |",
    ].join("\n"),
    fileType: "text/markdown",
    ocrProvider: "document-parser",
  });

  const imageOcr = inferKnowledgeChunkStructure({
    content: "Criterion | Level 4 | Level 3 Claim | clear scientific claim | partly correct claim",
    fileType: "image/png",
    ocrProvider: "vision-image",
  });

  const whitespaceTable = inferKnowledgeChunkStructure({
    content: [
      "Criterion    Level 4    Level 3",
      "Claim    clear scientific claim    partly correct claim",
      "Evidence    cites 2 data points    cites 1 data point",
    ].join("\n"),
    fileType: "image/png",
    ocrProvider: "vision-image",
  });

  assert.equal(markdownTable.contentType, "table");
  assert.equal(markdownTable.hasTable, true);
  assert.equal(markdownTable.hasFigure, false);
  assert.ok(markdownTable.structureHints.includes("markdown_table"));

  assert.equal(imageOcr.contentType, "image_ocr");
  assert.equal(imageOcr.hasFigure, true);
  assert.equal(imageOcr.hasTable, true);
  assert.ok(imageOcr.structureHints.includes("image_ocr"));

  assert.equal(whitespaceTable.contentType, "image_ocr");
  assert.equal(whitespaceTable.hasFigure, true);
  assert.equal(whitespaceTable.hasTable, true);
  assert.ok(whitespaceTable.structureHints.includes("table_like_text"));
}

function runVisionNormalizationCase() {
  const normalized = normalizeVisionExtractedText(
    [
      "Rubric Snapshot",
      "",
      "Criterion | Level 4 | Level 3",
      "Claim | clear scientific claim | partly correct claim",
      "Evidence | cites 2 data points | cites 1 data point",
      "",
      "Teacher reminder: cite two lab safety rules.",
    ].join("\n"),
  );

  assert.match(normalized, /\| Criterion \| Level 4 \| Level 3 \|/);
  assert.match(normalized, /\| --- \| --- \| --- \|/);
  assert.match(normalized, /\| Evidence \| cites 2 data points \| cites 1 data point \|/);

  const normalizedWithStraySeparator = normalizeVisionExtractedText(
    [
      "Rubric Snapshot",
      "",
      "| Criterion | Level 4 | Level 3 |",
      "| Claim | clear scientific claim | partly correct claim |",
      "| --- | --- | --- |",
      "| Evidence | cites 2 data points | cites 1 data point |",
    ].join("\n"),
  );

  assert.match(normalizedWithStraySeparator, /\| Criterion \| Level 4 \| Level 3 \|/);
  assert.match(normalizedWithStraySeparator, /\| Claim \| clear scientific claim \| partly correct claim \|/);
  assert.match(normalizedWithStraySeparator, /\| Evidence \| cites 2 data points \| cites 1 data point \|/);
  assert.doesNotMatch(
    normalizedWithStraySeparator,
    /\| Claim \| clear scientific claim \| partly correct claim \|\n\| --- \| --- \| --- \|\n\| --- \| --- \| --- \|/,
  );

  const normalizedWhitespaceTable = normalizeVisionExtractedText(
    [
      "Rubric Snapshot",
      "",
      "Criterion    Level 4    Level 3",
      "Claim    clear scientific claim    partly correct claim",
      "Evidence    cites 2 data points    cites 1 data point",
      "",
      "Teacher reminder: cite two lab safety rules.",
    ].join("\n"),
  );

  assert.match(normalizedWhitespaceTable, /\| Criterion \| Level 4 \| Level 3 \|/);
  assert.match(normalizedWhitespaceTable, /\| Claim \| clear scientific claim \| partly correct claim \|/);
  assert.match(normalizedWhitespaceTable, /\| Evidence \| cites 2 data points \| cites 1 data point \|/);

  const normalizedRubricHeaderTable = normalizeVisionExtractedText(
    [
      "Rubric Snapshot",
      "",
      "Criterion Level 4 Level 3",
      "Claim    clear scientific claim    partly correct claim",
      "Evidence    cites 2 data points    cites 1 data point",
      "",
      "Teacher reminder: cite two lab safety rules.",
    ].join("\n"),
  );

  assert.match(normalizedRubricHeaderTable, /\| Criterion \| Level 4 \| Level 3 \|/);
  assert.match(normalizedRubricHeaderTable, /\| Claim \| clear scientific claim \| partly correct claim \|/);
  assert.match(normalizedRubricHeaderTable, /\| Evidence \| cites 2 data points \| cites 1 data point \|/);

  const nonTableNarrative = normalizeVisionExtractedText(
    [
      "Rubric Snapshot",
      "",
      "Criterion Level 4 Level 3",
      "Students explain how the experiment changed after adding light.",
    ].join("\n"),
  );

  assert.doesNotMatch(nonTableNarrative, /\| --- \| --- \| --- \|/);
}

function runSemanticContentNormalizationCase() {
  const normalized = normalizeSemanticContentText(
    [
      "# Rubric Snapshot",
      "",
      "| Criterion | Level 4 | Level 3 |",
      "| --- | --- | --- |",
      "| Evidence | cites 2 data points | cites 1 data point |",
      "",
      "Teacher reminder: cite two lab safety rules.",
    ].join("\n"),
  );

  assert.match(normalized, /\n\| Criterion \| Level 4 \| Level 3 \|\n/);
  assert.match(normalized, /\n\| --- \| --- \| --- \|\n/);
  assert.match(normalized, /\n\| Evidence \| cites 2 data points \| cites 1 data point \|\n/);
}

function runStructuredPreviewCase() {
  const preview = buildKnowledgeContentPreview(
    [
      "# Rubric Snapshot",
      "",
      "| Criterion | Level 4 | Level 3 |",
      "| --- | --- | --- |",
      "| Claim | clear scientific claim | partly correct claim |",
      "| Evidence | cites 2 data points | cites 1 data point |",
      "",
      "Teacher reminder: cite two lab safety rules.",
    ].join("\n"),
    140,
  );

  assert.ok(preview);
  assert.match(preview!, /\n\| Criterion \| Level 4 \| Level 3 \|\n/);
  assert.match(preview!, /\n\| --- \| --- \| --- \|\n/);
}

function runEmbeddingModelResolutionCase() {
  withEnv(
    {
      GOOGLE_AI_API_KEY: undefined,
      GOOGLE_EMBEDDING_MODEL: undefined,
      OPENROUTER_DISABLE_EMBEDDINGS: "1",
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_EMBEDDING_MODEL: "custom/model",
    },
    () => {
      assert.equal(getKnowledgeEmbeddingModel(), null);
    },
  );

  withEnv(
    {
      GOOGLE_AI_API_KEY: undefined,
      GOOGLE_EMBEDDING_MODEL: undefined,
      OPENROUTER_DISABLE_EMBEDDINGS: undefined,
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_EMBEDDING_MODEL: undefined,
    },
    () => {
      assert.equal(getKnowledgeEmbeddingModel(), "openai/text-embedding-3-small");
    },
  );

  withEnv(
    {
      GOOGLE_AI_API_KEY: undefined,
      GOOGLE_EMBEDDING_MODEL: undefined,
      OPENROUTER_DISABLE_EMBEDDINGS: undefined,
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_EMBEDDING_MODEL: "openai/text-embedding-3-large",
    },
    () => {
      assert.equal(getKnowledgeEmbeddingModel(), "openai/text-embedding-3-large");
    },
  );
}

function runCorrectiveQueryCase() {
  const rewrites = buildCorrectiveKnowledgeQueries({
    query: "请根据这份 AP Calculus chain rule 讲义，帮我找能出题的定义、公式和易错点",
    subject: "AP Calculus",
    unit: "Unit 3",
  });

  assert.ok(rewrites.length >= 1);
  assert.ok(rewrites[0]?.includes("AP Calculus"));
  assert.ok(rewrites.some((item) => item.toLowerCase().includes("chain")));
}

function runRetrievalAssessmentCase() {
  const highQuality: KnowledgeSearchResult[] = [
    {
      id: "a",
      content: "Chain rule definition. Derivative of composite functions. Common mistakes include forgetting the inner derivative.",
      score: 82,
      metadata: {
        title: "Chain rule definition",
        semanticScore: 0.72,
        keywordScore: 0.61,
        contentPreview: "Chain rule definition and common mistakes",
      },
    },
    {
      id: "b",
      content: "Worked examples for chain rule with nested functions and practice prompts.",
      score: 76,
      metadata: {
        title: "Chain rule examples",
        semanticScore: 0.64,
        keywordScore: 0.42,
        contentPreview: "worked examples",
      },
    },
  ];

  const lowQuality: KnowledgeSearchResult[] = [
    {
      id: "x",
      content: "General classroom reflections about student engagement and attendance.",
      score: 12,
      metadata: {
        title: "Weekly memo",
        semanticScore: 0.08,
        keywordScore: 0.05,
        contentPreview: "engagement and attendance",
      },
    },
  ];

  const strongAssessment = assessKnowledgeRetrievalQuality({
    query: "AP Calculus chain rule definition and common mistakes",
    results: highQuality,
  });
  const weakAssessment = assessKnowledgeRetrievalQuality({
    query: "AP Calculus chain rule definition and common mistakes",
    results: lowQuality,
  });

  assert.equal(strongAssessment.needsCorrection, false);
  assert.notEqual(strongAssessment.confidence, "low");
  assert.equal(weakAssessment.needsCorrection, true);
  assert.equal(weakAssessment.confidence, "low");
}

function main() {
  runPdfPageChunkCase();
  runLongFallbackChunkCase();
  runMarkdownTableChunkCase();
  runChunkStructureCase();
  runVisionNormalizationCase();
  runSemanticContentNormalizationCase();
  runStructuredPreviewCase();
  runEmbeddingModelResolutionCase();
  runCorrectiveQueryCase();
  runRetrievalAssessmentCase();
  console.log("knowledge-rag regression: PASS");
}

main();
