"use client";

import { useMemo } from "react";
import type { CurrentActor, RequestAuth, Role } from "@/components/ui-grid/types";
import { AppFrame } from "@/components/workspace/app-frame";
import { ProfilePage } from "@/components/profile/profile-page";

type PersonalWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

export function PersonalWorkspace({ actor, accessToken, devRole, onSignOut }: PersonalWorkspaceProps) {
  const requestAuth = useMemo<RequestAuth>(() => ({ accessToken, devRole }), [accessToken, devRole]);
  return (
    <AppFrame actor={actor} title="Perfil">
      <ProfilePage actor={actor} requestAuth={requestAuth} hasSession={Boolean(accessToken)} onSignOut={onSignOut} />
    </AppFrame>
  );
}
