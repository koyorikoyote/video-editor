#!/usr/bin/env node
// End-to-end silence detection: loudnorm -> silencedetect -> src/data/silences.ts
//
// Usage:
//   node scripts/detect-silences.mjs <path/to/video.mp4>

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , inputPath] = process.argv;
if (!inputPath) {
  console.error("Usage: node scripts/detect-silences.mjs <input>");
  process.exit(1);
}

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(new Error(`${cmd} exited ${code}\n${stderr}`)),
    );
  });

const FFMPEG = "npx";
const FFMPEG_ARGS = ["remotion", "ffmpeg", "-hide_banner", "-nostats"];
const FFPROBE_ARGS = ["remotion", "ffprobe", "-v", "error"];

console.log("1/3 probing duration");
const probe = await run(FFMPEG, [
  ...FFPROBE_ARGS,
  "-show_entries",
  "format=duration",
  "-of",
  "default=nokey=1:noprint_wrappers=1",
  inputPath,
]);
const totalSec = Number(probe.stdout.trim());

console.log("2/3 measuring loudnorm threshold");
const loud = await run(FFMPEG, [
  ...FFMPEG_ARGS,
  "-i",
  inputPath,
  "-map",
  "0:a",
  "-af",
  "loudnorm=print_format=json",
  "-f",
  "null",
  process.platform === "win32" ? "NUL" : "/dev/null",
]);
const jsonMatch = loud.stderr.match(/\{[\s\S]*?"target_offset"[\s\S]*?\}/);
if (!jsonMatch) throw new Error("Could not parse loudnorm output");
const loudJson = JSON.parse(jsonMatch[0]);
const thresh = Number(loudJson.input_thresh);
console.log(`   input_thresh = ${thresh}dB`);

console.log("3/3 running silencedetect");
const silent = await run(FFMPEG, [
  ...FFMPEG_ARGS,
  "-i",
  inputPath,
  "-map",
  "0:a",
  "-af",
  `silencedetect=noise=${thresh}dB:d=0.5`,
  "-f",
  "null",
  process.platform === "win32" ? "NUL" : "/dev/null",
]);

const tmp = await mkdtemp(path.join(tmpdir(), "silences-"));
const logFile = path.join(tmp, "silences.log");
await writeFile(logFile, silent.stderr);

// Hand off to parser
const { default: _ } = await import(path.resolve("scripts/parse-silences.mjs")).catch(() => ({
  default: null,
}));
void _;

// Call parser via child process so its top-level await executes cleanly.
await run(process.execPath, [
  "scripts/parse-silences.mjs",
  logFile,
  String(totalSec),
]).then(({ stdout }) => process.stdout.write(stdout));
