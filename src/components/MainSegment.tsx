import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useMasterVolume } from "../VolumeContext";
import { Captions } from "./Captions";
import { ZoomVideo } from "./ZoomVideo";

type Props = {
  videoSrc: string;
  voiceVolume: number;
};

export const MainSegment: React.FC<Props> = ({ videoSrc, voiceVolume }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const voiceVol = useMasterVolume(voiceVolume);

  const fadeIn = interpolate(frame, [0, fps * 0.6], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps * 0.6, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut, background: "#0E0A06" }}>
      {/* A-roll with slow Ken Burns. Polished video has silences stripped. */}
      <ZoomVideo src={videoSrc} zoomCycleSec={20} volume={voiceVol} />

      {/* Warm vignette for readability */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(14,10,6,0.55) 100%)",
        }}
      />

      {/* Trilingual captions */}
      <Captions />
    </AbsoluteFill>
  );
};
