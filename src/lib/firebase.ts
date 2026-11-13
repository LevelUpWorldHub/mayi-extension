import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheckToken,
} from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
  type GenerativeModel,
} from "firebase/ai";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { locateQuote } from "./citation";
import { selectChunks, type RankedExcerpt } from "./chunk";
import { classifySentence } from "./extractive";
import { buildAskPrompt } from "./prompts";
import { presetById } from "./presets";
import type { Answer, InferencePath, PolicyDoc, Verdict } from "./types";

const CLOUD_MODEL = "gemini-3.5-flash-lite";
export const ON_DEVICE_CHAR_BUDGET = 6_000;
export const CLOUD_CHAR_BUDGET = 18_000;
export const LONG_DOCUMENT_CHARS = 12_000;

export type AppCheckMode = "recaptcha-enterprise" | "debug" | "extension-bridge" | "not-configured";

export interface FirebaseStatus {
  configured: boolean;
  appCheck: AppCheckMode;
  cloudModel: string;
}

const globals = globalThis as typeof globalThis & {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
};

let app: FirebaseApp | null = null;
let status: FirebaseStatus = {
  configured: false,
  appCheck: "not-configured",
  cloudModel: CLOUD_MODEL,
};
let deviceInit: Promise<void> | null = null;

const answerSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({
      enum: ["yes", "no", "conditional", "unknown"],
      description: "What the excerpts support.",
    }),
    reason: Schema.string({ description: "One plain-English sentence. Do not start with Yes or No." }),
    quote: Schema.string({ description: "Exact contiguous substring from one excerpt, or empty." }),
    sourceTitle: Schema.string({ description: "Title of the excerpt the quote came from." }),
  },
});

function env(name: keyof ImportMetaEnv): string {
  return (import.meta.env[name] ?? "").trim();
}

export function firebaseConfigPresent(): boolean {
  return Boolean(env("VITE_FIREBASE_API_KEY") && env("VITE_FIREBASE_PROJECT_ID") && env("VITE_FIREBASE_APP_ID"));
}

export function getFirebaseStatus(): FirebaseStatus {
  return status;
}

function inExtensionPage(): boolean {
  return typeof location !== "undefined" && location.protocol === "chrome-extension:";
}

async function ensureOffscreen(): Promise<void> {
  if (!chrome.offscreen) throw new Error("This Chrome build cannot open an offscreen document.");
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.IFRAME_SCRIPTING],
    justification:
      "Run the Firebase App Check reCAPTCHA Enterprise bridge, because Manifest V3 pages cannot load remote scripts.",
  });
}

async function requestBridgeToken(): Promise<AppCheckToken> {
  await ensureOffscreen();
  let lastError = "App Check bridge did not return a token.";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = (await chrome.runtime.sendMessage({ type: "APP_CHECK_TOKEN" })) as
      | { token?: string; expireTimeMillis?: number; error?: string }
      | undefined;
    if (response?.token && response.expireTimeMillis) {
      return { token: response.token, expireTimeMillis: response.expireTimeMillis };
    }
    if (response?.error) lastError = response.error;
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw new Error(lastError);
}

export function initFirebase(): FirebaseStatus {
  if (!firebaseConfigPresent()) {
    status = { configured: false, appCheck: "not-configured", cloudModel: CLOUD_MODEL };
    return status;
  }
  if (app) return status;

  const debug = env("VITE_FIREBASE_APPCHECK_DEBUG_TOKEN");
  if (debug) globals.FIREBASE_APPCHECK_DEBUG_TOKEN = debug === "true" ? true : debug;

  app = getApps()[0] ?? initializeApp({
    apiKey: env("VITE_FIREBASE_API_KEY"),
    authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: env("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: env("VITE_FIREBASE_APP_ID"),
  });

  const siteKey = env("VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY");
  const bridge = env("VITE_APPCHECK_BRIDGE_URL");
  let appCheck: AppCheckMode = "not-configured";

  if (inExtensionPage() && bridge && !debug) {
    initializeAppCheck(app, {
      provider: new CustomProvider({ getToken: requestBridgeToken }),
      isTokenAutoRefreshEnabled: true,
    });
    appCheck = "extension-bridge";
  } else if (siteKey || debug) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey || "debug-placeholder"),
      isTokenAutoRefreshEnabled: true,
    });
    appCheck = debug ? "debug" : "recaptcha-enterprise";
  }

  status = { configured: true, appCheck, cloudModel: CLOUD_MODEL };
  return status;
}

function modelFor(mode: (typeof InferenceMode)[keyof typeof InferenceMode]): GenerativeModel {
  if (!app) throw new Error("Firebase is not configured.");
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    mode,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        responseSchema: answerSchema,
      },
    },
  });
}

export function prepareOnDeviceModel(onProgress?: (value: number) => void): Promise<void> {
  initFirebase();
  if (!app) return Promise.resolve();
  if (!deviceInit) {
    deviceInit = modelFor(InferenceMode.PREFER_ON_DEVICE)
      .initializeDeviceModel(onProgress)
      .catch((error: unknown) => {
        deviceInit = null;
        throw error;
      });
  }
  return deviceInit;
}

interface ModelJson {
  verdict: Verdict;
  reason: string;
  quote: string;
  sourceTitle: string;
}

function parseModelJson(text: string): ModelJson | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const value = JSON.parse(trimmed) as Partial<ModelJson>;
    const verdict = value.verdict;
    if (verdict !== "yes" && verdict !== "no" && verdict !== "conditional" && verdict !== "unknown") return null;
    return {
      verdict,
      reason: typeof value.reason === "string" ? value.reason.trim() : "",
      quote: typeof value.quote === "string" ? value.quote.trim() : "",
      sourceTitle: typeof value.sourceTitle === "string" ? value.sourceTitle.trim() : "",
    };
  } catch {
    return null;
  }
}

function sourceOf(value: unknown): InferencePath {
  if (value === InferenceSource.ON_DEVICE) return "on_device";
  if (value === InferenceSource.IN_CLOUD) return "cloud";
  return "unreported";
}

async function generate(
  mode: (typeof InferenceMode)[keyof typeof InferenceMode],
  question: string,
  excerpts: RankedExcerpt[],
): Promise<{ parsed: ModelJson; inference: InferencePath }> {
  const result = await modelFor(mode).generateContent(buildAskPrompt(question, excerpts));
  const parsed = parseModelJson(result.response.text());
  if (!parsed) throw new Error("The model did not return the expected JSON.");
  return { parsed, inference: sourceOf(result.response.inferenceSource) };
}

function cite(parsed: ModelJson, docs: PolicyDoc[]): { doc: PolicyDoc | null; quote: string | null } {
  if (!parsed.quote) return { doc: null, quote: null };
  const ordered = [
    ...docs.filter((doc) => doc.title === parsed.sourceTitle),
    ...docs.filter((doc) => doc.title !== parsed.sourceTitle),
  ];
  for (const doc of ordered) {
    const located = locateQuote(doc.text, parsed.quote);
    if (located.method === "none") continue;
    return { doc, quote: located.matched };
  }
  return { doc: null, quote: null };
}

export async function askFirebase(options: {
  question: string;
  presetId: string | null;
  docs: PolicyDoc[];
  tone: Answer["tone"];
}): Promise<Answer> {
  initFirebase();
  if (!status.configured) throw new Error("Firebase is not configured.");
  const total = options.docs.reduce((sum, doc) => sum + doc.text.length, 0);
  const long = total > LONG_DOCUMENT_CHARS;
  const first = await generate(
    InferenceMode.PREFER_ON_DEVICE,
    options.question,
    selectChunks(options.docs, options.question, ON_DEVICE_CHAR_BUDGET),
  );
  let parsed = first.parsed;
  let inference = first.inference;
  let detail =
    inference === "on_device"
      ? long
        ? "On-device — Gemini Nano read an excerpt picked on this device so the prompt fits Nano."
        : "On-device — Gemini Nano."
      : inference === "cloud"
        ? long
          ? "Cloud — the policy is long enough that Firebase used the cloud model."
          : "Cloud — Gemini Nano isn't available in this browser, so Firebase used the cloud model."
        : "Firebase answered, and did not say whether Nano or the cloud ran it.";

  let cited = cite(parsed, options.docs);
  if (long && (!cited.quote || parsed.verdict === "unknown")) {
    const second = await generate(
      InferenceMode.ONLY_IN_CLOUD,
      options.question,
      selectChunks(options.docs, options.question, CLOUD_CHAR_BUDGET),
    );
    parsed = second.parsed;
    inference = "cloud";
    cited = cite(parsed, options.docs);
    detail = "Cloud — labeled because the on-device excerpt did not contain a clause MayI could cite, and the policy is long.";
  }

  const intent = presetById(options.presetId);
  let verdict = parsed.verdict;
  let reason = parsed.reason || "MayI couldn't phrase a reason from the clause.";
  if (!cited.quote || !cited.doc) {
    verdict = "unknown";
    reason = "The model named a clause that is not on the page, so MayI will not use that answer.";
  } else if (intent) {
    const classified = classifySentence(intent, cited.quote);
    if (classified && classified !== verdict) {
      verdict = classified;
      reason = "The verdict follows the quoted clause.";
    }
  }

  const citation = cited.doc && cited.quote ? locateQuote(cited.doc.text, cited.quote) : null;
  return {
    id: crypto.randomUUID(),
    question: options.question,
    presetId: options.presetId,
    tone: options.tone,
    verdict,
    reason,
    quote: cited.quote,
    sourceUrl: cited.doc?.url ?? null,
    sourceTitle: cited.doc?.title ?? null,
    citation: citation && citation.method !== "none" ? citation : null,
    inference,
    inferenceDetail: detail,
  };
}
