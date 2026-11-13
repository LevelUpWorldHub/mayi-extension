import type { FetchResult } from "./types";

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  copy: "©",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return NAMED[body] ?? full;
  });
}

export function htmlToText(html: string): string {
  const withoutDanger = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  const withBreaks = withoutDanger
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|section|article|blockquote|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const decoded = decodeEntities(withBreaks)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return decoded;
}

export function extractTitle(html: string): string | null {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const text = decodeEntities(h1[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!title) return null;
  const text = decodeEntities(title[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return text || null;
}

function metaContent(html: string, name: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const wanted = name.toLowerCase();
  for (const tag of tags) {
    const nameMatch = tag.match(/\bname\s*=\s*["']([^"']+)["']/i);
    if (!nameMatch || nameMatch[1].toLowerCase() !== wanted) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    return content ? decodeEntities(content[1]) : "";
  }
  return null;
}

export function extractMeta(html: string): {
  title: string | null;
  metaRobots: string | null;
  tdmReservation: string | null;
  tdmPolicy: string | null;
} {
  return {
    title: extractTitle(html),
    metaRobots: metaContent(html, "robots"),
    tdmReservation: metaContent(html, "tdm-reservation"),
    tdmPolicy: metaContent(html, "tdm-policy"),
  };
}

export function extractLinks(html: string, base: string): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const attrs = match[1] ?? "";
    const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const raw = hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? "";
    if (!raw || raw.startsWith("#") || /^mailto:|^javascript:/i.test(raw)) continue;
    let href: string;
    try {
      href = new URL(raw, base).href;
    } catch {
      continue;
    }
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    links.push({ href, text });
  }
  return links;
}

export function headerMap(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

export async function httpFetcher(url: string): Promise<FetchResult> {
  try {
    const response = await fetch(url, { credentials: "omit", redirect: "follow" });
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      text: await response.text(),
      headers: headerMap(response.headers),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      text: "",
      headers: {},
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
