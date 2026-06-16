"use client";

import { useAuthActionsContext, useAuthSessionState } from "@/components/auth/auth-provider";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { ProfileEditor } from "@/components/profile/profile-editor";

export function VendedorPerfil() {
  const { actor } = useAuthSessionState();
  const { signOut } = useAuthActionsContext();
  const requestAuth = useVendedorAuth();

  if (!actor) return null;

  return (
    <section className="vendedor-perfil">
      <header className="vendedor-perfil-head">
        <div>
          <h1>Perfil</h1>
          <p>Dados pessoais e conta.</p>
        </div>
        <button type="button" className="vendedor-btn-ghost" onClick={() => void signOut()}>
          Sair
        </button>
      </header>

      {/* Auto-serviço: foto, bio e telefone (WhatsApp do vendedor nos links). */}
      <ProfileEditor requestAuth={requestAuth} fallbackName={actor.userName} />

      <div className="vendedor-perfil-grid">
        <article className="vendedor-perfil-card">
          <small>Nome</small>
          <strong>{actor.userName}</strong>
        </article>
        <article className="vendedor-perfil-card">
          <small>Email</small>
          <strong>{actor.userEmail ?? "Sem email vinculado"}</strong>
        </article>
        <article className="vendedor-perfil-card">
          <small>Perfil</small>
          <strong>{actor.role}</strong>
        </article>
        <article className="vendedor-perfil-card">
          <small>Status</small>
          <strong>{actor.status}</strong>
        </article>
      </div>
    </section>
  );
}
