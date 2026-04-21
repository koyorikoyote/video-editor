import { japaneseQuestionWindows } from "./questions";

export type BRollCue = {
  startSec: number;
  durationSec: number;
  keywords: string[];
  label: string;
};

// Rotating pool of professional-workplace / Japanese-learning themes, cycled
// across the Japanese question windows in src/data/questions.ts.
const POOL: Array<{ keywords: string[]; label: string }> = [
  { keywords: ["office", "workers", "business"], label: "Japanese office workers" },
  { keywords: ["meeting", "business"], label: "Japanese business meeting" },
  { keywords: ["handshake", "professional"], label: "Japanese professional handshake" },
  { keywords: ["classroom", "language"], label: "Language classroom" },
  { keywords: ["studying", "notebook"], label: "Studying Japanese" },
  { keywords: ["teacher", "student"], label: "Teacher & student" },
];

// One B-roll cut per Japanese question window, cycling through the pool.
// Cut is slightly shorter than the window so we see a beat of the interview
// first, then the B-roll plays.
export const brollCues: BRollCue[] = japaneseQuestionWindows.map(
  (window, i) => {
    const pick = POOL[i % POOL.length];
    const available = window.endSec - window.startSec;
    const duration = Math.max(1.8, Math.min(available - 0.4, 3.2));
    return {
      startSec: window.startSec + 0.2,
      durationSec: duration,
      keywords: pick.keywords,
      label: pick.label,
    };
  },
);
