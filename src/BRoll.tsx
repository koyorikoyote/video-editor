import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from "remotion";

export type BRollClip = {
  src: string;
  startFrame: number;
  durationFrames: number;
  startFromFrame?: number;
  label?: string;
};

export type BRollManifestEntry = {
  query: string;
  src: string;
  durationSec: number;
  width: number;
  height: number;
  pexelsUrl: string;
  photographer: string;
  photographerUrl: string | null;
};

export const BRoll: React.FC<{ clips: BRollClip[]; muted?: boolean }> = ({
  clips,
  muted = true,
}) => {
  return (
    <AbsoluteFill>
      {clips.map((clip, i) => (
        <Sequence
          key={i}
          from={clip.startFrame}
          durationInFrames={clip.durationFrames}
        >
          <AbsoluteFill>
            <OffthreadVideo
              src={staticFile(clip.src)}
              muted={muted}
              startFrom={clip.startFromFrame}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// Picks a clip from the manifest whose query matches any keyword (case-insensitive).
export const pickClip = (
  manifest: BRollManifestEntry[],
  keywords: string[],
): BRollManifestEntry | undefined => {
  const needles = keywords.map((k) => k.toLowerCase());
  return manifest.find((m) =>
    needles.some((n) => m.query.toLowerCase().includes(n)),
  );
};
