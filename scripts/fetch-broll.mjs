#!/usr/bin/env node
// Fetch free B-roll clips from Pexels for each query and write a manifest.
//
// Usage:
//   PEXELS_API_KEY=xxx node scripts/fetch-broll.mjs "japanese classroom" "tokyo street" ...
//
// Outputs: public/broll/<query>_<id>.mp4 and public/broll/manifest.json

import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

const API_KEY = process.env.PEXELS_API_KEY;
if (!API_KEY) {
  console.error("Missing PEXELS_API_KEY. Get a free key at https://www.pexels.com/api/");
  process.exit(1);
}

const queries = process.argv.slice(2);
if (queries.length === 0) {
  console.error('Usage: node scripts/fetch-broll.mjs "query one" "query two" ...');
  process.exit(1);
}

const OUT_DIR = path.resolve("public/broll");
const PER_QUERY = Number(process.env.BROLL_PER_QUERY ?? 3);
const MIN_DURATION = Number(process.env.BROLL_MIN_SEC ?? 3);
const MAX_DURATION = Number(process.env.BROLL_MAX_SEC ?? 20);

await mkdir(OUT_DIR, { recursive: true });

async function search(query) {
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(PER_QUERY * 3));
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("size", "medium");
  const res = await fetch(url, { headers: { Authorization: API_KEY } });
  if (!res.ok) throw new Error(`Pexels search failed ${res.status}: ${await res.text()}`);
  const { videos } = await res.json();
  return videos
    .filter((v) => v.duration >= MIN_DURATION && v.duration <= MAX_DURATION)
    .slice(0, PER_QUERY);
}

function pickFile(video) {
  const files = video.video_files ?? [];
  const hd = files.find((f) => f.quality === "hd" && f.width && f.width <= 1920);
  const sd = files.find((f) => f.quality === "sd");
  return hd ?? sd ?? files[0];
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

const manifest = [];
for (const q of queries) {
  console.log(`\n[${q}]`);
  const results = await search(q);
  for (const v of results) {
    const file = pickFile(v);
    if (!file) continue;
    const slug = q.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    const name = `${slug}_${v.id}.mp4`;
    const dest = path.join(OUT_DIR, name);
    process.stdout.write(`  ↓ ${name} (${v.duration}s, ${file.width}x${file.height}) ... `);
    try {
      await download(file.link, dest);
      console.log("ok");
      manifest.push({
        query: q,
        src: `broll/${name}`,
        durationSec: v.duration,
        width: file.width,
        height: file.height,
        pexelsUrl: v.url,
        photographer: v.user?.name ?? "unknown",
        photographerUrl: v.user?.url ?? null,
      });
    } catch (err) {
      console.log(`FAILED (${err.message})`);
    }
  }
}

await writeFile(
  path.join(OUT_DIR, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(`\nWrote ${manifest.length} clips -> public/broll/manifest.json`);
console.log("Remember to credit photographers per Pexels license.");
