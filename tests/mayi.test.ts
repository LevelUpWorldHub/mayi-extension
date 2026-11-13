import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAiTxt } from "../src/lib/ai-txt";
import { locateQuote } from "../src/lib/citation";
import { chunkText, selectChunks } from "../src/lib/chunk";
import { collectSite } from "../src/lib/collect";
import { briefSignals, detectConflicts } from "../src/lib/conflicts";
import { shouldRetryInCloud } from "../src/lib/route";
import { diffPolicies } from "../src/lib/diff";
import { answerExtractive } from "../src/lib/extractive";
import { htmlToText } from "../src/lib/html";
import { parseLlmsTxt } from "../src/lib/llms-txt";
import { planHybridRoute } from "../src/lib/route";
import { parseRobots, robotsDecision, robotsRuleMatches } from "../src/lib/robots";
import { parseTdmRepJson, parseTdmReservation, mergeTdm } from "../src/lib/tdm";
import type { Fetcher } from "../src/lib/types";

describe("robots.txt", () => {
  const parsed = parseRobots(`
User-agent: *
Disallow: /private
Allow: /
Content-Signal: search=yes, ai-input=no, ai-train=no

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Allow: /public
Disallow: /

Sitemap: https://example.com/sitemap.xml
`);

  it("lets the longest rule win and prefers allow on a tie", () => {
    expect(robotsDecision(parsed, "ClaudeBot", "/public/page")).toBe("allow");
    expect(robotsDecision(parsed, "ClaudeBot", "/secret")).toBe("disallow");
    expect(robotsDecision(parsed, "GPTBot", "/")).toBe("disallow");
    expect(robotsDecision(parsed, "SomeOtherBot", "/notes")).toBe("allow");
    expect(robotsDecision(parsed, "SomeOtherBot", "/private/file")).toBe("disallow");
  });

  it("anchors end-of-path wildcards", () => {
    expect(robotsRuleMatches("/*.pdf$", "/file.pdf")).toBe(true);
    expect(robotsRuleMatches("/*.pdf$", "/file.pdf.txt")).toBe(false);
    expect(robotsRuleMatches("/private", "/private/x")).toBe(true);
  });

  it("reads Cloudflare content signals and sitemaps", () => {
    expect(parsed.groups[0]?.contentSignals).toEqual({ search: "yes", aiInput: "no", aiTrain: "no" });
    expect(parsed.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("groups consecutive user-agent lines", () => {
    const shared = parseRobots(`User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /drafts\n`);
    expect(shared.groups).toHaveLength(1);
    expect(robotsDecision(shared, "GPTBot", "/drafts/a")).toBe("disallow");
    expect(robotsDecision(shared, "ClaudeBot", "/")).toBe("allow");
  });
});

describe("ai.txt", () => {
  it("parses directive blocks, including per-agent overrides", () => {
    const parsed = parseAiTxt(`
Spec-Version: 1.0
Site-Name: Kindred Press
Training: conditional
Scraping: allow
Training-License: CC-BY-4.0
Training-Allow: /stories/*
Training-Deny: /members/*

Agent: GPTBot
  Training: deny
  Scraping: deny
`);
    expect(parsed.format).toBe("directives");
    expect(parsed.training).toBe("conditional");
    expect(parsed.scraping).toBe("allow");
    expect(parsed.trainingLicense).toBe("CC-BY-4.0");
    expect(parsed.trainingAllow).toEqual(["/stories/*"]);
    expect(parsed.trainingDeny).toEqual(["/members/*"]);
    expect(parsed.agents[0]).toMatchObject({ name: "GPTBot", training: "deny", scraping: "deny" });
  });

  it("treats a robots-style file as a training opt-out", () => {
    const parsed = parseAiTxt("User-agent: *\nDisallow: /\n");
    expect(parsed.format).toBe("robots");
    expect(parsed.training).toBe("deny");
  });
});

describe("llms.txt and TDM", () => {
  it("reads the title, summary, links, and an opt-out sentence", () => {
    const parsed = parseLlmsTxt(`# Pinnacle\n\n> A map.\n\nIt is not permission to train models.\n\n- [Start](https://pinnacle.example/docs): Open a folder.\n`);
    expect(parsed.title).toBe("Pinnacle");
    expect(parsed.summary).toBe("A map.");
    expect(parsed.links[0]?.href).toBe("https://pinnacle.example/docs");
    expect(parsed.mentionsOptOut).toBe(true);
  });

  it("parses reservation headers and tdmrep.json", () => {
    expect(parseTdmReservation("1")).toBe(1);
    expect(parseTdmReservation("0")).toBe(0);
    expect(parseTdmReservation("maybe")).toBeNull();
    expect(parseTdmRepJson('[{"tdm-reservation":1,"tdm-policy":"https://lumen.example/privacy"}]')).toEqual({
      reservation: 1,
      policyUrl: "https://lumen.example/privacy",
    });
    const merged = mergeTdm([
      { source: "header", reservation: 0 },
      { source: "tdmrep.json", reservation: 1, policyUrl: "https://example.com/policy" },
    ]);
    expect(merged.disagreement).toBe(true);
    expect(merged.reservation).toBe(1);
  });
});

describe("clause citation", () => {
  const page = "Intro.\n\nYou may not use the Archive, or any portion of it, to train a model.\n\nGoodbye.";

  it("finds an exact quote", () => {
    const quote = "You may not use the Archive, or any portion of it, to train a model.";
    const located = locateQuote(page, quote);
    expect(located.method).toBe("exact");
    expect(located.matched).toBe(quote);
  });

  it("finds a quote with different whitespace", () => {
    const located = locateQuote(page, "You   may not use the Archive,\nor any portion of it, to train a model.");
    expect(located.method).toBe("normalized");
    expect(located.matched).toContain("to train a model");
  });

  it("fuzzy-matches a quote that dropped a word", () => {
    const located = locateQuote(page, "You may not use the Archive, or any portion, to train a model.");
    expect(located.method).toBe("fuzzy");
    expect(located.confidence).toBeGreaterThanOrEqual(0.84);
    expect(page.slice(located.start, located.end)).toContain("train");
  });

  it("refuses a quote that is not on the page", () => {
    expect(locateQuote(page, "The archive welcomes commercial resale of every notebook.").method).toBe("none");
  });
});

describe("chunk selection", () => {
  it("keeps the arbitration sentence when the budget is smaller than the document", () => {
    const filler = Array.from({ length: 40 }, (_, index) => `Section ${index} covers ordinary workspace operation and folders.`).join("\n\n");
    const text = `${filler}\n\nAny dispute shall be resolved by binding arbitration administered in private.`;
    const chunks = chunkText(text, 500, 40);
    expect(chunks.length).toBeGreaterThan(2);
    const picked = selectChunks([{ title: "Terms", url: "https://example.com/terms", text }], "Is there forced arbitration?", 900);
    expect(picked.map((chunk) => chunk.text).join("\n")).toMatch(/binding arbitration/);
    expect(picked.reduce((sum, chunk) => sum + chunk.text.length, 0)).toBeLessThanOrEqual(900 + 20);
  });
});

describe("cloud retry decision", () => {
  it("retries only when a long document's excerpt misses the clause", () => {
    expect(
      shouldRetryInCloud({ totalChars: 4_000, onDeviceExcerpt: "you may not train", quote: "you may not train", verdict: "no" }),
    ).toBe(false);
    expect(
      shouldRetryInCloud({ totalChars: 20_000, onDeviceExcerpt: "the morning train", quote: "you may not train a model", verdict: "no" }),
    ).toBe(true);
    expect(
      shouldRetryInCloud({ totalChars: 20_000, onDeviceExcerpt: "you may not train a model here", quote: null, verdict: "unknown" }),
    ).toBe(true);
    expect(
      shouldRetryInCloud({
        totalChars: 20_000,
        onDeviceExcerpt: "You may not train a model on this text.",
        quote: "You may not train a model on this text.",
        verdict: "no",
      }),
    ).toBe(false);
  });

  it("keeps a signal brief shorter than the full bot list", () => {
    const brief = briefSignals([
      "ai.txt says Training: allow",
      "TDM reservation is 0 (no reservation)",
      "robots.txt allows GPTBot, Google-Extended, ClaudeBot, CCBot, Applebot-Extended",
    ]);
    expect(brief).toMatch(/ai\.txt says Training: allow/);
    expect(brief).toMatch(/1 more on the Signals tab/);
    expect(brief).not.toMatch(/Applebot/);
  });
});

describe("policy diff", () => {
  it("says what changed for the reader", () => {
    const before = "We use membership information to schedule visits. You can ask for a copy of the record.";
    const after = "We use membership information to schedule visits. We may sell your personal information, including precise location data, to data brokers and advertising networks. You can ask for a copy of the record.";
    const diff = diffPolicies(before, after);
    expect(diff.summary).toMatch(/selling personal information/);
    expect(diff.added.join(" ")).toMatch(/data brokers/);
    expect(diff.removed).toHaveLength(0);
  });
});

function sampleFetcher(): Fetcher {
  return {
    async fetch(url: string) {
      const pathname = new URL(url).pathname.replace(/^\//, "");
      try {
        const text = readFileSync(new URL(`../public/${pathname}`, import.meta.url), "utf8");
        const headers: Record<string, string> = {};
        if (pathname.startsWith("samples/lumen/")) {
          headers["tdm-reservation"] = "1";
          headers["tdm-policy"] = "https://lumen.example/privacy";
        }
        if (pathname.startsWith("samples/northwind/") || pathname.startsWith("samples/sable/")) {
          headers["tdm-reservation"] = "0";
        }
        if (pathname.startsWith("samples/pinnacle/")) headers["x-robots-tag"] = "noai, noimageai";
        return { ok: true, status: 200, url, text, headers };
      } catch {
        return { ok: false, status: 404, url, text: "", headers: {} };
      }
    },
  };
}

async function loadSample(id: string) {
  const root = `https://demo.local/samples/${id}`;
  return collectSite({
    pageUrl: `${root}/index.html`,
    siteRoot: root,
    fetcher: sampleFetcher(),
  });
}

describe("sample sites", () => {
  it("flags Northwind when the files allow training and the terms forbid it", async () => {
    const site = await loadSample("northwind");
    const report = detectConflicts(site.signals, site.policies);
    expect(report.items.find((item) => item.topic === "training")?.severity).toBe("conflict");
    expect(report.primary?.headline).toMatch(/files allow AI training/i);
    expect(report.primary?.machineBrief.length ?? 0).toBeLessThan(220);
    expect(report.primary?.machineBrief).toMatch(/ai\.txt/);
    expect(report.primary?.machineBrief).not.toMatch(/Applebot/);
    const train = answerExtractive("May I train AI on it?", site.policies, "train");
    expect(train.verdict).toBe("no");
    expect(train.quote).toMatch(/may not use the Archive/i);
    expect(locateQuote(site.policies.find((doc) => doc.kind === "terms")?.text ?? "", train.quote ?? "").method).not.toBe("none");
    expect(answerExtractive("May I share screenshots?", site.policies, "screenshots").verdict).toBe("conditional");
    expect(answerExtractive("Do they sell my data?", site.policies, "sell").verdict).toBe("no");
    expect(answerExtractive("Is there forced arbitration?", site.policies, "arbitration").verdict).toBe("no");
  });

  it("reads Lumen as aligned denial, with a privacy diff", async () => {
    const site = await loadSample("lumen");
    const report = detectConflicts(site.signals, site.policies);
    expect(report.items.find((item) => item.topic === "training")?.severity).toBe("aligned");
    expect(report.items.find((item) => item.topic === "scraping")?.severity).toBe("aligned");
    expect(answerExtractive("Do they sell my data?", site.policies, "sell").verdict).toBe("yes");
    expect(answerExtractive("May I cancel anytime?", site.policies, "cancel").verdict).toBe("no");
    expect(answerExtractive("Is there auto-renewal?", site.policies, "renew").verdict).toBe("yes");
    expect(answerExtractive("Is there forced arbitration?", site.policies, "arbitration").verdict).toBe("yes");
    const previous = htmlToText(readFileSync(new URL("../public/samples/lumen/privacy.previous.html", import.meta.url), "utf8"));
    const current = site.policies.find((doc) => doc.kind === "privacy")?.text ?? "";
    expect(diffPolicies(previous, current).summary).toMatch(/selling personal information/);
  });

  it("treats Kindred training as conditional on both sides", async () => {
    const site = await loadSample("kindred");
    expect(site.signals.aiTxt?.training).toBe("conditional");
    expect(site.signals.aiTxtUrl).toMatch(/\.well-known\/ai\.txt$/);
    expect(detectConflicts(site.signals, site.policies).items.find((item) => item.topic === "training")?.severity).toBe("aligned");
    expect(answerExtractive("May I train AI on it?", site.policies, "train").verdict).toBe("conditional");
    expect(answerExtractive("May I scrape this?", site.policies, "scrape").verdict).toBe("yes");
    expect(answerExtractive("May I use it commercially?", site.policies, "commercial").verdict).toBe("conditional");
  });

  it("finds Pinnacle's late clauses and a scraping tension", async () => {
    const site = await loadSample("pinnacle");
    expect(site.policies.reduce((sum, doc) => sum + doc.text.length, 0)).toBeGreaterThan(6000);
    expect(answerExtractive("Is there forced arbitration?", site.policies, "arbitration").verdict).toBe("yes");
    expect(answerExtractive("May I cancel anytime?", site.policies, "cancel").verdict).toBe("no");
    expect(answerExtractive("May I train AI on it?", site.policies, "train").verdict).toBe("no");
    expect(answerExtractive("May I scrape this?", site.policies, "scrape").verdict).toBe("conditional");
    expect(detectConflicts(site.signals, site.policies).items.find((item) => item.topic === "training")?.severity).toBe("aligned");
    expect(detectConflicts(site.signals, site.policies).items.find((item) => item.topic === "scraping")?.severity).toBe("tension");
    expect(site.signals.llms?.mentionsOptOut).toBe(true);
  });

  it("sends Sable's late training ban down the cloud route", async () => {
    const site = await loadSample("sable");
    const total = site.policies.reduce((sum, doc) => sum + doc.text.length, 0);
    expect(total).toBeGreaterThan(12_000);
    const train = answerExtractive("May I train AI on it?", site.policies, "train");
    expect(train.verdict).toBe("no");
    expect(train.quote).toMatch(/may not use Sable Ferry/i);
    expect(train.quote!.length).toBeLessThan(280);
    expect(train.quote).not.toMatch(/Running order|morning train meets/);
    const route = planHybridRoute(site.policies, train.question, train.quote);
    expect(route.long).toBe(true);
    expect(route.onDeviceHasClause).toBe(false);
    expect(route.cloudHasClause).toBe(true);
    expect(route.step).toBe("cloud_retry");
    expect(detectConflicts(site.signals, site.policies).items.find((item) => item.topic === "training")?.severity).toBe(
      "conflict",
    );
  });
});
