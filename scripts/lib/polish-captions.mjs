// Pass-the-whole-list caption reviewer powered by Ollama (gemma4:e4b).
// Sees every caption together so it can use surrounding context to fix
// translation drift, awkward phrasing, and topic mismatches that NLLB
// produces when translating short isolated sentences.
//
// Bengali (the spoken language) is treated as ground truth and never
// changed — we only repair JP and EN. If any batch fails, originals are
// kept; this is best-effort polish, not a hard requirement.
//
// Env:
//   POLISH_CAPTIONS=0          disable entirely (default: enabled)
//   OLLAMA_MODEL               default gemma4:e4b
//   OLLAMA_URL                 default http://localhost:11434
//   OLLAMA_GPU_LAYERS          default -1 (all)
//   OLLAMA_TIMEOUT_MS          default 0 (no timeout)
//   POLISH_BATCH_SIZE          default 10

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma4:e4b";
const NUM_GPU = Number(process.env.OLLAMA_GPU_LAYERS ?? -1);
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 0);
const BATCH_SIZE = Number(process.env.POLISH_BATCH_SIZE || 10);

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
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Ollama request exceeded ${TIMEOUT_MS}ms`));
    });
    req.write(payload);
    req.end();
  });
}

const SYSTEM_PROMPT = `You are a senior trilingual subtitle editor (Bengali, Japanese, English).

Context: this is a testimonial interview where a Bangladeshi student in Dhaka talks about learning Japanese, the experience of living in Japan, ambition, and "Imas Frontier" — a Japanese-language school in Dhaka, Bangladesh that helps Bangladeshis study Japanese and move to Japan to work and live.

You will receive a JSON array of caption objects, each with { idx, bn, jp, en }.

Your job:
  1. For each caption, REVIEW the JP (Japanese) and EN (English) translations against the BN (Bengali) source — bn is ground truth, never change it.
  2. If JP or EN is wrong, awkward, mistranslated, hallucinated, or off-topic, REWRITE it so it accurately and naturally conveys what BN says.
  3. Use the surrounding captions for context — they are sequential snippets from the same person speaking continuously, about the same themes (Japan, language study, immigration, ambition, Imas Frontier).
  4. Keep translations CONCISE — these are subtitles, viewers read them quickly.
  5. If a JP or EN line is already good, return it unchanged.

Return ONLY a JSON object of this exact shape (no prose, no markdown):
{ "captions": [ { "idx": <int>, "jp": "...", "en": "..." }, ... ] }

The idx values must match the input exactly. Include every caption in the input.`;

export async function polishCaptions(captions, label = "captions") {
  if (process.env.POLISH_CAPTIONS === "0") {
    console.log(`  (POLISH_CAPTIONS=0, skipping Ollama polish for ${label})`);
    return captions;
  }
  if (!captions || captions.length === 0) return captions;

  const indexed = captions.map((c, i) => ({
    idx: i,
    bn: (c.bn || "").trim(),
    jp: (c.jp || "").trim(),
    en: (c.en || "").trim(),
  }));

  const batches = [];
  for (let i = 0; i < indexed.length; i += BATCH_SIZE) {
    batches.push(indexed.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `polishing ${indexed.length} ${label} via ${MODEL} (${batches.length} batch${batches.length === 1 ? "" : "es"} of ≤${BATCH_SIZE}) ...`,
  );

  // Working copy we mutate as batches return.
  const polished = indexed.map((c) => ({ ...c }));
  let totalChanged = 0;

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const t0 = Date.now();

    const body = JSON.stringify({
      model: MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0.2, num_ctx: 8192, num_gpu: NUM_GPU },
      keep_alive: "10m",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Review these ${batch.length} captions. Improve JP and EN where needed; keep BN as ground truth.\n\n${JSON.stringify(batch, null, 2)}\n\nReturn the JSON now.`,
        },
      ],
    });

    let res;
    try {
      res = await ollamaPost(`${OLLAMA_URL}/api/chat`, body);
    } catch (e) {
      console.warn(`  batch ${b + 1}/${batches.length} request failed: ${e.message} — keeping originals for this batch`);
      continue;
    }
    if (!res.ok) {
      console.warn(`  batch ${b + 1}/${batches.length} HTTP ${res.status} — keeping originals`);
      continue;
    }

    let parsed;
    try {
      const wrapper = JSON.parse(res.text);
      parsed = JSON.parse(wrapper.message?.content || "{}");
    } catch (e) {
      console.warn(`  batch ${b + 1}/${batches.length} non-JSON reply — keeping originals`);
      continue;
    }
    if (!Array.isArray(parsed.captions)) {
      console.warn(`  batch ${b + 1}/${batches.length} unexpected shape — keeping originals`);
      continue;
    }

    let changed = 0;
    for (const p of parsed.captions) {
      if (typeof p.idx !== "number") continue;
      const target = polished[p.idx];
      if (!target) continue;
      if (typeof p.jp === "string" && p.jp.trim() && p.jp.trim() !== target.jp) {
        target.jp = p.jp.trim();
        changed++;
      }
      if (typeof p.en === "string" && p.en.trim() && p.en.trim() !== target.en) {
        target.en = p.en.trim();
        changed++;
      }
    }
    totalChanged += changed;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  batch ${b + 1}/${batches.length} done in ${elapsed}s  (${changed} translation lines updated)`);
  }

  console.log(`  polish complete: ${totalChanged} translation lines updated across ${indexed.length} captions`);

  // Splice the polished jp/en back into the original caption objects so we
  // don't lose startSec/endSec or any other fields.
  return captions.map((c, i) => ({
    ...c,
    jp: polished[i].jp,
    en: polished[i].en,
  }));
}
