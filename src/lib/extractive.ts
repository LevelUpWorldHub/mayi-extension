import { locateQuote } from "./citation";
import type { Intent } from "./presets";
import { PRESETS, presetById, presetForQuestion } from "./presets";
import { splitSentences } from "./sentences";
import type { Answer, PolicyDoc, PolicyKind, QuestionTone, Verdict } from "./types";

function matches(patterns: RegExp[], sentence: string): boolean {
  return patterns.some((pattern) => pattern.test(sentence));
}

export function classifySentence(intent: Intent, sentence: string): Verdict | null {
  const hit = {
    deny: matches(intent.deny, sentence),
    allow: matches(intent.allow, sentence),
    conditional: matches(intent.conditional, sentence),
  };
  if (!hit.deny && !hit.allow && !hit.conditional) return null;
  if (intent.order === "risk-yes-first") {
    if (hit.allow) return "yes";
    if (hit.conditional) return "conditional";
    if (hit.deny) return "no";
  }
  if (intent.order === "deny-first") {
    if (hit.deny) return "no";
    if (hit.conditional) return "conditional";
    if (hit.allow) return "yes";
  }
  if (hit.conditional) return "conditional";
  if (hit.deny) return "no";
  if (hit.allow) return "yes";
  return null;
}

function scoreSentence(intent: Intent, sentence: string, kind: PolicyKind): number {
  const lower = sentence.toLowerCase();
  let score = intent.kindBoost[kind] ?? 0;
  for (const anchor of intent.anchors) {
    if (lower.includes(anchor)) score += 3;
  }
  if (matches(intent.deny, sentence) || matches(intent.allow, sentence) || matches(intent.conditional, sentence)) {
    score += 5;
  }
  if (sentence.length < 40) score -= 3;
  return score;
}

function reasonFor(intent: Intent, verdict: Verdict, sentence: string, title: string): string {
  const specific = intent.reasons.find((reason) => reason.verdict === verdict && reason.test.test(sentence));
  const template = specific?.text ?? intent.fallback[verdict];
  return template.replaceAll("{doc}", title);
}

function combine(intent: Intent, ranked: { verdict: Verdict }[]): Verdict {
  const verdicts = ranked.map((item) => item.verdict);
  const unique = new Set(verdicts);
  if (unique.size <= 1) return verdicts[0] ?? "unknown";
  if (intent.order === "deny-first" && unique.has("no")) return "no";
  if (intent.order === "risk-yes-first" && unique.has("yes")) return "yes";
  if (unique.has("yes") && unique.has("no")) return "conditional";
  if (unique.has("conditional")) return "conditional";
  return verdicts[0] ?? "unknown";
}

export function answerWithIntent(intent: Intent, docs: PolicyDoc[], inferenceDetail: string): Answer {
  const ranked = docs
    .flatMap((doc) =>
      splitSentences(doc.text).map((sentence) => ({
        ...sentence,
        doc,
        score: scoreSentence(intent, sentence.text, doc.kind),
        verdict: classifySentence(intent, sentence.text),
      })),
    )
    .filter((item) => item.score >= 5 && item.verdict)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  const top = ranked[0];
  if (!top || !top.verdict) {
    return {
      id: crypto.randomUUID(),
      question: intent.question,
      presetId: intent.id,
      tone: intent.tone,
      verdict: "unknown",
      reason: intent.fallback.unknown.replaceAll("{doc}", "pages"),
      quote: null,
      sourceUrl: null,
      sourceTitle: null,
      citation: null,
      inference: "extractive",
      inferenceDetail,
    };
  }

  const verdict = combine(
    intent,
    ranked.flatMap((item) => (item.verdict ? [{ verdict: item.verdict }] : [])),
  );
  const sameVerdict = ranked.filter((item) => item.verdict === verdict);
  const supporting = sameVerdict.find((item) => item.text.length <= 320) ?? sameVerdict[0] ?? top;
  const citation = locateQuote(supporting.doc.text, supporting.text);
  return {
    id: crypto.randomUUID(),
    question: intent.question,
    presetId: intent.id,
    tone: intent.tone,
    verdict,
    reason: reasonFor(intent, verdict, supporting.text, supporting.doc.title),
    quote: citation.method === "none" ? supporting.text : citation.matched,
    sourceUrl: supporting.doc.url,
    sourceTitle: supporting.doc.title,
    citation: citation.method === "none" ? null : citation,
    inference: "extractive",
    inferenceDetail,
  };
}

const FREEFORM_CONDITIONAL = /provided that|as long as|only if|unless |subject to|written consent|except /i;
const FREEFORM_DENY = /may not|must not|shall not|do not|don't|prohibited|forbidden|not permitted|cannot/i;
const FREEFORM_ALLOW = /you may|you can|is permitted|is allowed|we allow/i;

export function answerFreeform(question: string, docs: PolicyDoc[], inferenceDetail: string): Answer {
  const preset = presetForQuestion(question);
  if (preset) return answerWithIntent(preset, docs, inferenceDetail);
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !["may", "this", "that", "with", "from", "they", "your", "have", "does"].includes(word));
  const ranked = docs
    .flatMap((doc) =>
      splitSentences(doc.text).map((sentence) => {
        const lower = sentence.text.toLowerCase();
        const hits = words.filter((word) => lower.includes(word)).length;
        return { ...sentence, doc, hits };
      }),
    )
    .filter((item) => item.hits > 0)
    .sort((left, right) => right.hits - left.hits || right.text.length - left.text.length);

  const best = ranked[0];
  const tone: QuestionTone = "permission";
  if (!best) {
    return {
      id: crypto.randomUUID(),
      question,
      presetId: null,
      tone,
      verdict: "unknown",
      reason: "MayI couldn't find a clause that answers this.",
      quote: null,
      sourceUrl: null,
      sourceTitle: null,
      citation: null,
      inference: "extractive",
      inferenceDetail,
    };
  }
  let verdict: Verdict = "unknown";
  if (FREEFORM_CONDITIONAL.test(best.text)) verdict = "conditional";
  else if (FREEFORM_DENY.test(best.text)) verdict = "no";
  else if (FREEFORM_ALLOW.test(best.text)) verdict = "yes";
  const citation = locateQuote(best.doc.text, best.text);
  const reason =
    verdict === "yes"
      ? `The ${best.doc.title} looks like it allows this.`
      : verdict === "no"
        ? `The ${best.doc.title} looks like it doesn't allow this.`
        : verdict === "conditional"
          ? `The ${best.doc.title} allows this only with a condition.`
          : `The closest clause is in the ${best.doc.title}, and it does not say clearly.`;
  return {
    id: crypto.randomUUID(),
    question,
    presetId: null,
    tone,
    verdict,
    reason,
    quote: citation.method === "none" ? best.text : citation.matched,
    sourceUrl: best.doc.url,
    sourceTitle: best.doc.title,
    citation: citation.method === "none" ? null : citation,
    inference: "extractive",
    inferenceDetail,
  };
}

export function answerExtractive(question: string, docs: PolicyDoc[], presetId?: string | null): Answer {
  const detail = "Local reading — clause matcher on this device. Add Firebase config for Gemini Nano.";
  const intent = presetById(presetId) ?? presetForQuestion(question);
  if (intent) return { ...answerWithIntent(intent, docs, detail), question };
  return answerFreeform(question, docs, detail);
}

export function answerAllExtractive(docs: PolicyDoc[]): Answer[] {
  return PRESETS.map((preset) => answerExtractive(preset.question, docs, preset.id));
}
