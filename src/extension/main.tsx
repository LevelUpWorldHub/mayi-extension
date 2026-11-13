import { useState } from "react";
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { collectSite, type SiteSnapshot } from "../lib/collect";
import { textFragmentUrl } from "../lib/citation";
import { httpFetcher } from "../lib/html";
import type { PageHints } from "../lib/types";
import { Panel } from "../panel/Panel";
import { recordPolicies, type WatchedChange } from "../panel/session";
import "../panel/panel.css";

function ExtensionApp() {
  const [snapshot, setSnapshot] = useState<SiteSnapshot | null>(null);
  const [changes, setChanges] = useState<WatchedChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function readThisTab() {
    setLoading(true);
    setError(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
        setError("Open an http(s) page, then press This tab.");
        setSnapshot(null);
        return;
      }
      const hints = await extract(tab.id);
      const origin = new URL(tab.url).origin;
      const next = await collectSite({
        pageUrl: tab.url,
        siteRoot: origin,
        fetcher: { fetch: httpFetcher },
        hints,
      });
      if (!next.policies.length) setError("MayI couldn’t find a terms, privacy, or license page on this site.");
      setSnapshot(next);
      setChanges(await recordPolicies(next, { fetch: httpFetcher }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "MayI couldn’t read this tab.");
    } finally {
      setLoading(false);
    }
  }

  async function showClause(url: string, quote: string) {
    await chrome.runtime.sendMessage({
      type: "MAYI_OPEN_CLAUSE",
      url: textFragmentUrl(url, quote),
      quote,
    });
  }

  return (
    <Panel
      snapshot={snapshot}
      changes={changes}
      loading={loading}
      error={error}
      fetcher={{ fetch: httpFetcher }}
      onShowClause={(url, quote) => void showClause(url, quote)}
      onReread={() => void readThisTab()}
      onChanges={setChanges}
    />
  );
}

async function extract(tabId: number): Promise<Partial<PageHints>> {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "MAYI_EXTRACT" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type: "MAYI_EXTRACT" });
  }
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ExtensionApp />
    </StrictMode>,
  );
}
