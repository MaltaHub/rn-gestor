"use client";

import { useSyncExternalStore } from "react";

/** Celular = até 720px (mesmo corte dos CSS de layout). */
export const MOBILE_QUERY = "(max-width: 720px)";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY);
}
