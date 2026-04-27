import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts } from "../fonts";
import { theme } from "../theme";
import {
  DriftingGlyphs,
  ImasFrontierMark,
  LightStreaks,
} from "./AmbitionGraphics";

export const ViralIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps * 0.4, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const taglineEnter = interpolate(frame, [fps * 0.6, fps * 1.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 35%, ${theme.charcoal} 0%, ${theme.ink} 60%, #0A0805 100%)`,
        opacity: fadeOut,
      }}
    >
      <DriftingGlyphs seed="intro" count={14} speed={28} />
      <LightStreaks count={5} />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 32,
          padding: "0 80px",
          textAlign: "center",
        }}
      >
        <ImasFrontierMark size="lg" />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            opacity: taglineEnter,
            transform: `translateY(${(1 - taglineEnter) * 12}px)`,
          }}
        >
          <span
            style={{
              fontFamily: fonts.bn,
              fontSize: 36,
              fontWeight: 700,
              color: theme.amber,
            }}
          >
            ঢাকা থেকে জাপান
          </span>
          <span
            style={{
              fontFamily: fonts.jp,
              fontSize: 32,
              fontWeight: 700,
              color: theme.gold,
              letterSpacing: 4,
            }}
          >
            ダッカから日本へ
          </span>
          <span
            style={{
              fontFamily: fonts.en,
              fontSize: 26,
              fontWeight: 600,
              color: theme.softWhite,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            Dhaka to Japan
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
