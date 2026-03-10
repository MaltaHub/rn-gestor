"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiClientError, fetchCurrentActor } from "@/components/ui-grid/api";
import { HolisticSheet } from "@/components/ui-grid/holistic-sheet";
import type { CurrentActor, Role } from "@/components/ui-grid/types";
import { ROLE_ORDER } from "@/lib/domain/access";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

const initialFormState = {
  name: "",
  email: "",
  password: ""
};

const DEV_MODE_ROLES: Role[] = [...ROLE_ORDER];

export function AuthenticatedWorkspace() {
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  if (!clientRef.current) {
    clientRef.current = createSupabaseBrowserClient();
  }

  const supabase = clientRef.current;
  const validatedTokenRef = useRef<string | null>(null);

  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [sessionChecking, setSessionChecking] = useState(false);
  const [formState, setFormState] = useState(initialFormState);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [actor, setActor] = useState<CurrentActor | null>(null);
  const [devRole, setDevRole] = useState<Role>("ADMINISTRADOR");
  const [devModeEnabled, setDevModeEnabled] = useState(false);
  const devModeAvailable = process.env.NODE_ENV !== "production";

  useEffect(() => {
    let active = true;

    function resetAnonymousState() {
      validatedTokenRef.current = null;
      setAccessToken(null);
      setActor(null);
      setSessionChecking(false);
      setAuthBootstrapped(true);
    }

    async function hydrateActor(session: Session | null) {
      if (!active) return;

      const nextAccessToken = session?.access_token ?? null;
      if (!nextAccessToken) {
        resetAnonymousState();
        return;
      }

      if (validatedTokenRef.current === nextAccessToken) {
        setAccessToken(nextAccessToken);
        setSessionChecking(false);
        setAuthBootstrapped(true);
        return;
      }

      validatedTokenRef.current = nextAccessToken;
      setDevModeEnabled(false);
      setAccessToken(nextAccessToken);
      setSessionChecking(true);

      try {
        const nextActor = await fetchCurrentActor(nextAccessToken);
        if (!active) return;
        setActor(nextActor);
        setAuthError(null);
      } catch (error) {
        if (!active) return;
        validatedTokenRef.current = null;
        setActor(null);
        setAccessToken(null);
        setAuthError(error instanceof Error ? error.message : "Falha ao validar sessao.");

        if (
          error instanceof ApiClientError &&
          ["UNAUTHENTICATED", "INVALID_SESSION", "PROFILE_NOT_FOUND", "ACCOUNT_NOT_APPROVED"].includes(error.code ?? "")
        ) {
          await supabase.auth.signOut();
        }
      } finally {
        if (active) {
          setSessionChecking(false);
          setAuthBootstrapped(true);
        }
      }
    }

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          throw error;
        }

        return hydrateActor(data.session);
      })
      .catch((error) => {
        if (!active) return;
        resetAnonymousState();
        setAuthError(error instanceof Error ? error.message : "Falha ao carregar sessao local.");
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      void hydrateActor(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authSubmitting || sessionChecking) return;

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

    setAuthSubmitting(true);
    setAuthError(null);
    setAuthInfo(null);

    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAuthInfo("Sessao iniciada.");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name
            }
          }
        });

        if (error) throw error;

        if (data.session) {
          setAuthInfo("Conta criada e autenticada.");
        } else {
          setAuthInfo("Conta criada. Confirme o email caso a verificacao esteja habilitada.");
        }
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Falha de autenticacao.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    validatedTokenRef.current = null;
    setAuthError(null);
    setAuthInfo(null);
    setDevModeEnabled(false);
    await supabase.auth.signOut();
  }

  if (devModeEnabled) {
    const devActor: CurrentActor = {
      authUserId: null,
      role: devRole,
      status: "APROVADO",
      userId: null,
      userName: `Modo local ${devRole}`,
      userEmail: `${devRole.toLowerCase()}@rn-gestor.local`
    };

    return <HolisticSheet actor={devActor} accessToken={null} devRole={devRole} onSignOut={() => setDevModeEnabled(false)} />;
  }

  if (actor && accessToken) {
    return <HolisticSheet actor={actor} accessToken={accessToken} onSignOut={handleSignOut} />;
  }

  return (
    <main className="sheet-auth-shell">
      <section className="sheet-auth-card">
        <span className="sheet-badge">RN Gestor</span>
        <h1>Acesso ao painel</h1>
        <p>Autenticacao centralizada no Supabase Auth com perfil de aplicacao em `usuarios_acesso`.</p>

        <div className="sheet-auth-switch">
          <button
            type="button"
            className={authMode === "login" ? "is-active" : ""}
            data-testid="auth-mode-login"
            onClick={() => {
              setAuthMode("login");
              setAuthError(null);
              setAuthInfo(null);
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={authMode === "signup" ? "is-active" : ""}
            data-testid="auth-mode-signup"
            onClick={() => {
              setAuthMode("signup");
              setAuthError(null);
              setAuthInfo(null);
            }}
          >
            Criar conta
          </button>
        </div>

        <form className="sheet-auth-form" onSubmit={handleAuthSubmit}>
          {authMode === "signup" ? (
            <label className="sheet-inline-field">
              Nome
              <input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Seu nome"
                data-testid="auth-name"
              />
            </label>
          ) : null}

          <label className="sheet-inline-field">
            Email
            <input
              type="email"
              value={formState.email}
              onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="voce@empresa.com"
              data-testid="auth-email"
            />
          </label>

          <label className="sheet-inline-field">
            Senha
            <input
              type="password"
              value={formState.password}
              onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Sua senha"
              data-testid="auth-password"
            />
          </label>

          <button type="submit" className="btn" data-testid="auth-submit" disabled={authSubmitting || sessionChecking}>
            {authSubmitting ? "Processando..." : sessionChecking ? "Validando..." : authMode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        {authError ? <p className="sheet-error" data-testid="auth-error">{authError}</p> : null}
        {authInfo ? <p className="sheet-auth-info" data-testid="auth-info">{authInfo}</p> : null}
        {!authBootstrapped || sessionChecking ? (
          <p className="sheet-auth-info" data-testid="auth-session-info">
            Validando autenticacao e perfil de acesso do usuario.
          </p>
        ) : null}

        {devModeAvailable ? (
          <section className="sheet-auth-dev" data-testid="auth-dev-panel">
            <strong>Modo local de desenvolvimento</strong>
            <p>Usa a impersonacao controlada por headers apenas fora de producao.</p>
            <label className="sheet-inline-field">
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
              className="btn"
              data-testid="auth-dev-submit"
              onClick={() => {
                setAuthError(null);
                setAuthInfo(null);
                setDevModeEnabled(true);
              }}
            >
              Continuar em modo local
            </button>
          </section>
        ) : null}
      </section>
    </main>
  );
}
