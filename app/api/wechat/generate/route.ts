import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "旧版公众号生成器已冻结，请改用 /main/wechat-editor。",
      code: "WECHAT_GENERATOR_DEPRECATED",
      redirectTo: "/main/wechat-editor",
    },
    {
      status: 410,
    },
  );
}
