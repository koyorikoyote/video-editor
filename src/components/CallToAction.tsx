import { ding, pageTurn } from "@remotion/sfx";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts } from "../fonts";
import { SAFE, theme } from "../theme";
import { useMasterVolume } from "../VolumeContext";
import { SoftGlint, WarmParticles } from "./MotionGraphics";

type Props = { sfxVolume: number };

export const CallToAction: React.FC<Props> = ({ sfxVolume }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const dingVol = useMasterVolume(0.4 * sfxVolume);
  const pageVol = useMasterVolume(0.35 * sfxVolume);
  const enter = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 130, mass: 0.7 },
  });

  const outroFade = interpolate(
    frame,
    [durationInFrames - fps * 0.6, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 45%, ${theme.charcoal} 0%, ${theme.ink} 65%, #0B0906 100%)`,
        opacity: outroFade,
      }}
    >
      <WarmParticles seed="cta" count={28} />
      <SoftGlint />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 24,
          paddingLeft: SAFE.titleX,
          paddingRight: SAFE.titleX,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 12}px)`,
        }}
      >
        {/* Trilingual subtitle row */}
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              fontFamily: fonts.jp,
              fontSize: 26,
              fontWeight: 700,
              color: theme.amber,
            }}
          >
            日本での未来を
          </span>
          <span style={{ color: theme.copper, opacity: 0.7 }}>·</span>
          <span
            style={{
              fontFamily: fonts.bn,
              fontSize: 26,
              fontWeight: 700,
              color: theme.amber,
            }}
          >
            জাপানে আপনার ভবিষ্যৎ
          </span>
          <span style={{ color: theme.copper, opacity: 0.7 }}>·</span>
          <span
            style={{
              fontFamily: fonts.en,
              fontSize: 26,
              fontWeight: 600,
              color: theme.amber,
              letterSpacing: 10,
            }}
          >
            YOUR FUTURE IN JAPAN
          </span>
        </div>

        {/* Hero — trilingual call */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontFamily: fonts.jp,
              fontSize: 96,
              fontWeight: 700,
              color: theme.softWhite,
              letterSpacing: 2,
              textShadow: "0 8px 40px rgba(0,0,0,0.55)",
            }}
          >
            今日、お申し込みください
          </div>
          <div
            style={{
              fontFamily: fonts.bn,
              fontSize: 64,
              fontWeight: 700,
              color: theme.amber,
              textShadow: "0 6px 30px rgba(0,0,0,0.5)",
            }}
          >
            আজই সাইন আপ করুন
          </div>
          <div
            style={{
              fontFamily: fonts.en,
              fontSize: 108,
              fontWeight: 700,
              color: theme.gold,
              lineHeight: 1.0,
              letterSpacing: -1,
              textShadow: "0 8px 40px rgba(0,0,0,0.55)",
            }}
          >
            Sign up today.
          </div>
        </div>

        {/* Restrained CTA button */}
        <div
          style={{
            marginTop: 8,
            padding: "18px 54px",
            background: theme.copper,
            color: theme.softWhite,
            fontFamily: fonts.en,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 2,
            borderRadius: 10,
            textTransform: "uppercase",
            boxShadow: `0 14px 40px rgba(197,123,58,0.35), inset 0 0 0 1px rgba(255,255,255,0.1)`,
          }}
        >
          Enroll Now · 入学 · ভর্তি
        </div>

        {/* Features — stacked trilingual */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "center",
            opacity: 0.82,
            marginTop: 4,
          }}
        >
          <div
            style={{
              fontFamily: fonts.jp,
              fontSize: 22,
              fontWeight: 500,
              color: theme.softWhite,
              letterSpacing: 2,
            }}
          >
            ダッカ · JLPT対策 · ネイティブ講師 · 就職支援
          </div>
          <div
            style={{
              fontFamily: fonts.bn,
              fontSize: 22,
              fontWeight: 500,
              color: theme.softWhite,
              letterSpacing: 1.5,
            }}
          >
            ঢাকা · JLPT প্রস্তুতি · নেটিভ শিক্ষক · চাকরি স্থাপন
          </div>
          <div
            style={{
              fontFamily: fonts.en,
              fontSize: 22,
              fontWeight: 500,
              color: theme.softWhite,
              letterSpacing: 3,
            }}
          >
            Dhaka · JLPT prep · Native teachers · Job placement
          </div>
        </div>
      </AbsoluteFill>

      {/* A single soft ding on entrance, no confetti */}
      <Sequence durationInFrames={Math.round(fps * 1)} layout="none">
        <Audio src={ding} volume={dingVol} />
      </Sequence>
      <Sequence
        from={Math.round(fps * 3.5)}
        durationInFrames={Math.round(fps * 1)}
        layout="none"
      >
        <Audio src={pageTurn} volume={pageVol} />
      </Sequence>
    </AbsoluteFill>
  );
};
