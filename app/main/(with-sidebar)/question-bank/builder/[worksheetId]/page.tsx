import WorksheetBuilderPage from "@/components/main/question-bank/builder/WorksheetBuilderPage";

export default async function QuestionBankBuilderDetailPage({
  params,
}: {
  params: Promise<{ worksheetId: string }>;
}) {
  const resolved = await params;
  return <WorksheetBuilderPage worksheetId={resolved.worksheetId} />;
}
