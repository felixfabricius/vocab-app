import { useCallback, useEffect, useState } from "react";
import type { Settings } from "@/core/types";
import { repo } from "./services";

/** Loads settings once per mount and exposes a patch function that persists and re-renders. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | undefined>();
  useEffect(() => {
    let alive = true;
    repo.getSettings().then((s) => alive && setSettings(s));
    return () => {
      alive = false;
    };
  }, []);
  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = await repo.saveSettings(patch);
    setSettings(next);
    return next;
  }, []);
  return { settings, update };
}
