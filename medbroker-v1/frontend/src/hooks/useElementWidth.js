import { useEffect, useRef, useState } from 'react';

/**
 * useElementWidth — NEW, 24 Sep 2026 (built), 27 Sep 2026 (actually
 * delivered — see Status_Vercel.md, 27 Sep entry: the original build never
 * made it into a delivery ZIP). For PipelineJourney, the Reports page hero
 * (app-design-pass skill). Adapted from that skill's reference
 * implementation (assets/viz/useElementWidth.js); logic unchanged.
 *
 * Tracks an element's rendered width (ResizeObserver), for a chart whose
 * layout depends on real measured pixels rather than an assumed container
 * size. Re-checks after every render, not just on [ref] changing, so it
 * also works when the element mounts later than the component — e.g. only
 * once the report data has loaded, which is PipelineJourney's situation.
 */
export function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  const observed = useRef(null);
  const observer = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (el === observed.current) return;
    observer.current?.disconnect();
    observed.current = el;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.current.observe(el);
  });

  useEffect(() => () => observer.current?.disconnect(), []);
  return width;
}
