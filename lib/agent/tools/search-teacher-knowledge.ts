import { tool } from "ai";
import { z } from "zod";
import { searchTeacherKnowledgeRagDetailed } from "@/lib/assistant/knowledge-rag";
import type { AgentChatToolsParams } from "@/lib/agent/tools/types";
import { errorResult, successResult } from "@/lib/agent/tools/tool-result";

export function buildSearchTeacherKnowledgeTool(params: AgentChatToolsParams) {
  return tool({
    description: "检索教师私有资料，包括旧知识库文档和内容库上传文件。适用于「查一下我之前上传的讲义」「从我的资料里找相关内容」等请求",
    inputSchema: z.object({
      query: z.string().min(1).max(300).describe("检索关键词或问题"),
      limit: z.number().int().min(1).max(8).optional().describe("返回结果数量上限"),
    }),
    execute: async function* ({ query, limit }) {
      yield { status: "searching", text: "正在检索教师资料库..." };

      try {
        const response = await searchTeacherKnowledgeRagDetailed({
          teacherId: params.teacherId,
          query,
          limit: limit ?? 5,
        });

        const items = response.results.slice(0, 6).map((item) => ({
          id: item.id,
          score: item.score ?? null,
          content: item.content.slice(0, 1200),
          metadata: item.metadata,
        }));

        yield successResult(
          "search",
          `资料库检索：${query}`,
          items.length > 0 ? `找到 ${items.length} 条相关资料` : "未找到相关资料",
          items.length,
          items.length > 0
            ? ["基于这些资料回答问题", "用这些资料生成内容"]
            : ["换个关键词重试", "改为 web 搜索"],
          {
            query,
            retrieval: response.retrieval,
            items,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        yield errorResult("search", `资料库检索失败: ${message}`, ["请重试"], {
          query,
        });
      }
    },
  });
}
