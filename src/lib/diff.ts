import { splitSentences } from "./sentences";

export interface PolicyDiff {
  added: string[];
  removed: string[];
  summary: string;
  topics: { topic: string; change: "added" | "removed"; sentence: string }[];
}

const TOPICS: { id: string; re: RegExp }[] = [
  { id: "selling personal information", re: /sell (?:your |aggregated |personal )|data broker/i },
  { id: "arbitration", re: /arbitrat/i },
  { id: "automatic renewal", re: /renews automatically|auto-renew|automatic renewal/i },
  { id: "cancellation", re: /cancel/i },
  { id: "AI training", re: /\btrain\b|machine-learning|artificial intelligence/i },
  { id: "scraping", re: /scrap|crawl|automated means/i },
  { id: "screenshots", re: /screenshot/i },
];

function normalize(sentence: string): string {
  return sentence.toLowerCase().replace(/\s+/g, " ").trim();
}

function list(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function diffPolicies(before: string, after: string): PolicyDiff {
  const previous = splitSentences(before);
  const next = splitSentences(after);
  const previousSet = new Set(previous.map((sentence) => normalize(sentence.text)));
  const nextSet = new Set(next.map((sentence) => normalize(sentence.text)));
  const added = next.filter((sentence) => !previousSet.has(normalize(sentence.text))).map((sentence) => sentence.text);
  const removed = previous.filter((sentence) => !nextSet.has(normalize(sentence.text))).map((sentence) => sentence.text);
  const topics = [
    ...added.flatMap((sentence) =>
      TOPICS.filter((topic) => topic.re.test(sentence)).map((topic) => ({
        topic: topic.id,
        change: "added" as const,
        sentence,
      })),
    ),
    ...removed.flatMap((sentence) =>
      TOPICS.filter((topic) => topic.re.test(sentence)).map((topic) => ({
        topic: topic.id,
        change: "removed" as const,
        sentence,
      })),
    ),
  ];

  if (!added.length && !removed.length) {
    return {
      added,
      removed,
      topics,
      summary: "The wording is the same as the last copy stored on this device.",
    };
  }

  const addedTopics = [...new Set(topics.filter((topic) => topic.change === "added").map((topic) => topic.topic))];
  const removedTopics = [...new Set(topics.filter((topic) => topic.change === "removed").map((topic) => topic.topic))];
  const parts: string[] = [];
  if (addedTopics.length) parts.push(`They added language about ${list(addedTopics)}.`);
  if (removedTopics.length) parts.push(`They removed language about ${list(removedTopics)}.`);
  if (!parts.length) {
    parts.push(
      `The wording changed in ${added.length + removed.length} sentence${added.length + removed.length === 1 ? "" : "s"}, outside the topics MayI watches.`,
    );
  } else {
    parts.push(`${added.length} sentence${added.length === 1 ? "" : "s"} added, ${removed.length} removed.`);
  }
  return { added, removed, topics, summary: parts.join(" ") };
}
