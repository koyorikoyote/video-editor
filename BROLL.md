# B-Roll (Pexels)

Auto-fetches free stock footage from Pexels and cuts it in over the main video.

## Setup

1. Get a free API key at https://www.pexels.com/api/
2. Set it in your shell:

   ```bash
   export PEXELS_API_KEY=your_key_here
   ```

## Fetch clips

Pass one or more search queries. Each query downloads up to 3 matching clips (3–20s duration) into `public/broll/`, plus a `manifest.json`.

```bash
node scripts/fetch-broll.mjs "japanese classroom" "tokyo street at night" "students studying"
```

Tunable via env: `BROLL_PER_QUERY`, `BROLL_MIN_SEC`, `BROLL_MAX_SEC`.

## Use in a composition

```tsx
import manifest from "../public/broll/manifest.json";
import { BRoll, pickClip } from "./BRoll";

const tokyoClip = pickClip(manifest, ["tokyo"]);

<BRoll
  clips={[
    { src: tokyoClip!.src, startFrame: 90, durationFrames: 60 },
  ]}
/>
```

`<BRoll>` renders each clip as a muted `OffthreadVideo` inside a `Sequence`. Wrap it in the same `<AbsoluteFill>` stack as your A-roll so it overlays at the intended frame ranges.

## Auto-placement from transcript

Pipeline:

1. Run faster-whisper → word-level segments.
2. Extract nouns/topics per segment (keyword extraction).
3. Match against `manifest.json` via `pickClip(manifest, keywords)`.
4. Emit `{startFrame, durationFrames, src}` entries for `<BRoll>`.

Keep cuts short (1.5–3s) and respect 16:9 safe zones — `objectFit: cover` avoids letterboxing but may crop the clip's edges.

## Attribution

Pexels requires photographer credit when practical. The manifest includes `photographer` and `pexelsUrl` fields — use them in your video credits or description.
