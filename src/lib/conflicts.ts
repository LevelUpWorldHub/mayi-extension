import type { AiTxt } from "./ai-txt";
import { answerExtractive } from "./extractive";
import type { LlmsTxt } from "./llms-txt";
import { contentSignalsFor, explicitAgentDecision, robotsDecision, TRAINING_AGENTS, type RobotsParse } from "./robots";
import type { RobotsMeta, TdmSignal } from "./tdm";
import type { PolicyDoc } from "./types";

export type Posture = "allow" | "deny" | "conditional" | "mixed" | "silent";

export interface MachineSignals {
  robots: RobotsParse | null;
  robotsUrl: string | null;
  aiTxt: AiTxt | null;
  aiTxtUrl: string | null;
  llms: LlmsTxt | null;
  llmsUrl: string | null;
  tdm: TdmSignal;
  metaRobots: RobotsMeta;
  xRobotsTag: string | null;
  xRobots: RobotsMeta;
}

export interface ConflictItem {
  id: string;
  topic: "training" | "scraping" | "commercial";
  severity: "conflict" | "tension" | "aligned" | "gap";
  headline: string;
  machineSummary: string;
  policySummary: string;
  policyQuote: string | null;
  policyUrl: string | null;
  policyTitle: string | null;
}

export interface ConflictReport {
  primary: ConflictItem | null;
  items: ConflictItem[];
}

interface Vote {
  value: Posture;
  because: string;
}

function collapse(votes: Vote[], silent: string): { value: Posture; because: string[] } {
  if (!votes.length) return { value: "silent", because: [silent] };
  const values = new Set(votes.map((vote) => vote.value));
  const because = votes.map((vote) => vote.because);
  if (values.has("mixed") || (values.has("allow") && values.has("deny"))) {
    return { value: "mixed", because };
  }
  if (values.has("conditional") && (values.has("allow") || values.has("deny"))) {
    return { value: "mixed", because };
  }
  if (values.has("conditional")) return { value: "conditional", because };
  if (values.has("deny")) return { value: "deny", because };
  if (values.has("allow")) return { value: "allow", because };
  return { value: "silent", because };
}

export function trainingPosture(signals: MachineSignals): { value: Posture; because: string[] } {
  const votes: Vote[] = [];
  if (signals.aiTxt && signals.aiTxt.training !== "unspecified") {
    votes.push({ value: signals.aiTxt.training, because: `ai.txt says Training: ${signals.aiTxt.training}` });
  }
  if (signals.tdm.reservation === 1) votes.push({ value: "deny", because: "A TDM reservation is set (rights reserved)" });
  if (signals.tdm.reservation === 0) votes.push({ value: "allow", because: "TDM reservation is 0 (no reservation)" });
  if (signals.metaRobots.noai || signals.xRobots.noai) {
    votes.push({ value: "deny", because: "A robots tag includes noai" });
  }
  const content = signals.robots ? contentSignalsFor(signals.robots) : undefined;
  if (content?.aiTrain === "no") votes.push({ value: "deny", because: "robots.txt Content-Signal ai-train=no" });
  if (content?.aiTrain === "yes") votes.push({ value: "allow", because: "robots.txt Content-Signal ai-train=yes" });
  if (content?.aiInput === "no") votes.push({ value: "deny", because: "robots.txt Content-Signal ai-input=no" });
  if (signals.llms?.mentionsOptOut) votes.push({ value: "deny", because: "llms.txt says it is not permission to train" });

  if (signals.robots) {
    const explicit = TRAINING_AGENTS.map((agent) => ({
      agent,
      decision: explicitAgentDecision(signals.robots as RobotsParse, agent),
    })).filter((item) => item.decision !== "unspecified");
    if (explicit.length) {
      const allows = explicit.filter((item) => item.decision === "allow").map((item) => item.agent);
      const denies = explicit.filter((item) => item.decision === "disallow").map((item) => item.agent);
      if (allows.length && denies.length) {
        votes.push({ value: "mixed", because: `robots.txt allows ${allows[0]} and disallows ${denies[0]}` });
      } else if (denies.length) {
        votes.push({ value: "deny", because: `robots.txt disallows ${denies.slice(0, 3).join(", ")}` });
      } else if (allows.length) {
        votes.push({ value: "allow", because: `robots.txt allows ${allows.slice(0, 3).join(", ")}` });
      }
    } else if (robotsDecision(signals.robots, "*") === "disallow") {
      votes.push({ value: "deny", because: "robots.txt disallows all agents at /" });
    }
  }
  return collapse(votes, "No machine-readable training signal");
}

export function scrapingPosture(signals: MachineSignals): { value: Posture; because: string[] } {
  const votes: Vote[] = [];
  if (signals.aiTxt && signals.aiTxt.scraping !== "unspecified") {
    votes.push({ value: signals.aiTxt.scraping, because: `ai.txt says Scraping: ${signals.aiTxt.scraping}` });
  }
  if (signals.robots) {
    const decision = robotsDecision(signals.robots, "*");
    if (decision === "disallow") votes.push({ value: "deny", because: "robots.txt disallows all agents at /" });
    if (decision === "allow") votes.push({ value: "allow", because: "robots.txt allows general crawling" });
  }
  return collapse(votes, "No machine-readable crawling signal");
}

function policyPosture(presetId: string, docs: PolicyDoc[]): {
  value: Posture;
  quote: string | null;
  url: string | null;
  title: string | null;
  reason: string;
} {
  const answer = answerExtractive("", docs, presetId);
  const value: Posture =
    answer.verdict === "yes"
      ? "allow"
      : answer.verdict === "no"
        ? "deny"
        : answer.verdict === "conditional"
          ? "conditional"
          : "silent";
  return {
    value,
    quote: answer.quote,
    url: answer.sourceUrl,
    title: answer.sourceTitle,
    reason: answer.reason,
  };
}

function severity(machine: Posture, policy: Posture): ConflictItem["severity"] {
  if (machine === "silent" || policy === "silent") return "gap";
  if (machine === "mixed") return "tension";
  if ((machine === "allow" && policy === "deny") || (machine === "deny" && policy === "allow")) return "conflict";
  if (machine === policy) return "aligned";
  return "tension";
}

function headline(topic: string, machine: Posture, policy: Posture, level: ConflictItem["severity"]): string {
  if (level === "gap") {
    if (policy === "silent") return `The files mention ${topic}. The contract we found does not.`;
    return `The contract mentions ${topic}. The machine-readable files do not.`;
  }
  if (level === "aligned") return `The files and the contract agree on ${topic}.`;
  if (level === "conflict" && machine === "allow" && policy === "deny") {
    return topic === "training"
      ? "The files allow AI training. The terms forbid it."
      : "The files let crawlers in. The terms say you may not scrape.";
  }
  if (level === "conflict" && machine === "deny" && policy === "allow") {
    return topic === "training"
      ? "The files reserve AI training. The terms allow it."
      : "The files tell crawlers to stay out. The terms allow scraping.";
  }
  return `The files and the contract don't quite match on ${topic}.`;
}

function item(
  topic: ConflictItem["topic"],
  machine: { value: Posture; because: string[] },
  policy: ReturnType<typeof policyPosture>,
): ConflictItem {
  const level = severity(machine.value, policy.value);
  return {
    id: topic,
    topic,
    severity: level,
    headline: headline(topic, machine.value, policy.value, level),
    machineSummary: machine.because.join(" · "),
    policySummary: policy.value === "silent" ? "No matching clause in the pages MayI read." : policy.reason,
    policyQuote: policy.quote,
    policyUrl: policy.url,
    policyTitle: policy.title,
  };
}

const RANK: Record<ConflictItem["severity"], number> = { conflict: 0, tension: 1, aligned: 2, gap: 3 };

export function detectConflicts(signals: MachineSignals, docs: PolicyDoc[]): ConflictReport {
  const items = [
    item("training", trainingPosture(signals), policyPosture("train", docs)),
    item("scraping", scrapingPosture(signals), policyPosture("scrape", docs)),
    item("commercial", { value: "silent", because: ["No commercial flag in the machine-readable files"] }, policyPosture("commercial", docs)),
  ];
  const ordered = [...items].sort((left, right) => RANK[left.severity] - RANK[right.severity]);
  return {
    primary: ordered.find((entry) => entry.severity !== "gap") ?? null,
    items,
  };
}
