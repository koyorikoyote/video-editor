export type TriCaption = {
  startSec: number;
  endSec: number;
  en: string;
  jp: string;
  bn: string;
  position?: "top" | "bottom";
};

// Populated by scripts/build-captions.mjs from the Whisper transcript of
// public/main-polished.mp4. Timestamps are in the TRIMMED timeline (same as
// the polished video). Do not hand-edit without re-running the script.
export const captions: TriCaption[] = [];
