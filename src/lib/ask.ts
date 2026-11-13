import { answerExtractive } from "./extractive";
import { askFirebase, firebaseConfigPresent, initFirebase, prepareOnDeviceModel } from "./firebase";
import { planHybridRoute } from "./route";
import { presetById, presetForQuestion, PRESETS } from "./presets";
import type { Answer, PolicyDoc } from "./types";

function noteRoute(answer: Answer, docs: PolicyDoc[]): Answer {
  if (!answer.quote || answer.inference === "on_device" || answer.inference === "cloud") return answer;
  const plan = planHybridRoute(docs, answer.question, answer.quote);
  if (plan.step !== "cloud_retry") return answer;
  return { ...answer, routeNote: plan.note };
}

export function isBlankQuestion(question: string): boolean {
  const trimmed = question.trim().toLowerCase().replace(/[?.!]+$/g, "").trim();
  return trimmed.length === 0 || trimmed === "may i";
}

export async function askQuestion(options: {
  question: string;
  docs: PolicyDoc[];
  presetId?: string | null;
  onDeviceProgress?: (value: number) => void;
}): Promise<Answer> {
  const question = options.question.trim();
  if (isBlankQuestion(question)) {
    return {
      id: crypto.randomUUID(),
      question: question || "May I",
      presetId: options.presetId ?? null,
      tone: "permission",
      verdict: "unknown",
      reason: "Finish the question. For example: May I train AI on it?",
      quote: null,
      sourceUrl: null,
      sourceTitle: null,
      citation: null,
      inference: "extractive",
      inferenceDetail: "Local reading — there was no question to match.",
    };
  }
  const preset = presetById(options.presetId) ?? presetForQuestion(question);
  const presetId = preset?.id ?? options.presetId ?? null;
  if (!firebaseConfigPresent()) {
    const local = answerExtractive(question, options.docs, presetId);
    return noteRoute({ ...local, question }, options.docs);
  }
  initFirebase();
  try {
    await prepareOnDeviceModel(options.onDeviceProgress);
  } catch {
    // Nano may be missing. PREFER_ON_DEVICE still falls back to the cloud.
  }
  try {
    return await askFirebase({
      question,
      presetId,
      docs: options.docs,
      tone: preset?.tone ?? "permission",
    });
  } catch (error) {
    const local = answerExtractive(question, options.docs, presetId);
    const message = error instanceof Error ? error.message : "Firebase request failed.";
    return noteRoute(
      {
        ...local,
        question,
        inferenceDetail: `Local reading — Firebase didn't answer (${message}).`,
      },
      options.docs,
    );
  }
}

export async function askPresets(
  docs: PolicyDoc[],
  onProgress?: (done: number, total: number) => void,
  onDeviceProgress?: (value: number) => void,
): Promise<Answer[]> {
  const answers: Answer[] = [];
  for (let index = 0; index < PRESETS.length; index += 1) {
    const preset = PRESETS[index];
    answers.push(
      await askQuestion({
        question: preset.question,
        docs,
        presetId: preset.id,
        onDeviceProgress: index === 0 ? onDeviceProgress : undefined,
      }),
    );
    onProgress?.(index + 1, PRESETS.length);
  }
  return answers;
}
