import type { RankedExcerpt } from "./chunk";

export function buildAskPrompt(question: string, excerpts: RankedExcerpt[]): string {
  const body = excerpts
    .map((excerpt) => `--- ${excerpt.title} (${excerpt.url}) ---\n${excerpt.text}`)
    .join("\n\n");
  return [
    "You answer a question about a website's terms, privacy policy, or license.",
    "Use only the excerpts. Do not use outside knowledge.",
    "If the excerpts do not say, verdict is unknown and quote is an empty string.",
    "The quote must be copied exactly from one excerpt: contiguous, no ellipses, no paraphrase.",
    "The reason is one plain-English sentence a person can read aloud. Do not start it with Yes or No.",
    "",
    `Question: ${question}`,
    "",
    "Excerpts:",
    body || "(none)",
    "",
    'Return JSON: {"verdict":"yes|no|conditional|unknown","reason":"...","quote":"...","sourceTitle":"..."}',
  ].join("\n");
}
