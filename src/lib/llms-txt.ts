export interface LlmsLink {
  title: string;
  href: string;
  note?: string;
}

export interface LlmsTxt {
  title: string | null;
  summary: string | null;
  links: LlmsLink[];
  mentionsOptOut: boolean;
}

export function parseLlmsTxt(text: string): LlmsTxt {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const titleLine = lines.find((line) => line.startsWith("# "));
  const summary = lines
    .filter((line) => line.startsWith("> "))
    .map((line) => line.slice(2).trim())
    .join(" ");
  const links: LlmsLink[] = [];
  for (const line of lines) {
    const match = line.match(/\[([^\]]+)\]\(([^)]+)\)(?::\s*(.*))?/);
    if (!match) continue;
    links.push({ title: match[1], href: match[2], note: match[3]?.trim() || undefined });
  }
  return {
    title: titleLine ? titleLine.slice(2).trim() : null,
    summary: summary || null,
    links,
    mentionsOptOut: /not permission to train|do not train|no training|must not train/i.test(text),
  };
}
