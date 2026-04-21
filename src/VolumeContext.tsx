import { createContext, useContext } from "react";

export const VolumeContext = createContext(1);

// Multiply a component's intended volume by the composition-wide master.
// Usage: <Audio volume={useMasterVolume(0.8)} />
export const useMasterVolume = (local = 1): number => {
  const master = useContext(VolumeContext);
  return master * local;
};
