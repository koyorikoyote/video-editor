import type { CalculateMetadataFunction } from "remotion";
import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
import { trimmedDurationSec } from "./data/cutmap";
import type { CompositionProps } from "./Composition";
import { CTA_FRAMES, FPS, HOOK_FRAMES } from "./theme";

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
