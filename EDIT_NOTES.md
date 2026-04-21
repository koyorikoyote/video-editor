# Japan Promo Edit

16:9 (1920×1080 @ 30fps) promotional video for a Japanese language school in
Bangladesh, built in Remotion.

## Structure

```
ViralHook   ──6f──  MainSegment  ──6f──  CallToAction
  5.0s                ~501s                6.0s
```

- **ViralHook** (`src/components/ViralHook.tsx`) — three beats in 5s: whip-pan
  "STOP SCROLLING" with a whip SFX; trilingual question (日本に行きたい？ / জাপানে যেতে
  চান? / Dream of Japan?); "LEARN JAPANESE IN DHAKA." reveal with confetti +
  vine-boom SFX + tricolor Bangladesh/Japan/gold underline.
- **MainSegment** (`src/components/MainSegment.tsx`) — A-roll with Ken Burns
  (1.0→1.06 scale, subtle pan), corner badge, animated lower-third chyron,
  progress dots, vignette, B-roll overlays (when manifest present), per-cut
  whoosh SFX, trilingual captions.
- **CallToAction** (`src/components/CallToAction.tsx`) — rotating conic-gradient
  rays, trilingual "SIGN UP TODAY / 今日お申し込みください / আজই সাইন আপ করুন",
  bobbing CTA button with dual-mono ding+whoosh SFX, confetti burst.

## 16:9 safe zones

Defined in `src/theme.ts` (`SAFE.actionX/Y`, `SAFE.titleX/Y`). All text blocks
(captions, chyron, CTA, corner badge) are positioned inside the title-safe
rectangle. Render the `JapanPromo-SafeZone` composition to see the guides
overlaid (dashed yellow = title safe, white = action safe).

## Audio pipeline

The 3.3 GB source is raw 48 kHz PCM at -25.83 LUFS (well below broadcast).
`public/main-enhanced.mp4` was produced with system ffmpeg:

```
highpass=80Hz → lowpass=14kHz → afftdn (noise reduction)
  → acompressor (3:1 @ -20dB)
  → loudnorm=I=-14:TP=-1.5:LRA=8
  → alimiter=0.89
```

Result: 289 MB, 30fps H.264, AAC 192k at -14 LUFS (YouTube/IG target),
peak-limited. To re-run with different parameters:

```bash
ffmpeg -y -i "public/07_AKMSHAMIUL ISLAM.MP4" -map 0:v -map 0:a \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k \
  -af "highpass=f=80,lowpass=f=14000,afftdn=nr=12,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1.5:LRA=8,alimiter=limit=0.89" \
  public/main-enhanced.mp4
```

Requires a full ffmpeg install (the Remotion-bundled ffmpeg lacks `highpass`,
`afftdn`, `acompressor`, `alimiter`).

## Silence detection

`src/data/silences.ts` holds the leading/trailing trim points plus every silent
segment (61 of them for this source). Regenerate with:

```bash
node scripts/detect-silences.mjs public/main-enhanced.mp4
```

Currently only leading/trailing silences are trimmed via `<Video trimBefore
trimAfter>`. This source has no leading/trailing silence, so no trim. The full
segment list is preserved so you can add internal jump-cut editing later by
converting each non-silent span into a `<Series.Sequence>` with its own
`trimBefore`/`trimAfter`.

## Captions

`src/data/captions.ts` holds the trilingual track (JP / BN / EN, timed in
seconds). The current track covers the first ~52 s and is placeholder
copywriting — I could not transcribe the 8-minute source in-session. To
populate the full run:

1. Transcribe the source with Whisper (`faster-whisper` or `whisper.cpp`).
2. Translate each segment to JP and BN.
3. Fill `captions.ts` with one entry per segment.

Captions render below the title-safe rectangle so they stay out of face zones
in interview footage. Edit `position: "top"` on a caption if a particular
segment has the speaker in the lower half.

## B-roll

The existing Pexels fetcher is wired in (`scripts/fetch-broll.mjs`,
`src/BRoll.tsx`). Cue points are in `src/data/broll.ts`. To populate:

```bash
export PEXELS_API_KEY=...
node scripts/fetch-broll.mjs "japanese classroom" "tokyo street" \
  "students studying" "japanese office" "dhaka city" "graduation"
```

`calculateMetadata` auto-loads `public/broll/manifest.json` if present, and
`MainSegment` matches cues against it by keyword. No API key → B-roll cues are
simply skipped (the A-roll plays through).

## Sound effects

All SFX are from `@remotion/sfx` (remotion.media CDN): `whip`, `whoosh`,
`vineBoom`, `ding`. Timing is defined per-scene in the component files.

## Running

```bash
npm run dev                # Remotion Studio
npx remotion render JapanPromo --concurrency=4
npx remotion still JapanPromo --frame=90 /tmp/hook.png    # sanity check
```

`JapanPromo-SafeZone` is the same composition with the safe-zone guides turned
on — useful when tweaking caption positions.

## Known limitations (what this edit does *not* do automatically)

- **Blooper/filler removal** — requires human judgment or a transcript. The
  silence map catches pauses but not "um / uh / restart" patterns. Trim
  problematic spans in Studio by splitting the `MainSegment` into multiple
  `<Video trimBefore trimAfter>` sequences.
- **Full-length captions** — see above; placeholder covers only the first ~52
  s.
- **Internal silence jump-cuts** — infrastructure is in place
  (`silences.segments`) but not wired. Requires mapping caption timestamps
  through the cut list if enabled.
