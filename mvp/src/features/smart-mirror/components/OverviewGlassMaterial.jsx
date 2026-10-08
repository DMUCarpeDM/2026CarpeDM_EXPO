import { useEffect, useState } from "react";
import { Shader, Glass, LinearGradient, getWebGPUSupport } from "shaders/react";

export default function OverviewGlassMaterial({ shape, onReady, onUnavailable }) {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let active = true;
    getWebGPUSupport().then(({ supported }) => {
      if (!active) return;
      if (supported) setSupported(true);
      else onUnavailable();
    }).catch(() => { if (active) onUnavailable(); });
    return () => { active = false; };
  }, [onUnavailable]);
  if (!supported) return null;
  return <Shader className="overview-glass-canvas" aria-hidden="true" disableTelemetry colorSpace="srgb" onReady={onReady} onUnavailable={onUnavailable}>
    <Glass shape={shape} cutout refraction={.2} aberration={0} thickness={.12} highlight={.28} fresnel={.18} tintColor="#aab6c6" tintIntensity={.04}>
      <LinearGradient colorA="#465467" colorB="#0b1119" angle={125} />
    </Glass>
  </Shader>;
}
