export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
}

export interface ContentSignals {
  search?: "yes" | "no";
  aiInput?: "yes" | "no";
  aiTrain?: "yes" | "no";
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  contentSignals?: ContentSignals;
}

export interface RobotsParse {
  groups: RobotsGroup[];
  sitemaps: string[];
}

export const TRAINING_AGENTS = [
  "GPTBot",
  "Google-Extended",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
  "Diffbot",
  "Meta-ExternalAgent",
  "cohere-ai",
] as const;

export const KNOWN_AI_AGENTS = [
  ...TRAINING_AGENTS,
  "ChatGPT-User",
  "OAI-SearchBot",
  "Amazonbot",
  "PerplexityBot",
  "Applebot",
  "FacebookBot",
] as const;

function stripComment(line: string): string {
  const index = line.indexOf("#");
  return (index === -1 ? line : line.slice(0, index)).trim();
}

function parseContentSignal(value: string): ContentSignals {
  const signals: ContentSignals = {};
  for (const part of value.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    if (!rawKey || !rawValue) continue;
    const key = rawKey.trim().toLowerCase();
    const yn = rawValue.trim().toLowerCase() === "yes" ? "yes" : rawValue.trim().toLowerCase() === "no" ? "no" : undefined;
    if (!yn) continue;
    if (key === "search") signals.search = yn;
    if (key === "ai-input") signals.aiInput = yn;
    if (key === "ai-train") signals.aiTrain = yn;
  }
  return signals;
}

export function parseRobots(text: string): RobotsParse {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let seenRule = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line) continue;
    const match = line.match(/^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();

    if (field === "user-agent") {
      if (!current || seenRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        seenRule = false;
      }
      current.agents.push(value);
      continue;
    }
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (!current) {
      current = { agents: [], rules: [] };
      groups.push(current);
    }
    if (field === "allow" || field === "disallow") {
      seenRule = true;
      if (!value && field === "disallow") continue;
      current.rules.push({ type: field, path: value || "/" });
      continue;
    }
    if (field === "content-signal") {
      seenRule = true;
      current.contentSignals = { ...current.contentSignals, ...parseContentSignal(value) };
    }
  }

  return { groups, sitemaps };
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

export function robotsRuleMatches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  let source = pattern;
  let endAnchored = false;
  if (source.endsWith("$")) {
    endAnchored = true;
    source = source.slice(0, -1);
  }
  const body = source.split("*").map(escapeRegex).join(".*");
  return new RegExp(`^${body}${endAnchored ? "$" : ""}`).test(path);
}

function groupsFor(parsed: RobotsParse, agent: string, includeStar: boolean): RobotsGroup[] {
  const exact = parsed.groups.filter((group) =>
    group.agents.some((name) => name.toLowerCase() === agent.toLowerCase()),
  );
  if (exact.length || !includeStar) return exact;
  return parsed.groups.filter((group) => group.agents.includes("*"));
}

export function robotsDecision(
  parsed: RobotsParse,
  agent: string,
  path = "/",
): "allow" | "disallow" | "unspecified" {
  const exact = groupsFor(parsed, agent, false);
  const groups = exact.length ? exact : groupsFor(parsed, agent, true);
  const rules = groups.flatMap((group) => group.rules);
  if (!groups.length) return "unspecified";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  let best: { length: number; allow: boolean } | null = null;
  for (const rule of rules) {
    if (!robotsRuleMatches(rule.path, normalized)) continue;
    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.type === "allow")) {
      best = { length, allow: rule.type === "allow" };
    }
  }
  if (!best) return rules.length ? "allow" : "unspecified";
  return best.allow ? "allow" : "disallow";
}

export function contentSignalsFor(parsed: RobotsParse, agent = "*"): ContentSignals | undefined {
  const exact = groupsFor(parsed, agent, false);
  const groups = exact.length ? exact : groupsFor(parsed, "*", true);
  return groups.map((group) => group.contentSignals).find(Boolean);
}

export function explicitAgentDecision(
  parsed: RobotsParse,
  agent: string,
  path = "/",
): "allow" | "disallow" | "unspecified" {
  if (!groupsFor(parsed, agent, false).length) return "unspecified";
  return robotsDecision(parsed, agent, path);
}
