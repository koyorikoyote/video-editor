// Time windows (seconds) during which the interviewer asks a question in
// Japanese. B-roll cuts in *only* during these windows so we never cover the
// Bengali-speaking answerer's face.
//
// Without a transcript of the source, these are estimated gaps derived from
// the silence map in src/data/silences.ts. Refine these by opening the
// Remotion Studio timeline and aligning to where you hear Japanese.
//
// Heuristic: a Japanese question typically starts right after a long
// (>1.0 s) silence and lasts ~3–7 s.

export type QuestionWindow = {
  startSec: number;
  endSec: number;
};

export const japaneseQuestionWindows: QuestionWindow[] = [
  { startSec: 2.2, endSec: 6.5 },
  { startSec: 38.4, endSec: 43.0 },
  { startSec: 90.3, endSec: 96.0 },
  { startSec: 134.1, endSec: 139.0 },
  { startSec: 165.1, endSec: 171.0 },
  { startSec: 218.7, endSec: 224.0 },
  { startSec: 286.3, endSec: 291.5 },
  { startSec: 331.8, endSec: 338.0 },
  { startSec: 369.5, endSec: 375.0 },
  { startSec: 425.9, endSec: 431.0 },
  { startSec: 472.8, endSec: 478.5 },
];

// Answers are everything else — the ranges where the Bengali answer plays.
// Not referenced directly yet, but useful for richer caption density.
