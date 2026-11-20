import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localDate, permissionMarkdown } from "../src/lib/card";

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("wave 1 regressions", () => {
  it("keeps the skip link out of the pointer path until it is focused", () => {
    const css = readFileSync(join(__dirname, "../src/panel/panel.css"), "utf8");
    const hidden = rule(css, ".skip");
    expect(hidden).toMatch(/pointer-events:\s*none/);
    expect(hidden).toMatch(/width:\s*1px/);
    expect(hidden).toMatch(/height:\s*1px/);
    expect(hidden).toMatch(/clip:\s*rect\(0, 0, 0, 0\)/);
    expect(hidden).not.toMatch(/transform/);
    const focused = css.slice(css.indexOf(".skip:focus"), css.indexOf("}", css.indexOf(".skip:focus")));
    expect(focused).toMatch(/:focus-visible/);
    expect(focused).toMatch(/pointer-events:\s*auto/);
  });

  it("dates the card in local time, not UTC", () => {
    const evening = new Date(2026, 10, 19, 23, 30).getTime();
    expect(localDate(evening)).toBe("2026-11-19");
    const md = permissionMarkdown({ host: "a.example", title: "A", checkedAt: evening, conflict: null, rows: [] });
    expect(md).toContain("Checked 2026-11-19.");
  });

  it("gives every sample page a mobile viewport", () => {
    const root = join(__dirname, "../public/samples");
    const pages: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".html")) pages.push(path);
      }
    };
    walk(root);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) expect(readFileSync(page, "utf8"), page).toContain('name="viewport"');
  });

  it("ships security and sample headers in vercel.json", () => {
    const config = JSON.parse(readFileSync(join(__dirname, "../vercel.json"), "utf8"));
    const all = config.headers.find((entry: { source: string }) => entry.source === "/(.*)");
    const keys = all.headers.map((h: { key: string }) => h.key);
    expect(keys).toEqual(expect.arrayContaining(["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"]));
    const lumen = config.headers.find((entry: { source: string }) => entry.source === "/samples/lumen/");
    expect(lumen.headers).toContainEqual({ key: "tdm-reservation", value: "1" });
  });
});
