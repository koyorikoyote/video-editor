import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { captions, TriCaption } from "../data/captions";
import { fonts } from "../fonts";
import { SAFE, theme } from "../theme";

type Props = {
  offsetSec?: number;
};

// Caption timestamps are authored in TRIMMED-timeline seconds (matching
// public/main-polished.mp4), so no remap is needed.
export const Captions: React.FC<Props> = ({ offsetSec = 0 }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {captions.map((c, i) => {
        const from = Math.round((c.startSec + offsetSec) * fps);
        const dur = Math.max(1, Math.round((c.endSec - c.startSec) * fps));
        return (
          <Sequence
            key={i}
            from={from}
            durationInFrames={dur}
            layout="none"
          >
            <CaptionCard caption={c} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CaptionCard: React.FC<{ caption: TriCaption }> = ({ caption }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const inT = Math.min(1, frame / (fps * 0.4));
  const outStart = durationInFrames - fps * 0.35;
  const outT = Math.max(0, Math.min(1, (frame - outStart) / (fps * 0.35)));

  const opacity =
    interpolate(inT, [0, 1], [0, 1], {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }) *
    (1 - outT);
  const translateY = interpolate(inT, [0, 1], [14, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const isBottom = caption.position !== "top";
  const verticalStyle: React.CSSProperties = isBottom
    ? { bottom: 60 }
    : { top: 60 };

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: SAFE.titleX,
          right: SAFE.titleX,
          ...verticalStyle,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 5,
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <Line
          text={caption.jp}
          family={fonts.jp}
          size={28}
          weight={700}
          color={theme.gold}
          accent={theme.amber}
        />
        <Line
          text={caption.bn}
          family={fonts.bn}
          size={26}
          weight={700}
          color={theme.amber}
          accent={theme.copper}
        />
        <Line
          text={caption.en}
          family={fonts.en}
          size={22}
          weight={600}
          color={theme.softWhite}
          accent={theme.copper}
        />
      </div>
    </AbsoluteFill>
  );
};

const Line: React.FC<{
  text: string;
  family: string;
  size: number;
  weight: number;
  color: string;
  accent: string;
}> = ({ text, family, size, weight, color, accent }) => (
  <div
    style={{
      fontFamily: family,
      fontSize: size,
      fontWeight: weight,
      color,
      textAlign: "center",
      lineHeight: 1.15,
      letterSpacing: 0.2,
      padding: "4px 14px",
      background: "rgba(14,10,6,0.72)",
      borderLeft: `3px solid ${accent}`,
      borderRadius: 5,
      backdropFilter: "blur(6px)",
      textShadow: "0 2px 8px rgba(0,0,0,0.6)",
      maxWidth: "82%",
    }}
  >
    {text}
  </div>
);
