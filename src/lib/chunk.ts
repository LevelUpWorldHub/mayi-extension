export interface TextChunk {
  text: string;
  start: number;
  end: number;
}

export interface RankedExcerpt extends TextChunk {
  title: string;
  url: string;
  score: number;
}

const STOP = new Set([
  "may",
  "the",
  "and",
  "for",
  "you",
  "your",
  "this",
  "that",
  "with",
  "from",
  "they",
  "their",
  "are",
  "was",
  "any",
  "not",
  "can",
  "how",
  "what",
  "does",
  "have",
]);

export function keywordsOf(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

export function chunkText(text: string, size = 1600, overlap = 180): TextChunk[] {
  if (text.length <= size) return [{ text, start: 0, end: text.length }];
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const paragraph = text.lastIndexOf("\n\n", end);
      const sentence = text.lastIndexOf(". ", end);
      const breakAt = Math.max(paragraph, sentence);
      if (breakAt > start + size * 0.5) end = breakAt + (text[breakAt] === "." ? 1 : 0);
    }
    chunks.push({ text: text.slice(start, end).trim(), start, end });
    if (end >= text.length) break;
    const next = Math.max(end - overlap, start + 1);
    start = next;
  }
  return chunks.filter((chunk) => chunk.text.length > 0);
}

function scoreChunk(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  let hits = 0;
  for (const word of keywords) {
    if (!lower.includes(word)) continue;
    hits += 1;
    score += 2;
  }
  if (hits > 1) score += hits;
  return score;
}

function windowAround(text: string, keywords: string[], budget: number): string {
  const lower = text.toLowerCase();
  let index = -1;
  for (const word of keywords) {
    const found = lower.indexOf(word);
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  let start = index < 0 ? 0 : Math.max(0, index - Math.floor(budget * 0.25));
  const line = text.lastIndexOf("\n", start);
  if (line >= 0 && index - line < budget * 0.5) start = line + 1;
  if (start > 0 && text[start - 1] !== "\n") {
    const space = text.indexOf(" ", start);
    if (space >= 0 && space < start + 24) start = space + 1;
  }
  return text.slice(start, Math.min(text.length, start + budget)).trim();
}

export function selectChunks(
  docs: { title: string; url: string; text: string }[],
  question: string,
  budget: number,
): RankedExcerpt[] {
  const keywords = keywordsOf(question);
  const all: RankedExcerpt[] = docs.flatMap((doc) =>
    chunkText(doc.text).map((chunk) => ({
      ...chunk,
      title: doc.title,
      url: doc.url,
      score: scoreChunk(chunk.text, keywords),
    })),
  );
  const ranked = [...all].sort((left, right) => right.score - left.score || left.start - right.start);
  const picked: RankedExcerpt[] = [];
  let used = 0;
  const pool = ranked.some((chunk) => chunk.score > 0) ? ranked : all;
  const pieceCap = Math.max(4, Math.ceil(budget / 1500));
  for (const chunk of pool) {
    const room = budget - used;
    if (room < 80) break;
    const text = chunk.text.length > room ? windowAround(chunk.text, keywords, room) : chunk.text;
    if (!text) continue;
    picked.push({ ...chunk, text });
    used += text.length;
    if (used >= budget || picked.length >= pieceCap) break;
  }
  return picked.sort((left, right) => left.title.localeCompare(right.title) || left.start - right.start);
}
