"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import {
  banAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  sendPasswordRecoveryLink,
  updateAdminUser,
  type AdminAccessLookupOption,
  type AdminAccessUser
} from "@/components/admin/api";
import { UserEditDialog, type UserDraft } from "@/components/admin/user-edit-dialog";
import { findStatusCode, fullMoment, matchesUserSearch, relativeMoment, statusGroup, type UserStatusGroup } from "@/components/admin/user-format";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { Avatar } from "@/components/ui/avatar";
import { confirmDialog } from "@/components/ui/dialog/confirm";
import type { CurrentActor, RequestAuth, Role } from "@/components/ui-grid/types";
import { AppFrame } from "@/components/workspace/app-frame";
import styles from "@/components/admin/users.module.css";

type UserAdminWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

type GroupFilter = "todos" | UserStatusGroup;

const GROUP_FILTERS: Array<{ value: GroupFilter; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "pendente", label: "Pendentes" },
  { value: "aprovado", label: "Ativos" },
  { value: "bloqueado", label: "Bloqueados" }
];

function labelOf(options: AdminAccessLookupOption[], code: string) {
  return options.find((option) => option.code === code)?.name ?? code;
}

function byName(left: AdminAccessUser, right: AdminAccessUser) {
  return left.nome.localeCompare(right.nome, "pt-BR", { sensitivity: "base" });
}

export function UserAdminWorkspace({ actor, accessToken, devRole = null }: UserAdminWorkspaceProps) {
  const requestAuth = useMemo<RequestAuth>(() => ({ accessToken, devRole }), [accessToken, devRole]);
  const [users, setUsers] = useState<AdminAccessUser[]>([]);
  const [roles, setRoles] = useState<AdminAccessLookupOption[]>([]);
  const [statuses, setStatuses] = useState<AdminAccessLookupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<GroupFilter>("todos");
  const [role, setRole] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [approveRole, setApproveRole] = useState<Record<string, string>>({});

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAdminUsers(requestAuth);
      setUsers(data.users);
      setRoles(data.lookups.roles);
      setStatuses(data.lookups.statuses);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Falha ao carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }, [requestAuth]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Aviso some sozinho (o erro fica até a próxima ação).
  useEffect(() => {
    if (notice?.tone !== "ok") return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const isSelf = useCallback(
    (user: AdminAccessUser) => {
      if (actor.userId && actor.userId === user.id) return true;
      const mine = actor.userEmail?.toLowerCase();
      return Boolean(mine && user.email?.toLowerCase() === mine);
    },
    [actor.userEmail, actor.userId]
  );

  const counts = useMemo(() => {
    const result: Record<GroupFilter, number> = { todos: users.length, aprovado: 0, pendente: 0, bloqueado: 0 };
    for (const user of users) result[statusGroup(user.status)] += 1;
    return result;
  }, [users]);

  const pending = useMemo(() => users.filter((user) => statusGroup(user.status) === "pendente").sort(byName), [users]);

  const visible = useMemo(
    () =>
      users
        .filter((user) => group === "todos" || statusGroup(user.status) === group)
        .filter((user) => !role || user.cargo === role)
        .filter((user) => matchesUserSearch([user.nome, user.email, user.obs], search))
        .sort(byName),
    [group, role, search, users]
  );

  const editing = users.find((user) => user.id === editingId) ?? null;
  const filtered = Boolean(search.trim()) || group !== "todos" || Boolean(role);

  function setBusy(id: string, value: boolean) {
    setBusyIds((current) => ({ ...current, [id]: value }));
  }

  async function save(user: AdminAccessUser, updates: Partial<UserDraft>, message: string) {
    setBusy(user.id, true);
    setDialogError(null);
    try {
      const { user: saved } = await updateAdminUser({ id: user.id, requestAuth, updates });
      setUsers((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      setNotice({ tone: "ok", text: message });
      return true;
    } catch (error) {
      const text = error instanceof Error ? error.message : "Falha ao salvar.";
      if (editingId === user.id) setDialogError(text);
      else setNotice({ tone: "error", text });
      return false;
    } finally {
      setBusy(user.id, false);
    }
  }

  async function approve(user: AdminAccessUser) {
    const status = findStatusCode(statuses, "aprovado", "APROVADO");
    if (!status) return setNotice({ tone: "error", text: "Situação “Aprovado” não encontrada." });
    const cargo = approveRole[user.id] || user.cargo;
    await save(user, { status, cargo }, `${user.nome} aprovado como ${labelOf(roles, cargo)}.`);
  }

  async function refuse(user: AdminAccessUser) {
    const status = findStatusCode(statuses, "bloqueado", "BLOQUEADO");
    if (!status) return;
    const ok = await confirmDialog({
      title: `Recusar o acesso de ${user.nome}?`,
      message: "A conta fica bloqueada. Dá para liberar depois, editando o usuário.",
      confirmLabel: "Recusar"
    });
    if (ok) await save(user, { status }, `Acesso de ${user.nome} recusado.`);
  }

  async function sendRecovery(user: AdminAccessUser) {
    setBusy(user.id, true);
    setDialogError(null);
    try {
      const { email } = await sendPasswordRecoveryLink({ id: user.id, requestAuth });
      setNotice({ tone: "ok", text: `Link para redefinir a senha enviado para ${email}.` });
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Falha ao enviar o link.");
    } finally {
      setBusy(user.id, false);
    }
  }

  async function ban(user: AdminAccessUser) {
    const ok = await confirmDialog({
      title: `Banir ${user.nome}?`,
      message: "O acesso é bloqueado na hora. Dá para reativar depois mudando a situação.",
      confirmLabel: "Banir",
      tone: "danger"
    });
    if (!ok) return;
    setBusy(user.id, true);
    try {
      await banAdminUser({ id: user.id, requestAuth });
      setEditingId(null);
      setNotice({ tone: "ok", text: `${user.nome} foi banido.` });
      await loadUsers();
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Falha ao banir.");
    } finally {
      setBusy(user.id, false);
    }
  }

  async function remove(user: AdminAccessUser) {
    const ok = await confirmDialog({
      title: `Excluir a conta de ${user.nome}?`,
      message: "A conta é apagada e o acesso bloqueado. Não dá para desfazer.",
      confirmLabel: "Excluir conta",
      tone: "danger"
    });
    if (!ok) return;
    setBusy(user.id, true);
    try {
      await deleteAdminUser({ id: user.id, requestAuth });
      setEditingId(null);
      setNotice({ tone: "ok", text: `Conta de ${user.nome} excluída.` });
      await loadUsers();
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : "Falha ao excluir.");
    } finally {
      setBusy(user.id, false);
    }
  }

  if (actor.role !== "ADMINISTRADOR") {
    return (
      <AuthStatusCard
        title="Acesso restrito"
        description="O painel de usuários é exclusivo do administrador."
        error="Seu perfil não tem permissão para gerenciar acessos."
      >
        <Link href="/" className="btn">
          Voltar ao painel
        </Link>
      </AuthStatusCard>
    );
  }

  return (
    <AppFrame actor={actor} title="Usuários" fill>
      <div className={styles.page} data-testid="users-page">
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Icon name="search" size={15} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nome ou e-mail"
              aria-label="Buscar usuário"
              data-testid="users-search"
            />
          </label>
          <div className={styles.segmented} role="group" aria-label="Situação">
            {GROUP_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={group === option.value}
                onClick={() => setGroup(option.value)}
                data-testid={`users-group-${option.value}`}
              >
                {option.label}
                <span className={styles.count}>{counts[option.value]}</span>
              </button>
            ))}
          </div>
          <select className={styles.select} value={role} onChange={(event) => setRole(event.target.value)} aria-label="Cargo" data-testid="users-role">
            <option value="">Todos os cargos</option>
            {roles.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => void loadUsers()}
            disabled={loading}
            title="Recarregar"
            aria-label="Recarregar"
            data-testid="users-reload"
          >
            <Icon name="refresh" size={16} />
          </button>
        </div>

        {notice ? (
          <p className={styles.notice} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
            {notice.text}
            <button type="button" aria-label="Fechar aviso" onClick={() => setNotice(null)}>
              <Icon name="close" size={13} />
            </button>
          </p>
        ) : null}

        <div className={styles.scroll}>
          {pending.length > 0 && group !== "bloqueado" && group !== "aprovado" ? (
            <section className={styles.pending} aria-label="Aguardando aprovação" data-testid="users-pending">
              <h2 className={styles.sectionTitle}>
                Aguardando aprovação <span>{pending.length}</span>
              </h2>
              {pending.map((user) => {
                const busy = Boolean(busyIds[user.id]);
                return (
                  <div key={user.id} className={styles.pendingRow} data-testid="users-pending-row">
                    <Avatar name={user.nome} photoUrl={user.foto} size={32} />
                    <div className={styles.who}>
                      <strong>{user.nome}</strong>
                      <span>
                        {user.email ?? "Sem e-mail"} · pediu {relativeMoment(user.created_at).toLowerCase()}
                      </span>
                    </div>
                    <div className={styles.pendingActions}>
                      <select
                        className={styles.select}
                        value={approveRole[user.id] || user.cargo}
                        onChange={(event) => setApproveRole((current) => ({ ...current, [user.id]: event.target.value }))}
                        aria-label={`Cargo de ${user.nome}`}
                        disabled={busy}
                      >
                        {roles.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" className={styles.primaryBtn} onClick={() => void approve(user)} disabled={busy} data-testid="users-approve">
                        <Icon name="check" size={15} />
                        Aprovar
                      </button>
                      <button type="button" className={styles.ghostBtn} onClick={() => void refuse(user)} disabled={busy} data-testid="users-refuse">
                        Recusar
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}

          <section className={styles.list} aria-label="Usuários" data-testid="users-list">
            <div className={styles.listHead} aria-hidden="true">
              <span>Pessoa</span>
              <span>Cargo</span>
              <span>Situação</span>
              <span>Último acesso</span>
            </div>
            {loadError ? (
              <p className={styles.empty} role="alert">
                {loadError}
              </p>
            ) : null}
            {!loadError && loading && users.length === 0 ? <p className={styles.empty}>Carregando…</p> : null}
            {!loadError && !loading && visible.length === 0 ? (
              <p className={styles.empty}>{filtered ? "Ninguém com esses filtros." : "Nenhum usuário ainda."}</p>
            ) : null}
            {visible.map((user) => {
              const self = isSelf(user);
              const tone = statusGroup(user.status);
              return (
                <button
                  key={user.id}
                  type="button"
                  className={styles.row}
                  onClick={() => {
                    setDialogError(null);
                    setEditingId(user.id);
                  }}
                  data-testid="users-row"
                >
                  <span className={styles.person}>
                    <Avatar name={user.nome} photoUrl={user.foto} size={32} />
                    <span className={styles.who}>
                      <strong>
                        {user.nome}
                        {self ? <em className={styles.you}>você</em> : null}
                      </strong>
                      <span>{user.email ?? "Sem e-mail"}</span>
                    </span>
                  </span>
                  <span className={styles.cell} data-label="Cargo">
                    {labelOf(roles, user.cargo)}
                  </span>
                  <span className={styles.cell}>
                    <span className={styles.status} data-tone={tone}>
                      {labelOf(statuses, user.status)}
                    </span>
                  </span>
                  <span className={styles.cell} data-muted title={fullMoment(user.ultimo_login)}>
                    {relativeMoment(user.ultimo_login)}
                  </span>
                  <Icon name="chevronRight" size={15} className={styles.chevron} />
                </button>
              );
            })}
          </section>
        </div>
      </div>

      {editing ? (
        <UserEditDialog
          key={editing.id}
          user={editing}
          isSelf={isSelf(editing)}
          roles={roles}
          statuses={statuses}
          busy={Boolean(busyIds[editing.id])}
          error={dialogError}
          onClose={() => setEditingId(null)}
          onSave={async (draft) => {
            if (await save(editing, draft, `${draft.nome} atualizado.`)) setEditingId(null);
          }}
          onSendRecovery={() => void sendRecovery(editing)}
          onBan={() => void ban(editing)}
          onDelete={() => void remove(editing)}
        />
      ) : null}
    </AppFrame>
  );
}
