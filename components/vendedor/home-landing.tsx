"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { useAuthSessionState } from "@/components/auth/auth-provider";
import { AuthenticatedWorkspace } from "@/components/ui-grid/authenticated-workspace";

/**
 * Landing de "/": cargo VENDEDOR cai na area /vendedor; demais cargos seguem no
 * grid de gestao como hoje.
 */
export function HomeLanding() {
  const router = useRouter();
  const { actor, status } = useAuthSessionState();
  const isVendedor = status === "ready" && actor?.role === "VENDEDOR";

  useEffect(() => {
    if (isVendedor) router.replace("/vendedor");
  }, [isVendedor, router]);

  if (isVendedor) {
    return <AuthStatusCard title="Redirecionando" description="Abrindo a area do vendedor." />;
  }

  return <AuthenticatedWorkspace initialView="grid" />;
}
