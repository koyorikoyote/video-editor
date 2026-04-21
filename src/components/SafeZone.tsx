import { AbsoluteFill } from "remotion";
import { SAFE, VIDEO_HEIGHT, VIDEO_WIDTH } from "../theme";

export const SafeZone: React.FC<{ show?: boolean }> = ({ show = false }) => {
  if (!show) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: SAFE.actionX,
          top: SAFE.actionY,
          width: VIDEO_WIDTH - SAFE.actionX * 2,
          height: VIDEO_HEIGHT - SAFE.actionY * 2,
          border: "2px dashed rgba(255,255,255,0.4)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: SAFE.titleX,
          top: SAFE.titleY,
          width: VIDEO_WIDTH - SAFE.titleX * 2,
          height: VIDEO_HEIGHT - SAFE.titleY * 2,
          border: "2px dashed rgba(255,220,0,0.6)",
        }}
      />
    </AbsoluteFill>
  );
};
