#!/usr/bin/env node
// B-roll planner. Reads:
//   - public/broll/*.{mp4,mov,m4v,webm}   user-uploaded clips
//   - src/data/viralCut.ts                post-polish caption timeline
//
// Places EXACTLY ONE B-roll overlay at the tail of the viral cut, sized
// so it ends just before the body finishes — letting it act as a smooth
// visual handoff into the CTA outro. Plays once, no looping, no mid-cut
// repetition. Updates:
//   - public/broll-plan.json     hand-editable plan
//   - src/data/brollPlan.ts      what the composition reads
//
// If multiple clips are available, Ollama (gemma4:e4b) picks the single
// most contextually-fitting one for the closing moment based on the
// surrounding captions and the clip filenames. With one clip in
// public/broll/, Ollama is skipped entirely.
//
// Env (same vars as the other Ollama-driven scripts):
//   OLLAMA_MODEL=gemma4:e4b   OLLAMA_URL=http://localhost:11434
//   OLLAMA_GPU_LAYERS=-1      OLLAMA_TIMEOUT_MS=0
//   BROLL_TAIL_SEC            override target tail duration (sec)
//   BROLL_TAIL_BUFFER_SEC     gap between overlay end and body end (sec)
//
// Audio of B-roll is muted at render time so the speaker keeps talking.

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

// Tail-only behaviour. Default ~4.5s, end 0.5s before body ends so the
// CTA outro's crossfade has clean handoff room.
const TAIL_TARGET_SEC = Number(process.env.BROLL_TAIL_SEC || 4.5);
const TAIL_END_BUFFER_SEC = Number(process.env.BROLL_TAIL_BUFFER_SEC || 0.5);

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
// Pull captions + duration out of viralCut.ts
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
// Compute the tail overlay window
// ---------------------------------------------------------------------------
const tailEnd = +(totalSec - TAIL_END_BUFFER_SEC).toFixed(3);
// Start can't go before the safe entry zone (3s) and shouldn't last longer
// than the cut itself permits. Clamp tail length accordingly.
const earliestStart = 3.0;
const maxAvailable = Math.max(0, tailEnd - earliestStart);
const tailDur = Math.max(2.0, Math.min(TAIL_TARGET_SEC, maxAvailable));
const tailStart = +(tailEnd - tailDur).toFixed(3);

if (tailDur < 2.0) {
  console.error(
    `viral cut is too short (${totalSec}s) to fit a tail overlay. Aborting.`,
  );
  process.exit(1);
}

console.log(
  `tail overlay window: ${tailStart}s -> ${tailEnd}s  (${tailDur.toFixed(2)}s, ends ${TAIL_END_BUFFER_SEC}s before body)`,
);

// Captions overlapping the tail window — used for context when picking the clip
const tailCaptions = captions.filter(
  (c) => c.endSec > tailStart && c.startSec < tailEnd,
);
const tailContext = tailCaptions
  .map((c) => `  bn: "${c.bn}"\n  en: "${c.en}"`)
  .join("\n\n");

// ---------------------------------------------------------------------------
// Pick the single most-fitting clip
// ---------------------------------------------------------------------------
let chosen;
let chosenReason;
let chosenClipStart = 0;

if (clipMeta.length === 1) {
  chosen = clipMeta[0];
  chosenReason = "Only one B-roll clip available; using it for the tail handoff into the CTA.";
  console.log(`only one clip — skipping Ollama, using ${chosen.name}`);
} else {
  console.log(`\nasking ${MODEL} (num_gpu=${NUM_GPU === -1 ? "all" : NUM_GPU}) to pick the best tail clip ...`);

  const clipTable = clipMeta
    .map((c) => `  - "broll/${c.name}"  duration=${c.durationSec}s`)
    .join("\n");

  const systemPrompt = `You are a senior social-media video editor. You're producing a 9:16 promo for "Imas Frontier" — a Japanese-language school in Dhaka, Bangladesh whose students learn Japanese and move to Japan to live and work.

You will be given:
  1. A list of available user-uploaded B-roll clips (file path + duration).
  2. The captions playing during the FINAL ${tailDur.toFixed(2)} seconds of the viral cut, just before the CTA outro takes over.

Pick the SINGLE B-roll clip whose visual content (read from the filename) best provides a closing visual handoff — something that emotionally lands the message and bridges into a "sign up with Imas Frontier" call-to-action. Prefer footage of life in Japan, students arriving, daily routines, ambition, transition.

Also pick a "clipStartSec" — the offset within that clip where playback should begin. Pick the most visually striking moment. Default to 0 if unsure.

Output ONLY this JSON shape:
{ "clipFile": "broll/<filename>", "clipStartSec": <float>, "reason": "<short>" }

clipFile must include the "broll/" prefix exactly as listed.`;

  const userPrompt = `Available B-roll clips:
${clipTable}

Final ${tailDur.toFixed(2)}s of viral cut (this is what the speaker is saying right before the CTA):
${tailContext || "  (no captions in tail window)"}

Return the JSON now.`;

  let res;
  try {
    res = await ollamaPost(`${OLLAMA_URL}/api/chat`, JSON.stringify({
      model: MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0.3, num_ctx: 4096, num_gpu: NUM_GPU },
      keep_alive: "10m",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }));
  } catch (e) {
    console.warn(`  Ollama call failed (${e.message}) — falling back to first clip`);
    chosen = clipMeta[0];
    chosenReason = `Ollama unavailable; defaulted to first clip.`;
  }

  if (!chosen) {
    if (!res?.ok) {
      console.warn(`  Ollama HTTP ${res?.status} — falling back to first clip`);
      chosen = clipMeta[0];
      chosenReason = "Ollama returned non-OK; defaulted to first clip.";
    } else {
      let parsed;
      try {
        const wrapper = JSON.parse(res.text);
        parsed = JSON.parse(wrapper.message?.content || "{}");
      } catch (e) {
        console.warn(`  bad JSON from model (${e.message}) — falling back to first clip`);
        chosen = clipMeta[0];
        chosenReason = "Ollama returned non-JSON; defaulted to first clip.";
      }
      if (parsed) {
        const wantPath = String(parsed.clipFile || "");
        const wantName = wantPath.replace(/^broll\//, "");
        const match = clipMeta.find((c) => c.name === wantName);
        if (!match) {
          console.warn(`  model picked unknown clip "${wantPath}" — falling back to first clip`);
          chosen = clipMeta[0];
          chosenReason = "Model picked an unknown clip; defaulted to first.";
        } else {
          chosen = match;
          chosenReason = String(parsed.reason || "Selected by model for tail handoff.");
          chosenClipStart = Number(parsed.clipStartSec) || 0;
        }
      }
    }
  }
}

// Validate clipStartSec + clip length can satisfy tail duration.
if (chosen.durationSec < tailDur) {
  console.warn(
    `  ! clip ${chosen.name} (${chosen.durationSec}s) is shorter than tail ${tailDur.toFixed(2)}s — clip will end early; visible region will be the clip duration only.`,
  );
}
if (chosenClipStart < 0) chosenClipStart = 0;
if (chosenClipStart + tailDur > chosen.durationSec) {
  // Shift start back so the play window fits within the clip.
  chosenClipStart = Math.max(0, chosen.durationSec - tailDur);
  console.warn(
    `  clipStartSec adjusted to ${chosenClipStart.toFixed(2)} so it fits within the clip`,
  );
}

const overlay = {
  startSec: tailStart,
  endSec: tailEnd,
  clipFile: `broll/${chosen.name}`,
  clipStartSec: +chosenClipStart.toFixed(3),
  reason: chosenReason,
};

console.log(
  `\nplanned 1 tail overlay: ${overlay.startSec}s-${overlay.endSec}s  ${overlay.clipFile} @${overlay.clipStartSec}s`,
);
console.log(`  // ${overlay.reason}`);

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
await writeFile(
  OUT_JSON,
  JSON.stringify(
    {
      model: clipMeta.length === 1 ? "(skipped, single-clip)" : MODEL,
      viralCutDurationSec: totalSec,
      totalCoverageSec: +(overlay.endSec - overlay.startSec).toFixed(2),
      overlays: [overlay],
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

// Auto-generated by scripts/plan-broll.mjs (single tail overlay).
// One B-roll clip plays once at the end of the viral cut, ending
// ${TAIL_END_BUFFER_SEC.toFixed(2)}s before the body finishes so it acts as a
// smooth visual handoff into the CTA outro. To regenerate, re-run
// \`npm run plan:broll\` (or pass -WithBroll to the pipeline).

export const brollPlan: BrollOverlay[] = ${JSON.stringify([overlay], null, 2)};
`;

await writeFile(OUT_TS, tsBody, "utf8");

console.log(`\nwrote ${OUT_JSON} and ${OUT_TS}`);
console.log("Re-render with: npm run render:viral");
