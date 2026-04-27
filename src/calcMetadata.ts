import type { CalculateMetadataFunction } from "remotion";
import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
import { trimmedDurationSec } from "./data/cutmap";
import { viralCutDurationSec } from "./data/viralCut";
import type { CompositionProps } from "./Composition";
import type { ViralProps } from "./ViralComposition";
import { CTA_FRAMES, FPS, HOOK_FRAMES } from "./theme";

export const VIRAL_INTRO_FRAMES = Math.round(1.8 * FPS);
export const VIRAL_OUTRO_FRAMES = Math.round(4.0 * FPS);

export const calcCompositionMetadata: CalculateMetadataFunction<
  CompositionProps
> = async ({ props }) => {
  const src = props.videoSrc;
  let durationSec = trimmedDurationSec;

  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(src, { getRetryDelay: () => null }),
    });
    const computed = await input.computeDuration();
    // Only trust the probe if it's plausibly close to the expected trim;
    // a half-encoded file or truncated stream can return a bogus value.
    if (computed > 30) durationSec = computed;
  } catch {
    // Fallback to cutmap's trimmed duration
  }

  const mainFrames = Math.max(FPS, Math.round(durationSec * FPS));

  const totalFrames = HOOK_FRAMES + mainFrames + CTA_FRAMES - 12; // offsets -6 twice
  return {
    durationInFrames: totalFrames,
    defaultOutName: "out/japan-promo",
    props: {
      ...props,
      hookFrames: HOOK_FRAMES,
      mainFrames,
      ctaFrames: CTA_FRAMES,
    },
  };
};

export const calcViralMetadata: CalculateMetadataFunction<ViralProps> = async ({
  props,
}) => {
  // Probe the actual built file when available; fall back to the static
  // viralCutDurationSec so the composition still mounts before the pipeline
  // has run.
  let durationSec = viralCutDurationSec;
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(props.videoSrc, { getRetryDelay: () => null }),
    });
    const computed = await input.computeDuration();
    if (computed > 5) durationSec = computed;
  } catch {
    // Use static fallback
  }

  const mainFrames = Math.max(FPS, Math.round(durationSec * FPS));
  const totalFrames =
    VIRAL_INTRO_FRAMES + mainFrames + VIRAL_OUTRO_FRAMES - 8; // offsets -4 twice

  return {
    durationInFrames: totalFrames,
    defaultOutName: "out/imas-frontier-viral",
    props: {
      ...props,
      introFrames: VIRAL_INTRO_FRAMES,
      mainFrames,
      outroFrames: VIRAL_OUTRO_FRAMES,
    },
  };
};
