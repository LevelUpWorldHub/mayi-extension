import type { PolicyKind, QuestionTone, Verdict } from "./types";

export interface Intent {
  id: string;
  question: string;
  short: string;
  tone: QuestionTone;
  order: "conditional-first" | "deny-first" | "risk-yes-first";
  anchors: string[];
  deny: RegExp[];
  allow: RegExp[];
  conditional: RegExp[];
  kindBoost: Partial<Record<PolicyKind, number>>;
  reasons: { verdict: Verdict; test: RegExp; text: string }[];
  fallback: Record<Verdict, string>;
}

const doc = "{doc}";

export const PRESETS: Intent[] = [
  {
    id: "scrape",
    question: "May I scrape this?",
    short: "Scrape",
    tone: "permission",
    order: "conditional-first",
    anchors: ["scrap", "crawl", "harvest", "automated", "spider", "bulk-download"],
    deny: [
      /may not scrape/i,
      /must not scrape/i,
      /do not scrape/i,
      /may not crawl/i,
      /no scraping/i,
      /prohibit(?:s|ed)? automated/i,
      /may not[^.!?]{0,80}automated means/i,
    ],
    allow: [/you may scrape/i, /scraping is permitted/i, /you may crawl/i, /automated access is allowed/i],
    conditional: [
      /may scrape[\s\S]{0,120}provided/i,
      /except through the documented api/i,
      /only with[\s\S]{0,40}consent/i,
      /written consent/i,
    ],
    kindBoost: { terms: 2, license: 1, privacy: 0 },
    reasons: [
      {
        verdict: "no",
        test: /may not scrape|automated means/i,
        text: "The terms forbid scraping and other automated collection.",
      },
      {
        verdict: "conditional",
        test: /documented api/i,
        text: "Scraping the site is refused, except through the documented API and its limits.",
      },
      {
        verdict: "conditional",
        test: /provided/i,
        text: "Scraping is allowed only for the use the clause describes, and only if you meet that condition.",
      },
      {
        verdict: "yes",
        test: /you may scrape/i,
        text: "The terms say you may scrape these pages.",
      },
    ],
    fallback: {
      yes: `The ${doc} allows automated collection.`,
      no: `The ${doc} forbids automated collection.`,
      conditional: `The ${doc} allows scraping only in some cases.`,
      unknown: `MayI couldn't find a clause about scraping.`,
    },
  },
  {
    id: "train",
    question: "May I train AI on it?",
    short: "Train AI",
    tone: "permission",
    order: "conditional-first",
    anchors: ["train", "fine-tune", "machine-learning", "artificial intelligence", "language model", "foundation model"],
    deny: [
      /may not use[\s\S]{0,120}train/i,
      /may not train/i,
      /must not train/i,
      /do not train/i,
      /not permission to train/i,
      /no training/i,
    ],
    allow: [/you may train/i, /training is permitted/i, /may be used to train/i],
    conditional: [/you may train[\s\S]{0,140}if you/i, /with attribution/i, /give credit/i],
    kindBoost: { terms: 2, license: 2, privacy: 0 },
    reasons: [
      {
        verdict: "no",
        test: /may not/i,
        text: "The terms forbid using this material to train or evaluate a model.",
      },
      {
        verdict: "conditional",
        test: /credit|attribution/i,
        text: "You may train on it only if you credit the source and link the original.",
      },
    ],
    fallback: {
      yes: `The ${doc} allows model training.`,
      no: `The ${doc} forbids model training.`,
      conditional: `The ${doc} allows training only with a condition.`,
      unknown: `MayI couldn't find a clause about AI training.`,
    },
  },
  {
    id: "commercial",
    question: "May I use it commercially?",
    short: "Commercial",
    tone: "permission",
    order: "conditional-first",
    anchors: ["commercial", "resell", "sublicense", "exploit"],
    deny: [/may not resell/i, /no commercial use/i, /commercially exploit/i, /may not use[\s\S]{0,40}commercial/i],
    allow: [/commercial use is (?:allowed|permitted|free)/i, /you may use[\s\S]{0,80}commercial/i],
    conditional: [/without a written license/i, /separate written license/i, /internal commercial/i],
    kindBoost: { terms: 2, license: 3, privacy: 0 },
    reasons: [
      {
        verdict: "no",
        test: /commercially exploit|no commercial/i,
        text: "Commercial use needs a license the terms do not give you.",
      },
      {
        verdict: "conditional",
        test: /written license/i,
        text: "Commercial use is off the table unless they give you a written license.",
      },
      {
        verdict: "conditional",
        test: /internal commercial/i,
        text: "You may use it in your own business, and you may not resell the service itself.",
      },
      {
        verdict: "yes",
        test: /you may use/i,
        text: "The terms allow this kind of commercial use.",
      },
    ],
    fallback: {
      yes: `The ${doc} allows commercial use.`,
      no: `The ${doc} does not allow commercial use.`,
      conditional: `Commercial use depends on a condition in the ${doc}.`,
      unknown: `MayI couldn't find a clause about commercial use.`,
    },
  },
  {
    id: "screenshots",
    question: "May I share screenshots?",
    short: "Screenshots",
    tone: "permission",
    order: "conditional-first",
    anchors: ["screenshot", "screen recording", "screen recordings"],
    deny: [/may not publish screenshots/i, /may not share screenshots/i, /no screenshots/i],
    allow: [/you may share screenshots/i],
    conditional: [/screenshot[\s\S]{0,100}provided/i, /as long as/i, /prior written consent/i],
    kindBoost: { terms: 2, license: 2, privacy: 0 },
    reasons: [
      {
        verdict: "conditional",
        test: /provided you credit/i,
        text: "A screenshot is fine for commentary or news if you credit them and link the page.",
      },
      {
        verdict: "conditional",
        test: /written consent/i,
        text: "You need their written permission before you publish a screenshot.",
      },
      {
        verdict: "no",
        test: /may not publish screenshots/i,
        text: "The terms forbid publishing screenshots.",
      },
      {
        verdict: "yes",
        test: /you may share screenshots/i,
        text: "The terms say you may share screenshots.",
      },
    ],
    fallback: {
      yes: `The ${doc} allows sharing screenshots.`,
      no: `The ${doc} forbids sharing screenshots.`,
      conditional: `Screenshots are allowed only with a condition in the ${doc}.`,
      unknown: `MayI couldn't find a clause about screenshots.`,
    },
  },
  {
    id: "cancel",
    question: "May I cancel anytime?",
    short: "Cancel",
    tone: "permission",
    order: "deny-first",
    anchors: ["cancel", "cancellation"],
    deny: [
      /may not cancel/i,
      /cannot cancel/i,
      /certified mail/i,
      /at least (?:thirty|30) days/i,
      /days before the renewal/i,
    ],
    allow: [/cancel (?:at )?any ?time/i, /cancel whenever/i, /cancel online at any time/i],
    conditional: [/you may cancel in (?:your|the) account/i],
    kindBoost: { terms: 3, privacy: 0, license: 0 },
    reasons: [
      {
        verdict: "no",
        test: /certified mail/i,
        text: "You cannot cancel in the product. They accept cancellation only by certified mail.",
      },
      {
        verdict: "no",
        test: /phone|thirty days|30 days/i,
        text: "Not whenever you want. Cancellation has to be by phone, at least 30 days before renewal.",
      },
      {
        verdict: "yes",
        test: /any ?time|whenever/i,
        text: "You can cancel whenever you want.",
      },
    ],
    fallback: {
      yes: `The ${doc} lets you cancel freely.`,
      no: `The ${doc} does not let you cancel whenever you want.`,
      conditional: `Cancellation has a condition in the ${doc}.`,
      unknown: `MayI couldn't find a cancellation clause. There may be nothing to cancel.`,
    },
  },
  {
    id: "sell",
    question: "Do they sell my data?",
    short: "Sell data",
    tone: "risk",
    order: "risk-yes-first",
    anchors: ["sell", "data broker", "personal information", "usage data"],
    deny: [/do not sell personal/i, /does not sell personal/i, /we never sell/i, /we do not sell/i],
    allow: [
      /we may sell your personal/i,
      /sell your personal information/i,
      /may sell aggregated and individual/i,
      /sale of personal/i,
    ],
    conditional: [/we may sell[\s\S]{0,80}if you opt/i],
    kindBoost: { privacy: 3, terms: 1, license: 0 },
    reasons: [
      {
        verdict: "yes",
        test: /data brokers|advertising networks/i,
        text: "Yes. They say they may sell personal information, including location, to data brokers.",
      },
      {
        verdict: "yes",
        test: /analytics partners|usage data/i,
        text: "Yes. They say they may sell customer usage data to partners and affiliates.",
      },
      {
        verdict: "no",
        test: /do not sell|does not sell/i,
        text: "They say they do not sell personal information.",
      },
    ],
    fallback: {
      yes: `The ${doc} says they may sell personal information.`,
      no: `The ${doc} says they do not sell personal information.`,
      conditional: `A sale of data depends on a condition in the ${doc}.`,
      unknown: `MayI couldn't find a clause about selling personal information.`,
    },
  },
  {
    id: "arbitration",
    question: "Is there forced arbitration?",
    short: "Arbitration",
    tone: "risk",
    order: "risk-yes-first",
    anchors: ["arbitrat", "jury", "class action", "class proceeding"],
    deny: [/do not require arbitration/i, /does not require arbitration/i, /not require arbitration/i],
    allow: [
      /binding individual arbitration/i,
      /resolved by binding arbitration/i,
      /shall be resolved by binding arbitration/i,
      /agree that any dispute will be resolved by binding/i,
    ],
    conditional: [/opt out of arbitration/i],
    kindBoost: { terms: 3, privacy: 1, license: 0 },
    reasons: [
      {
        verdict: "yes",
        test: /class action|class proceeding|jury/i,
        text: "Yes. Disputes go to binding arbitration, and you waive court and class claims.",
      },
      {
        verdict: "no",
        test: /do not require|does not require/i,
        text: "No. The terms do not require arbitration, so a claim can go to court.",
      },
    ],
    fallback: {
      yes: `The ${doc} requires arbitration.`,
      no: `The ${doc} does not require arbitration.`,
      conditional: `Arbitration applies unless you use the opt-out in the ${doc}.`,
      unknown: `MayI couldn't find an arbitration clause.`,
    },
  },
  {
    id: "renew",
    question: "Is there auto-renewal?",
    short: "Auto-renewal",
    tone: "risk",
    order: "risk-yes-first",
    anchors: ["renew", "subscription", "membership"],
    deny: [/nothing renews automatically/i, /does not auto-renew/i, /no automatic renewal/i, /does not charge a subscription/i],
    allow: [/renews automatically/i, /will renew automatically/i, /automatic renewal/i, /auto-renew/i],
    conditional: [],
    kindBoost: { terms: 3, privacy: 0, license: 0 },
    reasons: [
      {
        verdict: "yes",
        test: /renews automatically/i,
        text: "Yes. The plan renews on its own unless you cancel in time.",
      },
      {
        verdict: "no",
        test: /nothing renews|does not charge a subscription/i,
        text: "Nothing here renews automatically.",
      },
    ],
    fallback: {
      yes: `The ${doc} renews the plan automatically.`,
      no: `The ${doc} does not describe an automatic renewal.`,
      conditional: `Renewal depends on a condition in the ${doc}.`,
      unknown: `MayI couldn't find an automatic-renewal clause.`,
    },
  },
];

export function presetById(id: string | null | undefined): Intent | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

export function presetForQuestion(question: string): Intent | undefined {
  const folded = question.trim().toLowerCase();
  return PRESETS.find((preset) => preset.question.toLowerCase() === folded);
}
