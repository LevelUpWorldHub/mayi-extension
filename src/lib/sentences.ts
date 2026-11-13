export function splitSentences(text: string): { text: string; start: number; end: number }[] {
  const sentences: { text: string; start: number; end: number }[] = [];
  const length = text.length;
  let start = 0;

  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    const body = raw.trim();
    if (body.length < 2) return;
    sentences.push({ text: body, start: from + lead, end: to - trail });
  };

  for (let index = 0; index < length; index += 1) {
    const char = text[index];
    if (char === "\n") {
      push(start, index);
      start = index + 1;
      continue;
    }
    if (char !== "." && char !== "!" && char !== "?") continue;
    let end = index + 1;
    while (end < length && /["'”’]/.test(text[end])) end += 1;
    if (end >= length || /\s/.test(text[end])) {
      push(start, end);
      while (end < length && text[end] !== "\n" && /\s/.test(text[end])) end += 1;
      start = end;
      index = end - 1;
    }
  }
  push(start, length);
  return sentences;
}
