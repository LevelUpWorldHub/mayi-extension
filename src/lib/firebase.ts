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
  HarmBlockThreshold,
  HarmCategory,
  InferenceMode,
  InferenceSource,
  Schema,
  ThinkingLevel,
  type GenerativeModel,
  type InferenceMode as InferenceModeValue,
} from "firebase/ai";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { CLOUD_CHAR_BUDGET, LONG_DOCUMENT_CHARS, ON_DEVICE_CHAR_BUDGET } from "./budgets";
import { groundModelQuote, locateQuote } from "./citation";
import { selectChunks, type RankedExcerpt } from "./chunk";
import { HYBRID_SYSTEM, selectHybridMode, type HybridModeName } from "./hybrid-plan";
import { shouldRetryInCloud } from "./route";
import { classifySentence } from "./extractive";
import { buildAskPrompt } from "./prompts";
import { presetById } from "./presets";
import type { Answer, InferencePath, PolicyDoc, Verdict } from "./types";

const CLOUD_MODEL = "gemini-3.5-flash-lite";
export { CLOUD_CHAR_BUDGET, LONG_DOCUMENT_CHARS, ON_DEVICE_CHAR_BUDGET };

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
let deviceReady = false;
let deviceBroken = false;

const REQUEST = { timeout: 20_000 };

const HARM_CATEGORIES = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
] as const;

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["yes", "no", "conditional", "unknown"] },
    reason: { type: "string" },
    quote: { type: "string" },
    sourceTitle: { type: "string" },
  },
  required: ["verdict", "reason", "quote", "sourceTitle"],
};

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

function toMode(mode: HybridModeName): InferenceModeValue {
  if (mode === "only_on_device") return InferenceMode.ONLY_ON_DEVICE;
  if (mode === "only_in_cloud") return InferenceMode.ONLY_IN_CLOUD;
  if (mode === "prefer_in_cloud") return InferenceMode.PREFER_IN_CLOUD;
  return InferenceMode.PREFER_ON_DEVICE;
}

function modelFor(mode: HybridModeName): GenerativeModel {
  if (!app) throw new Error("Firebase is not configured.");
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return getGenerativeModel(
    ai,
    {
      mode: toMode(mode),
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
          initialPrompts: [{ role: "system", content: [{ type: "text", value: HYBRID_SYSTEM }] }],
        },
        promptOptions: { responseConstraint: RESPONSE_JSON_SCHEMA },
      },
      inCloudParams: {
        model: CLOUD_MODEL,
        systemInstruction: HYBRID_SYSTEM,
        safetySettings: HARM_CATEGORIES.map((category) => ({
          category,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        })),
        generationConfig: {
          maxOutputTokens: 512,
          responseMimeType: "application/json",
          responseSchema: answerSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      },
    },
    REQUEST,
  );
}

export function prepareOnDeviceModel(onProgress?: (value: number) => void): Promise<void> {
  initFirebase();
  if (!app) return Promise.resolve();
  if (!deviceInit) {
    deviceInit = modelFor("prefer_on_device")
      .initializeDeviceModel(onProgress)
      .then(() => {
        deviceReady = true;
        deviceBroken = false;
      })
      .catch((error: unknown) => {
        deviceInit = null;
        deviceReady = false;
        deviceBroken = true;
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

interface ModelRead {
  text: string;
  inference: InferencePath;
  promptTokens: number | null;
  outputTokens: number | null;
}

function readUsage(response: { inferenceSource?: unknown; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }, text: string): ModelRead {
  const usage = response.usageMetadata;
  return {
    text,
    inference: sourceOf(response.inferenceSource),
    promptTokens: typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null,
    outputTokens: typeof usage?.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null,
  };
}

async function readModel(model: GenerativeModel, prompt: string): Promise<ModelRead> {
  try {
    const streaming = await model.generateContentStream(prompt);
    const aggregated = await streaming.response;
    return readUsage(aggregated, aggregated.text());
  } catch {
    const once = await model.generateContent(prompt);
    return readUsage(once.response, once.response.text());
  }
}

async function complete(mode: HybridModeName, prompt: string): Promise<ModelRead & { parsed: ModelJson; mode: HybridModeName }> {
  const model = modelFor(mode);
  let read = await readModel(model, prompt);
  let parsed = parseModelJson(read.text);
  if (!parsed) {
    const chat = model.startChat();
    const first = await chat.sendMessage(prompt);
    read = readUsage(first.response, first.response.text());
    parsed = parseModelJson(read.text);
    if (!parsed) {
      const repair = await chat.sendMessage("The previous reply was not the JSON object. Return only that JSON.");
      read = readUsage(repair.response, repair.response.text());
      parsed = parseModelJson(read.text);
    }
    await chat.getHistory().catch(() => []);
  }
  if (!parsed) throw new Error("The model did not return the expected JSON.");
  return { ...read, parsed, mode };
}

async function generate(mode: HybridModeName, prompt: string): Promise<ModelRead & { parsed: ModelJson; mode: HybridModeName }> {
  try {
    return await complete(mode, prompt);
  } catch (error) {
    if (mode !== "only_on_device") throw error;
    deviceReady = false;
    deviceBroken = true;
    deviceInit = null;
    return complete("prefer_in_cloud", prompt);
  }
}

function cite(
  parsed: ModelJson,
  docs: PolicyDoc[],
  excerpts: RankedExcerpt[],
): { doc: PolicyDoc | null; quote: string | null } {
  const grounded = groundModelQuote(excerpts, docs, parsed.quote, parsed.sourceTitle);
  if (!grounded.quote) return { doc: null, quote: null };
  const doc = docs.find((item) => item.url === grounded.url) ?? null;
  return { doc, quote: grounded.quote };
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
  const onDeviceExcerpts = selectChunks(options.docs, options.question, ON_DEVICE_CHAR_BUDGET);
  const onDevicePrompt = buildAskPrompt(options.question, onDeviceExcerpts);
  let countedTokens: number | null = null;
  try {
    countedTokens = (await modelFor("only_in_cloud").countTokens(onDevicePrompt)).totalTokens;
  } catch {
    countedTokens = null;
  }
  const choice = selectHybridMode({
    deviceReady,
    deviceBroken,
    promptTokens: countedTokens,
    forceCloud: false,
  });
  let excerpts = onDeviceExcerpts;
  let first = await generate(choice.mode, onDevicePrompt);
  let parsed = first.parsed;
  let inference = first.inference;
  let mode: HybridModeName = first.mode;
  let detail = choice.reason;
  if (inference === "on_device" && long) {
    detail = `${detail} Nano read an excerpt picked on this device.`;
  }
  if (inference === "unreported") {
    detail = `${detail} Firebase did not report whether Nano or the cloud ran it.`;
  }

  let cited = cite(parsed, options.docs, excerpts);
  const retry = shouldRetryInCloud({
    totalChars: total,
    onDeviceExcerpt: onDeviceExcerpts.map((excerpt) => excerpt.text).join("\n"),
    quote: cited.quote,
    verdict: parsed.verdict,
  });
  if (retry) {
    excerpts = selectChunks(options.docs, options.question, CLOUD_CHAR_BUDGET);
    const cloudChoice = selectHybridMode({
      deviceReady,
      deviceBroken,
      promptTokens: countedTokens,
      forceCloud: true,
    });
    first = await generate(cloudChoice.mode, buildAskPrompt(options.question, excerpts));
    parsed = first.parsed;
    inference = "cloud";
    mode = first.mode;
    cited = cite(parsed, options.docs, excerpts);
    detail = cloudChoice.reason;
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
    inferenceDetail: tokenDetail(detail, countedTokens, first.outputTokens),
    promptTokens: countedTokens ?? first.promptTokens,
    outputTokens: first.outputTokens,
    hybridMode: mode,
  };
}

function tokenDetail(detail: string, promptTokens: number | null, outputTokens: number | null): string {
  const parts = [detail];
  if (promptTokens !== null) parts.push(`Prompt: ${promptTokens} tokens.`);
  if (outputTokens !== null) parts.push(`Reply: ${outputTokens} tokens.`);
  return parts.join(" ");
}
