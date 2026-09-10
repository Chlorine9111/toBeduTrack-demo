export async function fetchWebPageWithJina(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("URL 格式不合法");
  }

  const jinaUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}`;

  const response = await fetch(jinaUrl, {
    method: "GET",
    headers: {
      Accept: "text/plain",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Jina Reader 请求失败: ${response.status}`);
  }

  const text = await response.text();
  return text.slice(0, 12000);
}
