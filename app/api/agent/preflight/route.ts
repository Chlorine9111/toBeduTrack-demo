import { jsonError } from "@/lib/api/response";

const RETIRED_MESSAGE =
  "Agent 前置补全接口已退役。请直接调用 /api/agent/chat；拆题能力也已迁出当前 Agent 页面。";

export async function POST() {
  return jsonError("FEATURE_DISABLED", RETIRED_MESSAGE, 410);
}
