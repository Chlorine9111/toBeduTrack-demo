import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateStructuredObjectWithGateway } from "@/lib/ai/gateway";
import { getModelForTask } from "@/lib/ai/model-router";

const flashcardSchema = z.object({
  cards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    }),
  ),
});

type GenerateFlashcardsParams = {
  teacherId: string;
  sourceAssetIds: string[];
  title?: string;
  count?: number;
};

type GenerateFlashcardsResult = {
  setId: string;
  cardCount: number;
};

const MAX_SOURCE_CHARS = 5000;
const DEFAULT_CARD_COUNT = 15;

export async function generateFlashcards(
  params: GenerateFlashcardsParams,
): Promise<GenerateFlashcardsResult> {
  const { teacherId, sourceAssetIds, title, count = DEFAULT_CARD_COUNT } = params;
  const admin = createAdminSupabaseClient();

  // 1. 读取源资产的 raw_text
  const { data: assets, error: readError } = await admin
    .from("content_assets")
    .select("id, title, raw_text")
    .in("id", sourceAssetIds)
    .eq("teacher_id", teacherId);

  if (readError) {
    throw new Error("读取源资产失败");
  }

  if (!assets || assets.length === 0) {
    throw new Error("未找到指定的源资产");
  }

  const combinedText = assets
    .map((a) => {
      const text = (a.raw_text ?? "").trim();
      return text ? `## ${a.title}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_SOURCE_CHARS);

  if (!combinedText) {
    throw new Error("源资产没有可用的文本内容");
  }

  // 2. 调用 AI 生成 flashcards
  const model = getModelForTask("exercise_generate");

  const { object } = await generateStructuredObjectWithGateway({
    model,
    schema: flashcardSchema,
    schemaName: "flashcards",
    systemPrompt:
      "你是一位教育专家。根据提供的教学资料，生成高质量的 Flashcard。每张卡片包含 front（问题/术语/概念）和 back（解释/答案/定义）。确保内容准确、简洁、便于记忆。涵盖资料中的关键概念。",
    userPrompt: `基于以下教学资料，生成 ${count} 张 Flashcard。\n\n${combinedText}`,
    maxTokens: 4096,
    timeout: 60_000,
  });

  const cards = object.cards;
  const setTitle =
    title ?? `Flashcards - ${assets[0].title}${assets.length > 1 ? ` 等 ${assets.length} 份资料` : ""}`;

  // 3. 写入 flashcard_sets
  const { data: setRow, error: setError } = await admin
    .from("flashcard_sets")
    .insert({
      teacher_id: teacherId,
      title: setTitle,
      card_count: cards.length,
    })
    .select("id")
    .single();

  if (setError || !setRow) {
    throw new Error("创建 Flashcard 集合失败");
  }

  const setId = setRow.id;

  // 4. 写入 flashcards
  const cardRows = cards.map((card, index) => ({
    set_id: setId,
    front_text: card.front,
    back_text: card.back,
    sort_order: index,
    difficulty: card.difficulty ?? null,
  }));

  const { error: cardsError } = await admin.from("flashcards").insert(cardRows);

  if (cardsError) {
    throw new Error("写入 Flashcard 卡片失败");
  }

  // 5. 在 content_assets 创建引用记录
  const { data: assetRow, error: assetError } = await admin
    .from("content_assets")
    .insert({
      teacher_id: teacherId,
      asset_source: "reference",
      storage_path: null,
      storage_bucket: null as unknown as string,
      file_name: null,
      file_type: null,
      mime_type: null,
      file_size_bytes: null,
      ref_entity_type: "flashcard_set",
      ref_entity_id: setId,
      title: setTitle,
      raw_text: cards
        .map((c, i) => `Q${i + 1}: ${c.front}\nA${i + 1}: ${c.back}`)
        .join("\n\n"),
      search_text: [setTitle, ...cards.map((c) => `${c.front} ${c.back}`)]
        .join(" ")
        .toLowerCase(),
      processing_status: "ready",
      chunk_count: 0,
      tags: [],
      metadata: { flashcard_set_id: setId, source_asset_ids: sourceAssetIds },
    })
    .select("id")
    .single();

  if (assetError || !assetRow) {
    throw new Error("创建 Flashcard 资产记录失败");
  }

  // 6. 回写 asset_id 到 flashcard_sets
  await admin
    .from("flashcard_sets")
    .update({ asset_id: assetRow.id })
    .eq("id", setId);

  return { setId, cardCount: cards.length };
}
