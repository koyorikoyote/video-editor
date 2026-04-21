# Bangladesh → Japan promo (Remotion)

A 16:9 promotional video for a Japanese-language school in Dhaka. Built with
Remotion. The pipeline takes a raw interview MP4 and produces a polished
edit with:

- 5 s viral hook (trilingual: JP / BN / EN)
- Main interview body — silence-stripped, denoised, level-controlled
- 6 s CTA (trilingual)
- Animated trilingual captions (JP / BN / EN) — transcribed from the actual
  speech with Whisper (`large-v3`) + per-chunk language detection

## Daily commands

```bash
npm i              # install JS deps
npm run dev        # Remotion Studio preview (http://localhost:3000)
npm run lint       # eslint + tsc
npx remotion render JapanPromo           # writes to out/japan-promo.mp4 (defaultOutName in calcMetadata.ts)
```

The `JapanPromo-SafeZone` composition shows 16:9 title-safe / action-safe
guides as a dashed overlay — render it to verify nothing important sits
outside the safe area.

In Studio, use the volume sliders in the top-right of the preview canvas
(Master / Voice / SFX) to balance audio live before rendering. Their
default values come from the composition's `defaultProps` and apply to
the final render too.

## Re-running the pipeline on a new source video

The full pipeline is six steps. Each is one shell command. Re-run only the
steps after the one you changed.

### Prerequisites (one-time)

```bash
# JS deps
npm install

# System ffmpeg (the Remotion-bundled ffmpeg lacks dynaudnorm, agate, etc.)
# Install via your OS package manager. On Windows: winget install Gyan.FFmpeg

# Python deps for transcription
pip install faster-whisper argostranslate
```

### Step 1 — Drop the new source MP4 into `public/`

```
public/<your-source>.MP4
```

Edit any path constants in the scripts below if your filename differs from
the default `07_AKMSHAMIUL ISLAM.MP4`.

### Step 2 — Detect silences

```bash
# Measure loudness floor + silences (uses the Remotion-bundled ffmpeg)
npx remotion ffmpeg -i "public/<your-source>.MP4" -map 0:a \
  -af loudnorm=print_format=json -f null /dev/null
# Note the input_thresh value, then:

THRESH=-36   # use the input_thresh number from above
npx remotion ffmpeg -i "public/<your-source>.MP4" -map 0:a \
  -af "silencedetect=noise=${THRESH}dB:d=0.5" -f null - \
  2>/tmp/silences.log

# Parse the log into src/data/silences.ts
node scripts/parse-silences.mjs /tmp/silences.log <total_duration_seconds>
```

`<total_duration_seconds>` is the source video duration (run
`ffprobe -i "public/<your-source>.MP4"` to get it).

### Step 3 — Polish: enhance audio + strip silences

```bash
# System ffmpeg required (uses agate / afftdn / anlmdn / dynaudnorm).
# Reads src/data/silences.ts; writes:
#   public/main-polished.mp4   (silence-stripped, denoised, levelled)
#   src/data/cutmap.ts         (kept-segments + remapTime helper)
node scripts/polish-audio.mjs
```

The audio chain:
`agate -45 dB → afftdn nr=30 → anlmdn → highpass 95 / lowpass 11.5 kHz →
dynaudnorm (consistent voice levels) → acompressor 3:1 → loudnorm -18 LUFS
→ alimiter 0.83`

Edit `scripts/polish-audio.mjs` to tune. The `-18 LUFS` target is
calibrated for web-browser playback; raise to `-14` for YouTube.

You'll also want to also produce a non-trimmed enhanced file for Whisper
(silences kept so VAD can split language switches naturally):

```bash
ffmpeg -y -i "public/<your-source>.MP4" \
  -map 0:v -map 0:a -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p \
  -r 30 -c:a aac -b:a 192k \
  -af "highpass=f=80,lowpass=f=14000,afftdn=nr=12,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1.5:LRA=8,alimiter=limit=0.89" \
  public/main-enhanced.mp4
```

### Step 4 — Transcribe (Whisper `large-v3`)

```bash
# Per-VAD-chunk dual-pass: forces both ja and bn for each chunk and picks
# whichever produced its expected script. Uses main-enhanced.mp4 (silences
# kept) so VAD splits Q/A boundaries naturally.
PYTHONIOENCODING=utf-8 WHISPER_MODEL=large-v3 \
  python scripts/transcribe.py public/main-enhanced.mp4

# Output: public/transcript.json
#   [{ startSec, endSec, lang, source, english,
#      ja_logprob, bn_logprob, ja_chars, bn_chars }]
```

Models:
- `large-v3` (~3 GB): best Bengali quality. Slow on CPU (~45-60 min for
  ~7 min of audio). **Recommended.**
- `medium` (~1.5 GB): faster but Bengali transcription is poor.
- `small` / `base` / `tiny`: not usable for non-English.

Each chunk runs **three** model passes (force-ja transcribe + force-bn
transcribe + translate in the chosen language), so wall time scales with
chunk count, not just audio length.

If a chunk's audio is mostly noise, both forced passes fail to produce
script-language characters and the chunk is skipped — see the
`no script` lines in the transcribe log.

### Step 5 — Fill in the third-language translations (Argos)

Whisper translates X → English only. The third language (e.g. JP for a
Bengali-source segment) is filled in by Argos Translate, routing through
English: BN → EN → JP, JP → EN → BN.

```bash
python scripts/fill-third-lang.py
# Output: public/translations.json
#   {"<startSec>-<endSec>": { "bn": "..." }} or {"...":{ "jp": "..." }}
```

First run downloads the Argos language packages (`en→ja`, `ja→en`,
`en→bn`, `bn→en`) — ~200 MB total. Subsequent runs are instant.

### Step 6 — Build captions + render

```bash
# Reads transcript.json + translations.json + cutmap.ts.
# Remaps original-time to trimmed-time via cutmap.remapTime().
# Writes src/data/captions.ts (consumed by src/components/Captions.tsx).
node scripts/build-captions.mjs

# Verify
npm run lint                       # eslint + tsc
npx remotion still JapanPromo --scale=0.5 --frame=300 /tmp/check.png

# Render
npx remotion render JapanPromo
```

## Repo layout

```
public/
  <source>.MP4              # raw interview
  main-enhanced.mp4         # full source, audio enhanced (silences kept) — Whisper input
  main-polished.mp4         # silences stripped + aggressive denoise/leveling — composition input
  transcript.json           # Whisper output (auto-generated)
  translations.json         # Argos third-lang fills (auto-generated)
  broll/manifest.json       # Pexels B-roll (currently unused, see "B-roll" below)

scripts/
  parse-silences.mjs        # silencedetect log → src/data/silences.ts
  polish-audio.mjs          # silences.ts → main-polished.mp4 + cutmap.ts
  transcribe.py             # Whisper large-v3 → transcript.json
  fill-third-lang.py        # Argos → translations.json
  build-captions.mjs        # transcript + translations + cutmap → captions.ts
  fetch-broll.mjs           # Pexels API → public/broll/

src/
  Root.tsx                  # composition registration
  Composition.tsx           # JapanPromo composition (Hook → Main → CTA)
  fonts.ts                  # Google Fonts (Montserrat, Noto Sans JP, Noto Sans Bengali)
  theme.ts                  # warm/professional palette + safe-zone constants
  VolumeContext.tsx         # master volume context for Studio + render
  calcMetadata.ts           # dynamic duration from cutmap.ts
  components/
    ViralHook.tsx           # 5 s trilingual opening
    MainSegment.tsx         # interview body with captions
    CallToAction.tsx        # 6 s trilingual CTA
    Captions.tsx            # animated trilingual caption renderer
    ZoomVideo.tsx           # @remotion/media Video + Ken Burns
    MotionGraphics.tsx      # WarmParticles + SoftGlint
    SafeZone.tsx            # dashed 16:9 safe-area overlay
    VolumeOverlay.tsx       # Studio-only live volume slider (hidden in render)
  data/
    silences.ts             # silencedetect output (auto-generated)
    cutmap.ts               # kept segments + remapTime() (auto-generated)
    captions.ts             # trilingual caption track (auto-generated)
    broll.ts, questions.ts  # B-roll cue authoring (currently inactive)

patches/
  @remotion+studio+4.0.448.patch   # 4 sites: draw-peaks crash + ForceSpecificCursor mount
                                   # auto-applied by postinstall (patch-package)
```

## B-roll (currently disabled)

The B-roll system is wired but disabled in [MainSegment.tsx](src/components/MainSegment.tsx).
To re-enable:

1. `export PEXELS_API_KEY=...` ([sign up](https://www.pexels.com/api/)).
2. `node scripts/fetch-broll.mjs "japanese office workers" "japanese business meeting" ...`
3. Edit `MainSegment.tsx` to import + render the `<BRoll>` component, gated
   by the cue list in `data/broll.ts` (which itself is built from
   `data/questions.ts`).

## Tweaking the edit

- **Hook copy / styling**: `src/components/ViralHook.tsx`
- **CTA copy / styling**: `src/components/CallToAction.tsx`
- **Caption styling** (font sizes, colors, positions): `src/components/Captions.tsx`
- **Caption text**: do not hand-edit `src/data/captions.ts` — re-run
  `scripts/build-captions.mjs` instead. To override a translation,
  edit `public/translations.json` and re-run the builder.
- **Audio chain**: `scripts/polish-audio.mjs`. Re-run after edits.
- **Volume defaults**: `defaultProps` in `src/Root.tsx`
  (`masterVolume`, `voiceVolume`, `sfxVolume`).
- **Safe-zone dimensions**: `SAFE` constants in `src/theme.ts`.

## Knowing what each output file is for

| File | Used by | When to regenerate |
|---|---|---|
| `public/main-enhanced.mp4` | Whisper transcription | When the source MP4 changes |
| `public/main-polished.mp4` | Composition (`<Video>`) | When silence detection changes |
| `src/data/silences.ts` | `polish-audio.mjs` | When source audio changes |
| `src/data/cutmap.ts` | `Composition.tsx`, `build-captions.mjs` | When silences.ts changes |
| `public/transcript.json` | `build-captions.mjs` | When source speech changes |
| `public/translations.json` | `build-captions.mjs` | When transcript.json changes |
| `src/data/captions.ts` | `Captions.tsx` | When transcript or translations change |
