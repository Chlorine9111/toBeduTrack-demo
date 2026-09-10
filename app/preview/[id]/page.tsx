import { notFound } from "next/navigation";
import { getPreviewRecord } from "@/lib/wechat-editor/preview-store";

export default async function WechatPreviewPage(
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const record = getPreviewRecord(params.id);

  if (!record) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-[420px] bg-white px-4 py-6 text-neutral-800">
      <div
        className="wechat-preview-content"
        dangerouslySetInnerHTML={{ __html: record.html }}
      />
      <p className="mt-6 text-center text-xs text-neutral-400">
        临时预览链接有效期至 {new Date(record.expiresAt).toLocaleString("zh-CN")}
      </p>
    </main>
  );
}
