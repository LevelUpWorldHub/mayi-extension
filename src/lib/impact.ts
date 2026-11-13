import { CLOUD_CHAR_BUDGET, ON_DEVICE_CHAR_BUDGET } from "./budgets";
import { selectChunks } from "./chunk";
import type { ConflictReport } from "./conflicts";
import type { SiteSnapshot } from "./collect";
import type { Answer } from "./types";

export interface ImpactCounts {
  charactersRead: number;
  policyPages: number;
  machineSignals: number;
  conflicts: number;
  tensions: number;
  answersCited: number;
  answers: number;
  onDeviceExcerpt: number;
  cloudExcerpt: number;
  charactersSentToCloud: number;
  promptTokens: number;
  outputTokens: number;
}

export function countImpact(snapshot: SiteSnapshot, report: ConflictReport | null, answers: Answer[]): ImpactCounts {
  const charactersRead = snapshot.policies.reduce((sum, doc) => sum + doc.text.length, 0);
  const signals = snapshot.signals;
  let machineSignals = 0;
  if (signals.robots) machineSignals += 1;
  if (signals.aiTxt) machineSignals += 1;
  if (signals.llms) machineSignals += 1;
  if (signals.tdm.reservation !== null) machineSignals += 1;
  if (signals.metaRobots.noai || signals.metaRobots.noimageai) machineSignals += 1;
  if (signals.xRobotsTag) machineSignals += 1;

  const docs = snapshot.policies;
  const onDeviceExcerpt = selectChunks(docs, "May I train AI on it?", ON_DEVICE_CHAR_BUDGET).reduce(
    (sum, chunk) => sum + chunk.text.length,
    0,
  );
  const cloudExcerpt = selectChunks(docs, "May I train AI on it?", CLOUD_CHAR_BUDGET).reduce(
    (sum, chunk) => sum + chunk.text.length,
    0,
  );
  const sent = answers.some((answer) => answer.inference === "cloud");

  return {
    charactersRead,
    policyPages: snapshot.policies.length,
    machineSignals,
    conflicts: report?.items.filter((item) => item.severity === "conflict").length ?? 0,
    tensions: report?.items.filter((item) => item.severity === "tension").length ?? 0,
    answersCited: answers.filter((answer) => answer.quote).length,
    answers: answers.length,
    onDeviceExcerpt,
    cloudExcerpt,
    charactersSentToCloud: sent ? cloudExcerpt : 0,
    promptTokens: answers.reduce((sum, answer) => sum + (answer.promptTokens ?? 0), 0),
    outputTokens: answers.reduce((sum, answer) => sum + (answer.outputTokens ?? 0), 0),
  };
}

export function impactLines(counts: ImpactCounts): string[] {
  const lines = [
    `Read ${counts.charactersRead.toLocaleString("en-US")} characters from ${counts.policyPages} policy ${counts.policyPages === 1 ? "page" : "pages"} on this device.`,
    `Checked ${counts.machineSignals} machine-readable ${counts.machineSignals === 1 ? "signal" : "signals"}.`,
    counts.conflicts
      ? `${counts.conflicts} file-versus-contract ${counts.conflicts === 1 ? "conflict" : "conflicts"}.`
      : "No file-versus-contract conflict on this page.",
  ];
  if (counts.answers) {
    lines.push(`Cited ${counts.answersCited} of ${counts.answers} ${counts.answers === 1 ? "answer" : "answers"} from a real span.`);
  }
  lines.push(
    counts.charactersSentToCloud
      ? `Sent ${counts.charactersSentToCloud.toLocaleString("en-US")} characters of excerpt to the cloud.`
      : `Sent 0 characters to the cloud. The on-device training excerpt is ${counts.onDeviceExcerpt.toLocaleString("en-US")} characters; the cloud excerpt would be ${counts.cloudExcerpt.toLocaleString("en-US")}.`,
  );
  if (counts.promptTokens) {
    lines.push(`Firebase counted ${counts.promptTokens.toLocaleString("en-US")} prompt tokens and ${counts.outputTokens.toLocaleString("en-US")} reply tokens.`);
  }
  return lines;
}
