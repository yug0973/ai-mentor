import { useEffect, useState, useRef } from "react";

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const mouseCoords = useRef({ x: 0, y: 0 });
  const ringCoords = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const touchQuery = window.matchMedia("(pointer: coarse)");
    setIsTouchDevice(touchQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
    touchQuery.addEventListener("change", handler);
    return () => touchQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (isTouchDevice) return;

    const handleMouseMove = (e: MouseEvent) => {
      mouseCoords.current = { x: e.clientX, y: e.clientY };
      
      // Make visible when mouse moves
      ringRef.current?.classList.remove("hidden");
      dotRef.current?.classList.remove("hidden");
    };

    const handleMouseLeave = () => {
      ringRef.current?.classList.add("hidden");
      dotRef.current?.classList.add("hidden");
    };

    const handleMouseEnter = () => {
      ringRef.current?.classList.remove("hidden");
      dotRef.current?.classList.remove("hidden");
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const isInteractive = !!target.closest(
        "a, button, input, select, textarea, [role='button'], .cursor-pointer"
      );
      if (isInteractive) {
        ringRef.current?.classList.add("hovered");
        dotRef.current?.classList.add("hovered");
      } else {
        ringRef.current?.classList.remove("hovered");
        dotRef.current?.classList.remove("hovered");
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseenter", handleMouseEnter);
    document.addEventListener("mouseover", handleMouseOver);

    // High performance animation loop utilizing hardware-accelerated 3D translations
    const updateCursor = () => {
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mouseCoords.current.x}px, ${mouseCoords.current.y}px, 0)`;
      }

      // Snappy physics lag factor (0.24) for the outer tracker
      ringCoords.current.x += (mouseCoords.current.x - ringCoords.current.x) * 0.24;
      ringCoords.current.y += (mouseCoords.current.y - ringCoords.current.y) * 0.24;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringCoords.current.x}px, ${ringCoords.current.y}px, 0)`;
      }

      animationFrameId.current = requestAnimationFrame(updateCursor);
    };

    animationFrameId.current = requestAnimationFrame(updateCursor);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("mouseover", handleMouseOver);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [isTouchDevice]);

  if (isTouchDevice) return null;

  return (
    <>
      {/* Outer Halo */}
      <div ref={ringRef} className="custom-cursor-ring hidden">
        <span className="hover-arrow">➔</span>
      </div>

      {/* Inner Pinpoint Dot */}
      <div ref={dotRef} className="custom-cursor-dot hidden" />
    </>
  );
}
