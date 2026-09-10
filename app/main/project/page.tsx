import { redirect } from "next/navigation";

type SearchParamValue = string | string[] | undefined;

function appendSearchParams(url: URLSearchParams, key: string, value: SearchParamValue) {
  if (typeof value === "string" && value) {
    url.set(key, value);
    return;
  }

  if (!Array.isArray(value)) {
    return;
  }

  for (const item of value) {
    if (!item) continue;
    url.append(key, item);
  }
}

export default async function ProjectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, SearchParamValue>>;
}) {
  const resolved = (await searchParams) ?? {};
  const nextSearch = new URLSearchParams();

  for (const [key, value] of Object.entries(resolved)) {
    appendSearchParams(nextSearch, key, value);
  }

  const query = nextSearch.toString();
  redirect(query ? `/main/agent?${query}` : "/main/agent");
}
