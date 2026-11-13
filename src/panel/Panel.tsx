import { useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { askPresets, askQuestion } from "../lib/ask";
import type { CardModel } from "../lib/card";
import { permissionMarkdown, renderCardPng } from "../lib/card";
import type { SiteSnapshot } from "../lib/collect";
import { detectConflicts, scrapingPosture, trainingPosture, type ConflictItem } from "../lib/conflicts";
import { LONG_DOCUMENT_CHARS } from "../lib/firebase";
import { firebaseConfigPresent, getFirebaseStatus, initFirebase } from "../lib/firebase";
import { PRESETS } from "../lib/presets";
import type { Answer, Fetcher, InferencePath, QuestionTone, Verdict } from "../lib/types";
import { replayLumenChange, type WatchedChange } from "./session";

type Tab = "ask" | "signals" | "changes" | "card";

export interface PanelProps {
  snapshot: SiteSnapshot | null;
  changes: WatchedChange[];
  loading: boolean;
  error: string | null;
  fetcher: Fetcher;
  onShowClause: (url: string, quote: string) => void;
  onReread?: () => void;
  onChanges: (changes: WatchedChange[]) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "ask", label: "Ask" },
  { id: "signals", label: "Signals" },
  { id: "changes", label: "Changes" },
  { id: "card", label: "Card" },
];

function verdictWord(verdict: Verdict): string {
  if (verdict === "yes") return "YES";
  if (verdict === "no") return "NO";
  if (verdict === "conditional") return "IF";
  return "?";
}

function verdictLabel(verdict: Verdict): string {
  if (verdict === "yes") return "Yes";
  if (verdict === "no") return "No";
  if (verdict === "conditional") return "Conditional";
  return "Unknown";
}

function stampTone(verdict: Verdict, tone: QuestionTone): string {
  if (verdict === "conditional") return "text-conditional";
  if (verdict === "unknown") return "text-muted";
  const favorable = tone === "permission" ? verdict === "yes" : verdict === "no";
  return favorable ? "text-yes" : "text-seal";
}

function badge(path: InferencePath): string {
  if (path === "on_device") return "On-device";
  if (path === "cloud") return "Cloud";
  if (path === "extractive") return "Local reading";
  return "Unreported";
}

function severityClass(severity: ConflictItem["severity"]): string {
  if (severity === "conflict") return "border-seal/40 bg-[#f8e4dc] text-seal";
  if (severity === "tension") return "border-conditional/40 bg-[#f6ead2] text-conditional";
  if (severity === "aligned") return "border-yes/30 bg-[#e5f0e8] text-yes";
  return "border-line bg-paper text-muted";
}

export function Panel({ snapshot, changes, loading, error, fetcher, onShowClause, onReread, onChanges }: PanelProps) {
  const [tab, setTab] = useState<Tab>("ask");
  const [question, setQuestion] = useState("May I ");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const siteKey = snapshot?.pageUrl ?? "";
  const [seenSite, setSeenSite] = useState(siteKey);
  if (seenSite !== siteKey) {
    setSeenSite(siteKey);
    setAnswers([]);
    setQuestion("May I ");
    setTab("ask");
  }
  const [asking, setAsking] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);

  const report = useMemo(
    () => (snapshot ? detectConflicts(snapshot.signals, snapshot.policies) : null),
    [snapshot],
  );
  const firebase = firebaseConfigPresent();
  const [status] = useState(() => (firebase ? initFirebase() : getFirebaseStatus()));
  const policyChars = snapshot?.policies.reduce((sum, policy) => sum + policy.text.length, 0) ?? 0;

  async function ask(text: string, presetId?: string) {
    if (!snapshot || !text.trim()) return;
    setAsking(text);
    setAskError(null);
    setProgress(null);
    setTab("ask");
    try {
      const answer = await askQuestion({
        question: text,
        docs: snapshot.policies,
        presetId,
        onDeviceProgress: (value) => setProgress(`Preparing Gemini Nano… ${Math.round(value * 100)}%`),
      });
      setAnswers((current) => [answer, ...current.filter((item) => item.question !== answer.question)]);
    } catch (cause) {
      setAskError(cause instanceof Error ? cause.message : "MayI couldn't answer that.");
    } finally {
      setAsking(null);
      setProgress(null);
    }
  }

  async function askUsual() {
    if (!snapshot) return;
    setAsking("usual");
    setAskError(null);
    setTab("ask");
    try {
      const next = await askPresets(snapshot.policies, (done, total) => {
        setProgress(`Reading ${done} of ${total}`);
      }, (value) => setProgress(`Preparing Gemini Nano… ${Math.round(value * 100)}%`));
      setAnswers(next);
    } catch (cause) {
      setAskError(cause instanceof Error ? cause.message : "MayI couldn't answer the usual eight.");
    } finally {
      setAsking(null);
      setProgress(null);
    }
  }

  const card: CardModel | null = snapshot
    ? {
        host: snapshot.host,
        title: snapshot.title,
        checkedAt: snapshot.fetchedAt,
        conflict: report?.primary && report.primary.severity !== "aligned" ? report.primary.headline : null,
        rows: (answers.length ? answers : []).map((answer) => ({
          question: answer.question,
          verdict: answer.verdict,
          tone: answer.tone,
        })),
      }
    : null;

  async function downloadCard() {
    if (!card || !card.rows.length) return;
    setCardError(null);
    try {
      const blob = await renderCardPng(card);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mayi-${snapshot?.host ?? "site"}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setCardError(cause instanceof Error ? cause.message : "Couldn't export the card.");
    }
  }

  async function copyCard() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(permissionMarkdown(card));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCardError("The clipboard is blocked in this browser. Download the PNG instead.");
    }
  }

  async function replay() {
    const privacy = snapshot?.policies.find((policy) => policy.url.includes("/samples/lumen/privacy.html"));
    if (!privacy) return;
    setReplaying(true);
    try {
      const change = await replayLumenChange(privacy, fetcher);
      if (change) onChanges([change, ...changes.filter((item) => item.policy.url !== privacy.url)]);
    } finally {
      setReplaying(false);
    }
  }

  return (
    <section className="flex min-h-[36rem] flex-col bg-paper text-ink lg:h-full lg:min-h-0">
      <header className="border-b border-line px-4 py-3">
        <p className="font-serif text-xs uppercase tracking-[0.22em] text-seal">MayI · FinePrint</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl leading-none">{snapshot?.title ?? "No site yet"}</h1>
            <p className="mt-1 text-sm text-muted">{snapshot?.host ?? "Open a page to read its terms."}</p>
          </div>
          {onReread ? (
            <Button variant="outline" size="sm" onClick={onReread} disabled={loading}>
              This tab
            </Button>
          ) : null}
        </div>
      </header>

      {report?.primary ? (
        <div className={`mx-4 mt-3 rounded-2xl border px-3 py-3 ${severityClass(report.primary.severity)}`} role="status">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
            {report.primary.severity === "conflict" ? "Files and contract disagree" : report.primary.severity}
          </p>
          <p className="mt-1 font-serif text-lg leading-snug">{report.primary.headline}</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-white/50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide">Files</p>
              <p className="mt-1">{report.primary.machineSummary}</p>
            </div>
            <div className="rounded-xl bg-white/50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide">Contract</p>
              <p className="mt-1">{report.primary.policyQuote ?? report.primary.policySummary}</p>
              {report.primary.policyQuote && report.primary.policyUrl ? (
                <button
                  type="button"
                  className="mt-2 font-semibold underline-offset-2 hover:underline"
                  onClick={() => onShowClause(report.primary?.policyUrl as string, report.primary?.policyQuote as string)}
                >
                  Show this clause
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex gap-1 px-4" role="tablist" aria-label="MayI sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`mayi-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`mayi-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal ${tab === item.id ? "bg-ink text-paper" : "text-muted hover:bg-paper-deep"}`}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              const index = TABS.findIndex((entry) => entry.id === item.id);
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                setTab(next.id);
                document.getElementById(`mayi-tab-${next.id}`)?.focus();
              }
            }}
          >
            {item.label}
            {item.id === "changes" && changes.length ? ` ${changes.length}` : ""}
          </button>
        ))}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        role="tabpanel"
        id={`mayi-panel-${tab}`}
        aria-labelledby={`mayi-tab-${tab}`}
        aria-busy={Boolean(asking) || loading}
      >
        {loading ? <p className="text-sm text-muted">Fetching robots.txt, ai.txt, and the policy pages…</p> : null}
        {error ? (
          <p className="mb-3 rounded-xl border border-seal/30 bg-[#f8e4dc] px-3 py-2 text-sm text-seal" role="alert">
            {error}
          </p>
        ) : null}
        {!snapshot && !loading ? (
          <div className="ruled rounded-2xl border border-line px-4 py-6">
            <p className="font-serif text-xl leading-snug">
              Point MayI at a site. It reads the terms, then answers in one sentence and shows the sentence it used.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
              <li>Open any page on the site, then press This tab.</li>
              <li>Read the banner first. It is the files on one side and the contract on the other.</li>
              <li>Ask a question. Show this clause highlights the sentence on the policy page.</li>
            </ol>
            <p className="mt-3 text-sm">
              For builders about to train or scrape, and for anyone about to accept a renewal or an arbitration clause.
            </p>
          </div>
        ) : null}

        {snapshot && tab === "ask" ? (
          <div className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void ask(question);
              }}
            >
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                aria-label="May I question"
                className="h-10 min-w-0 flex-1 rounded-full border border-line bg-white/60 px-4 text-sm outline-none focus:border-ink"
              />
              <Button type="submit" variant="seal" disabled={Boolean(asking)}>
                Ask
              </Button>
            </form>
            {!answers.length && !asking ? (
              <p className="text-sm text-muted">
                Start with the banner. Then ask. For a contract longer than Nano can read at once, open Sable Ferry and ask about training: the clause is past the on-device excerpt, and the card says Cloud route.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-busy={asking === preset.question}
                  className="rounded-full border border-line bg-white/50 px-2.5 py-1 text-xs font-semibold hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal disabled:opacity-50"
                  disabled={Boolean(asking)}
                  onClick={() => void ask(preset.question, preset.id)}
                >
                  {asking === preset.question ? "Reading…" : preset.question.replace(/^May I /, "").replace(/\?$/, "")}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => void askUsual()} disabled={Boolean(asking)}>
              {asking === "usual" ? "Reading the eight…" : "Answer the usual eight"}
            </Button>
            {progress ? <p className="text-sm text-muted" role="status">{progress}</p> : null}
            {askError ? (
              <p className="rounded-xl border border-seal/30 bg-[#f8e4dc] px-3 py-2 text-sm text-seal" role="alert">
                {askError}
              </p>
            ) : null}
            {policyChars > LONG_DOCUMENT_CHARS ? (
              <p className="text-xs text-muted">
                This contract is longer than Gemini Nano’s excerpt. MayI ranks the matching clauses
                {firebase ? " and can send a larger excerpt to the cloud, labeled Cloud." : "."}
              </p>
            ) : null}
            {!snapshot.policies.length ? (
              <p className="text-sm text-muted">MayI couldn’t find a terms, privacy, or license page on this site.</p>
            ) : null}
            {answers.map((answer) => (
              <article key={answer.id} className="rounded-2xl border border-line bg-white/40 p-3">
                <div className="flex gap-3">
                  <div className={`stamp ${stampTone(answer.verdict, answer.tone)}`} role="img" aria-label={verdictLabel(answer.verdict)}>
                    {verdictWord(answer.verdict)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-serif text-lg leading-tight">{answer.question}</h2>
                      <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                        {badge(answer.inference)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">
                      <span className={`font-semibold ${stampTone(answer.verdict, answer.tone)}`}>
                        {verdictLabel(answer.verdict)}.
                      </span>{" "}
                      {answer.reason}
                    </p>
                    {answer.quote ? (
                      <blockquote className="mt-2 border-l-2 border-seal/50 pl-3 text-sm text-muted">
                        “{answer.quote}”
                        {answer.sourceTitle ? <span className="mt-1 block text-xs">{answer.sourceTitle}</span> : null}
                      </blockquote>
                    ) : (
                      <p className="mt-2 text-xs text-muted">No clause on the page matched this answer.</p>
                    )}
                    {answer.quote && answer.sourceUrl ? (
                      <button
                        type="button"
                        className="mt-2 text-sm font-semibold text-seal underline-offset-2 hover:underline"
                        onClick={() => onShowClause(answer.sourceUrl as string, answer.quote as string)}
                      >
                        Show this clause
                      </button>
                    ) : null}
                    {answer.routeNote ? (
                      <p className="mt-2 rounded-xl border border-conditional/40 bg-[#f6ead2] px-3 py-2 text-xs text-conditional">
                        {answer.routeNote}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-muted">{answer.inferenceDetail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {snapshot && tab === "signals" ? <Signals snapshot={snapshot} items={report?.items ?? []} onShowClause={onShowClause} /> : null}

        {snapshot && tab === "changes" ? (
          <div className="space-y-3">
            {!changes.length ? (
              <p className="text-sm text-muted">
                MayI stores a hash of each policy on this device. The next time the wording changes, the difference shows up here in plain English.
              </p>
            ) : null}
            {changes.map((change) => (
              <article key={change.policy.url} className="rounded-2xl border border-line bg-white/40 p-3">
                <h2 className="font-serif text-lg">{change.policy.title}</h2>
                <p className="mt-1 text-sm">{change.diff.summary}</p>
                {change.diff.added.filter((sentence) => sentence.length > 48).slice(0, 3).map((sentence) => (
                  <p key={sentence} className="mt-2 border-l-2 border-yes pl-3 text-sm">
                    Added: {sentence}
                  </p>
                ))}
                {change.diff.removed.filter((sentence) => sentence.length > 48).slice(0, 3).map((sentence) => (
                  <p key={sentence} className="mt-2 border-l-2 border-seal pl-3 text-sm">
                    Removed: {sentence}
                  </p>
                ))}
              </article>
            ))}
            {snapshot.policies.some((policy) => policy.url.includes("/samples/lumen/privacy.html")) ? (
              <Button variant="outline" onClick={() => void replay()} disabled={replaying}>
                Replay the change
              </Button>
            ) : null}
          </div>
        ) : null}

        {snapshot && tab === "card" ? (
          <div className="space-y-3">
            {!card?.rows.length ? (
              <p className="text-sm text-muted">Answer the usual eight first. The card is the permission slip you can hand someone.</p>
            ) : (
              <div className="ruled rounded-2xl border border-line p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-seal">Permission card</p>
                <h2 className="mt-1 font-serif text-2xl">{snapshot.host}</h2>
                {card.conflict ? <p className="mt-2 font-serif text-seal">{card.conflict}</p> : null}
                <ul className="mt-3 space-y-2">
                  {card.rows.map((row) => (
                    <li key={row.question} className="flex justify-between gap-3 text-sm">
                      <span>{row.question}</span>
                      <span className={`font-semibold ${stampTone(row.verdict, row.tone)}`}>{verdictLabel(row.verdict)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void downloadCard()} disabled={!card?.rows.length}>
                Download PNG
              </Button>
              <Button variant="outline" onClick={() => void copyCard()} disabled={!card?.rows.length}>
                {copied ? "Copied" : "Copy Markdown"}
              </Button>
            </div>
            {cardError ? <p className="text-sm text-seal">{cardError}</p> : null}
          </div>
        ) : null}
      </div>

      <footer className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-muted">
        {status.configured
          ? `Firebase hybrid · cloud model ${status.cloudModel} · App Check ${status.appCheck}. `
          : "Policies are read on this device. Add Firebase config to turn on Gemini Nano, with the cloud used only as fallback. "}
        Not legal advice.
      </footer>
    </section>
  );
}

function Signals({
  snapshot,
  items,
  onShowClause,
}: {
  snapshot: SiteSnapshot;
  items: ConflictItem[];
  onShowClause: (url: string, quote: string) => void;
}) {
  const signals = snapshot.signals;
  const training = trainingPosture(signals);
  const scraping = scrapingPosture(signals);
  const rows = [
    ["robots.txt", signals.robotsUrl ?? "Not found"],
    ["ai.txt", signals.aiTxt ? `${signals.aiTxtUrl} · training ${signals.aiTxt.training}` : "Not found"],
    ["llms.txt", signals.llms ? `${signals.llmsUrl}${signals.llms.mentionsOptOut ? " · not permission to train" : ""}` : "Not found"],
    ["TDM reservation", signals.tdm.reservation === null ? "Silent" : String(signals.tdm.reservation)],
    ["meta robots", signals.metaRobots.noai ? "noai" : "no noai"],
    ["X-Robots-Tag", signals.xRobotsTag ?? "None"],
    ["Training posture", `${training.value}: ${training.because.join(" · ")}`],
    ["Scraping posture", `${scraping.value}: ${scraping.because.join(" · ")}`],
  ];
  return (
    <div className="space-y-3">
      <ul className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <li key={label} className="rounded-xl border border-line bg-white/40 px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
            <span className="break-words">{value}</span>
          </li>
        ))}
      </ul>
      {items.map((item) => (
        <article key={item.id} className={`rounded-2xl border px-3 py-3 ${severityClass(item.severity)}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide">{item.topic} · {item.severity}</p>
          <p className="mt-1 font-serif text-base leading-snug">{item.headline}</p>
          <p className="mt-1 text-xs opacity-80">{item.machineSummary}</p>
          {item.policyQuote && item.policyUrl ? (
            <button
              type="button"
              className="mt-2 text-sm font-semibold underline-offset-2 hover:underline"
              onClick={() => onShowClause(item.policyUrl as string, item.policyQuote as string)}
            >
              Show this clause
            </button>
          ) : null}
        </article>
      ))}
      {snapshot.errors.length ? (
        <ul className="text-xs text-muted">
          {snapshot.errors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
