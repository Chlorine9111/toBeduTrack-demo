import QuestionBankBuilderPage from "@/components/main/question-bank/builder/QuestionBankBuilderPage";

type BuilderSearchParams = Promise<{
  projectId?: string | string[];
}>;

export default async function QuestionBankBuilderEntryPage({
  searchParams,
}: {
  searchParams: BuilderSearchParams;
}) {
  const params = await searchParams;
  const projectId =
    typeof params.projectId === "string" && params.projectId.trim()
      ? params.projectId.trim()
      : null;

  return <QuestionBankBuilderPage initialProjectId={projectId} />;
}
