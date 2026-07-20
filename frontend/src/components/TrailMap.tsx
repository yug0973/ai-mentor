import { useState } from "react";

type Waypoint = {
  label: string;
  sublabel: string;
  x: number;
  y: number;
  state: "current" | "unlocked" | "locked";
};

const waypoints: Waypoint[] = [
  { label: "Trailhead", sublabel: "Goal Interview", x: 120, y: 340, state: "current" },
  { label: "Basecamp", sublabel: "Your Roadmap", x: 360, y: 220, state: "unlocked" },
  { label: "Switchbacks", sublabel: "Adaptive Practice", x: 600, y: 280, state: "locked" },
  { label: "Summit", sublabel: "Job-Ready Hiker", x: 840, y: 140, state: "locked" },
];

const markerColor: Record<Waypoint["state"], string> = {
  current: "#e8672c", // Blaze Orange
  unlocked: "#8fb27a", // Moss Green
  locked: "#4e5a52", // Silent dark slate
};

export default function TrailMap() {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  const trailPath = "M120,340 C220,300 280,260 360,220 C460,170 520,260 600,280 C680,300 760,180 840,140";

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-mist/40 bg-panel/20 p-6 backdrop-blur-md shadow-2xl font-mono-label">
      {/* HUD Border Ticks */}
      <div className="absolute left-2 top-2 text-[9px] text-fog/30">SYS.LOC // 45.109</div>
      <div className="absolute right-2 top-2 text-[9px] text-fog/30">SCALE // 1:400</div>
      <div className="absolute left-2 bottom-2 text-[9px] text-fog/30">HUD_TRAIL_ACTIVE</div>
      <div className="absolute right-2 bottom-2 text-[9px] text-fog/30">AUTO_CALIBRATE: OK</div>

      <svg
        viewBox="0 0 960 420"
        className="w-full relative z-10"
        role="img"
        aria-label="High-tech interactive route map showing path milestones"
      >
        <defs>
          {/* Futuristic grid pattern background */}
          <pattern id="hud-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(143, 178, 122, 0.03)" strokeWidth="1" />
          </pattern>

          {/* Glowing gradient for current active node */}
          <radialGradient id="blaze-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e8672c" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#e8672c" stopOpacity="0" />
          </radialGradient>

          {/* Glowing gradient for unlocked nodes */}
          <radialGradient id="moss-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8fb27a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#8fb27a" stopOpacity="0" />
          </radialGradient>

          {/* Premium tech arrow head marker */}
          <marker
            id="hud-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 L 3 5 Z" fill="var(--color-blaze)" />
          </marker>
        </defs>

        {/* Grid Background */}
        <rect width="100%" height="100%" fill="url(#hud-grid)" />

        {/* HUD Coordinate Crosshairs */}
        <line x1="40" y1="20" x2="40" y2="400" stroke="rgba(124, 139, 129, 0.05)" strokeDasharray="3 6" />
        <line x1="920" y1="20" x2="920" y2="400" stroke="rgba(124, 139, 129, 0.05)" strokeDasharray="3 6" />
        <line x1="20" y1="210" x2="940" y2="210" stroke="rgba(124, 139, 129, 0.05)" strokeDasharray="3 6" />

        {/* Winding mountain ridge contours for depth */}
        <path
          d="M0,420 L0,320 L160,280 L320,330 L480,240 L640,310 L800,220 L960,290 L960,420 Z"
          fill="rgba(17, 20, 29, 0.4)"
          stroke="rgba(124, 139, 129, 0.08)"
          strokeWidth="1.5"
        />

        {/* The dashed blueprint connection line */}
        <path
          d={trailPath}
          fill="none"
          stroke="rgba(124, 139, 129, 0.15)"
          strokeWidth="2"
          strokeDasharray="4 8"
        />

        {/* Animated glowing neon trail connection */}
        <path
          className="trail-path"
          d={trailPath}
          fill="none"
          stroke="var(--color-blaze)"
          strokeWidth="3.5"
          strokeLinecap="round"
          markerEnd="url(#hud-arrow)"
          style={{
            ["--trail-length" as string]: 1200,
            filter: "drop-shadow(0px 0px 5px rgba(232, 103, 44, 0.65))",
          }}
        />

        {/* Traveling glowing telemetry node (particle animating along the path) */}
        <circle r="4" fill="#e8672c" style={{ filter: "drop-shadow(0px 0px 4px #e8672c)" }}>
          <animateMotion
            dur="6s"
            repeatCount="indefinite"
            path={trailPath}
          />
        </circle>

        {/* Interactive Waypoints */}
        {waypoints.map((w, idx) => {
          const isHovered = hoveredLabel === w.label;
          const glowId = w.state === "current" ? "url(#blaze-glow)" : w.state === "unlocked" ? "url(#moss-glow)" : null;

          return (
            <g
              key={w.label}
              onMouseEnter={() => setHoveredLabel(w.label)}
              onMouseLeave={() => setHoveredLabel(null)}
              className="cursor-pointer"
            >
              {/* Telemetry vertical guide lines on hover */}
              {isHovered && (
                <line
                  x1={w.x}
                  y1={w.y}
                  x2={w.x}
                  y2={390}
                  stroke="rgba(232, 103, 44, 0.3)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
              )}

              {/* Glowing Halo */}
              {glowId && (
                <circle
                  cx={w.x}
                  cy={w.y}
                  r={isHovered ? 38 : 26}
                  fill={glowId}
                  className="transition-all duration-300"
                />
              )}

              {/* Outer pulsing ring for current point */}
              {w.state === "current" && (
                <circle
                  cx={w.x}
                  cy={w.y}
                  r="14"
                  fill="none"
                  stroke="#e8672c"
                  strokeWidth="1.5"
                  className="animate-pulse"
                  opacity="0.75"
                />
              )}

              {/* Base Interactive Node Dot */}
              <circle
                cx={w.x}
                cy={w.y}
                r={isHovered ? 9 : 6.5}
                fill={markerColor[w.state]}
                stroke="var(--color-bg)"
                strokeWidth={isHovered ? 3.5 : 2}
                className="transition-all duration-300"
                style={{
                  filter:
                    w.state !== "locked"
                      ? `drop-shadow(0px 0px 6px ${markerColor[w.state]})`
                      : "none",
                }}
              />

              {/* Node Index label overlay */}
              <text
                x={w.x}
                y={w.y - 15}
                textAnchor="middle"
                fill="rgba(124, 139, 129, 0.4)"
                fontSize="9"
                fontWeight="bold"
              >
                0{idx + 1}
              </text>
            </g>
          );
        })}
      </svg>

      {/* HTML Metadata Cards aligned underneath the SVG nodes */}
      <div className="absolute inset-x-6 bottom-4 grid grid-cols-4 gap-4 pointer-events-none">
        {waypoints.map((w) => {
          const isHovered = hoveredLabel === w.label;
          const colors = {
            current: "border-blaze/30 bg-blaze/5 text-parchment shadow-[0_0_15px_rgba(232,103,44,0.08)]",
            unlocked: "border-moss/30 bg-moss/5 text-parchment",
            locked: "border-mist/40 bg-transparent text-fog/60",
          };

          return (
            <div
              key={w.label}
              className={`rounded-lg border p-3 text-center transition-all duration-300 ${
                colors[w.state]
              } ${isHovered ? "border-blaze scale-[1.03] bg-blaze/10" : ""}`}
            >
              <p className="text-[10px] uppercase tracking-widest font-bold">
                {w.label}
              </p>
              <p className="text-[9px] text-fog/80 mt-0.5 truncate">{w.sublabel}</p>
              {w.state === "current" && (
                <span className="mt-1.5 inline-block rounded-full bg-blaze/10 border border-blaze/20 px-1.5 py-0.5 text-[8px] text-blaze font-bold uppercase tracking-wider">
                  active route
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
