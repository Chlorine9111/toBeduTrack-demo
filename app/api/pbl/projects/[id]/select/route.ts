import { jsonError } from "@/lib/api/response";
import { getPblContext } from "@/lib/pbl/context";

export async function POST() {
  const contextResult = await getPblContext();
  if (!contextResult.ok) {
    return jsonError("UNAUTHORIZED", contextResult.error.message, contextResult.error.status);
  }

  return jsonError(
    "VALIDATION_ERROR",
    "当前 PBL 生成功能已切换为直接生成完整方案，不再支持 overview 选择流程。",
    410,
  );
}
