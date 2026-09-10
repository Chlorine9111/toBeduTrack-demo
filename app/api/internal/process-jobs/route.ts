import { NextResponse } from "next/server";
import { processNextBatch } from "@/lib/background-jobs/worker";

// Import all handler registration modules to ensure they call registerJobHandler
// before processNextBatch runs.
import "@/lib/background-jobs/handlers";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // In development mode without CRON_SECRET configured, allow all requests
  if (!cronSecret && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  return token === cronSecret;
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await processNextBatch({ limit: 5 });

    return NextResponse.json({
      processed: result.processed,
      failed: result.failed,
    });
  } catch (error) {
    console.error("[process-jobs] 处理失败", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        processed: 0,
        failed: 0,
      },
      { status: 500 },
    );
  }
}
