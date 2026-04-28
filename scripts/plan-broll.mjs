#!/usr/bin/env node
// B-roll planner. Reads:
//   - public/broll/*.{mp4,mov,m4v,webm}   user-uploaded clips
//   - src/data/viralCut.ts                post-polish caption timeline
//
// Asks Ollama (gemma4:e4b) to lay B-roll overlays over the viral cut, then
// emits:
//   - public/broll-plan.json     hand-editable plan
//   - src/data/brollPlan.ts      what the composition reads
//
// Constraints handed to the model:
//   - each overlay 1.5-5.0 s long
//   - >= 2.5 s gap between overlays (no back-to-back)
//   - no overlay in the first or last 3 s of the viral cut
//   - total B-roll coverage <= 40% of the viral cut duration
//   - prefer clips whose visual matches the caption topic
//   - vary clip choices, no repeats unless variety is exhausted
//
// Env (same vars as the other Ollama-driven scripts):
//   OLLAMA_MODEL=gemma4:e4b   OLLAMA_URL=http://localhost:11434
//   OLLAMA_GPU_LAYERS=-1      OLLAMA_TIMEOUT_MS=0
//
// Audio of B-roll clips is muted at render time so the speaker keeps talking.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import { URL } from "node:url";
import { ALL_FORMATS, FilePathSource, Input } from "mediabunny";

const BROLL_DIR = "public/broll";
const VIRAL_TS = "src/data/viralCut.ts";
const OUT_JSON = "public/broll-plan.json";
const OUT_TS = "src/data/brollPlan.ts";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma4:e4b";
const NUM_GPU = Number(process.env.OLLAMA_GPU_LAYERS ?? -1);
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 0);

const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);

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
        res.on("end", () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Ollama request exceeded ${TIMEOUT_MS}ms`));
    });
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Discover B-roll clips
// ---------------------------------------------------------------------------
let brollFiles;
try {
  brollFiles = (await readdir(BROLL_DIR))
    .filter((f) => VIDEO_EXTS.has("." + f.split(".").pop().toLowerCase()))
    .filter((f) => !f.startsWith(".") && f !== "manifest.json")
    .sort();
} catch {
  console.error(`No ${BROLL_DIR}/ directory found. Create it and drop your B-roll clips in.`);
  process.exit(1);
}

if (brollFiles.length === 0) {
  console.error(`No video clips in ${BROLL_DIR}/. Drop .mp4/.mov files there and re-run.`);
  process.exit(1);
}

console.log(`found ${brollFiles.length} B-roll clip(s) in ${BROLL_DIR}/`);

const clipMeta = [];
for (const name of brollFiles) {
  const full = join(BROLL_DIR, name);
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new FilePathSource(full),
    });
    const dur = await input.computeDuration();
    clipMeta.push({ name, durationSec: +dur.toFixed(2) });
    console.log(`  ${name}  ${dur.toFixed(2)}s`);
  } catch (e) {
    console.warn(`  ! failed to probe ${name}: ${e.message} — skipping`);
  }
}

if (clipMeta.length === 0) {
  console.error("No probeable B-roll clips. Aborting.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pull captions out of viralCut.ts (it's plain TS-as-JSON)
// ---------------------------------------------------------------------------
const tsText = await readFile(VIRAL_TS, "utf8");
const arrMatch = tsText.match(/viralCutCaptions[^=]*=\s*(\[[\s\S]*?\]);/);
const durMatch = tsText.match(/viralCutDurationSec\s*=\s*([\d.]+)/);
if (!arrMatch || !durMatch) {
  throw new Error(`Could not parse captions or duration from ${VIRAL_TS}`);
}
const captions = JSON.parse(arrMatch[1]);
const totalSec = Number(durMatch[1]);

if (captions.length === 0) {
  console.error("viralCut.ts has no captions. Run `npm run build:viral` first.");
  process.exit(1);
}

console.log(`viral cut: ${totalSec}s, ${captions.length} captions`);

// ---------------------------------------------------------------------------
// Build the prompt
// ---------------------------------------------------------------------------
const captionTable = captions
  .map(
    (c, i) =>
      `idx=${i} t=${c.startSec}-${c.endSec}s  bn="${c.bn}"  en="${c.en}"`,
  )
  .join("\n");

const clipTable = clipMeta
  .map((c) => `  - "broll/${c.name}"  duration=${c.durationSec}s`)
  .join("\n");

const systemPrompt = `You are a senior social-media video editor. You're producing a 9:16 promo for "Imas Frontier" — a Japanese-language school in Dhaka, Bangladesh whose students learn Japanese and move to Japan to live and work.

You are given:
  1. A list of available user-uploaded B-roll clips (file path + duration).
  2. The caption timeline of the main viral cut (Bengali source + English translation, with timestamps).

Your job: design a B-roll overlay plan that adds visual variety to the speaker shot at moments where the topic of the caption matches what the clip likely depicts. Constraints (HARD):

  - Each overlay is 1.5 to 5.0 seconds long.
  - There must be at LEAST 2.5 seconds of gap between consecutive overlays.
  - NO overlay may start before t=3.0s or end after t=${(totalSec - 3).toFixed(2)}s.
  - Total overlay coverage (sum of overlay durations) must be <= ${(totalSec * 0.4).toFixed(1)}s (40% of the viral cut).
  - clipStartSec must be >= 0 and clipStartSec + (endSec - startSec) <= the clip's duration.
  - Prefer visual-topical match: pick a clip whose likely subject (read it from the filename) matches the caption topic at that moment.
  - VARY clip choices. Never use the same clip twice in a row. Spread usage across all available clips.
  - Quality over quantity: 3-7 well-placed overlays are better than 10 noisy ones.

Output ONLY a JSON object of this exact shape, no prose:
{
  "overlays": [
    { "startSec": <float>, "endSec": <float>, "clipFile": "broll/<filename>", "clipStartSec": <float>, "reason": "<short>" }
  ]
}

clipFile must include the "broll/" prefix exactly as listed.`;

const userPrompt = `Available B-roll clips:
${clipTable}

Viral cut caption timeline (total ${totalSec}s):
${captionTable}

Return the JSON now.`;

console.log(`\nasking ${MODEL} (num_gpu=${NUM_GPU === -1 ? "all" : NUM_GPU}) ...`);
const t0 = Date.now();

const res = await ollamaPost(`${OLLAMA_URL}/api/chat`, JSON.stringify({
  model: MODEL,
  stream: false,
  format: "json",
  options: { temperature: 0.4, num_ctx: 8192, num_gpu: NUM_GPU },
  keep_alive: "10m",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
}));

if (!res.ok) {
  console.error(`Ollama HTTP ${res.status}: ${res.text}`);
  process.exit(1);
}

let parsed;
try {
  const wrapper = JSON.parse(res.text);
  parsed = JSON.parse(wrapper.message?.content || "{}");
} catch (e) {
  console.error(`Bad JSON from model: ${e.message}`);
  console.error(`Raw: ${res.text.slice(0, 500)}`);
  process.exit(1);
}
console.log(`  Ollama replied in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (!Array.isArray(parsed.overlays)) {
  console.error("Model returned no overlays array. Raw:", JSON.stringify(parsed));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validate + sanitize
// ---------------------------------------------------------------------------
const clipByPath = new Map(clipMeta.map((c) => [`broll/${c.name}`, c]));
const validated = [];
let lastEnd = -Infinity;
let totalCoverage = 0;

const sorted = [...parsed.overlays].sort(
  (a, b) => Number(a.startSec ?? 0) - Number(b.startSec ?? 0),
);

for (const o of sorted) {
  const startSec = Number(o.startSec);
  const endSec = Number(o.endSec);
  const clipFile = String(o.clipFile || "");
  const clipStartSec = Number(o.clipStartSec || 0);

  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
  const dur = endSec - startSec;
  if (dur < 1.0) {
    console.warn(`  reject ${clipFile} @${startSec}: too short (${dur.toFixed(2)}s)`);
    continue;
  }
  if (dur > 6.0) {
    console.warn(`  reject ${clipFile} @${startSec}: too long (${dur.toFixed(2)}s)`);
    continue;
  }
  if (startSec < 3.0 || endSec > totalSec - 3.0) {
    console.warn(`  reject ${clipFile} @${startSec}: outside [3, ${(totalSec - 3).toFixed(1)}s] safe window`);
    continue;
  }
  if (startSec - lastEnd < 2.0) {
    console.warn(`  reject ${clipFile} @${startSec}: gap from previous overlay too small`);
    continue;
  }
  const meta = clipByPath.get(clipFile);
  if (!meta) {
    console.warn(`  reject unknown clipFile: ${clipFile}`);
    continue;
  }
  if (clipStartSec < 0 || clipStartSec + dur > meta.durationSec + 0.05) {
    console.warn(`  reject ${clipFile} @${startSec}: clipStartSec ${clipStartSec} + dur ${dur} exceeds clip length ${meta.durationSec}`);
    continue;
  }

  validated.push({
    startSec: +startSec.toFixed(3),
    endSec: +endSec.toFixed(3),
    clipFile,
    clipStartSec: +clipStartSec.toFixed(3),
    reason: typeof o.reason === "string" ? o.reason : "",
  });
  lastEnd = endSec;
  totalCoverage += dur;
}

const maxCoverage = totalSec * 0.4;
if (totalCoverage > maxCoverage) {
  console.warn(
    `  ! total coverage ${totalCoverage.toFixed(1)}s exceeds 40% cap (${maxCoverage.toFixed(1)}s). Trimming from the end.`,
  );
  while (validated.length > 0 && totalCoverage > maxCoverage) {
    const dropped = validated.pop();
    totalCoverage -= dropped.endSec - dropped.startSec;
  }
}

console.log(
  `\n${validated.length} overlay(s) validated, ${totalCoverage.toFixed(1)}s coverage (${((totalCoverage / totalSec) * 100).toFixed(1)}% of viral cut)`,
);
for (const o of validated) {
  console.log(
    `  ${o.startSec.toFixed(2)}-${o.endSec.toFixed(2)}s  ${o.clipFile} @${o.clipStartSec.toFixed(2)}  ${o.reason ? "// " + o.reason : ""}`,
  );
}

await writeFile(
  OUT_JSON,
  JSON.stringify(
    {
      model: MODEL,
      viralCutDurationSec: totalSec,
      totalCoverageSec: +totalCoverage.toFixed(2),
      overlays: validated,
    },
    null,
    2,
  ),
  "utf8",
);

const tsBody = `export type BrollOverlay = {
  startSec: number;
  endSec: number;
  clipFile: string;
  clipStartSec: number;
  reason?: string;
};

// Auto-generated by scripts/plan-broll.mjs (Ollama-curated B-roll plan).
// Empty array = no B-roll layer rendered. Drop your own clips into
// public/broll/ and re-run \`npm run plan:broll\` (or pass -WithBroll to
// the pipeline) to populate this file.

export const brollPlan: BrollOverlay[] = ${JSON.stringify(validated, null, 2)};
`;

await writeFile(OUT_TS, tsBody, "utf8");

console.log(`\nwrote ${OUT_JSON} and ${OUT_TS}`);
console.log("Re-render with: npm run render:viral");
