export type Verdict = "yes" | "no" | "conditional" | "unknown";

export type InferencePath = "on_device" | "cloud" | "extractive" | "unreported";

export type PolicyKind = "terms" | "privacy" | "license";

export type QuestionTone = "permission" | "risk";

export interface PolicyDoc {
  kind: PolicyKind;
  title: string;
  url: string;
  text: string;
}

export interface PageHints {
  url: string;
  title: string;
  links: { href: string; text: string }[];
  metaRobots: string | null;
  tdmReservation: string | null;
  tdmPolicy: string | null;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  url: string;
  text: string;
  headers: Record<string, string>;
  error?: string;
}

export interface Fetcher {
  fetch(url: string): Promise<FetchResult>;
}

export interface Citation {
  start: number;
  end: number;
  matched: string;
  confidence: number;
  method: "exact" | "normalized" | "fuzzy" | "none";
}

export interface Answer {
  id: string;
  question: string;
  presetId: string | null;
  tone: QuestionTone;
  verdict: Verdict;
  reason: string;
  quote: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  citation: Citation | null;
  inference: InferencePath;
  inferenceDetail: string;
  /** Set when a long policy's on-device excerpt misses the cited clause. */
  routeNote?: string | null;
}
