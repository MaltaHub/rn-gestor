"use client";

import { useAuthActionsContext, useAuthSessionState } from "@/components/auth/auth-provider";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { ProfilePage } from "@/components/profile/profile-page";

/** /vendedor/perfil: a mesma página do /perfil (foto, contato dos links e senha). */
export function VendedorPerfil() {
  const { accessToken, actor } = useAuthSessionState();
  const { signOut } = useAuthActionsContext();
  const requestAuth = useVendedorAuth();

  if (!actor) return null;

  return <ProfilePage actor={actor} requestAuth={requestAuth} hasSession={Boolean(accessToken)} onSignOut={signOut} />;
}
