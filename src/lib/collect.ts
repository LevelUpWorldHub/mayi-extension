import { aiTxtCandidateUrls, parseAiTxt, type AiTxt } from "./ai-txt";
import type { MachineSignals } from "./conflicts";
import { pickPolicyLinks, POLICY_FALLBACKS } from "./discover";
import { extractLinks, extractMeta, htmlToText } from "./html";
import { parseLlmsTxt, type LlmsTxt } from "./llms-txt";
import { parseRobots, type RobotsParse } from "./robots";
import { mergeTdm, parseRobotsDirectives, parseTdmRepJson, parseTdmReservation, type TdmSignal } from "./tdm";
import type { Fetcher, PageHints, PolicyDoc, PolicyKind } from "./types";

const EMPTY_TDM: TdmSignal = {
  reservation: null,
  policyUrl: null,
  source: null,
  disagreement: false,
  sources: [],
};

const KIND_TITLE: Record<PolicyKind, string> = {
  terms: "Terms of Service",
  privacy: "Privacy policy",
  license: "License",
};

export interface SiteSnapshot {
  pageUrl: string;
  siteRoot: string;
  host: string;
  title: string;
  fetchedAt: number;
  signals: MachineSignals;
  policies: PolicyDoc[];
  errors: string[];
}

function rootOf(siteRoot: string): string {
  return siteRoot.replace(/\/$/, "");
}

async function readOk(fetcher: Fetcher, url: string): Promise<{ url: string; text: string; headers: Record<string, string> } | null> {
  const result = await fetcher.fetch(url);
  if (!result.ok || result.status === 404) return null;
  return result;
}

export async function collectSite(options: {
  pageUrl: string;
  siteRoot: string;
  fetcher: Fetcher;
  hints?: Partial<PageHints>;
}): Promise<SiteSnapshot> {
  const errors: string[] = [];
  const root = rootOf(options.siteRoot);
  let host = root;
  try {
    host = new URL(options.pageUrl).host;
  } catch {
    errors.push("The page address could not be read.");
  }

  const page = await options.fetcher.fetch(options.pageUrl);
  if (page.error) errors.push(`Couldn't fetch the page: ${page.error}`);
  const parsed = page.ok ? extractMeta(page.text) : { title: null, metaRobots: null, tdmReservation: null, tdmPolicy: null };
  const hints = options.hints;
  const links = hints?.links?.length ? hints.links : page.ok ? extractLinks(page.text, page.url || options.pageUrl) : [];
  const metaRobots = parseRobotsDirectives(hints?.metaRobots ?? parsed.metaRobots);
  const xRobotsTag = page.headers["x-robots-tag"] ?? null;
  const xRobots = parseRobotsDirectives(xRobotsTag);

  const robotsResponse = await options.fetcher.fetch(`${root}/robots.txt`);
  let robots: RobotsParse | null = null;
  let robotsUrl: string | null = null;
  if (robotsResponse.ok) {
    robots = parseRobots(robotsResponse.text);
    robotsUrl = robotsResponse.url || `${root}/robots.txt`;
  } else if (robotsResponse.error) {
    errors.push(`Couldn't fetch robots.txt: ${robotsResponse.error}`);
  }

  let aiTxt: AiTxt | null = null;
  let aiTxtUrl: string | null = null;
  for (const url of aiTxtCandidateUrls(root)) {
    const response = await options.fetcher.fetch(url);
    if (response.error) {
      errors.push(`Couldn't fetch ${url}: ${response.error}`);
      continue;
    }
    if (!response.ok) continue;
    const parsedAi = parseAiTxt(response.text);
    if (parsedAi.format === "unknown") continue;
    aiTxt = parsedAi;
    aiTxtUrl = response.url || url;
    break;
  }

  let llms: LlmsTxt | null = null;
  let llmsUrl: string | null = null;
  const llmsResponse = await options.fetcher.fetch(`${root}/llms.txt`);
  if (llmsResponse.ok && llmsResponse.text.trim()) {
    llms = parseLlmsTxt(llmsResponse.text);
    llmsUrl = llmsResponse.url || `${root}/llms.txt`;
  } else if (llmsResponse.error) {
    errors.push(`Couldn't fetch llms.txt: ${llmsResponse.error}`);
  }

  const tdmParts: { source: string; reservation: 0 | 1 | null; policyUrl?: string | null }[] = [
    {
      source: "page header",
      reservation: parseTdmReservation(page.headers["tdm-reservation"]),
      policyUrl: page.headers["tdm-policy"] ?? null,
    },
    {
      source: "meta tag",
      reservation: parseTdmReservation(hints?.tdmReservation ?? parsed.tdmReservation),
      policyUrl: hints?.tdmPolicy ?? parsed.tdmPolicy,
    },
  ];
  const tdmRep = await options.fetcher.fetch(`${root}/.well-known/tdmrep.json`);
  if (tdmRep.ok) {
    const record = parseTdmRepJson(tdmRep.text);
    tdmParts.push({ source: "tdmrep.json", reservation: record.reservation, policyUrl: record.policyUrl });
  } else if (tdmRep.error) {
    errors.push(`Couldn't fetch tdmrep.json: ${tdmRep.error}`);
  }

  const found = pickPolicyLinks(links);
  const have = new Set(found.map((item) => item.kind));
  for (const kind of ["terms", "privacy", "license"] as const) {
    if (have.has(kind)) continue;
    for (const path of POLICY_FALLBACKS[kind]) {
      const candidate = await readOk(options.fetcher, `${root}${path}`);
      if (!candidate) continue;
      const text = htmlToText(candidate.text);
      if (text.length < 400) continue;
      found.push({ kind, url: candidate.url });
      break;
    }
  }

  const policies: PolicyDoc[] = [];
  for (const link of found) {
    const response = await options.fetcher.fetch(link.url);
    if (!response.ok) {
      if (response.error) errors.push(`Couldn't fetch ${link.kind}: ${response.error}`);
      continue;
    }
    const text = htmlToText(response.text).slice(0, 180_000);
    if (text.length < 80) continue;
    const title = extractMeta(response.text).title || KIND_TITLE[link.kind];
    policies.push({ kind: link.kind, title, url: response.url || link.url, text });
  }

  const signals: MachineSignals = {
    robots,
    robotsUrl,
    aiTxt,
    aiTxtUrl,
    llms,
    llmsUrl,
    tdm: tdmParts.length ? mergeTdm(tdmParts) : EMPTY_TDM,
    metaRobots,
    xRobotsTag,
    xRobots,
  };

  return {
    pageUrl: options.pageUrl,
    siteRoot: root,
    host,
    title: hints?.title || parsed.title || host,
    fetchedAt: Date.now(),
    signals,
    policies,
    errors,
  };
}
