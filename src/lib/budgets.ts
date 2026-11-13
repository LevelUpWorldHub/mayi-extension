/** Gemini Nano's practical excerpt. The on-device limit is about 9,216 tokens. */
export const ON_DEVICE_CHAR_BUDGET = 6_000;

/** Larger excerpt used only for the labeled cloud retry. */
export const CLOUD_CHAR_BUDGET = 18_000;

/** Past this, a missing on-device clause is retried in the cloud. */
export const LONG_DOCUMENT_CHARS = 12_000;
