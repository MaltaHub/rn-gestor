"use client";

import type { CurrentActor, Role } from "@/components/ui-grid/types";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";

type PersonalWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

export function PersonalWorkspace({ actor, onSignOut }: PersonalWorkspaceProps) {
  return (
    <main className="profile-shell">
      <WorkspaceHeader actor={actor} title="Perfil" />
      <section className="profile-topbar">
        <div>
          <h1>Perfil</h1>
          <p>Dados pessoais e configuracao da conta.</p>
        </div>
        <div className="profile-topbar-actions">
          <button type="button" className="btn sheet-signout-btn" onClick={() => void onSignOut()}>
            Sair
          </button>
        </div>
      </section>

      <section className="profile-grid">
        <article className="profile-card">
          <small>Nome</small>
          <strong>{actor.userName}</strong>
        </article>
        <article className="profile-card">
          <small>Email</small>
          <strong>{actor.userEmail ?? "Sem email vinculado"}</strong>
        </article>
        <article className="profile-card">
          <small>Perfil</small>
          <strong>{actor.role}</strong>
        </article>
        <article className="profile-card">
          <small>Status</small>
          <strong>{actor.status}</strong>
        </article>
      </section>
    </main>
  );
}
