import { useEffect, useRef, useState, ReactNode } from "react";

type ScrollRevealProps = {
  children: ReactNode;
  animation?: "fade" | "slide-up" | "slide-left" | "slide-right";
  delay?: number;
  duration?: number;
  threshold?: number;
  className?: string;
};

export default function ScrollReveal({
  children,
  animation = "slide-up",
  delay = 0,
  duration = 600,
  threshold = 0.1,
  className = "",
}: ScrollRevealProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold }
    );

    const currentElement = elementRef.current;
    if (currentElement) {
      observer.observe(currentElement);
    }

    return () => {
      if (currentElement) {
        observer.unobserve(currentElement);
      }
    };
  }, [threshold]);

  // Determine starting transform styles based on animation type
  const getAnimationStyles = () => {
    if (isRevealed) {
      return {
        opacity: 1,
        transform: "none",
        transition: `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      };
    }

    const startingTransforms = {
      fade: "none",
      "slide-up": "translateY(24px)",
      "slide-left": "translateX(24px)",
      "slide-right": "translateX(-24px)",
    };

    return {
      opacity: 0,
      transform: startingTransforms[animation],
      transition: `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
    };
  };

  return (
    <div
      ref={elementRef}
      style={getAnimationStyles()}
      className={`will-change-transform-opacity ${className}`}
    >
      {children}
    </div>
  );
}
