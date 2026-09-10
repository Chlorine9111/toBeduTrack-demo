import { redirect } from "next/navigation";

export default function ExerciseGenerateEntryPage() {
  redirect(`/main/agent?prompt=${encodeURIComponent("请帮我生成一组课堂习题")}`);
}
