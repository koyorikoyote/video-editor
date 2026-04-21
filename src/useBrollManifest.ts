import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import type { BRollManifestEntry } from "./BRoll";

export const useBrollManifest = (): BRollManifestEntry[] => {
  const [manifest, setManifest] = useState<BRollManifestEntry[]>([]);
  const [handle] = useState(() => delayRender("Loading B-roll manifest"));

  useEffect(() => {
    let cancelled = false;
    fetch(staticFile("broll/manifest.json"))
      .then((r) => (r.ok ? r.json() : []))
      .then((data: BRollManifestEntry[]) => {
        if (cancelled) return;
        setManifest(Array.isArray(data) ? data : []);
        continueRender(handle);
      })
      .catch((err) => {
        if (cancelled) return;
        // Manifest absent = no B-roll, not a hard error.
        if (String(err).includes("404")) {
          setManifest([]);
          continueRender(handle);
        } else {
          cancelRender(err as Error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return manifest;
};
