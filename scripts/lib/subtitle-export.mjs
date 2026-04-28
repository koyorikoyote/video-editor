// Subtitle exporter shared by build-captions.mjs (JapanPromo) and
// build-viral-cut.mjs (ImasFrontierViralCut). Writes SRT + WebVTT in three
// per-language files plus a combined trilingual file alongside the rendered
// MP4 in out/.
//
// Output for basePath="out/foo":
//   out/foo.bn.srt       Bengali only
//   out/foo.jp.srt       Japanese only
//   out/foo.en.srt       English only
//   out/foo.srt          Trilingual stack (BN / JP / EN per cue)
//   out/foo.bn.vtt   ─┐
//   out/foo.jp.vtt    │  WebVTT mirrors of the four .srt files above
//   out/foo.en.vtt    │
//   out/foo.vtt      ─┘

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, "0");

function fmtSrt(sec) {
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function fmtVtt(sec) {
  return fmtSrt(sec).replace(",", ".");
}

function buildSrt(captions, pickText) {
  const lines = [];
  let n = 1;
  for (const c of captions) {
    const text = pickText(c);
    if (!text || !text.trim()) continue;
    lines.push(String(n++));
    lines.push(`${fmtSrt(c.startSec)} --> ${fmtSrt(c.endSec)}`);
    lines.push(text.trim());
    lines.push("");
  }
  return lines.join("\n");
}

function buildVtt(captions, pickText) {
  const lines = ["WEBVTT", ""];
  for (const c of captions) {
    const text = pickText(c);
    if (!text || !text.trim()) continue;
    lines.push(`${fmtVtt(c.startSec)} --> ${fmtVtt(c.endSec)}`);
    lines.push(text.trim());
    lines.push("");
  }
  return lines.join("\n");
}

const trilingual = (c) =>
  [c.bn, c.jp, c.en]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join("\n");

/**
 * Write SRT + VTT subtitle files for the captions list to {basePath}.{lang,}.{srt,vtt}.
 * @param {Array<{startSec:number,endSec:number,bn?:string,jp?:string,en?:string}>} captions
 * @param {string} basePath e.g. "out/imas-frontier-viral"
 */
export async function writeSubtitles(captions, basePath) {
  await mkdir(dirname(basePath), { recursive: true });
  const targets = [
    [`${basePath}.bn.srt`, buildSrt(captions, (c) => c.bn)],
    [`${basePath}.jp.srt`, buildSrt(captions, (c) => c.jp)],
    [`${basePath}.en.srt`, buildSrt(captions, (c) => c.en)],
    [`${basePath}.srt`,    buildSrt(captions, trilingual)],
    [`${basePath}.bn.vtt`, buildVtt(captions, (c) => c.bn)],
    [`${basePath}.jp.vtt`, buildVtt(captions, (c) => c.jp)],
    [`${basePath}.en.vtt`, buildVtt(captions, (c) => c.en)],
    [`${basePath}.vtt`,    buildVtt(captions, trilingual)],
  ];
  for (const [path, body] of targets) {
    await writeFile(path, body, "utf8");
  }
  return targets.map(([p]) => p);
}
