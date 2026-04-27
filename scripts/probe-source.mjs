#!/usr/bin/env node
// Print metadata for a video file as KEY=VALUE lines, parseable by
// scripts/run-pipeline.ps1. Uses mediabunny (already a project dep) so we
// don't need ffprobe on PATH and don't have to wrestle with PowerShell's
// stderr-redirection quirks for native commands.
//
// Usage:
//   node scripts/probe-source.mjs <path-to-video>
//
// Output (stdout, one key=value per line):
//   duration=<seconds-as-float>
//   width=<int>
//   height=<int>

import { ALL_FORMATS, FilePathSource, Input } from "mediabunny";

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/probe-source.mjs <path>");
  process.exit(2);
}

// FilePathSource streams from disk, so this works on >2 GB raw interview files
// where readFile would throw ERR_FS_FILE_TOO_LARGE.
const input = new Input({
  formats: ALL_FORMATS,
  source: new FilePathSource(path),
});

const duration = await input.computeDuration();
process.stdout.write(`duration=${duration.toFixed(3)}\n`);

try {
  const tracks = await input.getTracks();
  const v = tracks.find((t) => t.type === "video");
  if (v) {
    process.stdout.write(`width=${v.codedWidth}\n`);
    process.stdout.write(`height=${v.codedHeight}\n`);
  }
} catch {
  // Width/height are nice-to-have, not required.
}
