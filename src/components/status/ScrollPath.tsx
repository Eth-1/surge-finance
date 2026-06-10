"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-drawn SVG guide line (ARCHITECTURE §5.6). A 1.5px soft-gold path in
 * the left gutter of /status that draws itself as the reader scrolls through
 * the content it annotates (its parent must be `position: relative`).
 *
 * - pathLength=1 + strokeDasharray=1 → strokeDashoffset = 1 − progress.
 * - rAF-throttled scroll/resize listeners; direct DOM writes (no re-renders).
 * - Hidden < xl; fully drawn (offset 0) when prefers-reduced-motion.
 * - pointer-events: none; aria-hidden (purely decorative).
 */
export function ScrollPath() {
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    const svg = svgRef.current;
    if (!path || !svg) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      path.style.strokeDashoffset = "0";
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const host = svg.parentElement;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const vh = window.innerHeight;
      // Drawn portion ≈ how far the viewport's lower third has travelled through the host.
      const total = rect.height + vh * 0.25;
      const progress = Math.min(1, Math.max(0, (vh * 0.85 - rect.top) / total));
      path.style.strokeDashoffset = String(1 - progress);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-y-0 left-0 hidden w-10 xl:block"
      viewBox="0 0 40 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        ref={pathRef}
        d="M20 0 C 20 110, 6 170, 20 290 C 34 410, 6 510, 20 630 C 34 750, 12 880, 20 1000"
        pathLength={1}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.5}
        strokeDasharray="1"
        strokeDashoffset={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
