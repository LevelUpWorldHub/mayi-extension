import { sha256 } from "./hash";
import type { PolicyKind } from "./types";

const PREFIX = "mayi:v1:";
const CAP = 150_000;

export interface SnapshotRecord {
  url: string;
  host: string;
  kind: PolicyKind;
  title: string;
  hash: string;
  text: string;
  fetchedAt: number;
  previous?: { hash: string; text: string; fetchedAt: number };
}

export interface WatchStore {
  get(url: string): Promise<SnapshotRecord | null>;
  seedIfEmpty(record: SnapshotRecord): Promise<boolean>;
  commit(record: Omit<SnapshotRecord, "hash" | "previous"> & { text: string }): Promise<{
    changed: boolean;
    firstReading: boolean;
    record: SnapshotRecord;
  }>;
  reset(url: string): Promise<void>;
}

function clip(text: string): string {
  return text.length > CAP ? text.slice(0, CAP) : text;
}

function canUseChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local) && location.protocol === "chrome-extension:";
}

function canUseLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function createStore(): WatchStore {
  const memory = new Map<string, string>();

  async function read(url: string): Promise<string | null> {
    const key = PREFIX + url;
    if (canUseChromeStorage()) {
      const stored = await chrome.storage.local.get(key);
      const value = stored[key];
      return typeof value === "string" ? value : null;
    }
    if (canUseLocalStorage()) return localStorage.getItem(key);
    return memory.get(key) ?? null;
  }

  async function write(url: string, value: string): Promise<void> {
    const key = PREFIX + url;
    if (canUseChromeStorage()) {
      await chrome.storage.local.set({ [key]: value });
      return;
    }
    if (canUseLocalStorage()) {
      localStorage.setItem(key, value);
      return;
    }
    memory.set(key, value);
  }

  async function remove(url: string): Promise<void> {
    const key = PREFIX + url;
    if (canUseChromeStorage()) {
      await chrome.storage.local.remove(key);
      return;
    }
    if (canUseLocalStorage()) {
      localStorage.removeItem(key);
      return;
    }
    memory.delete(key);
  }

  return {
    async get(url) {
      const raw = await read(url);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as SnapshotRecord;
      } catch {
        return null;
      }
    },
    async seedIfEmpty(record) {
      if (await read(record.url)) return false;
      await write(record.url, JSON.stringify(record));
      return true;
    },
    async commit(input) {
      const text = clip(input.text);
      const hash = await sha256(text);
      const existing = await this.get(input.url);
      if (!existing) {
        const record: SnapshotRecord = { ...input, text, hash };
        await write(input.url, JSON.stringify(record));
        return { changed: false, firstReading: true, record };
      }
      if (existing.hash === hash) {
        const record = { ...existing, fetchedAt: input.fetchedAt, title: input.title };
        await write(input.url, JSON.stringify(record));
        return { changed: false, firstReading: false, record };
      }
      const record: SnapshotRecord = {
        ...input,
        text,
        hash,
        previous: { hash: existing.hash, text: existing.text, fetchedAt: existing.fetchedAt },
      };
      await write(input.url, JSON.stringify(record));
      return { changed: true, firstReading: false, record };
    },
    async reset(url) {
      await remove(url);
    },
  };
}
