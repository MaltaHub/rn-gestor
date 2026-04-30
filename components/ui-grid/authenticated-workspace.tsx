"use client";

import { useEffect, type ReactElement } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { UserAdminWorkspace } from "@/components/admin/user-admin-workspace";
import { useAuthActionsContext, useAuthSessionState } from "@/components/auth/auth-provider";
import { FileManagerWorkspace } from "@/components/files/file-manager-workspace";
import { PlaygroundWorkspace } from "@/components/playground/playground-workspace";
import { PersonalWorkspace } from "@/components/profile/personal-workspace";
import { HolisticSheet, type AuditDashboardFilterDefaults } from "@/components/ui-grid/holistic-sheet";
import type { CurrentActor, Role } from "@/lib/domain/auth-session";
import type { SheetKey } from "@/components/ui-grid/types";
import styles from "@/components/ui-grid/ui-grid.module.css";

type WorkspaceView = "grid" | "files" | "users" | "profile" | "playground";

type AuthenticatedWorkspaceProps = {
  initialView?: WorkspaceView;
  initialAuditFilters?: AuditDashboardFilterDefaults;
  initialSheetKey?: SheetKey;
};

type WorkspaceSharedProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role;
  onSignOut: () => Promise<void>;
  initialAuditFilters?: AuditDashboardFilterDefaults;
  initialSheetKey?: SheetKey;
};

function buildNextPath(pathname: string, searchParams: { toString(): string }) {
  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function renderWorkspace(view: WorkspaceView, props: WorkspaceSharedProps) {
  const views: Record<WorkspaceView, ReactElement> = {
    files: (
      <FileManagerWorkspace
        actor={props.actor}
        accessToken={props.accessToken}
        devRole={props.devRole}
        onSignOut={props.onSignOut}
      />
    ),
    users: (
      <UserAdminWorkspace
        actor={props.actor}
        accessToken={props.accessToken}
        devRole={props.devRole}
        onSignOut={props.onSignOut}
      />
    ),
    profile: (
      <PersonalWorkspace
        actor={props.actor}
        accessToken={props.accessToken}
        devRole={props.devRole}
        onSignOut={props.onSignOut}
      />
    ),
    playground: (
      <PlaygroundWorkspace
        actor={props.actor}
        accessToken={props.accessToken}
        devRole={props.devRole}
        onSignOut={props.onSignOut}
      />
    ),
    grid: (
      <HolisticSheet
        actor={props.actor}
        accessToken={props.accessToken}
        initialAuditFilters={props.initialAuditFilters}
        initialSheetKey={props.initialSheetKey}
        devRole={props.devRole}
        onSignOut={props.onSignOut}
      />
    )
  };

  return views[view];
}

export function AuthenticatedWorkspace({
  initialView = "grid",
  initialAuditFilters,
  initialSheetKey
}: AuthenticatedWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { accessToken, actor, authError, devModeEnabled, devRole, status } = useAuthSessionState();
  const { signOut } = useAuthActionsContext();

  useEffect(() => {
    if (status !== "signed_out") return;

    const nextPath = buildNextPath(pathname || "/", searchParams);
    const loginUrl = nextPath === "/" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`;
    router.replace(loginUrl);
  }, [pathname, router, searchParams, status]);

  if (status === "loading") {
    return (
      <AuthStatusCard
        title="Validando acesso"
        description="Validando a sessao antes de abrir a area autenticada."
        error={authError}
      />
    );
  }

  if (status === "signed_out") {
    return <AuthStatusCard title="Redirecionando" description="Sessao ausente. Redirecionando para o login." />;
  }

  if (status === "profile_error" || !actor) {
    return (
      <AuthStatusCard
        title="Perfil indisponivel"
        description="A sessao foi validada, mas o perfil da aplicacao nao foi carregado."
        error={authError}
      >
        <button type="button" className={styles.btn} onClick={() => void signOut()}>
          Sair
        </button>
      </AuthStatusCard>
    );
  }

  return renderWorkspace(initialView, {
    actor,
    accessToken,
    devRole: devModeEnabled ? devRole : undefined,
    onSignOut: signOut,
    initialAuditFilters,
    initialSheetKey
  });
}
