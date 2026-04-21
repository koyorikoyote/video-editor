import {
  AbsoluteFill,
  interpolate,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "../theme";

// Subtle warm-light particles drifting upward — replaces aggressive stripes
// and confetti. Evokes dust motes in sunlight / lantern sparks.
export const WarmParticles: React.FC<{ seed?: string; count?: number }> = ({
  seed = "p",
  count = 40,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const seedStr = `${seed}-${i}`;
        const x0 = random(`${seedStr}-x`) * 2000 - 40;
        const y0 = random(`${seedStr}-y`) * 1200 + 1080;
        const driftX = random(`${seedStr}-dx`) * 40 - 20;
        const speed = 14 + random(`${seedStr}-s`) * 22;
        const y = y0 - t * speed * 10;
        const phase = random(`${seedStr}-p`) * Math.PI * 2;
        const alpha =
          0.18 + 0.22 * (Math.sin(t * 1.5 + phase) * 0.5 + 0.5);
        const size = 3 + random(`${seedStr}-sz`) * 4;
        // Fade out near end of composition
        const globalFade = interpolate(
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
              left: x0 + driftX * Math.sin(t + phase),
              top: y,
              width: size,
              height: size,
              borderRadius: size,
              background: i % 3 === 0 ? theme.amber : theme.gold,
              opacity: alpha * globalFade,
              boxShadow: `0 0 ${size * 2}px ${theme.amber}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Soft amber glint that slowly crosses the frame once. Good for accent
// moments (e.g. at end of CTA). Subtle, not flashy.
export const SoftGlint: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const x = interpolate(frame, [0, fps * 3], [-400, 2400]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      <div
        style={{
          position: "absolute",
          left: x,
          top: "-20%",
          width: 600,
          height: "140%",
          background:
            "linear-gradient(100deg, transparent 0%, rgba(229,169,107,0.15) 40%, rgba(229,169,107,0.35) 50%, rgba(229,169,107,0.15) 60%, transparent 100%)",
          filter: "blur(40px)",
          transform: "rotate(12deg)",
        }}
      />
    </AbsoluteFill>
  );
};
