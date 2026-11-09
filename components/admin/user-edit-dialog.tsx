"use client";

import { useState } from "react";
import type { AdminAccessLookupOption, AdminAccessUser } from "@/components/admin/api";
import { fullMoment, relativeMoment } from "@/components/admin/user-format";
import { Avatar } from "@/components/ui/avatar";
import { FocusDialog, dialogStyles } from "@/components/ui/dialog/focus-dialog";
import { FormField, recordFormStyles } from "@/components/ui-grid/record-form-parts";
import styles from "@/components/admin/users.module.css";

export type UserDraft = { nome: string; cargo: string; status: string; obs: string };

export function draftOf(user: AdminAccessUser): UserDraft {
  return { nome: user.nome ?? "", cargo: user.cargo ?? "", status: user.status ?? "", obs: user.obs ?? "" };
}

/**
 * Edição de um acesso (casca única FocusDialog): nome, cargo, situação e observação; ações da conta
 * (redefinir senha, banir, excluir) separadas embaixo. A própria conta não pode ser banida/excluída.
 */
export function UserEditDialog(props: {
  user: AdminAccessUser | null;
  isSelf: boolean;
  roles: AdminAccessLookupOption[];
  statuses: AdminAccessLookupOption[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: UserDraft) => void;
  onSendRecovery: () => void;
  onBan: () => void;
  onDelete: () => void;
}) {
  // O pai monta com key={user.id}: o rascunho nasce do usuário aberto.
  const { user } = props;
  const [draft, setDraft] = useState<UserDraft>(() => (user ? draftOf(user) : { nome: "", cargo: "", status: "", obs: "" }));

  if (!user) return null;
  const original = draftOf(user);
  const dirty = (Object.keys(draft) as Array<keyof UserDraft>).some((key) => draft[key].trim() !== original[key].trim());
  const nameMissing = !draft.nome.trim();

  return (
    <FocusDialog
      open
      onClose={props.onClose}
      busy={props.busy}
      size="md"
      title={user.nome}
      subtitle={user.email ?? "Sem e-mail"}
      testId="user-edit-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !nameMissing) props.onSave({ ...draft, nome: draft.nome.trim(), obs: draft.obs.trim() });
      }}
      footer={
        <>
          <button type="button" className={dialogStyles.btn} onClick={props.onClose} disabled={props.busy}>
            Cancelar
          </button>
          <button
            type="submit"
            className={`${dialogStyles.btn} ${dialogStyles.primary}`}
            disabled={props.busy || !dirty || nameMissing}
            data-testid="user-edit-save"
          >
            {props.busy ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <div className={recordFormStyles.form}>
        <div className={styles.dialogIdentity}>
          <Avatar name={user.nome} photoUrl={user.foto} size={40} />
          <dl>
            <div>
              <dt>Último acesso</dt>
              <dd title={fullMoment(user.ultimo_login)}>{relativeMoment(user.ultimo_login)}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{fullMoment(user.created_at)}</dd>
            </div>
            <div>
              <dt>Aprovado em</dt>
              <dd>{fullMoment(user.aprovado_em)}</dd>
            </div>
          </dl>
        </div>

        <div className={recordFormStyles.grid}>
          <FormField inputId="user-nome" label="Nome" full>
            <input id="user-nome" value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} required />
          </FormField>
          <FormField inputId="user-cargo" label="Cargo">
            <select
              id="user-cargo"
              value={draft.cargo}
              onChange={(event) => setDraft({ ...draft, cargo: event.target.value })}
              disabled={props.isSelf}
              title={props.isSelf ? "Seu próprio cargo não muda por aqui." : undefined}
              data-testid="user-edit-cargo"
            >
              {props.roles.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField inputId="user-status" label="Situação">
            <select
              id="user-status"
              value={draft.status}
              onChange={(event) => setDraft({ ...draft, status: event.target.value })}
              disabled={props.isSelf}
              title={props.isSelf ? "Sua própria situação não muda por aqui." : undefined}
              data-testid="user-edit-status"
            >
              {props.statuses.map((status) => (
                <option key={status.code} value={status.code}>
                  {status.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField inputId="user-obs" label="Observação" full>
            <textarea id="user-obs" rows={2} value={draft.obs} onChange={(event) => setDraft({ ...draft, obs: event.target.value })} />
          </FormField>
        </div>

        <section className={styles.accountActions} aria-label="Ações da conta">
          <span className={styles.accountTitle}>Conta</span>
          <button type="button" className={styles.linkBtn} onClick={props.onSendRecovery} disabled={props.busy || !user.email} data-testid="user-send-recovery">
            Enviar link para redefinir a senha
          </button>
          {props.isSelf ? (
            <span className={styles.muted}>Você não pode banir nem excluir a própria conta.</span>
          ) : (
            <span className={styles.dangerRow}>
              <button type="button" className={styles.linkBtn} data-tone="danger" onClick={props.onBan} disabled={props.busy} data-testid="user-ban">
                Banir
              </button>
              <button type="button" className={styles.linkBtn} data-tone="danger" onClick={props.onDelete} disabled={props.busy} data-testid="user-delete">
                Excluir conta
              </button>
            </span>
          )}
        </section>

        {props.error ? (
          <p className={dialogStyles.error} role="alert">
            {props.error}
          </p>
        ) : null}
      </div>
    </FocusDialog>
  );
}
