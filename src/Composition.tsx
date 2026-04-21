import { useState } from "react";
import { AbsoluteFill, getRemotionEnvironment, Series } from "remotion";
import { z } from "zod";
import { CallToAction } from "./components/CallToAction";
import { MainSegment } from "./components/MainSegment";
import { SafeZone } from "./components/SafeZone";
import { ViralHook } from "./components/ViralHook";
import { VolumeOverlay } from "./components/VolumeOverlay";
import "./fonts";
import { VolumeContext } from "./VolumeContext";

export const compositionSchema = z.object({
  videoSrc: z.string(),
  hookFrames: z.number().int().positive(),
  mainFrames: z.number().int().positive(),
  ctaFrames: z.number().int().positive(),
  showSafeZone: z.boolean(),
  masterVolume: z
    .number()
    .min(0)
    .max(1)
    .describe("Master render volume (0–1). Studio preview has its own slider."),
  voiceVolume: z
    .number()
    .min(0)
    .max(1)
    .describe("Main interview audio volume (0–1)."),
  sfxVolume: z
    .number()
    .min(0)
    .max(1)
    .describe("Sound-effects volume (0–1)."),
});

export type CompositionProps = z.infer<typeof compositionSchema>;

export const MyComposition: React.FC<CompositionProps> = ({
  hookFrames,
  mainFrames,
  ctaFrames,
  videoSrc,
  showSafeZone,
  masterVolume,
  voiceVolume,
  sfxVolume,
}) => {
  // Studio-only live overrides. In render mode `isStudio` is false, so the
  // overlay never mounts and these initial values (= composition props) are
  // used. In Studio, the sliders take over.
  const isStudio = getRemotionEnvironment().isStudio;
  const [liveMaster, setLiveMaster] = useState(masterVolume);
  const [liveVoice, setLiveVoice] = useState(voiceVolume);
  const [liveSfx, setLiveSfx] = useState(sfxVolume);

  const activeMaster = isStudio ? liveMaster : masterVolume;
  const activeVoice = isStudio ? liveVoice : voiceVolume;
  const activeSfx = isStudio ? liveSfx : sfxVolume;

  return (
    <VolumeContext.Provider value={activeMaster}>
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <Series>
          <Series.Sequence durationInFrames={hookFrames}>
            <ViralHook sfxVolume={activeSfx} />
          </Series.Sequence>
          <Series.Sequence durationInFrames={mainFrames} offset={-6}>
            <MainSegment videoSrc={videoSrc} voiceVolume={activeVoice} />
          </Series.Sequence>
          <Series.Sequence durationInFrames={ctaFrames} offset={-6}>
            <CallToAction sfxVolume={activeSfx} />
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
