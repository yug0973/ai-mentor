import { useEffect, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";

/**
 * Real WebGL mesh-gradient shader background (@paper-design/shaders-react,
 * pulled via the 21st.dev component registry), tuned to the trail-map
 * palette. Replaces the earlier CSS-blob aurora with an actual GPU shader —
 * still slow and subtle by design, not a flashy centerpiece.
 *
 * Colors are dark/desaturated on purpose: this sits behind body text on
 * every page, so it needs to stay closer to --color-bg than to the vivid
 * blaze/moss brand colors used everywhere else in the UI.
 */
const THEME_COLORS = [
  "#0d1712", // near-black anchor, darker than --color-bg
  "#2a4436", // mid-lightness moss — real lightness jump from the anchor
  "#4a2e1c", // warm amber-brown, blaze-adjacent but more saturated/lighter
  "#17281f", // transition tone bridging the two
];

export default function MotionGraphicsBg() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 bg-bg">
      <MeshGradient
        colors={THEME_COLORS}
        distortion={0.6}
        swirl={0.35}
        grainMixer={0.05}
        grainOverlay={0.08}
        speed={reduced ? 0 : 0.2}
        scale={1.5}
        rotation={0}
        offsetX={0}
        offsetY={0}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}