import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ViralCaption, viralCutCaptions } from "../data/viralCut";
import { fonts } from "../fonts";
import { SAFE, theme } from "../theme";

// Caption renderer for the Imas Frontier viral cut. Reads viralCut.ts
// (timestamps in the concatenated viral-cut.mp4 timeline). Larger
// typography than the main-edit Captions to read on phone screens at arm's
// length while scrolling.
type Props = { offsetSec?: number };

export const ViralCutCaptions: React.FC<Props> = ({ offsetSec = 0 }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {viralCutCaptions.map((c, i) => {
        const from = Math.round((c.startSec + offsetSec) * fps);
        const dur = Math.max(1, Math.round((c.endSec - c.startSec) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <CaptionCard caption={c} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CaptionCard: React.FC<{ caption: ViralCaption }> = ({ caption }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const inT = Math.min(1, frame / (fps * 0.35));
  const outStart = durationInFrames - fps * 0.3;
  const outT = Math.max(0, Math.min(1, (frame - outStart) / (fps * 0.3)));

  const opacity =
    interpolate(inT, [0, 1], [0, 1], {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }) *
    (1 - outT);
  const translateY = interpolate(inT, [0, 1], [18, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: SAFE.titleX,
          right: SAFE.titleX,
          bottom: SAFE.titleY,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        {/* Bengali leads (it's the spoken language) */}
        <Line
          text={caption.bn}
          family={fonts.bn}
          size={42}
          weight={700}
          color={theme.softWhite}
          accent={theme.copper}
        />
        <Line
          text={caption.jp}
          family={fonts.jp}
          size={34}
          weight={700}
          color={theme.gold}
          accent={theme.amber}
        />
        <Line
          text={caption.en}
          family={fonts.en}
          size={30}
          weight={600}
          color={theme.amber}
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
}> = ({ text, family, size, weight, color, accent }) => {
  if (!text) return null;
  return (
    <div
      style={{
        fontFamily: family,
        fontSize: size,
        fontWeight: weight,
        color,
        textAlign: "center",
        lineHeight: 1.18,
        letterSpacing: 0.3,
        padding: "8px 18px",
        background: "rgba(14,10,6,0.78)",
        borderLeft: `4px solid ${accent}`,
        borderRadius: 6,
        backdropFilter: "blur(8px)",
        textShadow: "0 2px 10px rgba(0,0,0,0.7)",
        maxWidth: "94%",
      }}
    >
      {text}
    </div>
  );
};
