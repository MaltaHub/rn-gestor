"use client";

import { useMemo } from "react";
import { useAuthSessionState } from "@/components/auth/auth-provider";
import type { RequestAuth } from "@/components/ui-grid/types";

/** RequestAuth derivado da sessão (igual ao padrão das outras workspaces). */
export function useVendedorAuth(): RequestAuth {
  const { accessToken, devModeEnabled, devRole } = useAuthSessionState();
  return useMemo<RequestAuth>(
    () => ({ accessToken, devRole: devModeEnabled ? devRole : undefined }),
    [accessToken, devModeEnabled, devRole]
  );
}
