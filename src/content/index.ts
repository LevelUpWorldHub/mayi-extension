import { highlightQuote } from "../lib/highlight-dom";
import { extractLinks, extractMeta } from "../lib/html";
import { sameExtension } from "../lib/security";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sameExtension(sender.id, chrome.runtime.id)) return;
  if (message?.type === "MAYI_EXTRACT") {
    const html = document.documentElement?.innerHTML ?? "";
    const meta = extractMeta(html);
    sendResponse({
      url: location.href,
      title: meta.title ?? document.title,
      links: extractLinks(html, location.href).slice(0, 80),
      metaRobots: meta.metaRobots,
      tdmReservation: meta.tdmReservation,
      tdmPolicy: meta.tdmPolicy,
    });
    return;
  }
  if (message?.type === "MAYI_HIGHLIGHT") {
    sendResponse({ ok: highlightQuote(document, String(message.quote ?? "")) });
  }
});
