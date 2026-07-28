"use client";

import { FormEvent, useState } from "react";
import { useAuthActionsContext } from "@/components/auth/auth-provider";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/domain/password-policy";

const EMPTY = { atual: "", nova: "", confirmacao: "" };

/**
 * Troca de senha por auto-servico: exige a senha ATUAL antes de gravar a nova.
 * O Supabase nao valida a senha antiga no updateUser, entao quem confere e' o
 * changePassword do auth-provider (reautentica com a senha informada).
 *
 * Sem sessao real (modo local de desenvolvimento) o card fica desabilitado —
 * nao ha usuario no Supabase Auth pra reautenticar.
 */
export function PasswordCard({ hasSession }: { hasSession: boolean }) {
  const { changePassword } = useAuthActionsContext();

  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function update(field: keyof typeof EMPTY, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setInfo(null);

    const senhaAtual = form.atual.trim();
    const novaSenha = form.nova.trim();
    const problema = validateNewPassword({
      senhaAtual,
      novaSenha,
      confirmacao: form.confirmacao.trim()
    });

    if (problema) {
      setError(problema);
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ currentPassword: senhaAtual, newPassword: novaSenha });
      setForm(EMPTY);
      setInfo("Senha alterada. Ela ja vale para o proximo login.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar a senha.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="profile-edit-card profile-password-card" aria-label="Senha da conta">
      <div className="profile-edit-fields">
        <h2 className="profile-section-title">Senha</h2>

        {hasSession ? (
          <form className="profile-password-form" onSubmit={handleSubmit}>
            <label className="profile-field">
              <span>Senha atual</span>
              <input
                type="password"
                value={form.atual}
                onChange={(event) => update("atual", event.target.value)}
                autoComplete="current-password"
                placeholder="Sua senha de hoje"
                data-testid="password-current"
              />
            </label>

            <label className="profile-field">
              <span>Nova senha</span>
              <input
                type="password"
                value={form.nova}
                onChange={(event) => update("nova", event.target.value)}
                autoComplete="new-password"
                placeholder={`Minimo ${MIN_PASSWORD_LENGTH} caracteres`}
                data-testid="password-new"
              />
            </label>

            <label className="profile-field">
              <span>Confirmar nova senha</span>
              <input
                type="password"
                value={form.confirmacao}
                onChange={(event) => update("confirmacao", event.target.value)}
                autoComplete="new-password"
                placeholder="Repita a nova senha"
                data-testid="password-confirm"
              />
            </label>

            <div className="profile-edit-actions">
              <button type="submit" className="btn" disabled={submitting} data-testid="password-submit">
                {submitting ? "Alterando..." : "Alterar senha"}
              </button>
              {info ? (
                <span className="profile-ok" data-testid="password-ok">
                  {info}
                </span>
              ) : null}
              {error ? (
                <span className="profile-error" data-testid="password-error">
                  {error}
                </span>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="profile-hint">
            Modo local de desenvolvimento: sem sessao do Supabase Auth para revalidar a senha atual.
          </p>
        )}
      </div>
    </section>
  );
}
