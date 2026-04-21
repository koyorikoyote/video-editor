import { pageTurn, shutterModern, whoosh } from "@remotion/sfx";
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts } from "../fonts";
import { theme } from "../theme";
import { useMasterVolume } from "../VolumeContext";
import { WarmParticles } from "./MotionGraphics";

type Props = { sfxVolume: number };

type TriLine = {
  jp: string;
  bn: string;
  en: string;
};

export const ViralHook: React.FC<Props> = ({ sfxVolume }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pageVol = useMasterVolume(0.45 * sfxVolume);
  const shutterVol = useMasterVolume(0.35 * sfxVolume);
  const whooshVol = useMasterVolume(0.25 * sfxVolume);

  const bgShift = interpolate(frame, [0, fps * 5], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${135 + bgShift * 15}deg, ${theme.ink} 0%, ${theme.charcoal} 40%, #3d3024 75%, ${theme.copper} 100%)`,
      }}
    >
      <WarmParticles seed="hook" />
      <VignetteWarm />

      {/* Beat 1: 0.0 - 1.6s — warm trilingual invitation */}
      <Sequence durationInFrames={Math.round(fps * 1.6)} layout="none">
        <Invitation />
      </Sequence>

      {/* Beat 2: 1.6 - 3.0s — trilingual question */}
      <Sequence
        from={Math.round(fps * 1.6)}
        durationInFrames={Math.round(fps * 1.4)}
        layout="none"
      >
        <Question />
      </Sequence>

      {/* Beat 3: 3.0 - 5.0s — trilingual promise */}
      <Sequence
        from={Math.round(fps * 3.0)}
        durationInFrames={Math.round(fps * 2.0)}
        layout="none"
      >
        <Promise />
      </Sequence>

      {/* SFX — soft, paper-like */}
      <Sequence durationInFrames={Math.round(fps * 1)} layout="none">
        <Audio src={pageTurn} volume={pageVol} />
      </Sequence>
      <Sequence
        from={Math.round(fps * 1.6)}
        durationInFrames={Math.round(fps * 1)}
        layout="none"
      >
        <Audio src={shutterModern} volume={shutterVol} />
      </Sequence>
      <Sequence
        from={Math.round(fps * 3.0)}
        durationInFrames={Math.round(fps * 1)}
        layout="none"
      >
        <Audio src={whoosh} volume={whooshVol} />
      </Sequence>
    </AbsoluteFill>
  );
};

const VignetteWarm: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background:
        "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(14,10,6,0.65) 100%)",
    }}
  />
);

// ---------- Beat 1: Invitation ----------
const Invitation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tagline: TriLine = {
    jp: "新しい道、日本へ",
    bn: "জাপানের নতুন পথ",
    en: "A NEW PATH TO JAPAN",
  };
  const hero: TriLine = {
    jp: "日本語を学び、未来を築く。",
    bn: "জাপানি শিখুন। ভবিষ্যৎ গড়ুন।",
    en: "Learn Japanese. Build your future.",
  };

  const rise = interpolate(frame, [0, fps * 0.6], [24, 0], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const fadeIn = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [fps * 1.2, fps * 1.55], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = fadeIn * fadeOut;

  const underline = interpolate(frame, [fps * 0.4, fps * 1.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 18,
        paddingLeft: 160,
        paddingRight: 160,
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <TaglineTrio trio={tagline} />
      <HeroTrio trio={hero} accent={theme.copper} />
      <div
        style={{
          height: 3,
          width: `${underline * 260}px`,
          background: `linear-gradient(90deg, transparent, ${theme.copper}, transparent)`,
          opacity: 0.9,
        }}
      />
    </AbsoluteFill>
  );
};

// ---------- Beat 2: Question ----------
const Question: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = [
    { text: "日本で働きたい？", family: fonts.jp, color: theme.softWhite, weight: 700, size: 86 },
    { text: "জাপানে কাজ করতে চান?", family: fonts.bn, color: theme.amber, weight: 700, size: 64 },
    { text: "Dream of working in Japan?", family: fonts.en, color: theme.gold, weight: 600, size: 54 },
  ];
  const outFade = interpolate(frame, [fps * 1.1, fps * 1.4], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 16,
        opacity: outFade,
      }}
    >
      {lines.map((l, i) => {
        const appear = spring({
          frame: frame - i * 5,
          fps,
          config: { damping: 18, stiffness: 120, mass: 0.6 },
        });
        return (
          <div
            key={i}
            style={{
              fontFamily: l.family,
              fontWeight: l.weight,
              fontSize: l.size,
              color: l.color,
              transform: `translateY(${(1 - appear) * 22}px)`,
              opacity: appear,
              textShadow: "0 4px 24px rgba(0,0,0,0.55)",
              letterSpacing: 1,
            }}
          >
            {l.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- Beat 3: Promise ----------
const Promise: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tagline: TriLine = {
    jp: "ダッカ · 東京",
    bn: "ঢাকা · টোকিও",
    en: "DHAKA · TOKYO",
  };
  const hero: TriLine = {
    jp: "ダッカで学び、日本で働く。",
    bn: "ঢাকায় পড়ুন। জাপানে কাজ করুন।",
    en: "Study in Dhaka. Work in Japan.",
  };

  const entrance = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 130, mass: 0.7 },
  });
  const underline = interpolate(frame, [fps * 0.45, fps * 1.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: 16,
        padding: "0 160px",
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 10}px)`,
      }}
    >
      <TaglineTrio trio={tagline} />
      <HeroTrio trio={hero} accent={theme.gold} />
      <div
        style={{
          height: 4,
          width: `${underline * 40}%`,
          background: theme.copper,
          borderRadius: 2,
          marginTop: 10,
          opacity: 0.9,
        }}
      />
    </AbsoluteFill>
  );
};

// ---------- shared trilingual components ----------

// Small tagline: all three languages on one horizontal row, separated by dots.
const TaglineTrio: React.FC<{ trio: TriLine }> = ({ trio }) => (
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
    <span style={{ fontFamily: fonts.jp, fontSize: 22, fontWeight: 700, color: theme.amber }}>
      {trio.jp}
    </span>
    <span style={{ color: theme.copper, opacity: 0.7 }}>·</span>
    <span style={{ fontFamily: fonts.bn, fontSize: 22, fontWeight: 700, color: theme.amber }}>
      {trio.bn}
    </span>
    <span style={{ color: theme.copper, opacity: 0.7 }}>·</span>
    <span style={{ fontFamily: fonts.en, fontSize: 22, fontWeight: 600, color: theme.amber, letterSpacing: 10 }}>
      {trio.en}
    </span>
  </div>
);

// Hero line: stacked JP (top, large), BN (middle), EN (bottom, subtitle).
const HeroTrio: React.FC<{ trio: TriLine; accent: string }> = ({ trio, accent }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      textAlign: "center",
    }}
  >
    <div
      style={{
        fontFamily: fonts.jp,
        fontSize: 84,
        fontWeight: 700,
        color: theme.softWhite,
        letterSpacing: 2,
        lineHeight: 1.1,
        textShadow: "0 6px 30px rgba(0,0,0,0.5)",
      }}
    >
      {trio.jp}
    </div>
    <div
      style={{
        fontFamily: fonts.bn,
        fontSize: 56,
        fontWeight: 700,
        color: accent,
        lineHeight: 1.15,
        textShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {trio.bn}
    </div>
    <div
      style={{
        fontFamily: fonts.en,
        fontSize: 52,
        fontWeight: 600,
        color: theme.gold,
        letterSpacing: -0.3,
        lineHeight: 1.1,
        textShadow: "0 3px 16px rgba(0,0,0,0.5)",
      }}
    >
      {trio.en}
    </div>
  </div>
);
