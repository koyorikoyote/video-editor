import { useState } from "react";
import {
  AbsoluteFill,
  getRemotionEnvironment,
  Series,
  staticFile,
} from "remotion";
import { z } from "zod";
import {
  DriftingGlyphs,
  LightStreaks,
} from "./components/AmbitionGraphics";
import { SafeZone } from "./components/SafeZone";
import { ViralCutCaptions } from "./components/ViralCutCaptions";
import { ViralIntro } from "./components/ViralIntro";
import { ViralOutro } from "./components/ViralOutro";
import { VolumeOverlay } from "./components/VolumeOverlay";
import { ZoomVideo } from "./components/ZoomVideo";
import "./fonts";
import { VolumeContext } from "./VolumeContext";

export const viralSchema = z.object({
  enabled: z
    .boolean()
    .describe("Master toggle for the viral cut module. When false, renders a placeholder card."),
  videoSrc: z.string(),
  introFrames: z.number().int().positive(),
  mainFrames: z.number().int().positive(),
  outroFrames: z.number().int().positive(),
  showSafeZone: z.boolean(),
  masterVolume: z.number().min(0).max(1),
  voiceVolume: z.number().min(0).max(1),
});

export type ViralProps = z.infer<typeof viralSchema>;

export const ViralComposition: React.FC<ViralProps> = ({
  enabled,
  videoSrc,
  introFrames,
  mainFrames,
  outroFrames,
  showSafeZone,
  masterVolume,
  voiceVolume,
}) => {
  const isStudio = getRemotionEnvironment().isStudio;
  const [liveMaster, setLiveMaster] = useState(masterVolume);
  const [liveVoice, setLiveVoice] = useState(voiceVolume);
  const [liveSfx, setLiveSfx] = useState(0);

  const activeMaster = isStudio ? liveMaster : masterVolume;
  const activeVoice = isStudio ? liveVoice : voiceVolume;

  if (!enabled) {
    return <DisabledCard />;
  }

  return (
    <VolumeContext.Provider value={activeMaster}>
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <Series>
          <Series.Sequence durationInFrames={introFrames}>
            <ViralIntro />
          </Series.Sequence>
          <Series.Sequence durationInFrames={mainFrames} offset={-4}>
            <ViralBody videoSrc={videoSrc} voiceVolume={activeVoice} />
          </Series.Sequence>
          <Series.Sequence durationInFrames={outroFrames} offset={-4}>
            <ViralOutro />
          </Series.Sequence>
        </Series>
        <SafeZone show={showSafeZone} />
        <VolumeOverlay
          master={liveMaster}
          voice={liveVoice}
          sfx={liveSfx}
          onMaster={setLiveMaster}
          onVoice={setLiveVoice}
          onSfx={setLiveSfx}
        />
      </AbsoluteFill>
    </VolumeContext.Provider>
  );
};

const ViralBody: React.FC<{ videoSrc: string; voiceVolume: number }> = ({
  videoSrc,
  voiceVolume,
}) => (
  <AbsoluteFill style={{ background: "#0E0A06" }}>
    <ZoomVideo src={videoSrc} zoomCycleSec={14} volume={voiceVolume} />

    {/* Warm vignette for caption legibility */}
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(14,10,6,0.6) 100%)",
      }}
    />

    {/* Subtle moving graphics over the A-roll */}
    <DriftingGlyphs seed="body" count={6} speed={18} />
    <LightStreaks count={2} />

    <ViralCutCaptions />
  </AbsoluteFill>
);

const DisabledCard: React.FC = () => (
  <AbsoluteFill
    style={{
      background: "#0B0906",
      color: "#F7F1E6",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      gap: 24,
      padding: 60,
      textAlign: "center",
      fontFamily: "system-ui, sans-serif",
    }}
  >
    <div style={{ fontSize: 38, fontWeight: 700 }}>Imas Frontier · Viral Cut</div>
    <div style={{ fontSize: 22, opacity: 0.8, lineHeight: 1.5, maxWidth: 800 }}>
      Module disabled. Enable it via the <code>enabled</code> prop, then run
      the pipeline:
      <br />
      <br />
      <code>npm run build:viral</code>
      <br />
      <br />
      (Generates public/viral-cut.mp4 + src/data/viralCut.ts via
      Ollama gemma4:e4b + ffmpeg.)
    </div>
  </AbsoluteFill>
);

export const VIRAL_DEFAULT_PROPS = {
  enabled: true,
  videoSrc: staticFile("viral-cut.mp4"),
  masterVolume: 0.5,
  voiceVolume: 1.0,
};
