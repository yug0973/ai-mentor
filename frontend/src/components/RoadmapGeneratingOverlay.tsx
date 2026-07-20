import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

// Mirrors the real two-pass generation happening on mentor_ai_engine's side
// (see app/roadmap/generator.py) — milestones first, then topics per
// milestone — so this isn't just decorative, it's roughly honest about
// what's actually taking the time.
const STATUS_MESSAGES = [
  "Reading your interview...",
  "Plotting the milestones...",
  "Mapping the switchbacks...",
  "Charting checkpoint quizzes...",
  "Drawing the route to the summit...",
];

const TRAIL_PATH = "M4,32 C40,10 80,34 116,14 C150,-2 170,26 196,8";

export default function RoadmapGeneratingOverlay() {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 2600);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-xl mx-auto text-center bg-panel border border-mist rounded-lg p-10 sm:p-12 space-y-8 shadow-xl">
      <svg viewBox="0 0 200 40" className="mx-auto w-40 h-8" aria-hidden="true">
        <path
          d={TRAIL_PATH}
          fill="none"
          stroke="var(--color-mist)"
          strokeWidth="2"
          strokeDasharray="1 8"
          strokeLinecap="round"
        />
        <circle r="4" fill="var(--color-blaze)">
          {!reduced && (
            <animateMotion dur="3.2s" repeatCount="indefinite" path={TRAIL_PATH} />
          )}
        </circle>
      </svg>

      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: reduced ? 0 : 10 }}
          animate={{
            opacity: 1,
            y: 0,
            backgroundPosition: reduced ? "0% center" : ["200% center", "-200% center"],
          }}
          exit={{ opacity: 0, y: reduced ? 0 : -10 }}
          transition={{
            opacity: { duration: 0.35 },
            y: { duration: 0.35 },
            backgroundPosition: reduced
              ? { duration: 0 }
              : { duration: 2.4, ease: "linear", repeat: Infinity },
          }}
          className="font-display text-xl sm:text-2xl font-semibold bg-[length:200%_100%] bg-gradient-to-r from-parchment via-blaze to-parchment bg-clip-text text-transparent"
        >
          {STATUS_MESSAGES[index]}
        </motion.p>
      </AnimatePresence>

      <p className="font-mono-label text-xs uppercase tracking-widest text-fog">
        This can take up to a minute — two real AI passes are drafting your route
      </p>
    </div>
  );
}
