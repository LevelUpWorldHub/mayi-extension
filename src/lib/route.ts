import { ON_DEVICE_CHAR_BUDGET, CLOUD_CHAR_BUDGET, LONG_DOCUMENT_CHARS } from "./budgets";
import { locateQuote } from "./citation";
import { selectChunks } from "./chunk";
import type { PolicyDoc, Verdict } from "./types";

export interface HybridRoute {
  totalChars: number;
  long: boolean;
  onDeviceHasClause: boolean;
  cloudHasClause: boolean;
  step: "on_device" | "cloud_retry";
  note: string;
}

function excerptText(docs: PolicyDoc[], question: string, budget: number): string {
  return selectChunks(docs, question, budget)
    .map((excerpt) => excerpt.text)
    .join("\n");
}

function containsClause(haystack: string, clause: string | null): boolean {
  if (!clause) return false;
  return locateQuote(haystack, clause).method !== "none";
}

export function planHybridRoute(docs: PolicyDoc[], question: string, clause: string | null): HybridRoute {
  const totalChars = docs.reduce((sum, doc) => sum + doc.text.length, 0);
  const long = totalChars > LONG_DOCUMENT_CHARS;
  const onDeviceHasClause = containsClause(excerptText(docs, question, ON_DEVICE_CHAR_BUDGET), clause);
  const cloudHasClause = containsClause(excerptText(docs, question, CLOUD_CHAR_BUDGET), clause);
  const step = long && !onDeviceHasClause ? "cloud_retry" : "on_device";
  const note =
    step === "cloud_retry"
      ? "Cloud route: Nano's excerpt does not include this clause. With Firebase configured, MayI sends a larger excerpt to the cloud and badges that answer Cloud."
      : "This clause fits in the on-device excerpt.";
  return { totalChars, long, onDeviceHasClause, cloudHasClause, step, note };
}

export function shouldRetryInCloud(options: {
  totalChars: number;
  onDeviceExcerpt: string;
  quote: string | null;
  verdict: Verdict;
}): boolean {
  if (options.totalChars <= LONG_DOCUMENT_CHARS) return false;
  if (!options.quote || options.verdict === "unknown") return true;
  return locateQuote(options.onDeviceExcerpt, options.quote).method === "none";
}
