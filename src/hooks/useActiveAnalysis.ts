import { useEffect, useState } from "react";
import {
  ACTIVE_ANALYSIS_EVENT,
  getActiveAnalysis,
  type ActiveAnalysisPayload,
} from "@/lib/active-analysis";

/** Reactive read of the company analysis kept in session storage. */
export function useActiveAnalysis() {
  const [activeAnalysis, setActiveAnalysisState] =
    useState<ActiveAnalysisPayload | null>(() => getActiveAnalysis());

  useEffect(() => {
    const sync = () => setActiveAnalysisState(getActiveAnalysis());
    window.addEventListener(ACTIVE_ANALYSIS_EVENT, sync);
    return () => window.removeEventListener(ACTIVE_ANALYSIS_EVENT, sync);
  }, []);

  return { activeAnalysis };
}
