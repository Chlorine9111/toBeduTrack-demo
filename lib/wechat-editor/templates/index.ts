import type { Template } from "@/lib/wechat-editor/types";
import { academicBlueTemplate } from "@/lib/wechat-editor/templates/academic-blue";
import { vibrantOrangeTemplate } from "@/lib/wechat-editor/templates/vibrant-orange";
import { freshGreenTemplate } from "@/lib/wechat-editor/templates/fresh-green";
import { elegantPurpleTemplate } from "@/lib/wechat-editor/templates/elegant-purple";
import { classicBwTemplate } from "@/lib/wechat-editor/templates/classic-bw";
import { warmPinkTemplate } from "@/lib/wechat-editor/templates/warm-pink";
import { techBlueTemplate } from "@/lib/wechat-editor/templates/tech-blue";
import { chinaRedTemplate } from "@/lib/wechat-editor/templates/china-red";
import { natureBrownTemplate } from "@/lib/wechat-editor/templates/nature-brown";
import { minimalGrayTemplate } from "@/lib/wechat-editor/templates/minimal-gray";

export const WECHAT_TEMPLATES: Template[] = [
  academicBlueTemplate,
  vibrantOrangeTemplate,
  freshGreenTemplate,
  elegantPurpleTemplate,
  classicBwTemplate,
  warmPinkTemplate,
  techBlueTemplate,
  chinaRedTemplate,
  natureBrownTemplate,
  minimalGrayTemplate,
];

export function getTemplateById(templateId: string) {
  return WECHAT_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function listTemplateCategories() {
  const categorySet = new Set<string>();
  WECHAT_TEMPLATES.forEach((template) => {
    template.categories.forEach((category) => categorySet.add(category));
  });
  return ["全部", ...Array.from(categorySet)];
}
