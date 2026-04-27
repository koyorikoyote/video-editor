#!/usr/bin/env node
// Translate every transcript segment into the two languages it doesn't already
// have, using NLLB-200 (distilled-600M) via Transformers.js. This replaces
// the previous Argos-Translate-based fill-third-lang.py.
//
// Inputs:
//   public/transcript.json    [{ startSec, endSec, lang, source, ... }]
//
// Output:
//   public/translations.json  { "<startSec>-<endSec>": { en, jp, bn } }
//   - For ja-source segments we generate { en, bn }
//   - For bn-source segments we generate { en, jp }
//   (the source-language field is omitted; build-captions.mjs reads it from
//   transcript.json directly.)
//
// Why NLLB-200 over Argos:
//   - One model, 200+ languages, no per-pair package downloads
//   - Direct ja<->bn (no English pivot) — better fidelity for idioms
//   - Runs locally, $0, on CPU
//
// First run downloads ~600 MB into the Transformers.js cache; subsequent
// runs are instant.

import { readFile, writeFile } from "node:fs/promises";
import { pipeline } from "@xenova/transformers";

const TRANSCRIPT = "public/transcript.json";
const OUTPUT = "public/translations.json";
const MODEL_ID = "Xenova/nllb-200-distilled-600M";
const BATCH_SIZE = 8;

const NLLB = { ja: "jpn_Jpan", bn: "ben_Beng", en: "eng_Latn" };
// build-captions.mjs reads `ovr.jp` (legacy "jp" alias for Japanese), so
// we write it under that key.
const OUT_KEY = { ja: "jp", bn: "bn", en: "en" };

const transcript = JSON.parse(await readFile(TRANSCRIPT, "utf8"));

console.log(`loading NLLB model: ${MODEL_ID} (first run downloads ~600 MB) ...`);
const translator = await pipeline("translation", MODEL_ID);

async function translateBatch(texts, srcLang, tgtLang) {
  if (texts.length === 0) return [];
  const out = await translator(texts, {
    src_lang: NLLB[srcLang],
    tgt_lang: NLLB[tgtLang],
  });
  // Pipeline returns either {translation_text} or [{translation_text}, ...]
  const arr = Array.isArray(out) ? out : [out];
  return arr.map((r) => (r?.translation_text ?? "").trim());
}

// Build per-direction job lists so we can batch each direction together.
// Direction key: `${src}->${tgt}`. Each job tracks the segment index.
const jobs = new Map(); // key -> [{ idx, text }]
const queue = (src, tgt, idx, text) => {
  const k = `${src}->${tgt}`;
  if (!jobs.has(k)) jobs.set(k, []);
  jobs.get(k).push({ idx, text });
};

transcript.forEach((seg, idx) => {
  const text = (seg.source || "").trim();
  if (!text) return;
  if (seg.lang === "ja") {
    queue("ja", "en", idx, text);
    queue("ja", "bn", idx, text);
  } else if (seg.lang === "bn") {
    queue("bn", "en", idx, text);
    queue("bn", "ja", idx, text);
  }
});

const totalJobs = [...jobs.values()].reduce((a, b) => a + b.length, 0);
console.log(`translating ${totalJobs} segment-direction pairs in batches of ${BATCH_SIZE} ...`);

const result = {}; // segIdx -> { en?, jp?, bn? }
let done = 0;
for (const [direction, items] of jobs) {
  const [src, tgt] = direction.split("->");
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const translated = await translateBatch(
      batch.map((b) => b.text),
      src,
      tgt,
    );
    batch.forEach((b, k) => {
      const bucket = (result[b.idx] ??= {});
      bucket[OUT_KEY[tgt]] = translated[k] || "";
    });
    done += batch.length;
    if (done % 16 === 0 || done === totalJobs) {
      console.log(`  ${done}/${totalJobs}  [${direction}]`);
    }
  }
}

const out = {};
for (const [idxStr, bucket] of Object.entries(result)) {
  const seg = transcript[Number(idxStr)];
  out[`${seg.startSec}-${seg.endSec}`] = bucket;
}

await writeFile(OUTPUT, JSON.stringify(out, null, 2), "utf8");
console.log(`\nwrote ${Object.keys(out).length} translation entries -> ${OUTPUT}`);
console.log("Next step: node scripts/build-captions.mjs");
