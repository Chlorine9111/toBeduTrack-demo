export default function LessonPlanNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">教案链接无效</h1>
      <p className="text-sm text-slate-600">该教案可能已取消发布，或链接已过期。</p>
    </main>
  );
}
