import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Props = {
  src: string;
  trimBeforeFrames?: number;
  trimAfterFrames?: number;
  zoomCycleSec?: number;
  muted?: boolean;
  volume?: number;
};

// Slow Ken Burns: scale oscillates 1.00 <-> 1.06 over zoomCycleSec, with subtle pan.
export const ZoomVideo: React.FC<Props> = ({
  src,
  trimBeforeFrames,
  trimAfterFrames,
  zoomCycleSec = 14,
  muted = false,
  volume = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cycle = zoomCycleSec * fps;
  const t = (frame % cycle) / cycle;
  const easedT = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  const scale = interpolate(easedT, [0, 1], [1.0, 1.06], {
    easing: Easing.inOut(Easing.ease),
  });
  const panX = interpolate(easedT, [0, 1], [-12, 12]);
  const panY = interpolate(easedT, [0, 1], [6, -6]);

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        transform: `scale(${scale}) translate(${panX}px, ${panY}px)`,
        transformOrigin: "center center",
      }}
    >
      <Video
        src={src}
        trimBefore={trimBeforeFrames}
        trimAfter={trimAfterFrames}
        muted={muted}
        volume={volume}
        objectFit="cover"
        style={{ width: "100%", height: "100%" }}
      />
    </AbsoluteFill>
  );
};
