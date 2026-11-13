import type { Citation } from "./types";

const NONE: Citation = { start: -1, end: -1, matched: "", confidence: 0, method: "none" };

function unify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\u00a0/g, " ");
}

function normalizeWithMap(input: string): { norm: string; map: number[] } {
  const norm: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  let started = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = unify(input[index]);
    if (/\s/.test(char)) {
      if (started) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      norm.push(" ");
      map.push(index);
      pendingSpace = false;
    }
    norm.push(char);
    map.push(index);
    started = true;
  }
  return { norm: norm.join(""), map };
}

function tokenize(input: string): { token: string; start: number; end: number }[] {
  const tokens: { token: string; start: number; end: number }[] = [];
  const pattern = /[a-z0-9']+/g;
  const folded = unify(input);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(folded))) {
    tokens.push({ token: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

function dice(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const counts = new Map<string, number>();
  for (const token of left) counts.set(token, (counts.get(token) ?? 0) + 1);
  let overlap = 0;
  const used = new Map<string, number>();
  for (const token of right) {
    const seen = used.get(token) ?? 0;
    if (seen < (counts.get(token) ?? 0)) {
      overlap += 1;
      used.set(token, seen + 1);
    }
  }
  return (2 * overlap) / (left.length + right.length);
}

function inOrder(needles: string[], haystack: string[]): boolean {
  let cursor = 0;
  for (const token of needles) {
    let found = -1;
    for (let index = cursor; index < haystack.length; index += 1) {
      if (haystack[index] === token) {
        found = index;
        break;
      }
    }
    if (found < 0) return false;
    cursor = found + 1;
  }
  return true;
}

export function locateQuote(documentText: string, quote: string): Citation {
  const needle = quote.trim();
  if (needle.length < 8) return NONE;

  const exact = documentText.indexOf(needle);
  if (exact >= 0) {
    return {
      start: exact,
      end: exact + needle.length,
      matched: documentText.slice(exact, exact + needle.length),
      confidence: 1,
      method: "exact",
    };
  }

  if (needle.length < 12) return NONE;

  const hay = normalizeWithMap(documentText);
  const pin = normalizeWithMap(needle);
  const found = pin.norm.length >= 12 ? hay.norm.indexOf(pin.norm) : -1;
  if (found >= 0) {
    const start = hay.map[found];
    const last = hay.map[found + pin.norm.length - 1];
    const end = last + 1;
    return {
      start,
      end,
      matched: documentText.slice(start, end),
      confidence: 0.96,
      method: "normalized",
    };
  }

  const quoteTokens = tokenize(needle);
  if (quoteTokens.length < 4) return NONE;
  const docTokens = tokenize(documentText);
  let best: { score: number; start: number; end: number } | null = null;
  const widths = [quoteTokens.length - 1, quoteTokens.length, quoteTokens.length + 1, quoteTokens.length + 2].filter(
    (width) => width >= 4,
  );
  for (const width of widths) {
    for (let index = 0; index <= docTokens.length - width; index += 1) {
      const window = docTokens.slice(index, index + width);
      const quoteWords = quoteTokens.map((token) => token.token);
      const windowWords = window.map((token) => token.token);
      if (!inOrder(quoteWords, windowWords)) continue;
      const score = dice(quoteWords, windowWords);
      if (!best || score > best.score) {
        best = { score, start: window[0].start, end: window[window.length - 1].end };
      }
    }
  }
  if (!best || best.score < 0.84) return NONE;
  return {
    start: best.start,
    end: best.end,
    matched: documentText.slice(best.start, best.end),
    confidence: Number(best.score.toFixed(3)),
    method: "fuzzy",
  };
}

export function groundModelQuote(
  excerpts: { title: string; url: string; text: string }[],
  docs: { title: string; url: string; text: string }[],
  quote: string,
  sourceTitle: string,
): { quote: string | null; url: string | null; title: string | null; citation: Citation | null } {
  const blank = { quote: null, url: null, title: null, citation: null };
  const needle = quote.trim();
  if (needle.length < 8) return blank;
  const ordered = [
    ...excerpts.filter((excerpt) => excerpt.title === sourceTitle),
    ...excerpts.filter((excerpt) => excerpt.title !== sourceTitle),
  ];
  for (const excerpt of ordered) {
    const inExcerpt = locateQuote(excerpt.text, needle);
    if (inExcerpt.method === "none" || inExcerpt.method === "fuzzy") continue;
    const doc = docs.find((item) => item.url === excerpt.url) ?? docs.find((item) => item.title === excerpt.title);
    if (!doc) {
      return { quote: inExcerpt.matched, url: excerpt.url, title: excerpt.title, citation: inExcerpt };
    }
    const inDoc = locateQuote(doc.text, inExcerpt.matched);
    if (inDoc.method === "none") continue;
    return { quote: inDoc.matched, url: doc.url, title: doc.title, citation: inDoc };
  }
  return blank;
}

export function textFragmentUrl(url: string, quote: string): string {
  const clean = quote.replace(/\s+/g, " ").trim();
  const slice = clean.length > 160 ? clean.slice(0, 160) : clean;
  const base = url.split("#")[0];
  return `${base}#:~:text=${encodeURIComponent(slice)}`;
}
