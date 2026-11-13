import { answerExtractive } from "./extractive";
import { askFirebase, firebaseConfigPresent, initFirebase, prepareOnDeviceModel } from "./firebase";
import { presetById, presetForQuestion, PRESETS } from "./presets";
import type { Answer, PolicyDoc } from "./types";

export async function askQuestion(options: {
  question: string;
  docs: PolicyDoc[];
  presetId?: string | null;
  onDeviceProgress?: (value: number) => void;
}): Promise<Answer> {
  const question = options.question.trim();
  const preset = presetById(options.presetId) ?? presetForQuestion(question);
  const presetId = preset?.id ?? options.presetId ?? null;
  if (!firebaseConfigPresent()) {
    const local = answerExtractive(question, options.docs, presetId);
    return { ...local, question };
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
    return {
      ...local,
      question,
      inferenceDetail: `Local reading — Firebase didn't answer (${message}).`,
    };
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
