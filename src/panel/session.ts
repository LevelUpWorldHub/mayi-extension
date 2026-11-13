import { diffPolicies, type PolicyDiff } from "../lib/diff";
import { sha256 } from "../lib/hash";
import { htmlToText } from "../lib/html";
import { createStore, type WatchStore } from "../lib/storage";
import type { Fetcher, PolicyDoc } from "../lib/types";
import type { SiteSnapshot } from "../lib/collect";

export interface WatchedChange {
  policy: PolicyDoc;
  diff: PolicyDiff;
  previousAt: number;
}

function isLumenPrivacy(url: string): boolean {
  return url.includes("/samples/lumen/privacy.html");
}

async function seedLumenPrevious(policy: PolicyDoc, fetcher: Fetcher, store: WatchStore): Promise<void> {
  if (!isLumenPrivacy(policy.url)) return;
  const previousUrl = policy.url.replace(/privacy\.html(?:[?#].*)?$/, "privacy.previous.html");
  const response = await fetcher.fetch(previousUrl);
  if (!response.ok) return;
  const text = htmlToText(response.text).slice(0, 150_000);
  await store.seedIfEmpty({
    url: policy.url,
    host: "lumen.example",
    kind: "privacy",
    title: policy.title,
    hash: await sha256(text),
    text,
    fetchedAt: Date.now() - 1000 * 60 * 60 * 24 * 12,
  });
}

export async function recordPolicies(
  snapshot: SiteSnapshot,
  fetcher: Fetcher,
  store: WatchStore = createStore(),
): Promise<WatchedChange[]> {
  const changes: WatchedChange[] = [];
  for (const policy of snapshot.policies) {
    try {
      await seedLumenPrevious(policy, fetcher, store);
      const result = await store.commit({
        url: policy.url,
        host: snapshot.host,
        kind: policy.kind,
        title: policy.title,
        text: policy.text,
        fetchedAt: snapshot.fetchedAt,
      });
      if (!result.record.previous) continue;
      changes.push({
        policy,
        previousAt: result.record.previous.fetchedAt,
        diff: diffPolicies(result.record.previous.text, result.record.text),
      });
    } catch {
      // One policy failing to store should not drop the answers for the rest.
    }
  }
  return changes;
}

export async function replayLumenChange(
  policy: PolicyDoc,
  fetcher: Fetcher,
  store: WatchStore = createStore(),
): Promise<WatchedChange | null> {
  if (!isLumenPrivacy(policy.url)) return null;
  await store.reset(policy.url);
  await seedLumenPrevious(policy, fetcher, store);
  const result = await store.commit({
    url: policy.url,
    host: "lumen.example",
    kind: policy.kind,
    title: policy.title,
    text: policy.text,
    fetchedAt: Date.now(),
  });
  if (!result.record.previous) return null;
  return {
    policy,
    previousAt: result.record.previous.fetchedAt,
    diff: diffPolicies(result.record.previous.text, result.record.text),
  };
}
