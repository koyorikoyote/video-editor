import "./index.css";
import { Composition, staticFile } from "remotion";
import { calcCompositionMetadata } from "./calcMetadata";
import { compositionSchema, MyComposition } from "./Composition";
import { CTA_FRAMES, FPS, HOOK_FRAMES, VIDEO_HEIGHT, VIDEO_WIDTH } from "./theme";

const sharedDefaults = {
  videoSrc: staticFile("main-polished.mp4"),
  hookFrames: HOOK_FRAMES,
  mainFrames: 30 * FPS,
  ctaFrames: CTA_FRAMES,
  // Conservative default for direct browser playback (was too loud at 0.6).
  // Loudnorm targets -18 LUFS in the polished file; 0.4 here keeps it
  // comfortable. Adjust in Studio with the Preview Volume sliders.
  masterVolume: 0.4,
  voiceVolume: 1.0,
  sfxVolume: 0.35,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="JapanPromo"
        component={MyComposition}
        schema={compositionSchema}
        durationInFrames={HOOK_FRAMES + 30 * FPS + CTA_FRAMES}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{
          ...sharedDefaults,
          showSafeZone: false,
        }}
        calculateMetadata={calcCompositionMetadata}
      />
      <Composition
        id="JapanPromo-SafeZone"
        component={MyComposition}
        schema={compositionSchema}
        durationInFrames={HOOK_FRAMES + 30 * FPS + CTA_FRAMES}
        fps={FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{
          ...sharedDefaults,
          showSafeZone: true,
        }}
        calculateMetadata={calcCompositionMetadata}
      />
    </>
  );
};
