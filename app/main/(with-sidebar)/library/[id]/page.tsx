import { redirect } from "next/navigation";
import DocumentEditorPage from "@/components/editor/DocumentEditorPage";
import { getTeacherContext } from "@/lib/api/teacher-context";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";
import { getDocumentDetail, listDocuments } from "@/lib/documents/store";

type Props = {
  params: Promise<{ id: string }>;
};

function buildTypeCounts(items: Array<{ documentKind: string }>) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.documentKind] = (counts[item.documentKind] ?? 0) + 1;
  }
  return counts;
}

export default async function LibraryDocumentPage({ params }: Props) {
  const { id } = await params;
  const { supabase, teacherId } = await getTeacherContext();

  if (!teacherId) {
    return <DocumentEditorPage documentId={id} />;
  }

  const document = await getDocumentDetail(
    {
      teacherId,
      supabase,
    },
    id,
  );

  if (document?.sourceType === "content_library" && document.sourceId) {
    redirect(
      buildContentAssetsRoute({
        itemId: document.sourceId,
      }),
    );
  }

  const sidebar = await listDocuments(
    {
      teacherId,
      supabase,
    },
    {
      page: 1,
      limit: 10,
      sort: "updatedAt",
      order: "desc",
    },
  );

  return (
    <DocumentEditorPage
      key={id}
      documentId={id}
      initialDocument={document}
      initialRecentDocs={sidebar.items.map((item) => ({
        id: item.id,
        title: item.title,
      }))}
      initialTypeCounts={buildTypeCounts(sidebar.items)}
    />
  );
}
