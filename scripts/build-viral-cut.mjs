#!/usr/bin/env node
// Take public/viral-cut.json (LLM picks, ORIGINAL-time seconds) + cutmap.ts
// (silence-stripped → polished mapping) and produce:
//
//   public/viral-cut.mp4    — concatenated A-roll, in pick order
//   src/data/viralCut.ts    — captions in the new (concatenated) timeline
//
// Each pick's [startSec, endSec] is in ORIGINAL time. We remap to TRIMMED
// time (matches main-polished.mp4) before extracting, then lay them out
// end-to-end on a fresh timeline starting at 0 for the captions.
//
// Requires system ffmpeg on PATH (the Remotion-bundled ffmpeg works too).

import { exec } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";
import { pipeline } from "@xenova/transformers";
import { polishCaptions } from "./lib/polish-captions.mjs";
import { writeSubtitles } from "./lib/subtitle-export.mjs";

const run = promisify(exec);

const VIRAL = "public/viral-cut.json";
const CUTMAP_TS = "src/data/cutmap.ts";
const SRC_VIDEO = "public/main-polished.mp4";
const OUT_VIDEO = "public/viral-cut.mp4";
const OUT_TS = "src/data/viralCut.ts";
const TMP_DIR = "public/.viral-tmp";

const FFMPEG = process.env.FFMPEG || "ffmpeg";

const viral = JSON.parse(await readFile(VIRAL, "utf8"));

// ---------------------------------------------------------------------------
// Trim trailing segments so we (a) stay within the target duration window
// and (b) never end on a segment whose source text is cut off mid-sentence
// (Whisper's VAD chunking sometimes truncates the last word). Honor (b)
// strictly even if it pushes us under target_min — better short and clean
// than long and unnatural.
// ---------------------------------------------------------------------------
const TARGET_MIN = viral.targetMinSec ?? 60;
const TARGET_MAX = viral.targetMaxSec ?? 90;
const SENTENCE_END = /[।.!?…。]["'""'')\]\s]*$/;
const endsCleanly = (text) => SENTENCE_END.test((text || "").trim());

const kept = [...viral.segments];
let totalForTrim = kept.reduce((a, s) => a + s.durationSec, 0);

while (kept.length > 1) {
  const last = kept[kept.length - 1];
  const overBudget = totalForTrim > TARGET_MAX;
  const midSentence = !endsCleanly(last.source);
  if (!overBudget && !midSentence) break;

  kept.pop();
  totalForTrim -= last.durationSec;
  const reason = overBudget && midSentence
    ? "over-budget + mid-sentence"
    : overBudget
      ? `over budget (${TARGET_MAX}s cap)`
      : "ends mid-sentence";
  console.warn(
    `  dropping trailing seg idx=${last.idx} (${last.durationSec}s, ${reason})`,
  );
}

if (totalForTrim < TARGET_MIN) {
  console.warn(
    `  ! after trimming, total is ${totalForTrim.toFixed(1)}s (< targetMin ${TARGET_MIN}s) — proceeding anyway, prefer short+clean over long+truncated`,
  );
}

viral.segments = kept;

const cutmapText = await readFile(CUTMAP_TS, "utf8");
const cutmapMatch = cutmapText.match(/export const keptSegments[^=]*=\s*(\[[\s\S]*?\]);/);
if (!cutmapMatch) throw new Error("Could not parse keptSegments from cutmap.ts");
const keptSegments = JSON.parse(cutmapMatch[1]);

const remap = (originalSec) => {
  let t = 0;
  for (const [s, e] of keptSegments) {
    if (originalSec < s) return t;
    if (originalSec < e) return t + (originalSec - s);
    t += e - s;
  }
  return t;
};

await rm(TMP_DIR, { recursive: true, force: true });
await mkdir(TMP_DIR, { recursive: true });

// Split Bengali (or any) text into sentences using language-appropriate
// sentence-final punctuation. Punctuation is re-attached to each sentence.
function splitBengaliSentences(text) {
  if (!text) return [];
  const splitter = /([।!?…]+\s*)/g;
  const parts = text.split(splitter);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = (parts[i] || "").trim();
    const punc = (parts[i + 1] || "").trim();
    if (body) out.push(punc ? `${body}${punc}` : body);
  }
  return out.length ? out : [text.trim()];
}

const MIN_SUBCAPTION_SEC = 1.4;

// ---------------------------------------------------------------------------
// Load NLLB-200 once. We re-translate each Bengali sentence directly so
// per-caption JP and EN are aligned with what's spoken in that sub-window
// (the segment-level translations.json output drifts on long inputs and was
// causing the "wonky translations / endless repeat" feel — the same loose
// JP block was lingering for 20+ s while the speaker had moved on).
// ---------------------------------------------------------------------------
console.log("loading NLLB-200 for per-sentence retranslation ...");
const translator = await pipeline("translation", "Xenova/nllb-200-distilled-600M");

const NLLB = { ja: "jpn_Jpan", bn: "ben_Beng", en: "eng_Latn" };

async function nllbBatch(texts, srcLang, tgtLang) {
  if (texts.length === 0) return [];
  const out = await translator(texts, {
    src_lang: NLLB[srcLang],
    tgt_lang: NLLB[tgtLang],
  });
  const arr = Array.isArray(out) ? out : [out];
  return arr.map((r) => (r?.translation_text ?? "").trim());
}

const concatList = [];
const captions = [];
let timelineSec = 0;

for (let i = 0; i < viral.segments.length; i++) {
  const seg = viral.segments[i];
  const trimStart = remap(seg.startSec);
  const trimEnd = remap(seg.endSec);
  const dur = +(trimEnd - trimStart).toFixed(3);
  if (dur <= 0.1) {
    console.warn(`  skip seg ${seg.idx}: zero-length after remap`);
    continue;
  }

  const part = `${TMP_DIR}/part_${String(i).padStart(3, "0")}.mp4`;
  console.log(
    `  [${i + 1}/${viral.segments.length}] idx=${seg.idx}  trim=${trimStart.toFixed(2)}-${trimEnd.toFixed(2)}  dur=${dur}s`,
  );

  // Re-encode each part so concat is reliable across keyframe boundaries.
  await run(
    `${FFMPEG} -y -ss ${trimStart} -to ${trimEnd} -i "${SRC_VIDEO}" ` +
      `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 192k -movflags +faststart "${part}"`,
  );

  // ffmpeg's concat demuxer resolves `file '...'` entries relative to the
  // directory of the concat-list file itself, so we write only the basename.
  // Otherwise paths get doubled (e.g. public/.viral-tmp/public/.viral-tmp/part_000.mp4).
  concatList.push(`file '${basename(part)}'`);

  // Sentence-level captions, with JP/EN re-translated PER SENTENCE for
  // tighter alignment to what the speaker is saying right now.
  const bnSentences = splitBengaliSentences(seg.bn || seg.source);
  const totalChars = bnSentences.reduce((a, s) => a + s.length, 0) || 1;
  const subDurs = bnSentences.map((s) =>
    Math.max(MIN_SUBCAPTION_SEC, dur * (s.length / totalChars)),
  );
  // Re-normalize: the Math.max above can push the sum past `dur`. Scale back.
  const sumSubs = subDurs.reduce((a, b) => a + b, 0);
  if (sumSubs > 0) {
    for (let s = 0; s < subDurs.length; s++) subDurs[s] *= dur / sumSubs;
  }

  const jpSentences = await nllbBatch(bnSentences, "bn", "ja");
  const enSentences = await nllbBatch(bnSentences, "bn", "en");

  let cursor = timelineSec;
  for (let s = 0; s < bnSentences.length; s++) {
    const sd = subDurs[s];
    captions.push({
      startSec: +cursor.toFixed(3),
      endSec: +(cursor + sd).toFixed(3),
      jp: (jpSentences[s] || "").trim(),
      bn: bnSentences[s].trim(),
      en: (enSentences[s] || "").trim(),
    });
    cursor += sd;
  }

  timelineSec += dur;
}

const listFile = `${TMP_DIR}/concat.txt`;
await writeFile(listFile, concatList.join("\n"), "utf8");

console.log(`\nconcatenating ${concatList.length} parts → ${OUT_VIDEO}`);
await run(
  `${FFMPEG} -y -f concat -safe 0 -i "${listFile}" -c copy -movflags +faststart "${OUT_VIDEO}"`,
);

const totalDuration = +timelineSec.toFixed(3);

// Whole-list contextual review: gemma4:e4b sees every caption together so it
// can fix translation drift / awkward phrasing / topic mismatches that NLLB
// can't catch in isolation. Bengali is treated as ground truth. Best-effort:
// if Ollama is down or returns garbage, originals are kept.
const polished = await polishCaptions(captions, "viral-cut captions");

const ts = `export type ViralCaption = {
  startSec: number;
  endSec: number;
  jp: string;
  bn: string;
  en: string;
};

// Auto-generated by scripts/build-viral-cut.mjs from public/viral-cut.json.
// Captions are in the NEW concatenated timeline of public/viral-cut.mp4
// (each pick laid end-to-end starting at 0).

export const viralCutDurationSec = ${totalDuration};

export const viralCutCaptions: ViralCaption[] = ${JSON.stringify(polished, null, 2)};
`;

await writeFile(OUT_TS, ts, "utf8");

await rm(TMP_DIR, { recursive: true, force: true });

// Subtitle sidecar files alongside the rendered MP4.
const subBase = "out/imas-frontier-viral";
const subFiles = await writeSubtitles(polished, subBase);

console.log(
  `\nwrote ${OUT_VIDEO} (${totalDuration.toFixed(2)}s) and ${OUT_TS} (${captions.length} captions)`,
);
console.log(`wrote ${subFiles.length} subtitle files: ${subBase}.{en,jp,bn,}.{srt,vtt}`);
console.log("Next step: npx remotion render ImasFrontierViralCut");
