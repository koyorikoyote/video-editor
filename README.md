# Bangladesh → Japan promo (Remotion)

Vertical 9:16 (1080×1920) promos for **Imas Frontier**, a Japanese-language
school in Dhaka. Two compositions:

- **`JapanPromo`** — full-length edit (hook → silence-stripped interview body
  → CTA), trilingual captions JP / BN / EN.
- **`ImasFrontierViralCut`** — opt-in 60–90 s social cut. Ollama
  (`gemma4:e4b`) curates the highest-hook Bengali testimonial segments,
  ffmpeg concats them, intro/outro motion graphics + sign-up button on top.

## Run order

One-time setup (PowerShell):

```powershell
npm install
winget install Gyan.FFmpeg                            # system ffmpeg has dynaudnorm/agate
pip install faster-whisper transformers torch
ollama pull gemma4:e4b                                # for the viral cut
```

### One-shot: `npm run pipeline`

```powershell
# Drop your raw interview MP4 into public/ first, then:
npm run pipeline
```

That runs [scripts/run-pipeline.ps1](scripts/run-pipeline.ps1) which:

1. Auto-discovers the source video in `public/` (largest video file that
   isn't a pipeline-generated output).
2. Auto-detects duration via ffmpeg and the silencedetect threshold via
   `loudnorm input_thresh`.
3. Runs steps 1 → 5a (`JapanPromo`) → 5b (`ImasFrontierViralCut`).

Useful flags:

```powershell
npm run pipeline -- -Src "public/foo.MP4"        # explicit source override
npm run pipeline -- -ViralOnly                   # re-run only the viral cut (5b)
npm run pipeline -- -SkipViral                   # JapanPromo only
npm run pipeline -- -SkipPolish -SkipTranscribe  # resume after editing captions
npm run pipeline -- -NoRender                    # build assets, skip remotion render
```

(The `--` is required by npm so the flags reach the underlying PowerShell
script instead of npm itself.)

### Manual run order

If you'd rather drive the steps yourself, here is what `npm run pipeline`
does. Re-run only from the step you changed.

PowerShell treats `<` and `>` as redirection operators, so do **not** paste
literal `<src>` placeholders — set these two variables first and the rest
of the block is copy-paste safe:

```powershell
# Set once at the top of your session:
$SRC      = "public/07_AKMSHAMIUL ISLAM.MP4"   # path to the raw interview
$DURATION = 501                                # source duration in seconds (see step 1a)
```

```powershell
# 1a. (Optional) measure source duration if you don't already know it
npx remotion ffmpeg -i "$SRC" -hide_banner 2>&1 | Select-String "Duration"

# 1b. Measure loudness floor — note the input_thresh value in the JSON output
npx remotion ffmpeg -i "$SRC" -map 0:a `
  -af loudnorm=print_format=json -f null NUL

# 1c. Detect silences using that threshold
$THRESH = -36
$LOG    = "$env:TEMP\silences.log"
npx remotion ffmpeg -i "$SRC" -map 0:a `
  -af "silencedetect=noise=$($THRESH)dB:d=0.5" -f null - 2> $LOG
node scripts/parse-silences.mjs "$LOG" $DURATION

# 2. Polish audio + strip silences  →  public/main-polished.mp4 + cutmap.ts
node scripts/polish-audio.mjs

# 2b. Whisper-input file (silences kept, audio enhanced)
ffmpeg -y -i "$SRC" -map 0:v -map 0:a `
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k `
  -af "highpass=f=80,lowpass=f=14000,afftdn=nr=12,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1.5:LRA=8,alimiter=limit=0.89" `
  public/main-enhanced.mp4

# 3. Transcribe — large-v3 (detect + ja) + mozilla-ai/whisper-large-v3-bn (bn)
$env:PYTHONIOENCODING = "utf-8"
$env:WHISPER_MODEL    = "large-v3"
$env:BN_MODEL         = "mozilla-ai/whisper-large-v3-bn"
python scripts/transcribe.py public/main-enhanced.mp4

# 4. Translate every segment via NLLB-200 (Transformers.js, direct ja↔bn)
node scripts/translate-nllb.mjs

# 5a. Full-length JapanPromo
node scripts/build-captions.mjs
npm run lint
npx remotion render JapanPromo                         # → out/japan-promo.mp4

# 5b. ImasFrontierViralCut (60–90 s social cut) — needs `ollama serve` running
npm run build:viral                                    # pick-viral.mjs + build-viral-cut.mjs
npm run render:viral                                   # → out/imas-frontier-viral.mp4
```

Both 5a and 5b are independent — run either, both, or neither, depending
on what you need.

First runs download models: `large-v3` ~3 GB, Bengali Whisper ~3 GB,
NLLB-200 ~600 MB, gemma4:e4b ~3 GB. Cached after that.

## Daily commands

```powershell
npm run dev                        # Studio at http://localhost:3000
npm run lint                       # eslint + tsc
npm run build:viral                # re-curate the viral cut
npx remotion render JapanPromo
npm run render:viral
```

`-SafeZone` variants of both compositions overlay mobile-safe-area guides —
render them to verify nothing critical sits under platform UI overlays.

## Viral cut module — env vars

`pick-viral.mjs` is the only Ollama-driven step.

| Var | Default | Purpose |
|---|---|---|
| `OLLAMA_MODEL` | `gemma4:e4b` | Model tag |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama host |
| `OLLAMA_GPU_LAYERS` | `-1` (all) | `0` to force CPU |
| `TARGET_MIN` / `TARGET_MAX` | `60` / `90` | Duration window (sec) |
| `FFMPEG` | `ffmpeg` | ffmpeg binary path used by `build-viral-cut.mjs` |

Disable the module without removing it: set `enabled: false` in the
`ImasFrontierViralCut` defaultProps in `src/Root.tsx`.

`public/viral-cut.json` is hand-editable between `pick-viral.mjs` and
`build-viral-cut.mjs` — tweak the picks or order, then re-run only step 5b.

## Repo layout

```
public/
  <source>.MP4              raw interview
  main-enhanced.mp4         Whisper input (silences kept)
  main-polished.mp4         JapanPromo input (silences stripped)
  viral-cut.mp4             ImasFrontierViralCut input (concatenated picks)
  transcript.json           Whisper output
  translations.json         NLLB-200 en + third-lang fills
  viral-cut.json            Ollama curator output (hand-editable)
  broll/manifest.json       Pexels B-roll (currently unused)

scripts/
  parse-silences.mjs        silencedetect log → src/data/silences.ts
  polish-audio.mjs          silences.ts → main-polished.mp4 + cutmap.ts
  transcribe.py             large-v3 (ja) + whisper-large-v3-bn (bn) → transcript.json
  translate-nllb.mjs        NLLB-200 → translations.json
  build-captions.mjs        transcript + translations + cutmap → captions.ts
  pick-viral.mjs            Ollama gemma4:e4b → viral-cut.json
  build-viral-cut.mjs       viral-cut.json + cutmap → viral-cut.mp4 + viralCut.ts
  fetch-broll.mjs           Pexels API → public/broll/

src/
  Root.tsx, Composition.tsx, ViralComposition.tsx, calcMetadata.ts
  theme.ts                  palette + 9:16 canvas + safe-zone constants
  fonts.ts                  Montserrat / Noto Sans JP / Noto Sans Bengali
  VolumeContext.tsx
  components/
    ViralHook.tsx           5 s opening (JapanPromo)
    MainSegment.tsx         interview body + captions (JapanPromo)
    CallToAction.tsx        6 s CTA (JapanPromo, Imas Frontier sign-up)
    Captions.tsx            JapanPromo trilingual caption renderer
    ViralIntro.tsx          1.8 s intro (ImasFrontierViralCut)
    ViralOutro.tsx          4 s outro w/ sign-up button (ImasFrontierViralCut)
    ViralCutCaptions.tsx    captions for the viral-cut timeline
    AmbitionGraphics.tsx    drifting kanji + light streaks + ImasFrontier mark
    ZoomVideo.tsx           Video + Ken Burns
    MotionGraphics.tsx      WarmParticles + SoftGlint
    SafeZone.tsx            dashed mobile-safe-area overlay
    VolumeOverlay.tsx       Studio-only volume sliders
  data/
    silences.ts, cutmap.ts, captions.ts            (auto-generated)
    viralCut.ts                                    (auto-generated by build-viral-cut.mjs)
    broll.ts, questions.ts                         (B-roll authoring, inactive)

patches/
  @remotion+studio+4.0.448.patch                   auto-applied by postinstall
```

## File regeneration

| File | Consumer | Regenerate when |
|---|---|---|
| `main-enhanced.mp4` | transcribe.py | source MP4 changes |
| `main-polished.mp4` | JapanPromo `<Video>` | silences change |
| `silences.ts` | polish-audio.mjs | source audio changes |
| `cutmap.ts` | Composition.tsx, build-captions.mjs, build-viral-cut.mjs | silences.ts changes |
| `transcript.json` | translate-nllb.mjs, build-captions.mjs, pick-viral.mjs | source speech changes |
| `translations.json` | build-captions.mjs, pick-viral.mjs | transcript.json changes |
| `captions.ts` | Captions.tsx | transcript or translations change |
| `viral-cut.json` | build-viral-cut.mjs | re-curate; hand-edit OK |
| `viral-cut.mp4` | ViralComposition `<Video>` | viral-cut.json changes |
| `viralCut.ts` | ViralCutCaptions.tsx | viral-cut.json changes |

## Tweaking

| What | Where |
|---|---|
| JapanPromo hook | `src/components/ViralHook.tsx` |
| JapanPromo CTA | `src/components/CallToAction.tsx` |
| JapanPromo caption style | `src/components/Captions.tsx` |
| Viral-cut intro / outro | `src/components/ViralIntro.tsx` / `ViralOutro.tsx` |
| Viral-cut caption style | `src/components/ViralCutCaptions.tsx` |
| Viral-cut motion graphics | `src/components/AmbitionGraphics.tsx` |
| Caption text | re-run `build-captions.mjs` / `build-viral-cut.mjs`; override translations in `public/translations.json` |
| Audio chain | `scripts/polish-audio.mjs` |
| Volume defaults | `defaultProps` in `src/Root.tsx` |
| Canvas / safe zone | `VIDEO_WIDTH`/`VIDEO_HEIGHT`/`SAFE` in `src/theme.ts` |

## B-roll (disabled)

Wired in [MainSegment.tsx](src/components/MainSegment.tsx) but commented out.
To re-enable: `export PEXELS_API_KEY=...`, `node scripts/fetch-broll.mjs ...`,
then mount `<BRoll>` gated by `data/broll.ts`.
