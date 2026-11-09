"use client";

import { FormEvent, useState } from "react";
import { useAuthActionsContext } from "@/components/auth/auth-provider";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/domain/password-policy";
import styles from "@/components/profile/profile.module.css";

const EMPTY = { atual: "", nova: "", confirmacao: "" };

/**
 * Troca de senha por auto-serviço: exige a senha ATUAL antes de gravar a nova.
 * O Supabase não valida a senha antiga no updateUser, então quem confere é o
 * changePassword do auth-provider (reautentica com a senha informada).
 *
 * Sem sessão real (modo local de desenvolvimento) não há usuário no Supabase Auth
 * para reautenticar: a seção só explica isso.
 */
export function PasswordCard({ hasSession }: { hasSession: boolean }) {
  const { changePassword } = useAuthActionsContext();

  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function update(field: keyof typeof EMPTY, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setMessage(null);

    const senhaAtual = form.atual.trim();
    const novaSenha = form.nova.trim();
    const problema = validateNewPassword({ senhaAtual, novaSenha, confirmacao: form.confirmacao.trim() });
    if (problema) {
      setMessage({ tone: "error", text: problema });
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ currentPassword: senhaAtual, newPassword: novaSenha });
      setForm(EMPTY);
      setMessage({ tone: "ok", text: "Senha alterada. Ela já vale para o próximo login." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao alterar a senha." });
    } finally {
      setSubmitting(false);
    }
  }

  const filled = Boolean(form.atual && form.nova && form.confirmacao);

  return (
    <section className={styles.card} aria-labelledby="profile-password-title">
      <div className={styles.cardHead}>
        <h2 id="profile-password-title">Senha</h2>
        <p>{hasSession ? `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres. Pedimos a atual para confirmar que é você.` : "Modo local de desenvolvimento: sem sessão do Supabase Auth para conferir a senha atual."}</p>
      </div>

      {hasSession ? (
        <form onSubmit={handleSubmit}>
          <div className={styles.fields} data-cols="3">
            <label className={styles.field}>
              <span>Senha atual</span>
              <input
                type="password"
                value={form.atual}
                onChange={(event) => update("atual", event.target.value)}
                autoComplete="current-password"
                data-testid="password-current"
              />
            </label>
            <label className={styles.field}>
              <span>Nova senha</span>
              <input
                type="password"
                value={form.nova}
                onChange={(event) => update("nova", event.target.value)}
                autoComplete="new-password"
                data-testid="password-new"
              />
            </label>
            <label className={styles.field}>
              <span>Confirmar</span>
              <input
                type="password"
                value={form.confirmacao}
                onChange={(event) => update("confirmacao", event.target.value)}
                autoComplete="new-password"
                data-testid="password-confirm"
              />
            </label>
          </div>
          <div className={styles.cardFoot}>
            {message ? (
              <span
                className={styles.message}
                data-tone={message.tone}
                role={message.tone === "error" ? "alert" : "status"}
                data-testid={message.tone === "ok" ? "password-ok" : "password-error"}
              >
                {message.text}
              </span>
            ) : null}
            <button type="submit" className={styles.primaryBtn} disabled={submitting || !filled} data-testid="password-submit">
              {submitting ? "Alterando…" : "Alterar senha"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
