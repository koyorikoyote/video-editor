#!/usr/bin/env node
// Ollama-driven viral curator. Reads transcript.json + translations.json,
// asks gemma4:e4b to pick the highest hook-potential Bengali testimonial
// segments (60–90 s total) for an Imas Frontier promo (learn Japanese in
// Dhaka → live & work in Japan), and writes public/viral-cut.json.
//
// Output schema:
//   {
//     model, targetMinSec, targetMaxSec, totalDurationSec,
//     segments: [
//       { idx, startSec, endSec, durationSec, source, en, jp, bn,
//         scores: { ambition, lifeInJapan, emotional, standalone },
//         reason, bridgeOk }
//     ]
//   }
//
// Env:
//   OLLAMA_URL=http://localhost:11434   (default)
//   OLLAMA_MODEL=gemma4:e4b             (default)
//   TARGET_MIN=60                       (seconds)
//   TARGET_MAX=90                       (seconds)

import { readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

const TRANSCRIPT = "public/transcript.json";
const TRANSLATIONS = "public/translations.json";
const OUTPUT = "public/viral-cut.json";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma4:e4b";
const TARGET_MIN = Number(process.env.TARGET_MIN || 60);
const TARGET_MAX = Number(process.env.TARGET_MAX || 90);
// GPU offload: -1 = use all GPU layers when a GPU is present, falls back to
// CPU automatically if Ollama can't find one. Override with OLLAMA_GPU_LAYERS=0
// to force CPU.
const NUM_GPU = Number(process.env.OLLAMA_GPU_LAYERS ?? -1);
// Per-request timeout in ms. Cold gemma4:e4b loads + 30+ Bengali segments
// can easily exceed Node-fetch's 5-min default. 0 = no timeout.
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 0);

// Replacement for global fetch() that uses node:http and lets us set both
// the socket idle timeout and headers timeout to whatever we want. The
// Ollama request is localhost so there's no TLS / proxy concern.
function ollamaPost(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? httpsRequest : httpRequest;
    const payload = Buffer.from(body, "utf8");
    const req = lib(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    // 0 disables the socket idle timeout entirely.
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Ollama request exceeded ${REQUEST_TIMEOUT_MS}ms`));
    });
    req.write(payload);
    req.end();
  });
}

const transcript = JSON.parse(await readFile(TRANSCRIPT, "utf8"));
let translations = {};
try {
  translations = JSON.parse(await readFile(TRANSLATIONS, "utf8"));
} catch {
  console.warn(`(${TRANSLATIONS} not found — proceeding with source-only segments)`);
}

// Restrict to bn-language testimonial answers only.
const bnSegments = transcript
  .map((seg, idx) => ({ ...seg, idx }))
  .filter((s) => s.lang === "bn" && (s.source || "").trim().length > 0);

if (bnSegments.length === 0) {
  console.error("No bn-language segments in transcript — nothing to curate.");
  process.exit(1);
}

const enrich = (s) => {
  const key = `${s.startSec}-${s.endSec}`;
  const ovr = translations[key] || {};
  return {
    idx: s.idx,
    startSec: s.startSec,
    endSec: s.endSec,
    durationSec: +(s.endSec - s.startSec).toFixed(2),
    bn: s.source || "",
    en: ovr.en || s.english || "",
    jp: ovr.jp || "",
  };
};

const enriched = bnSegments.map(enrich);
const totalAvailable = enriched.reduce((a, b) => a + b.durationSec, 0);
console.log(
  `${enriched.length} bn segments available, ${totalAvailable.toFixed(1)}s total`,
);

const segmentTable = enriched
  .map(
    (s) =>
      `idx=${s.idx} dur=${s.durationSec.toFixed(2)}s [${s.startSec}-${s.endSec}]\n` +
      `  bn: ${s.bn}\n` +
      `  en: ${s.en}`,
  )
  .join("\n\n");

const systemPrompt = `You are a senior social-media video editor specializing in viral 9:16 promo cuts for immigration / language-school brands.

Your client is "Imas Frontier" — a Japanese-language school in Dhaka, Bangladesh that helps Bangladeshi students learn Japanese and move to Japan to work and live.

You will be given a list of Bengali-language testimonial segments transcribed from a longer interview (with English translations for your understanding). Your job: pick a sequence of 6–14 segments that, played back-to-back, form ONE coherent 60–90 second promo emphasizing:

  - AMBITION (wanting more, building a future)
  - LIFE IN JAPAN (concrete aspiration, hopes, plans)
  - EMOTIONAL PULL (a viewer should feel something in the first 5 seconds)
  - STANDALONE CLARITY (each segment should make sense without surrounding context that was cut)

Hard constraints:
  - Total duration must be between ${TARGET_MIN} and ${TARGET_MAX} seconds.
  - Use each segment at most once.
  - Output ONLY valid JSON matching the schema below — no prose, no markdown fences.
  - Order matters: the array order is the playback order.
  - The FIRST chosen segment must be the strongest hook (high ambition + emotional + standalone).
  - Mark bridgeOk=true if the segment flows naturally from the segment before it in your chosen order (e.g. continuing the same idea, or the same speaker's next breath). Mark bridgeOk=false if it's a hard cut to a new topic — those are allowed but should be rare.

JSON schema:
{
  "segments": [
    { "idx": <int>, "scores": { "ambition": <0-10>, "lifeInJapan": <0-10>, "emotional": <0-10>, "standalone": <0-10> }, "reason": "<one short sentence>", "bridgeOk": <bool> }
  ]
}`;

const userPrompt = `Bengali testimonial segments:\n\n${segmentTable}\n\nReturn the JSON now. Total duration of your chosen segments must be between ${TARGET_MIN}s and ${TARGET_MAX}s.`;

console.log(
  `asking ${MODEL} at ${OLLAMA_URL} (num_gpu=${NUM_GPU === -1 ? "all" : NUM_GPU}, timeout=${REQUEST_TIMEOUT_MS === 0 ? "none" : REQUEST_TIMEOUT_MS + "ms"}) ...`,
);
console.log("  (cold model load + multi-segment reasoning can take several minutes — be patient)");
const t0 = Date.now();

const requestBody = JSON.stringify({
  model: MODEL,
  stream: false,
  format: "json",
  options: {
    temperature: 0.4,
    num_ctx: 8192,
    // num_gpu = -1 → offload all layers to GPU when one is detected.
    // Ollama silently falls back to CPU if no GPU / driver is present.
    num_gpu: NUM_GPU,
  },
  keep_alive: "10m",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
});

let res;
try {
  res = await ollamaPost(`${OLLAMA_URL}/api/chat`, requestBody);
} catch (e) {
  console.error(`Ollama request failed: ${e.message}`);
  console.error("  - Is `ollama serve` running?");
  console.error(`  - Is the model pulled?  ollama pull ${MODEL}`);
  console.error("  - Set OLLAMA_TIMEOUT_MS=600000 (10 min) if the model is slow on your hardware.");
  process.exit(1);
}

if (!res.ok) {
  console.error(`Ollama HTTP ${res.status}: ${res.text}`);
  process.exit(1);
}

let body;
try {
  body = JSON.parse(res.text);
} catch (e) {
  console.error(`Could not parse Ollama response as JSON: ${e.message}`);
  console.error(`Raw body (first 500 chars): ${res.text.slice(0, 500)}`);
  process.exit(1);
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
// Ollama reports per-call timing fields; eval_count / eval_duration tells
// us tokens-per-second, which is the easiest signal that GPU offload took.
const evalTokPerSec = body.eval_count && body.eval_duration
  ? (body.eval_count / (body.eval_duration / 1e9)).toFixed(1)
  : "?";
console.log(`  Ollama replied in ${elapsed}s  (${evalTokPerSec} tok/s)`);
const raw = body.message?.content || "";
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.error("Model did not return valid JSON. Raw output:\n", raw);
  process.exit(1);
}

if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) {
  console.error("Model returned no segments. Raw output:\n", raw);
  process.exit(1);
}

// Resolve picks against the original transcript and validate.
const byIdx = new Map(enriched.map((s) => [s.idx, s]));
const picks = [];
for (const p of parsed.segments) {
  const src = byIdx.get(p.idx);
  if (!src) {
    console.warn(`  skipping unknown idx=${p.idx}`);
    continue;
  }
  picks.push({
    idx: src.idx,
    startSec: src.startSec,
    endSec: src.endSec,
    durationSec: src.durationSec,
    source: src.bn,
    en: src.en,
    jp: src.jp,
    bn: src.bn,
    scores: p.scores || {},
    reason: p.reason || "",
    bridgeOk: !!p.bridgeOk,
  });
}

const totalDuration = picks.reduce((a, b) => a + b.durationSec, 0);
console.log(`\nmodel picked ${picks.length} segments, ${totalDuration.toFixed(1)}s total`);

if (totalDuration < TARGET_MIN || totalDuration > TARGET_MAX) {
  console.warn(
    `! duration ${totalDuration.toFixed(1)}s is outside [${TARGET_MIN}, ${TARGET_MAX}] — review and re-run, or hand-edit ${OUTPUT}`,
  );
}

// Continuity check: warn on hard cuts the model didn't flag.
let hardCuts = 0;
for (let i = 1; i < picks.length; i++) {
  const prev = picks[i - 1];
  const cur = picks[i];
  const adjacent = Math.abs(cur.startSec - prev.endSec) < 1.5;
  const endsClean = /[।.!?…]$/.test(prev.source.trim());
  if (!adjacent && !endsClean && !cur.bridgeOk) {
    hardCuts++;
    console.warn(
      `  hard cut at position ${i}: idx ${prev.idx} → idx ${cur.idx} (not adjacent, prev doesn't end on sentence punctuation, bridgeOk=false)`,
    );
  }
}
if (hardCuts > 0) {
  console.warn(`  ${hardCuts} unflagged hard cuts — consider re-running or editing ${OUTPUT}`);
}

const out = {
  model: MODEL,
  targetMinSec: TARGET_MIN,
  targetMaxSec: TARGET_MAX,
  totalDurationSec: +totalDuration.toFixed(2),
  segments: picks,
};

await writeFile(OUTPUT, JSON.stringify(out, null, 2), "utf8");
console.log(`\nwrote ${OUTPUT}`);
console.log("Next step: node scripts/build-viral-cut.mjs");
