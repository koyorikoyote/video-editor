import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts } from "../fonts";
import { theme, VIDEO_HEIGHT, VIDEO_WIDTH } from "../theme";

// Drifting Japanese kana / kanji glyphs that rise slowly across the frame —
// evokes the feeling of moving toward Japan. Sparse and low-opacity so they
// sit behind the speaker without competing.
const AMBITION_GLYPHS = [
  "夢", "未来", "希望", "挑戦", "成長",
  "東京", "日本", "前進", "可能性", "新",
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
];

export const DriftingGlyphs: React.FC<{
  seed?: string;
  count?: number;
  speed?: number;
}> = ({ seed = "g", count = 10, speed = 22 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const sd = `${seed}-${i}`;
        const x = random(`${sd}-x`) * (VIDEO_WIDTH + 200) - 100;
        const y0 = random(`${sd}-y`) * (VIDEO_HEIGHT + 400) + VIDEO_HEIGHT;
        const lifetime = 8 + random(`${sd}-l`) * 6;
        const localT = (t + random(`${sd}-ph`) * lifetime) % lifetime;
        const progress = localT / lifetime;
        const y = y0 - progress * (VIDEO_HEIGHT + 600) * (speed / 22);
        const fade =
          progress < 0.15
            ? progress / 0.15
            : progress > 0.85
              ? (1 - progress) / 0.15
              : 1;
        const fontSize = 38 + random(`${sd}-sz`) * 70;
        const glyph = AMBITION_GLYPHS[Math.floor(random(`${sd}-c`) * AMBITION_GLYPHS.length)];
        const compFade = interpolate(
          frame,
          [durationInFrames - fps * 0.6, durationInFrames],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              fontFamily: fonts.jp,
              fontSize,
              fontWeight: 700,
              color: theme.copper,
              opacity: 0.10 * fade * compFade,
              textShadow: `0 0 24px ${theme.amber}`,
              letterSpacing: 4,
              userSelect: "none",
            }}
          >
            {glyph}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Diagonal light streaks that sweep slowly across the canvas, parallax style.
// Adds energy without flicker.
export const LightStreaks: React.FC<{ count?: number }> = ({ count = 4 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      {Array.from({ length: count }).map((_, i) => {
        const sd = `streak-${i}`;
        const period = 6 + random(`${sd}-p`) * 6;
        const phase = random(`${sd}-ph`) * period;
        const local = ((t + phase) % period) / period;
        const x = interpolate(local, [0, 1], [-600, VIDEO_WIDTH + 600]);
        const y = random(`${sd}-y`) * VIDEO_HEIGHT;
        const w = 280 + random(`${sd}-w`) * 360;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: w,
              height: 4,
              background: `linear-gradient(90deg, transparent 0%, ${theme.amber} 50%, transparent 100%)`,
              filter: "blur(6px)",
              opacity: 0.32,
              transform: "rotate(-18deg)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Brand mark used in intro and outro: "IMAS FRONTIER" wordmark with
// underline draw-on and a subtle JP ruby above.
export const ImasFrontierMark: React.FC<{
  size?: "sm" | "lg";
  delayFrames?: number;
}> = ({ size = "lg", delayFrames = 0 }) => {
  const frame = useCurrentFrame() - delayFrames;
  const { fps } = useVideoConfig();
  const fontSize = size === "lg" ? 86 : 36;
  const ruby = size === "lg" ? 28 : 16;

  const enter = interpolate(frame, [0, fps * 0.7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const underline = interpolate(frame, [fps * 0.5, fps * 1.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 14}px)`,
      }}
    >
      <span
        style={{
          fontFamily: fonts.jp,
          fontSize: ruby,
          fontWeight: 700,
          color: theme.amber,
          letterSpacing: 8,
        }}
      >
        イマス・フロンティア
      </span>
      <span
        style={{
          fontFamily: fonts.en,
          fontSize,
          fontWeight: 800,
          color: theme.softWhite,
          letterSpacing: size === "lg" ? 6 : 4,
          textTransform: "uppercase",
          textShadow: `0 6px 30px rgba(0,0,0,0.55)`,
        }}
      >
        Imas Frontier
      </span>
      <div
        style={{
          height: 3,
          width: `${underline * (size === "lg" ? 320 : 180)}px`,
          background: `linear-gradient(90deg, transparent, ${theme.copper}, transparent)`,
        }}
      />
    </div>
  );
};
