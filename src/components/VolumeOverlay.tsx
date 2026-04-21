import { getRemotionEnvironment } from "remotion";
import { fonts } from "../fonts";

type Props = {
  master: number;
  voice: number;
  sfx: number;
  onMaster: (v: number) => void;
  onVoice: (v: number) => void;
  onSfx: (v: number) => void;
};

// Studio-only overlay. getRemotionEnvironment().isStudio is false during
// server-side render, so this vanishes from the output MP4.
export const VolumeOverlay: React.FC<Props> = ({
  master,
  voice,
  sfx,
  onMaster,
  onVoice,
  onSfx,
}) => {
  if (!getRemotionEnvironment().isStudio) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 20,
        padding: "14px 18px",
        background: "rgba(10,14,26,0.88)",
        color: "white",
        fontFamily: fonts.en,
        fontSize: 14,
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 240,
        pointerEvents: "auto",
      }}
      // Stop clicks from reaching Studio's frame-scrub handlers.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 900, letterSpacing: 1, fontSize: 11, opacity: 0.7 }}>
        PREVIEW VOLUME (Studio only)
      </div>
      <Slider label="Master" value={master} onChange={onMaster} />
      <Slider label="Voice" value={voice} onChange={onVoice} />
      <Slider label="SFX" value={sfx} onChange={onSfx} />
    </div>
  );
};

const Slider: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, value, onChange }) => (
  <label
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontSize: 13,
    }}
  >
    <span style={{ width: 52, opacity: 0.85 }}>{label}</span>
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
      style={{ flex: 1, accentColor: "#F7B500" }}
    />
    <span
      style={{
        width: 36,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        opacity: 0.75,
      }}
    >
      {Math.round(value * 100)}%
    </span>
  </label>
);
