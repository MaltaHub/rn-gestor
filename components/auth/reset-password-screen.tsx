"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActionsContext } from "@/components/auth/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "@/components/auth/auth.module.css";

const MIN_PASSWORD_LENGTH = 8;

type Phase = "checking" | "ready" | "invalid" | "done";

/**
 * Página única que conclui a recuperação de senha. O link do email (tanto o do
 * "Esqueci minha senha" quanto o gerado pelo admin) redireciona para cá com a
 * sessão de recuperação na URL — o supabase-js a consome e dispara
 * PASSWORD_RECOVERY. Aqui o usuário define a nova senha (updateUser) e volta ao
 * login.
 */
export function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword, signOut } = useAuthActionsContext();

  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  const cleanUrlHash = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash || window.location.search) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);

  // Detecta a sessão de recuperação (vinda do link do email).
  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) {
      setPhase("invalid");
      setError("Autenticação indisponível neste navegador.");
      return;
    }

    let active = true;
    const markReady = () => {
      if (!active || resolvedRef.current) return;
      resolvedRef.current = true;
      setPhase("ready");
      cleanUrlHash();
    };

    // O supabase-js consome o token da URL ao iniciar e dispara este evento.
    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))) {
        markReady();
      }
    });

    // Sessão já persistida (token consumido pelo provider global).
    void client.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    // Sem sessão de recuperação após um tempo: link inválido/expirado.
    const timeout = window.setTimeout(() => {
      if (!active || resolvedRef.current) return;
      resolvedRef.current = true;
      setPhase("invalid");
    }, 3500);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [cleanUrlHash]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const senha = password.trim();
    if (senha.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (senha !== confirm.trim()) {
      setError("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(senha);
      // Encerra a sessão de recuperação: o usuário entra de novo com a nova senha.
      await signOut().catch(() => undefined);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao redefinir a senha.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.authShell}>
      <section className={styles.authCard}>
        <span className={styles.badge}>RN Gestor</span>
        <h1>Redefinir senha</h1>

        {phase === "checking" ? (
          <p>Validando o link de recuperação...</p>
        ) : phase === "invalid" ? (
          <>
            <p className={styles.error}>
              Link de recuperação inválido ou expirado. Solicite um novo em &quot;Esqueci minha senha&quot;.
            </p>
            <button type="button" className={styles.btn} onClick={() => router.replace("/login")}>
              Voltar ao login
            </button>
          </>
        ) : phase === "done" ? (
          <>
            <p className={styles.info}>Senha redefinida com sucesso. Entre com a nova senha.</p>
            <button type="button" className={styles.btn} data-testid="reset-go-login" onClick={() => router.replace("/login")}>
              Ir para o login
            </button>
          </>
        ) : (
          <>
            <p>Defina a nova senha da sua conta.</p>
            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.inlineField}>
                Nova senha
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                  autoComplete="new-password"
                  data-testid="reset-password"
                />
              </label>
              <label className={styles.inlineField}>
                Confirmar nova senha
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                  data-testid="reset-password-confirm"
                />
              </label>

              {error ? <p className={styles.error} data-testid="reset-error">{error}</p> : null}

              <button type="submit" className={styles.btn} disabled={submitting} data-testid="reset-submit">
                {submitting ? "Salvando..." : "Redefinir senha"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
