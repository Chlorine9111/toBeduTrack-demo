import { redirect } from "next/navigation";
import { getActorContext } from "@/lib/auth/actor-context";

export default async function MainPage() {
  const actor = await getActorContext();

  if (!actor.isAuthenticated) {
    redirect("/auth/login?next=/main");
  }

  redirect("/main/agent");
}
