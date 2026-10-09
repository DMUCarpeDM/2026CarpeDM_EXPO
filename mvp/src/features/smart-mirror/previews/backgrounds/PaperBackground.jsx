import React, { useEffect, useState } from "react";
import { Dithering, MeshGradient } from "@paper-design/shaders-react";

export function PaperBackground({ variant }) {
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMoving(!preference.matches && !document.hidden);
    update();
    preference.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const common = { width: "100%", height: "100%", minPixelRatio: 1, maxPixelCount: 1500000, speed: moving ? 0.12 : 0, frame: 12000 };
  return <div className="ambient-backdrop paper-backdrop" aria-hidden="true">
    {variant === "mesh" ? <MeshGradient {...common}
      colors={["#06080d", "#182431", "#566777", "#111720"]}
      distortion={0.65} swirl={0.3} grainMixer={0} grainOverlay={0.015} />
      : <Dithering {...common} colorBack="#080c13" colorFront="#64788c"
        shape="warp" type="4x4" size={1} scale={4.5}
        rotation={0} offsetX={0} offsetY={0} speed={moving ? 0.35 : 0} />}
  </div>;
}
