import { useEffect, useRef, useState } from "react";
import { collectSite, type SiteSnapshot } from "../lib/collect";
import { textFragmentUrl } from "../lib/citation";
import { highlightQuote } from "../lib/highlight-dom";
import { httpFetcher } from "../lib/html";
import { absoluteSampleRoot, sampleById, SAMPLES, type SampleSite } from "../lib/samples";
import { Panel } from "../panel/Panel";
import { recordPolicies, type WatchedChange } from "../panel/session";

export function Lab() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [sample, setSample] = useState<SampleSite>(SAMPLES[0]);
  const [snapshot, setSnapshot] = useState<SiteSnapshot | null>(null);
  const [changes, setChanges] = useState<WatchedChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const [walk, setWalk] = useState(0);
  const [walking, setWalking] = useState(false);
  const walkSteps = [
    {
      id: "northwind",
      tab: "ask" as const,
      note: "Beat 1 of 3. Northwind’s files allow training. The contract forbids it. Read the line that starts “For you”.",
    },
    {
      id: "lumen",
      tab: "changes" as const,
      note: "Beat 2 of 3. Lumen’s privacy policy changed. The Changes tab quotes the new sentence about selling personal information.",
    },
    {
      id: "sable",
      tab: "ask" as const,
      note: "Beat 3 of 3. Sable’s training ban sits past the excerpt Gemini Nano can read. Press “Show the cloud route”.",
    },
  ];
  const step = walking ? walkSteps[walk] : null;

  useEffect(() => {
    const token = ++generation.current;
    const root = absoluteSampleRoot(window.location.origin, sample);
    const pageUrl = `${root}/index.html`;
    setLoading(true);
    setError(null);
    void collectSite({ pageUrl, siteRoot: root, fetcher: { fetch: httpFetcher } })
      .then(async (next) => {
        if (token !== generation.current) return;
        const labeled = { ...next, host: sample.host };
        if (!labeled.policies.length) setError("MayI couldn’t find a terms, privacy, or license page on this site.");
        setSnapshot(labeled);
        setChanges(await recordPolicies(labeled, { fetch: httpFetcher }));
      })
      .catch((cause: unknown) => {
        if (token !== generation.current) return;
        setError(cause instanceof Error ? cause.message : "The sample site didn’t load.");
      })
      .finally(() => {
        if (token === generation.current) setLoading(false);
      });
  }, [sample]);

  function showClause(url: string, quote: string) {
    const frame = frameRef.current;
    if (!frame) return;
    const paint = () => {
      const doc = frame.contentDocument;
      if (doc) highlightQuote(doc, quote);
    };
    let same = false;
    try {
      const current = frame.contentWindow?.location;
      const target = new URL(url);
      same = Boolean(current && current.origin === target.origin && current.pathname === target.pathname);
    } catch {
      same = false;
    }
    if (same) {
      paint();
      return;
    }
    frame.addEventListener("load", () => paint(), { once: true });
    frame.src = textFragmentUrl(url, quote);
  }

  const root = absoluteSampleRoot(window.location.origin, sample);

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line bg-paper px-4 py-3">
        <div>
          <p className="font-serif text-xs uppercase tracking-[0.22em] text-seal">Lab · offline samples</p>
          <p className="max-w-xl text-sm text-muted">{step?.note ?? sample.blurb}</p>
        </div>
        <button
          type="button"
          className="rounded-full bg-seal px-3 py-1.5 text-sm font-semibold text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          onClick={() => {
            const next = walking ? (walk + 1) % walkSteps.length : 0;
            const chosen = walkSteps[next];
            const site = sampleById(chosen.id);
            setWalking(true);
            setWalk(next);
            if (site) setSample(site);
          }}
        >
          {walking ? (walk === walkSteps.length - 1 ? "Replay the walk" : "Next beat") : "Walk the three beats"}
        </button>
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Sample sites">
          {SAMPLES.map((item) => {
            const selected = item.id === sample.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                title={item.mark}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal ${selected ? "bg-ink text-paper" : "border border-line bg-white/50"}`}
                onClick={() => {
                  setWalking(false);
                  setSample(item);
                }}
              >
                {item.name}
                {selected ? <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{item.mark}</span> : null}
              </button>
            );
          })}
        </div>
      </header>
      <div className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,28rem)]">
        <iframe
          ref={frameRef}
          title={`${sample.name} sample site`}
          src={`${root}/index.html`}
          className="h-[42vh] w-full border-b border-line bg-white lg:h-full lg:border-r lg:border-b-0"
        />
        <Panel
          snapshot={snapshot}
          changes={changes}
          loading={loading}
          error={error}
          fetcher={{ fetch: httpFetcher }}
          onShowClause={showClause}
          onChanges={setChanges}
          guide={step ? { tab: step.tab, note: step.note } : null}
        />
      </div>
    </div>
  );
}
