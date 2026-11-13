import { locateQuote } from "./citation";

const STYLE_ID = "mayi-highlight-style";

export function highlightQuote(doc: Document, quote: string): boolean {
  const head = doc.head ?? doc.documentElement;
  if (head && !doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "mark.mayi-clause{background:#ffe08a;color:inherit;border-radius:2px;box-shadow:0 0 0 3px #ffe08a;padding:0 .05em;}";
    head.appendChild(style);
  }
  for (const existing of [...doc.querySelectorAll("mark.mayi-clause")]) {
    const parent = existing.parentNode;
    if (!parent) continue;
    parent.replaceChild(doc.createTextNode(existing.textContent ?? ""), existing);
    parent.normalize();
  }
  if (!doc.body || quote.length > 2_000) return false;

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const ranges: { node: Text; start: number }[] = [];
  let full = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (parent?.closest("script, style, noscript")) continue;
    ranges.push({ node, start: full.length });
    full += node.data;
  }

  const located = locateQuote(full, quote);
  if (located.method === "none") return false;

  let first: HTMLElement | null = null;
  for (const range of ranges) {
    const end = range.start + range.node.data.length;
    if (end <= located.start || range.start >= located.end) continue;
    const localStart = Math.max(0, located.start - range.start);
    const localEnd = Math.min(range.node.data.length, located.end - range.start);
    let target = range.node;
    if (localStart > 0) target = target.splitText(localStart);
    const piece = localEnd - localStart;
    if (piece < target.data.length) target.splitText(piece);
    const mark = doc.createElement("mark");
    mark.className = "mayi-clause";
    target.parentNode?.insertBefore(mark, target);
    mark.appendChild(target);
    first ??= mark;
  }
  const reduce = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  first?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  return Boolean(first);
}
