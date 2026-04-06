"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import {
  fetchAdminUsers,
  updateAdminUser,
  sendPasswordRecoveryLink,
  banAdminUser,
  deleteAdminUser,
  type AdminAccessLookupOption,
  type AdminAccessUser
} from "@/components/admin/api";
import type { CurrentActor, RequestAuth, Role } from "@/components/ui-grid/types";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";

type UserAdminWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

type UserDraft = {
  nome: string;
  cargo: string;
  status: string;
  obs: string;
};

const APPROVED_STATUS_HINTS = ["APROVADO", "APPROVED", "ATIVO", "ACTIVE"];
const PENDING_STATUS_HINTS = ["PENDENTE", "PENDING", "AGUARDANDO"];

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function matchesHints(value: string | null | undefined, hints: string[]) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return hints.some((hint) => normalized === normalizeText(hint) || normalized.includes(normalizeText(hint)));
}

function toDraft(user: AdminAccessUser): UserDraft {
  return {
    nome: user.nome ?? "",
    cargo: user.cargo ?? "",
    status: user.status ?? "",
    obs: user.obs ?? ""
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "Nunca";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(parsed);
}

function findLookupByHints(options: AdminAccessLookupOption[], hints: string[]) {
  return options.find((option) => matchesHints(option.code, hints) || matchesHints(option.name, hints)) ?? null;
}

export function UserAdminWorkspace({ actor, accessToken, devRole = null }: UserAdminWorkspaceProps) {
  const requestAuth = useMemo<RequestAuth>(
    () => ({
      accessToken,
      devRole
    }),
    [accessToken, devRole]
  );
  const [users, setUsers] = useState<AdminAccessUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [roleOptions, setRoleOptions] = useState<AdminAccessLookupOption[]>([]);
  const [statusOptions, setStatusOptions] = useState<AdminAccessLookupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchAdminUsers(requestAuth);
      setUsers(data.users);
      setDrafts(Object.fromEntries(data.users.map((user) => [user.id, toDraft(user)])));
      setRoleOptions(data.lookups.roles);
      setStatusOptions(data.lookups.statuses);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar usuarios.");
    } finally {
      setLoading(false);
    }
  }, [requestAuth]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const approvedStatusOption = useMemo(() => findLookupByHints(statusOptions, APPROVED_STATUS_HINTS), [statusOptions]);
  const pendingStatusOption = useMemo(() => findLookupByHints(statusOptions, PENDING_STATUS_HINTS), [statusOptions]);
  const pendingUsers = useMemo(
    () => users.filter((user) => !matchesHints(user.status, APPROVED_STATUS_HINTS)),
    [users]
  );
  const approvedCount = useMemo(
    () => users.filter((user) => matchesHints(user.status, APPROVED_STATUS_HINTS)).length,
    [users]
  );

  async function saveUser(user: AdminAccessUser, nextDraft?: UserDraft) {
    const draft = nextDraft ?? drafts[user.id];
    if (!draft) return;

    setSavingIds((prev) => ({ ...prev, [user.id]: true }));
    setError(null);
    setInfo(null);

    try {
      const response = await updateAdminUser({
        id: user.id,
        requestAuth,
        updates: {
          nome: draft.nome,
          cargo: draft.cargo,
          status: draft.status,
          obs: draft.obs
        }
      });

      setUsers((prev) => prev.map((entry) => (entry.id === user.id ? response.user : entry)));
      setDrafts((prev) => ({ ...prev, [user.id]: toDraft(response.user) }));
      setInfo(`Usuario ${response.user.nome} atualizado com sucesso.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao atualizar usuario.");
    } finally {
      setSavingIds((prev) => ({ ...prev, [user.id]: false }));
    }
  }

  if (actor.role !== "ADMINISTRADOR") {
    return (
      <AuthStatusCard
        title="Acesso restrito"
        description="O painel de usuarios e exclusivo do administrador."
        error="Seu perfil nao possui permissao para gerenciar acessos."
      >
        <Link href="/" className="btn">
          Voltar ao painel
        </Link>
      </AuthStatusCard>
    );
  }

  return (
    <main className="admin-users-shell">
      <WorkspaceHeader actor={actor} title="Usuarios" />
      <section className="admin-users-topbar">
        <div>
          <h1>Controle de usuarios</h1>
          <p>Aprovacao, perfil e status operacional.</p>
        </div>
      </section>

      <section className="admin-users-summary">
        <article className="admin-users-stat">
          <strong>{users.length}</strong>
          <span>Usuarios totais</span>
        </article>
        <article className="admin-users-stat">
          <strong>{approvedCount}</strong>
          <span>Usuarios aprovados</span>
        </article>
        <article className="admin-users-stat is-warning">
          <strong>{pendingUsers.length}</strong>
          <span>Aguardando acao</span>
        </article>
        <article className="admin-users-actor">
          <strong>{actor.userName}</strong>
          <span>{actor.role}</span>
          <small>{actor.userEmail ?? "Sem email vinculado"}</small>
        </article>
      </section>

      {error ? <p className="admin-users-feedback is-error">{error}</p> : null}
      {info ? <p className="admin-users-feedback is-info">{info}</p> : null}

      <section className="admin-users-panel">
        <div className="admin-users-panel-head">
          <div>
            <strong>Pendencias de acesso</strong>
            <p>Somente usuarios com status aprovado podem operar no sistema.</p>
          </div>
          <button type="button" className="btn" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? "Atualizando..." : "Recarregar"}
          </button>
        </div>

        {loading ? <p className="admin-users-empty">Carregando usuarios...</p> : null}
        {!loading && pendingUsers.length === 0 ? (
          <p className="admin-users-empty">Nenhum usuario pendente ou bloqueado no momento.</p>
        ) : null}

        <div className="admin-users-pending-grid">
          {pendingUsers.map((user) => {
            const draft = drafts[user.id] ?? toDraft(user);
            return (
              <article key={`pending-${user.id}`} className="admin-users-pending-card">
                <header>
                  <strong>{user.nome}</strong>
                  <span>{user.status}</span>
                </header>
                <p>{user.email ?? "Sem email vinculado"}</p>
                <small>Criado em {formatDateTime(user.created_at)}</small>
                <div className="admin-users-pending-actions">
                  {approvedStatusOption ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={Boolean(savingIds[user.id])}
                      onClick={() => {
                        const nextDraft = { ...draft, status: approvedStatusOption.code };
                        setDrafts((prev) => ({ ...prev, [user.id]: nextDraft }));
                        void saveUser(user, nextDraft);
                      }}
                    >
                      Aprovar
                    </button>
                  ) : null}
                  {pendingStatusOption ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={Boolean(savingIds[user.id])}
                      onClick={() => {
                        const nextDraft = { ...draft, status: pendingStatusOption.code };
                        setDrafts((prev) => ({ ...prev, [user.id]: nextDraft }));
                        void saveUser(user, nextDraft);
                      }}
                    >
                      Marcar pendente
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="admin-users-panel">
        <div className="admin-users-panel-head">
          <div>
            <strong>Base completa de acessos</strong>
            <p>Edicao administrativa com RBAC e aprovacao operacional.</p>
          </div>
        </div>

        <div className="admin-users-list">
          {users.map((user) => {
            const draft = drafts[user.id] ?? toDraft(user);
            const isSaving = Boolean(savingIds[user.id]);

            return (
              <article key={user.id} className="admin-users-card">
                <div className="admin-users-card-head">
                  <div>
                    <strong>{user.nome}</strong>
                    <span>{user.email ?? "Sem email vinculado"}</span>
                  </div>
                  <span className={`admin-users-status-chip ${matchesHints(draft.status, APPROVED_STATUS_HINTS) ? "is-approved" : "is-pending"}`}>
                    {draft.status}
                  </span>
                </div>

                <div className="admin-users-form-grid">
                  <label className="admin-users-field">
                    <span>Nome</span>
                    <input
                      value={draft.nome}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [user.id]: { ...draft, nome: event.target.value }
                        }))
                      }
                    />
                  </label>

                  <label className="admin-users-field">
                    <span>Perfil</span>
                    <select
                      value={draft.cargo}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [user.id]: { ...draft, cargo: event.target.value }
                        }))
                      }
                    >
                      {roleOptions.map((option) => (
                        <option key={`${user.id}-role-${option.code}`} value={option.code}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="admin-users-field">
                    <span>Status</span>
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [user.id]: { ...draft, status: event.target.value }
                        }))
                      }
                    >
                      {statusOptions.map((option) => (
                        <option key={`${user.id}-status-${option.code}`} value={option.code}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="admin-users-field is-full">
                    <span>Observacoes</span>
                    <textarea
                      rows={3}
                      value={draft.obs}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [user.id]: { ...draft, obs: event.target.value }
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="admin-users-meta">
                  <small>Ultimo login: {formatDateTime(user.ultimo_login)}</small>
                  <small>Aprovado em: {formatDateTime(user.aprovado_em)}</small>
                  <small>ID auth: {user.auth_user_id ?? "Nao vinculado"}</small>
                </div>

                <div className="admin-users-card-actions">
                  <button type="button" className="btn" disabled={isSaving} onClick={() => void saveUser(user)}>
                    {isSaving ? "Salvando..." : "Salvar alteracoes"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      try {
                        const { recoveryLink } = await sendPasswordRecoveryLink({ id: user.id, requestAuth });
                        setInfo(recoveryLink ? `Link de recuperacao gerado: ${recoveryLink}` : "Solicitacao de recuperacao enviada.");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Falha ao enviar recuperacao.");
                      }
                    }}
                  >
                    Enviar recuperacao
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      try {
                        await banAdminUser({ id: user.id, requestAuth });
                        setInfo(`Usuario ${user.nome} banido.`);
                        void loadUsers();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Falha ao banir usuario.");
                      }
                    }}
                  >
                    Banir
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={async () => {
                      if (!window.confirm(`Excluir e banir ${user.nome}? Esta acao e irreversivel.`)) return;
                      try {
                        await deleteAdminUser({ id: user.id, requestAuth });
                        setInfo(`Usuario ${user.nome} excluido.`);
                        void loadUsers();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Falha ao excluir usuario.");
                      }
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
