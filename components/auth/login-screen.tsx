"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DEV_MODE_ROLES,
  useAuthActionsContext,
  useAuthSessionState
} from "@/components/auth/auth-provider";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import type { Role } from "@/lib/domain/auth-session";
import styles from "@/components/auth/auth.module.css";

type AuthMode = "login" | "signup";

const initialFormState = {
  name: "",
  email: "",
  password: ""
};

function getSafeNextPath(rawNext: string | null) {
  if (!rawNext || !rawNext.startsWith("/")) return "/";
  if (rawNext.startsWith("//")) return "/";
  return rawNext;
}

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get("next"));
  const { authError, authInfo, authSubmitting, canUseDevMode, devRole, profileLoading, status } = useAuthSessionState();
  const { enableDevMode, resetFeedback, requestPasswordReset, setAuthError, setDevRole, signIn, signOut, signUp } =
    useAuthActionsContext();

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [formState, setFormState] = useState(initialFormState);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  useEffect(() => {
    if (status !== "ready") return;
    router.replace(nextPath);
  }, [nextPath, router, status]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authSubmitting) return;

    const email = formState.email.trim();
    const password = formState.password.trim();
    const name = formState.name.trim();

    if (!email || !password) {
      setAuthError("Informe email e senha.");
      return;
    }

    if (authMode === "signup" && !name) {
      setAuthError("Informe o nome para criar a conta.");
      return;
    }

    if (authMode === "login") {
      await signIn({ email, password });
      return;
    }

    await signUp({ name, email, password });
  }

  if (status === "loading") {
    return (
      <AuthStatusCard
        title="Validando acesso"
        description="Validando a sessao com o Supabase Auth antes de liberar o painel."
        error={authError}
      />
    );
  }

  if (status === "ready") {
    return (
      <AuthStatusCard
        title="Redirecionando"
        description="Sessao pronta. Redirecionando para a area autenticada."
      />
    );
  }

  if (status === "profile_error") {
    return (
      <AuthStatusCard
        title="Perfil indisponivel"
        description="A sessao existe, mas o perfil da aplicacao nao foi carregado."
        error={authError}
      >
        {profileLoading ? null : (
          <button type="button" className={styles.btn} onClick={() => void signOut()}>
            Sair
          </button>
        )}
      </AuthStatusCard>
    );
  }

  return (
    <main className={styles.authShell}>
      <section className={styles.authCard}>
        <span className={styles.badge}>RN Gestor</span>
        <h1>Acesso ao painel</h1>
        <p>Login e sessao centralizados no Supabase Auth. O app so libera as rotas protegidas depois do bootstrap.</p>
        <div className={styles.pillRow} aria-hidden="true">
          <span>Supabase Auth</span>
          <span>Sessao persistente</span>
          <span>Rotas protegidas</span>
        </div>

        <div className={styles.switchRow}>
          <button
            type="button"
            className={`${styles.switchBtn} ${authMode === "login" ? styles.switchBtnActive : ""}`.trim()}
            data-testid="auth-mode-login"
            onClick={() => {
              setAuthMode("login");
              resetFeedback();
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`${styles.switchBtn} ${authMode === "signup" ? styles.switchBtnActive : ""}`.trim()}
            data-testid="auth-mode-signup"
            onClick={() => {
              setAuthMode("signup");
              resetFeedback();
            }}
          >
            Criar conta
          </button>
        </div>

        <form className={styles.form} onSubmit={handleAuthSubmit}>
          {authMode === "signup" ? (
            <label className={styles.inlineField}>
              Nome
              <input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Seu nome"
                data-testid="auth-name"
              />
            </label>
          ) : null}

          <label className={styles.inlineField}>
            Email
            <input
              type="email"
              value={formState.email}
              onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="voce@empresa.com"
              data-testid="auth-email"
            />
          </label>

          <label className={styles.inlineField}>
            Senha
            <input
              type="password"
              value={formState.password}
              onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Sua senha"
              data-testid="auth-password"
            />
          </label>
          {authMode === "login" ? (
            <div className={styles.inline}>
              <button
                type="button"
                className={styles.btnLink}
                disabled={resetSubmitting}
                onClick={async () => {
                  const email = formState.email.trim();
                  if (!email) {
                    setAuthError("Informe o email primeiro para recuperar a senha.");
                    return;
                  }
                  try {
                    setResetSubmitting(true);
                    await requestPasswordReset(email);
                  } catch (err) {
                    setAuthError(err instanceof Error ? err.message : "Falha ao solicitar recuperacao.");
                  } finally {
                    setResetSubmitting(false);
                  }
                }}
              >
                Esqueci minha senha
              </button>
            </div>
          ) : null}

          <button type="submit" className={styles.btn} data-testid="auth-submit" disabled={authSubmitting}>
            {authSubmitting ? "Processando..." : authMode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        {authError ? <p className={styles.error} data-testid="auth-error">{authError}</p> : null}
        {authInfo ? <p className={styles.info} data-testid="auth-info">{authInfo}</p> : null}

        {canUseDevMode ? (
          <section className={styles.devPanel} data-testid="auth-dev-panel">
            <strong>Modo local de desenvolvimento</strong>
            <p>Usa a impersonacao controlada por headers apenas fora de producao.</p>
            <label className={styles.inlineField}>
              Perfil local
              <select value={devRole} onChange={(event) => setDevRole(event.target.value as Role)} data-testid="auth-dev-role">
                {DEV_MODE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.btnSecondary}
              data-testid="auth-dev-submit"
              onClick={() => {
                enableDevMode(devRole);
                router.replace(nextPath);
              }}
            >
              Entrar em modo local
            </button>
          </section>
        ) : null}
      </section>
    </main>
  );
}
