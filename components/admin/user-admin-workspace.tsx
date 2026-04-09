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
const ALL_FILTER = "__all";
const PENDING_FILTER = "__pending";
const APPROVED_FILTER = "__approved";

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

function getInitials(name: string | null | undefined) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "??";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function sortUsers(users: AdminAccessUser[]) {
  return [...users].sort((left, right) => {
    const leftPending = matchesHints(left.status, APPROVED_STATUS_HINTS) ? 1 : 0;
    const rightPending = matchesHints(right.status, APPROVED_STATUS_HINTS) ? 1 : 0;
    if (leftPending !== rightPending) return leftPending - rightPending;
    return normalizeText(left.nome).localeCompare(normalizeText(right.nome), "pt-BR");
  });
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
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);

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

  const hasActiveFilters = searchTerm.trim().length > 0 || roleFilter !== ALL_FILTER || statusFilter !== ALL_FILTER;

  const filteredUsers = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);

    return sortUsers(
      users.filter((user) => {
        const draft = drafts[user.id] ?? toDraft(user);
        const matchesSearch =
          normalizedSearch.length === 0 ||
          [
            user.nome,
            user.email,
            draft.nome,
            draft.cargo,
            draft.status,
            draft.obs,
            user.auth_user_id
          ].some((value) => normalizeText(value).includes(normalizedSearch));

        const matchesRole = roleFilter === ALL_FILTER || draft.cargo === roleFilter;

        const matchesStatus =
          statusFilter === ALL_FILTER ||
          (statusFilter === PENDING_FILTER && !matchesHints(draft.status, APPROVED_STATUS_HINTS)) ||
          (statusFilter === APPROVED_FILTER && matchesHints(draft.status, APPROVED_STATUS_HINTS)) ||
          draft.status === statusFilter;

        return matchesSearch && matchesRole && matchesStatus;
      })
    );
  }, [drafts, roleFilter, searchTerm, statusFilter, users]);

  const visiblePendingUsers = useMemo(
    () => filteredUsers.filter((user) => !matchesHints((drafts[user.id] ?? toDraft(user)).status, APPROVED_STATUS_HINTS)),
    [drafts, filteredUsers]
  );

  const activeStatusLabel = useMemo(() => {
    if (statusFilter === ALL_FILTER) return "Todos";
    if (statusFilter === PENDING_FILTER) return "Pendentes";
    if (statusFilter === APPROVED_FILTER) return "Aprovados";
    return statusOptions.find((option) => option.code === statusFilter)?.name ?? statusFilter;
  }, [statusFilter, statusOptions]);

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
        <div className="admin-users-topbar-copy">
          <span className="admin-users-kicker">Central administrativa</span>
          <h1>Controle de usuarios</h1>
          <p>
            Analise a base de acessos, trate aprovacoes e ajuste perfis com mais contexto visual.
            Agora voce pode buscar por nome, email, status, observacao e filtrar a lista sem sair da tela.
          </p>
          <div className="admin-users-chip-row">
            <span>{users.length} usuarios mapeados</span>
            <span>{approvedCount} aprovados</span>
            <span>{pendingUsers.length} com acao pendente</span>
          </div>
        </div>

        <div className="admin-users-topbar-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? "Atualizando..." : "Recarregar dados"}
          </button>
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

      <section className="admin-users-panel admin-users-panel-filters">
        <div className="admin-users-panel-head">
          <div>
            <strong>Filtros e contexto</strong>
            <p>Refine a lista por cargo, status e texto livre para localizar usuarios rapidamente.</p>
          </div>
          <div className="admin-users-results-pill">
            <strong>{filteredUsers.length}</strong>
            <span>visiveis</span>
          </div>
        </div>

        <div className="admin-users-filters-grid">
          <label className="admin-users-field admin-users-search-field">
            <span>Busca</span>
            <input
              type="search"
              value={searchTerm}
              placeholder="Nome, email, observacao, perfil ou status..."
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <label className="admin-users-field">
            <span>Perfil</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value={ALL_FILTER}>Todos os perfis</option>
              {roleOptions.map((option) => (
                <option key={`role-filter-${option.code}`} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-users-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value={ALL_FILTER}>Todos os status</option>
              <option value={PENDING_FILTER}>Somente pendentes</option>
              <option value={APPROVED_FILTER}>Somente aprovados</option>
              {statusOptions.map((option) => (
                <option key={`status-filter-${option.code}`} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-users-filter-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!hasActiveFilters}
              onClick={() => {
                setSearchTerm("");
                setRoleFilter(ALL_FILTER);
                setStatusFilter(ALL_FILTER);
              }}
            >
              Limpar filtros
            </button>
          </div>
        </div>

        <div className="admin-users-chip-row">
          <span>Exibindo {filteredUsers.length} de {users.length}</span>
          <span>Status: {activeStatusLabel}</span>
          {roleFilter !== ALL_FILTER ? <span>Perfil filtrado</span> : null}
          {searchTerm.trim() ? <span>Busca ativa</span> : null}
        </div>
      </section>

      <section className="admin-users-panel">
        <div className="admin-users-panel-head">
          <div>
            <strong>Pendencias de acesso</strong>
            <p>Bloco focado em aprovacao rapida para reduzir tempo de triagem.</p>
          </div>
        </div>

        {loading ? <p className="admin-users-empty">Carregando usuarios...</p> : null}
        {!loading && visiblePendingUsers.length === 0 ? (
          <p className="admin-users-empty">
            {hasActiveFilters
              ? "Nenhuma pendencia corresponde aos filtros aplicados."
              : "Nenhum usuario pendente ou bloqueado no momento."}
          </p>
        ) : null}

        <div className="admin-users-pending-grid">
          {visiblePendingUsers.map((user) => {
            const draft = drafts[user.id] ?? toDraft(user);
            const isSaving = Boolean(savingIds[user.id]);

            return (
              <article key={`pending-${user.id}`} className="admin-users-pending-card">
                <header className="admin-users-card-head">
                  <div className="admin-users-identity">
                    <div className="admin-users-avatar" aria-hidden="true">
                      {user.foto ? (
                        <img src={user.foto} alt="" />
                      ) : (
                        <span>{getInitials(user.nome)}</span>
                      )}
                    </div>
                    <div>
                      <strong>{user.nome}</strong>
                      <span>{user.email ?? "Sem email vinculado"}</span>
                    </div>
                  </div>
                  <span className="admin-users-status-chip is-pending">{draft.status}</span>
                </header>

                <div className="admin-users-meta">
                  <small>Criado em {formatDateTime(user.created_at)}</small>
                  <small>Ultimo login: {formatDateTime(user.ultimo_login)}</small>
                </div>

                <div className="admin-users-pending-actions">
                  {approvedStatusOption ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={isSaving}
                      onClick={() => {
                        const nextDraft = { ...draft, status: approvedStatusOption.code };
                        setDrafts((prev) => ({ ...prev, [user.id]: nextDraft }));
                        void saveUser(user, nextDraft);
                      }}
                    >
                      Aprovar acesso
                    </button>
                  ) : null}
                  {pendingStatusOption ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={isSaving}
                      onClick={() => {
                        const nextDraft = { ...draft, status: pendingStatusOption.code };
                        setDrafts((prev) => ({ ...prev, [user.id]: nextDraft }));
                        void saveUser(user, nextDraft);
                      }}
                    >
                      Manter pendente
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
            <p>Lista detalhada com contexto operacional para revisar cada usuario sem perder informacao.</p>
          </div>
        </div>

        <div className="admin-users-list">
          {filteredUsers.map((user) => {
            const draft = drafts[user.id] ?? toDraft(user);
            const isSaving = Boolean(savingIds[user.id]);
            const isApproved = matchesHints(draft.status, APPROVED_STATUS_HINTS);

            return (
              <article key={user.id} className="admin-users-card">
                <div className="admin-users-card-head">
                  <div className="admin-users-identity">
                    <div className="admin-users-avatar" aria-hidden="true">
                      {user.foto ? (
                        <img src={user.foto} alt="" />
                      ) : (
                        <span>{getInitials(user.nome)}</span>
                      )}
                    </div>
                    <div>
                      <strong>{user.nome}</strong>
                      <span>{user.email ?? "Sem email vinculado"}</span>
                    </div>
                  </div>
                  <span className={`admin-users-status-chip ${isApproved ? "is-approved" : "is-pending"}`}>
                    {draft.status}
                  </span>
                </div>

                <div className="admin-users-meta admin-users-meta-grid">
                  <small>
                    <strong>Perfil atual:</strong> {draft.cargo || "Nao informado"}
                  </small>
                  <small>
                    <strong>Criado em:</strong> {formatDateTime(user.created_at)}
                  </small>
                  <small>
                    <strong>Ultimo login:</strong> {formatDateTime(user.ultimo_login)}
                  </small>
                  <small>
                    <strong>Aprovado em:</strong> {formatDateTime(user.aprovado_em)}
                  </small>
                  <small>
                    <strong>ID:</strong> {user.id.slice(0, 8)}...
                  </small>
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

      <style jsx global>{`
.admin-users-topbar-copy {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.admin-users-kicker {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(21, 89, 191, 0.1);
  color: #164d9f;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.admin-users-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-users-chip-row span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(31, 41, 55, 0.08);
  color: #475569;
  font-size: 0.78rem;
  font-weight: 700;
}

.admin-users-panel-filters {
  display: grid;
  gap: 18px;
}

.admin-users-results-pill {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  min-width: 92px;
  padding: 10px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(31, 41, 55, 0.08);
}

.admin-users-results-pill strong {
  font-size: 1.4rem;
  line-height: 1;
}

.admin-users-results-pill span {
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.admin-users-filters-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(180px, 1fr)) auto;
  gap: 14px;
  align-items: end;
}

.admin-users-search-field {
  grid-column: auto;
}

.admin-users-filter-actions {
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
  min-height: 100%;
}

.admin-users-filter-actions .btn {
  width: 100%;
}

.admin-users-identity {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.admin-users-avatar {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  overflow: hidden;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(21, 89, 191, 0.16), rgba(15, 118, 110, 0.12));
  color: #164d9f;
  font-weight: 800;
  font-size: 1rem;
  letter-spacing: 0.04em;
}

.admin-users-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.admin-users-identity > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.admin-users-identity strong,
.admin-users-identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-users-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px 14px;
}

.admin-users-meta-grid small {
  display: block;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(248, 250, 255, 0.88);
  border: 1px solid rgba(31, 41, 55, 0.06);
}

.admin-users-meta-grid strong {
  color: #1f2937;
}

.admin-users-card {
  display: grid;
  gap: 16px;
}

.admin-users-empty {
  padding: 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px dashed rgba(31, 41, 55, 0.12);
}

.btn.btn-danger {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  box-shadow: 0 16px 34px rgba(185, 28, 28, 0.2);
}

.btn.btn-danger:hover {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
}

@media (max-width: 1180px) {
  .admin-users-filters-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-users-search-field,
  .admin-users-filter-actions {
    grid-column: 1 / -1;
  }

  .admin-users-filter-actions {
    justify-content: flex-start;
  }

  .admin-users-filter-actions .btn {
    width: auto;
  }
}

@media (max-width: 720px) {
  .admin-users-topbar-copy {
    gap: 8px;
  }

  .admin-users-results-pill {
    align-items: flex-start;
  }

  .admin-users-filters-grid,
  .admin-users-meta-grid {
    grid-template-columns: 1fr;
  }

  .admin-users-identity {
    align-items: flex-start;
  }

  .admin-users-avatar {
    width: 46px;
    height: 46px;
    border-radius: 14px;
  }

  .admin-users-card-actions,
  .admin-users-pending-actions,
  .admin-users-topbar-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .admin-users-card-actions > *,
  .admin-users-pending-actions > *,
  .admin-users-topbar-actions > * {
    width: 100%;
  }
}
`}</style>
    </main>
  );
}
