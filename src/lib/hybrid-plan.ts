export const NANO_PROMPT_TOKEN_BUDGET = 1800;

export const HYBRID_SYSTEM =
  "You answer a May I question about a website's terms, privacy policy, or license. Use only the excerpts in the user message. If they do not say, verdict is unknown and quote is empty. The quote must be an exact contiguous copy from one excerpt. The reason is one plain-English sentence and does not start with Yes or No.";

export type HybridModeName = "prefer_on_device" | "only_on_device" | "only_in_cloud" | "prefer_in_cloud";

export function selectHybridMode(input: {
  deviceReady: boolean;
  deviceBroken: boolean;
  promptTokens: number | null;
  forceCloud: boolean;
}): { mode: HybridModeName; reason: string } {
  if (input.forceCloud) {
    return {
      mode: "only_in_cloud",
      reason: "Cloud only — the on-device excerpt had no citable clause, and the policy is long.",
    };
  }
  if (input.promptTokens !== null && input.promptTokens > NANO_PROMPT_TOKEN_BUDGET) {
    return {
      mode: "only_in_cloud",
      reason: `Cloud only — countTokens reported ${input.promptTokens} tokens, over the ${NANO_PROMPT_TOKEN_BUDGET}-token on-device budget.`,
    };
  }
  if (input.deviceBroken) {
    return {
      mode: "prefer_in_cloud",
      reason: "Cloud preferred — Gemini Nano did not initialize. Firebase can still use the device if the cloud call cannot run.",
    };
  }
  if (input.deviceReady) {
    const counted = input.promptTokens === null ? "" : ` countTokens reported ${input.promptTokens} tokens.`;
    return {
      mode: "only_on_device",
      reason: `On-device only — Gemini Nano is ready and the prompt fits.${counted}`,
    };
  }
  return {
    mode: "prefer_on_device",
    reason: "On-device preferred — Firebase uses Gemini Nano when it is available and the cloud model otherwise.",
  };
}
