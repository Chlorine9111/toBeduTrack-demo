import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { filterTemplates } from "@/lib/wechat-editor/template-renderer";
import { buildDefaultBlockStyles } from "@/lib/wechat-editor/templates/types";
import type { Template, TemplateBlockStyle, TemplateBlockType } from "@/lib/wechat-editor/types";
import type { Json } from "@/types/database";

const COLOR_FAMILY_VALUES = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "gray",
  "black",
  "white",
] as const;

const REQUIRED_BLOCK_TYPES: TemplateBlockType[] = [
  "article-title",
  "hero-title",
  "hero-subtitle",
  "intro",
  "section-title",
  "section-content",
  "image",
  "divider",
  "blockquote",
];

const blockStyleSchema = z.object({
  id: z.string().min(1),
  blockType: z.enum([
    "article-title",
    "hero-title",
    "hero-subtitle",
    "intro",
    "section-title",
    "section-content",
    "image",
    "divider",
    "blockquote",
  ]),
  name: z.string().min(1),
  previewHtml: z.string().min(1),
  templateHtml: z.string().min(1),
});

const templateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  thumbnail: z.string().min(1),
  categories: z.array(z.string().min(1)),
  colorFamily: z.enum(COLOR_FAMILY_VALUES),
  hasHeroImage: z.boolean(),
  colorScheme: z.object({
    primary: z.string().min(1),
    secondary: z.string().min(1),
    background: z.string().min(1),
    text: z.string().min(1),
    accent: z.string().min(1),
  }),
  blockStyles: z.array(blockStyleSchema),
});

interface WechatTemplateDbRow {
  id: string;
  name: string;
  thumbnail: string;
  categories: string[];
  color_family: string;
  has_hero_image: boolean;
  color_scheme: Json;
  block_styles: Json;
}

function normalizeTemplate(template: Template): Template {
  const defaultStyles = buildDefaultBlockStyles(template.id);
  const styleByType = new Map<TemplateBlockType, TemplateBlockStyle[]>();

  for (const style of template.blockStyles.filter((item) => isSafeTemplateHtml(item.templateHtml))) {
    const list = styleByType.get(style.blockType) ?? [];
    list.push(style);
    styleByType.set(style.blockType, list);
  }

  for (const requiredType of REQUIRED_BLOCK_TYPES) {
    const current = styleByType.get(requiredType);
    if (current && current.length > 0) continue;
    const fallbackStyles = defaultStyles.filter((item) => item.blockType === requiredType);
    if (fallbackStyles.length > 0) {
      styleByType.set(requiredType, fallbackStyles);
    }
  }

  return {
    ...template,
    blockStyles: Array.from(styleByType.values()).flat(),
  };
}

function isSafeTemplateHtml(templateHtml: string) {
  const lowered = templateHtml.toLowerCase();
  if (lowered.includes("<script")) return false;
  if (lowered.includes("javascript:")) return false;
  if (/\bon[a-z]+\s*=/.test(lowered)) return false;
  return true;
}

function mapTemplateRow(row: WechatTemplateDbRow): Template | null {
  const parsed = templateSchema.safeParse({
    id: row.id,
    name: row.name,
    thumbnail: row.thumbnail,
    categories: row.categories,
    colorFamily: row.color_family,
    hasHeroImage: row.has_hero_image,
    colorScheme: row.color_scheme,
    blockStyles: row.block_styles,
  });

  if (!parsed.success) {
    console.error("[template-repository] template row validation failed", row.id, parsed.error.flatten());
    return null;
  }

  return normalizeTemplate(parsed.data);
}

export function collectTemplateCategories(templates: Template[]) {
  const categorySet = new Set<string>();
  for (const template of templates) {
    for (const category of template.categories) {
      categorySet.add(category);
    }
  }
  return ["全部", ...Array.from(categorySet)];
}

export async function listWechatTemplatesFromCloud(filters: {
  keyword?: string | null;
  category?: string | null;
  colorFamily?: string | null;
  hasHero?: "all" | "yes" | "no";
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("wechat_templates")
    .select(
      "id,name,thumbnail,categories,color_family,has_hero_image,color_scheme,block_styles,sort_order",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`加载模板库失败: ${error.message}`);
  }

  const templates = (data ?? [])
    .map((row) => mapTemplateRow(row as WechatTemplateDbRow))
    .filter((item): item is Template => Boolean(item));

  const filtered = filterTemplates({
    templates,
    keyword: filters.keyword,
    category: filters.category,
    colorFamily: filters.colorFamily,
    hasHero: filters.hasHero,
  });

  return {
    templates: filtered,
    categories: collectTemplateCategories(templates),
  };
}

export async function getWechatTemplateByIdFromCloud(templateId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("wechat_templates")
    .select("id,name,thumbnail,categories,color_family,has_hero_image,color_scheme,block_styles")
    .eq("id", templateId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`获取模板失败: ${error.message}`);
  }

  if (!data) return null;
  return mapTemplateRow(data as WechatTemplateDbRow);
}
