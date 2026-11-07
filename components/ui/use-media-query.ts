"use client";

import { useSyncExternalStore } from "react";

/**
 * Layout compacto (uma barra só): celular (até 720px) ou tela baixa, como o
 * celular deitado (até 520px de altura) — senão o grid fica sem altura útil.
 */
export const MOBILE_QUERY = "(max-width: 720px), (max-height: 520px)";

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
