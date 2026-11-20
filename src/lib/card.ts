import type { Answer, Verdict } from "./types";

export interface CardModel {
  host: string;
  title: string;
  checkedAt: number;
  conflict: string | null;
  rows: { question: string; verdict: Verdict; tone: Answer["tone"] }[];
  reading?: string[];
}

export function permissionMarkdown(card: CardModel): string {
  const when = localDate(card.checkedAt);
  const lines = [
    `# MayI permission card`,
    ``,
    `**${card.title || card.host}**  `,
    `Checked ${when}. Not legal advice.`,
    ``,
  ];
  if (card.conflict) {
    lines.push(`> ${card.conflict}`, ``);
  }
  lines.push(`| Question | Verdict |`, `| --- | --- |`);
  for (const row of card.rows) {
    lines.push(`| ${row.question} | ${label(row.verdict)} |`);
  }
  if (card.reading?.length) {
    lines.push(``);
    for (const line of card.reading) lines.push(`- ${line}`);
  }
  lines.push(``, `Read on-device first. Clauses are quoted from the page.`);
  return lines.join("\n");
}

function label(verdict: Verdict): string {
  if (verdict === "yes") return "Yes";
  if (verdict === "no") return "No";
  if (verdict === "conditional") return "Conditional";
  return "Unknown";
}

function toneColor(verdict: Verdict, tone: Answer["tone"]): string {
  if (verdict === "conditional") return "#8a5a12";
  if (verdict === "unknown") return "#6d645b";
  const good = tone === "permission" ? verdict === "yes" : verdict === "no";
  return good ? "#1f6a45" : "#b43322";
}

export async function renderCardPng(card: CardModel): Promise<Blob> {
  await document.fonts.ready;
  const width = 1200;
  const height = 1680;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available.");
  context.fillStyle = "#f4efe4";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#d9cbb6";
  context.lineWidth = 2;
  for (let y = 180; y < height; y += 48) {
    context.beginPath();
    context.moveTo(72, y);
    context.lineTo(width - 72, y);
    context.stroke();
  }
  context.fillStyle = "#b43322";
  context.beginPath();
  context.arc(1040, 150, 78, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#f4efe4";
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = "#f4efe4";
  context.font = "700 28px Fraunces, serif";
  context.textAlign = "center";
  context.fillText("MAY I", 1040, 158);
  context.textAlign = "left";
  context.fillStyle = "#221c16";
  context.font = "600 28px Source Sans 3, sans-serif";
  context.fillText("MAY I  ·  FINEPRINT", 72, 110);
  context.font = "650 64px Fraunces, serif";
  const host = card.host.length > 28 ? `${card.host.slice(0, 26)}…` : card.host;
  context.fillText(host, 72, 200);
  context.font = "400 28px Source Sans 3, sans-serif";
  context.fillStyle = "#5c5146";
  context.fillText(new Date(card.checkedAt).toLocaleDateString(undefined, { dateStyle: "long" }), 72, 252);
  if (card.conflict) {
    wrapText(context, card.conflict, 72, 330, 1000, 40, "600 30px Fraunces, serif", "#7a1f1f");
  }
  let y = card.conflict ? 470 : 360;
  for (const row of card.rows) {
    context.fillStyle = toneColor(row.verdict, row.tone);
    context.font = "700 26px Source Sans 3, sans-serif";
    context.fillText(label(row.verdict).toUpperCase(), 72, y);
    context.fillStyle = "#221c16";
    context.font = "400 30px Source Sans 3, sans-serif";
    context.fillText(row.question, 280, y);
    y += 78;
  }
  context.fillStyle = "#5c5146";
  context.font = "400 24px Source Sans 3, sans-serif";
  context.fillText("Quoted from the page. Not legal advice.", 72, height - 80);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't export the card.");
  return blob;
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  font: string,
  color: string,
) {
  context.font = font;
  context.fillStyle = color;
  const words = text.split(" ");
  let line = "";
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth) {
      context.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) context.fillText(line, x, cursor);
}

/** YYYY-MM-DD in the reader's own time zone, not UTC. */
export function localDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
