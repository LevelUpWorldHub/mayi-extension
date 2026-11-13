import type { PolicyKind } from "./types";

const RULES: { kind: PolicyKind; re: RegExp }[] = [
  { kind: "privacy", re: /\bprivacy\b|privacy-policy|personal-data|data-protection/i },
  { kind: "license", re: /\blicen[cs]e\b|\bcopyright\b/i },
  { kind: "terms", re: /terms of service|terms of use|terms and conditions|user agreement|\btos\b|\/terms(?:\/|$|\.)/i },
];

export function classifyLink(href: string, text: string): { kind: PolicyKind; score: number } | null {
  const hay = `${text} ${href}`;
  let best: { kind: PolicyKind; score: number } | null = null;
  for (const rule of RULES) {
    if (!rule.re.test(hay)) continue;
    const inText = rule.re.test(text) ? 2 : 0;
    const score = 5 + inText;
    if (!best || score > best.score) best = { kind: rule.kind, score };
  }
  return best;
}

export function pickPolicyLinks(
  links: { href: string; text: string }[],
): { kind: PolicyKind; url: string }[] {
  const best = new Map<PolicyKind, { url: string; score: number }>();
  for (const link of links) {
    const classified = classifyLink(link.href, link.text);
    if (!classified) continue;
    const current = best.get(classified.kind);
    if (!current || classified.score > current.score) {
      best.set(classified.kind, { url: link.href, score: classified.score });
    }
  }
  return [...best.entries()].map(([kind, value]) => ({ kind, url: value.url }));
}

export const POLICY_FALLBACKS: Record<PolicyKind, string[]> = {
  terms: ["/terms", "/terms-of-service", "/tos"],
  privacy: ["/privacy", "/privacy-policy"],
  license: ["/license"],
};
