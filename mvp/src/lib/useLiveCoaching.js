import { useEffect, useRef, useState } from "react";
import { observeTurn } from "./pocApi";
import { startLiveCoaching } from "./liveCoaching";

export function useLiveCoaching({ session, turnId, active, sample }) {
  const [tip, setTip] = useState(null);
  const memoryRef = useRef({ lastShown: -Infinity, shown: new Set() });
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  useEffect(() => {
    setTip(null);
    if (!active || !session?.access_token || !turnId) return undefined;
    return startLiveCoaching({
      observe: (input, signal) => observeTurn(session, turnId, input, signal),
      sample: () => sampleRef.current(),
      onTip: setTip,
      memory: memoryRef.current,
    });
  }, [session?.id, session?.access_token, turnId, active]);
  useEffect(() => {
    if (!tip) return undefined;
    const timer = setTimeout(() => setTip(null), 6000);
    return () => clearTimeout(timer);
  }, [tip]);
  return tip;
}
