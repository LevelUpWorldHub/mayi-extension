chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "MAYI_OPEN_CLAUSE") return;
  void openClause(String(message.url ?? ""), String(message.quote ?? "")).then(
    (ok) => sendResponse({ ok }),
    (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Couldn't open the clause." }),
  );
  return true;
});

function waitForComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 8000);
    function listener(updatedId: number, info: { status?: string }) {
      if (updatedId === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function highlight(tabId: number, quote: string): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "MAYI_HIGHLIGHT", quote });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "MAYI_HIGHLIGHT", quote });
  }
}

async function openClause(url: string, quote: string): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !url) return false;
  await chrome.tabs.update(tab.id, { url });
  await waitForComplete(tab.id);
  await highlight(tab.id, quote);
  return true;
}
