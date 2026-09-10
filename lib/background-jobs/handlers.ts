import { registerJobHandler } from "@/lib/background-jobs/worker";
import { processAsset } from "@/lib/content-assets/process-pipeline";

// 副作用注册：import 此文件即自动注册所有 handler
registerJobHandler("asset_process", async (job) => {
  const assetId = job.payload.assetId;
  if (typeof assetId !== "string" || !assetId) {
    throw new Error("asset_process job 缺少 assetId");
  }
  await processAsset(assetId);
});
