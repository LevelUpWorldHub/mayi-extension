import { isAllowedBridgeUrl, sameExtension } from "../lib/security";

const bridgeUrl = (import.meta.env.VITE_APPCHECK_BRIDGE_URL ?? "").trim();

let frame: HTMLIFrameElement | null = null;
let ready: Promise<void> | null = null;

function ensureFrame(): Promise<void> {
  if (!bridgeUrl) return Promise.reject(new Error("VITE_APPCHECK_BRIDGE_URL is not set."));
  if (!isAllowedBridgeUrl(bridgeUrl)) {
    return Promise.reject(new Error("App Check bridge must be an https Firebase Hosting URL."));
  }
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    const origin = new URL(bridgeUrl).origin;
    const timeout = window.setTimeout(() => reject(new Error("App Check bridge timed out.")), 20000);
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin || event.source !== iframe.contentWindow) return;
      if (event.data?.source !== "mayi-app-check-ready") return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve();
    }
    window.addEventListener("message", onMessage);
    iframe.src = bridgeUrl;
    document.body.appendChild(iframe);
    frame = iframe;
  });
  ready = ready.catch((error: unknown) => {
    ready = null;
    throw error;
  });
  return ready;
}

function requestToken(): Promise<{ token: string; expireTimeMillis: number }> {
  const iframe = frame;
  const bridgeWindow = iframe?.contentWindow;
  if (!iframe || !bridgeWindow) return Promise.reject(new Error("App Check bridge is not loaded."));
  const origin = new URL(bridgeUrl).origin;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("App Check bridge did not return a token."));
    }, 20000);
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin || event.source !== bridgeWindow || event.data?.source !== "mayi-app-check") return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!event.data.token) {
        reject(new Error(typeof event.data.error === "string" ? event.data.error : "Empty App Check token."));
        return;
      }
      resolve({ token: String(event.data.token), expireTimeMillis: Number(event.data.expireTimeMillis) });
    }
    window.addEventListener("message", onMessage);
    iframe.contentWindow?.postMessage({ source: "mayi-app-check-request" }, origin);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sameExtension(sender.id, chrome.runtime.id)) return;
  if (message?.type !== "APP_CHECK_TOKEN") return;
  void ensureFrame()
    .then(() => requestToken())
    .then((token) => sendResponse(token))
    .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : "App Check failed." }));
  return true;
});
