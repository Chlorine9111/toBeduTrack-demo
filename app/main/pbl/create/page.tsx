import { redirect } from "next/navigation";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";

export default function PblCreatePage() {
  redirect(buildContentAssetsRoute({ type: "pbl" }));
}
