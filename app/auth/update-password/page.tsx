import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/urls";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UpdatePasswordPage(props: { searchParams: SearchParams }) {
  const searchParams = (await props.searchParams) ?? {};
  const next = sanitizeNextPath(readSearchParam(searchParams.next), "/main/agent");

  const query = new URLSearchParams({
    notice: "Demo mode does not use passwords or email verification.",
  });
  if (next !== "/main/agent") query.set("next", next);
  redirect(`/auth/login?${query.toString()}`);
}
