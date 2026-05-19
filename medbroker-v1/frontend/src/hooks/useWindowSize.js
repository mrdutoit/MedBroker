/**
 * hooks/useWindowSize.js
 * Returns current window dimensions and responsive breakpoint flags.
 * Used throughout the app to drive responsive layout decisions
 * without needing CSS media queries (the app uses inline styles only).
 */

import { useState, useEffect } from 'react';

export function useWindowSize() {
  const [size, setSize] = useState({
    width:  typeof window !== 'undefined' ? window.innerWidth  : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    function handle() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  return {
    width:     size.width,
    height:    size.height,
    isMobile:  size.width < 768,
    isTablet:  size.width >= 768 && size.width < 1024,
    isDesktop: size.width >= 1024,
  };
}
