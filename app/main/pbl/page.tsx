import { redirect } from "next/navigation";
import { buildContentAssetsRoute } from "@/lib/content-assets/routes";

export default function PblPage() {
  redirect(buildContentAssetsRoute({ type: "pbl" }));
}
