import { useEffect, useRef, useState } from "react";
import { collectSite, type SiteSnapshot } from "../lib/collect";
import { textFragmentUrl } from "../lib/citation";
import { highlightQuote } from "../lib/highlight-dom";
import { httpFetcher } from "../lib/html";
import { absoluteSampleRoot, SAMPLES, type SampleSite } from "../lib/samples";
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
          <p className="max-w-xl text-sm text-muted">{sample.blurb}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Sample sites">
          {SAMPLES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === sample.id}
              className={`rounded-full px-3 py-1.5 text-left text-sm font-semibold ${item.id === sample.id ? "bg-ink text-paper" : "border border-line bg-white/50"}`}
              onClick={() => setSample(item)}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-70">{item.mark}</span>
              {item.name}
            </button>
          ))}
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
        />
      </div>
    </div>
  );
}
