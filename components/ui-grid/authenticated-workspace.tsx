"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import { FileManagerWorkspace } from "@/components/files/file-manager-workspace";
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

type WorkspaceView = "grid" | "files";

type AuthenticatedWorkspaceProps = {
  initialView?: WorkspaceView;
};

type BrowserSupabase = ReturnType<typeof createSupabaseBrowserClient>;

const ACTOR_CACHE_KEY = "rn-gestor.current-actor";

type CachedActorState = {
  actor: CurrentActor;
};

function getCurrentAuthRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}

function cleanupAuthCallbackUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const authParamNames = [
    "code",
    "error_code",
    "error_description",
    "type",
    "access_token",
    "refresh_token",
    "expires_at",
    "expires_in",
    "token_type",
    "provider_token",
    "provider_refresh_token"
  ];

  const hasAuthParams =
    url.search === "?" ||
    authParamNames.some((name) => url.searchParams.has(name) || hashParams.has(name));

  if (!hasAuthParams) return;

  window.history.replaceState(window.history.state, "", url.pathname || "/");
}

async function fetchActorWithRetry(accessToken: string) {
  try {
    return await fetchCurrentActor(accessToken);
  } catch (error) {
    const isRetryable =
      error instanceof ApiClientError && (error.status >= 500 || error.code === "REQUEST_TIMEOUT" || error.code === "INTERNAL_ERROR");

    if (!isRetryable) {
      throw error;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 600));
    return fetchCurrentActor(accessToken);
  }
}

function readCachedActor(authUserId: string) {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(ACTOR_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedActorState;
    return parsed.actor?.authUserId === authUserId ? parsed.actor : null;
  } catch {
    window.localStorage.removeItem(ACTOR_CACHE_KEY);
    return null;
  }
}

function writeCachedActor(actor: CurrentActor) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    ACTOR_CACHE_KEY,
    JSON.stringify({
      actor
    } satisfies CachedActorState)
  );
}

function clearCachedActor() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTOR_CACHE_KEY);
}

async function validateSessionWithRetry(supabase: BrowserSupabase, accessToken: string) {
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new ApiClientError(error?.message ?? "Sessao invalida ou expirada.", {
        status: 401,
        code: "INVALID_SESSION"
      });
    }

    return data.user;
  } catch (error) {
    const isRetryable =
      error instanceof AuthRetryableFetchError ||
      (error instanceof Error && error.name === "AbortError") ||
      (error instanceof ApiClientError && error.status >= 500);

    if (!isRetryable) {
      throw error;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 600));

    const { data, error: retryError } = await supabase.auth.getUser(accessToken);
    if (retryError || !data.user) {
      throw new ApiClientError(retryError?.message ?? "Sessao invalida ou expirada.", {
        status: 401,
        code: "INVALID_SESSION"
      });
    }

    return data.user;
  }
}

export function AuthenticatedWorkspace({ initialView = "grid" }: AuthenticatedWorkspaceProps) {
  const clientRef = useRef<BrowserSupabase | null>(null);
  if (!clientRef.current) {
    clientRef.current = createSupabaseBrowserClient();
  }

  const supabase = clientRef.current;
  if (!supabase) {
    throw new Error("Falha ao inicializar o client do Supabase.");
  }
  const validatedTokenRef = useRef<string | null>(null);

  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [sessionChecking, setSessionChecking] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
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
      setProfileLoading(false);
      setAuthBootstrapped(true);
    }

    async function refreshActorProfile(nextAccessToken: string) {
      setProfileLoading(true);

      try {
        const nextActor = await fetchActorWithRetry(nextAccessToken);
        if (!active) return;
        setActor(nextActor);
        writeCachedActor(nextActor);
        setAuthError(null);
      } catch (error) {
        if (!active) return;

        if (
          error instanceof ApiClientError &&
          ["UNAUTHENTICATED", "INVALID_SESSION", "PROFILE_NOT_FOUND", "ACCOUNT_NOT_APPROVED"].includes(error.code ?? "")
        ) {
          clearCachedActor();
          validatedTokenRef.current = null;
          setActor(null);
          setAccessToken(null);
          setAuthError(error.message);
          await supabase.auth.signOut();
          return;
        }

        setAuthError(error instanceof Error ? error.message : "Falha ao carregar perfil de acesso.");
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
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
        const user = await validateSessionWithRetry(supabase, nextAccessToken);
        if (!active) return;

        const cachedActor = readCachedActor(user.id);
        setActor(cachedActor);
        setAuthError(null);

        setSessionChecking(false);
        setAuthBootstrapped(true);

        void refreshActorProfile(nextAccessToken);
      } catch (error) {
        if (!active) return;
        clearCachedActor();
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

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrateActor(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!authBootstrapped) return;
    cleanupAuthCallbackUrl();
  }, [authBootstrapped]);

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
            emailRedirectTo: getCurrentAuthRedirectUrl(),
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
    clearCachedActor();
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

    if (initialView === "files") {
      return (
        <FileManagerWorkspace
          actor={devActor}
          accessToken={null}
          devRole={devRole}
          onSignOut={() => setDevModeEnabled(false)}
        />
      );
    }

    return <HolisticSheet actor={devActor} accessToken={null} devRole={devRole} onSignOut={() => setDevModeEnabled(false)} />;
  }

  if (actor && accessToken) {
    if (initialView === "files") {
      return <FileManagerWorkspace actor={actor} accessToken={accessToken} onSignOut={handleSignOut} />;
    }

    return <HolisticSheet actor={actor} accessToken={accessToken} onSignOut={handleSignOut} />;
  }

  if (!authBootstrapped || sessionChecking) {
    return (
      <main className="sheet-auth-shell">
        <section className="sheet-auth-card">
          <span className="sheet-badge">RN Gestor</span>
          <h1>Validando acesso</h1>
          <p>Validando a sessao com o Supabase Auth.</p>
          {authError ? <p className="sheet-error">{authError}</p> : null}
        </section>
      </main>
    );
  }

  if (accessToken && profileLoading) {
    return (
      <main className="sheet-auth-shell">
        <section className="sheet-auth-card">
          <span className="sheet-badge">RN Gestor</span>
          <h1>Carregando perfil</h1>
          <p>Sessao validada pelo Supabase. Carregando permissoes da aplicacao.</p>
          {authError ? <p className="sheet-error">{authError}</p> : null}
        </section>
      </main>
    );
  }

  if (accessToken && !actor) {
    return (
      <main className="sheet-auth-shell">
        <section className="sheet-auth-card">
          <span className="sheet-badge">RN Gestor</span>
          <h1>Perfil indisponivel</h1>
          <p>A sessao foi validada pelo Supabase, mas o perfil da aplicacao nao foi carregado.</p>
          {authError ? <p className="sheet-error">{authError}</p> : null}
          <button type="button" className="btn" onClick={() => void handleSignOut()}>
            Sair
          </button>
        </section>
      </main>
    );
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
