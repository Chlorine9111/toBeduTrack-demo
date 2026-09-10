import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/campus-image?name=Stanford+University
 *
 * 服务端代理 Wikimedia Commons 搜索，返回校园照片 URL。
 * 避免浏览器 CORS 问题，并提供内存缓存。
 */

const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";

const cache = new Map<string, { url: string | null; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

interface WikiPage {
  index?: number;
  title?: string;
  imageinfo?: {
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
  }[];
}

const SKIP_KEYWORDS = ["seal", "logo", "map", "coat of arms", "icon", "flag", "crest"];

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ url: null }, { status: 400 });
  }

  const cacheKey = name.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(
      { url: cached.url },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  }

  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: `${name} campus building`,
      gsrnamespace: "6",
      gsrlimit: "5",
      prop: "imageinfo",
      iiprop: "url|dimensions",
      iiurlwidth: "800",
      format: "json",
      origin: "*",
    });

    const resp = await fetch(`${WIKIMEDIA_API}?${params}`, {
      signal: AbortSignal.timeout(6000),
    });

    if (!resp.ok) {
      cache.set(cacheKey, { url: null, ts: Date.now() });
      return NextResponse.json({ url: null });
    }

    const data = await resp.json();
    const pages = data?.query?.pages;

    if (!pages) {
      cache.set(cacheKey, { url: null, ts: Date.now() });
      return NextResponse.json({ url: null });
    }

    const sorted = (Object.values(pages) as WikiPage[]).sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );

    // Prefer landscape, non-logo images
    let resultUrl: string | null = null;

    for (const page of sorted) {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) continue;
      const title = (page.title ?? "").toLowerCase();
      if (SKIP_KEYWORDS.some((kw) => title.includes(kw))) continue;
      const w = info.thumbwidth ?? 0;
      const h = info.thumbheight ?? 0;
      if (w > h) {
        resultUrl = info.thumburl;
        break;
      }
    }

    // Fallback: first non-logo
    if (!resultUrl) {
      for (const page of sorted) {
        const info = page.imageinfo?.[0];
        if (!info?.thumburl) continue;
        const title = (page.title ?? "").toLowerCase();
        if (SKIP_KEYWORDS.some((kw) => title.includes(kw))) continue;
        resultUrl = info.thumburl;
        break;
      }
    }

    cache.set(cacheKey, { url: resultUrl, ts: Date.now() });
    return NextResponse.json(
      { url: resultUrl },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  } catch {
    cache.set(cacheKey, { url: null, ts: Date.now() });
    return NextResponse.json({ url: null });
  }
}
