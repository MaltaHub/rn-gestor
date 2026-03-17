"use client";

import Link from "next/link";
import type { CurrentActor, Role } from "@/components/ui-grid/types";

type PersonalWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

export function PersonalWorkspace({ actor, onSignOut }: PersonalWorkspaceProps) {
  return (
    <main className="profile-shell">
      <section className="profile-topbar">
        <div>
          <h1>Perfil</h1>
          <p>Dados pessoais e acesso atual.</p>
        </div>
        <div className="profile-topbar-actions">
          <Link href="/" className="btn sheet-nav-btn">
            Operacional
          </Link>
          <Link href="/arquivos" className="btn sheet-nav-btn">
            Arquivos
          </Link>
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
