import { getResolvedLanguageModelForTask } from "@/lib/ai/model-router";
import {
  resolveModelTemperature,
} from "@/lib/ai/gateway";

export function resolveMoonshotTemperature(modelId: string, fallback: number) {
  return resolveModelTemperature(modelId, fallback);
}

export function getWechatArticleModel() {
  return getResolvedLanguageModelForTask("wechat_article");
}

export function getWechatVisionModel() {
  return getResolvedLanguageModelForTask("wechat_vision");
}
