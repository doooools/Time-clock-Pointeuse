import { useEffect, useState } from "react";

const DESKTOP = "(min-width: 1024px)";

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setMatch(e.matches);
    setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Desktop layout (≥ 1024 px); below that, the mobile variant. */
export const useIsDesktop = () => useMediaQuery(DESKTOP);
