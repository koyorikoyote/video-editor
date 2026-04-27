import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts } from "../fonts";
import { SAFE, theme } from "../theme";
import {
  DriftingGlyphs,
  ImasFrontierMark,
  LightStreaks,
} from "./AmbitionGraphics";

export const ViralOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 130, mass: 0.7 },
  });

  const buttonPulse =
    1 + 0.04 * Math.sin((frame / fps) * Math.PI * 1.6);

  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps * 0.5, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const headlineFade = interpolate(frame, [fps * 0.5, fps * 1.0], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 50%, ${theme.charcoal} 0%, ${theme.ink} 65%, #0B0906 100%)`,
        opacity: fadeOut,
      }}
    >
      <DriftingGlyphs seed="outro" count={12} speed={24} />
      <LightStreaks count={4} />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 28,
          paddingLeft: SAFE.titleX,
          paddingRight: SAFE.titleX,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 16}px)`,
          textAlign: "center",
        }}
      >
        <ImasFrontierMark size="sm" />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            opacity: headlineFade,
          }}
        >
          <div
            style={{
              fontFamily: fonts.bn,
              fontSize: 48,
              fontWeight: 700,
              color: theme.softWhite,
              lineHeight: 1.2,
              textShadow: "0 6px 30px rgba(0,0,0,0.55)",
            }}
          >
            ঢাকায় শিখুন। জাপানে বাঁচুন।
          </div>
          <div
            style={{
              fontFamily: fonts.jp,
              fontSize: 44,
              fontWeight: 700,
              color: theme.amber,
              letterSpacing: 2,
              lineHeight: 1.2,
              textShadow: "0 4px 20px rgba(0,0,0,0.5)",
            }}
          >
            ダッカで学び、日本で生きる。
          </div>
          <div
            style={{
              fontFamily: fonts.en,
              fontSize: 40,
              fontWeight: 700,
              color: theme.gold,
              lineHeight: 1.1,
              letterSpacing: -0.3,
              textShadow: "0 4px 20px rgba(0,0,0,0.5)",
            }}
          >
            Learn in Dhaka. Live in Japan.
          </div>
        </div>

        <div
          style={{
            marginTop: 6,
            padding: "22px 56px",
            background: theme.copper,
            color: theme.softWhite,
            fontFamily: fonts.en,
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: 3,
            borderRadius: 12,
            textTransform: "uppercase",
            textAlign: "center",
            transform: `scale(${buttonPulse})`,
            boxShadow: `0 16px 44px rgba(197,123,58,0.4), inset 0 0 0 1px rgba(255,255,255,0.12)`,
          }}
        >
          Sign up · Imas Frontier
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            opacity: 0.85,
            marginTop: 4,
          }}
        >
          <div
            style={{
              fontFamily: fonts.bn,
              fontSize: 22,
              color: theme.softWhite,
              letterSpacing: 1,
            }}
          >
            ঢাকা · জাপানি ভাষা · জাপানে চাকরি
          </div>
          <div
            style={{
              fontFamily: fonts.en,
              fontSize: 20,
              color: theme.softWhite,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            Dhaka · Japanese language · Jobs in Japan
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
