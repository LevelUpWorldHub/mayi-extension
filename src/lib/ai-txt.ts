import { parseRobots, robotsDecision } from "./robots";

export type TriState = "allow" | "deny" | "conditional" | "unspecified";

export interface AiAgentRule {
  name: string;
  training: TriState;
  scraping: TriState;
  indexing: TriState;
  caching: TriState;
  extras: Record<string, string>;
}

export interface AiTxt {
  format: "directives" | "robots" | "unknown";
  specVersion?: string;
  siteName?: string;
  training: TriState;
  scraping: TriState;
  indexing: TriState;
  caching: TriState;
  trainingAllow: string[];
  trainingDeny: string[];
  trainingLicense?: string;
  agents: AiAgentRule[];
}

const EMPTY_AGENT = (): AiAgentRule => ({
  name: "*",
  training: "unspecified",
  scraping: "unspecified",
  indexing: "unspecified",
  caching: "unspecified",
  extras: {},
});

function tri(value: string): TriState | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "allow" || normalized === "yes") return "allow";
  if (normalized === "deny" || normalized === "disallow" || normalized === "no") return "deny";
  if (normalized === "conditional") return "conditional";
  return null;
}

function empty(): AiTxt {
  return {
    format: "unknown",
    training: "unspecified",
    scraping: "unspecified",
    indexing: "unspecified",
    caching: "unspecified",
    trainingAllow: [],
    trainingDeny: [],
    agents: [],
  };
}

function isDocument(target: AiTxt | AiAgentRule): target is AiTxt {
  return "trainingAllow" in target;
}

function applyKey(target: AiTxt | AiAgentRule, key: string, value: string): void {
  const state = tri(value);
  if (key === "training" && state) target.training = state;
  else if (key === "scraping" && state) target.scraping = state;
  else if (key === "indexing" && state) target.indexing = state;
  else if (key === "caching" && state) target.caching = state;
  else if (isDocument(target) && key === "training-allow") target.trainingAllow.push(value);
  else if (isDocument(target) && key === "training-deny") target.trainingDeny.push(value);
  else if (isDocument(target) && key === "training-license") target.trainingLicense = value;
  else if (isDocument(target) && key === "spec-version") target.specVersion = value;
  else if (isDocument(target) && key === "site-name") target.siteName = value;
  else if (!isDocument(target)) target.extras[key] = value;
}

export function parseAiTxt(text: string): AiTxt {
  const result = empty();
  const directiveLike = /^(training|scraping|indexing|caching|agent|spec-version)\s*:/im.test(text);
  if (!directiveLike && /user-agent\s*:/i.test(text)) {
    result.format = "robots";
    const robots = parseRobots(text);
    const decision = robotsDecision(robots, "*", "/");
    result.training = decision === "disallow" ? "deny" : decision === "allow" ? "allow" : "unspecified";
    return result;
  }
  if (!directiveLike && !text.trim()) return result;
  if (!directiveLike) return result;

  result.format = "directives";
  let current: AiAgentRule | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) {
      current = null;
      continue;
    }
    const indented = /^[ \t]/.test(raw);
    const line = raw.trim();
    if (line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === "agent") {
      current = { ...EMPTY_AGENT(), name: value || "*" };
      result.agents.push(current);
      continue;
    }
    if (indented && current) applyKey(current, key, value);
    else {
      current = null;
      applyKey(result, key, value);
    }
  }
  return result;
}

export function aiTxtCandidateUrls(siteRoot: string): string[] {
  const root = siteRoot.replace(/\/$/, "");
  return [`${root}/.well-known/ai.txt`, `${root}/ai.txt`];
}
