"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { ApiClientError, fetchCurrentActor } from "@/components/ui-grid/api";
import { getDevActorAuthUserId, type CurrentActor, type Role, type SessionStatus } from "@/lib/domain/auth-session";
import { ROLE_ORDER } from "@/lib/domain/access";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { syncBrowserSessionHint } from "@/lib/supabase/session-hint";

type ProfileState = "idle" | "loading" | "ready" | "error";

type SessionState = {
  accessToken: string | null;
  actor: CurrentActor | null;
  authBootstrapped: boolean;
  authError: string | null;
  authInfo: string | null;
  authSubmitting: boolean;
  canUseDevMode: boolean;
  devModeEnabled: boolean;
  devRole: Role;
  profileLoading: boolean;
  sessionChecking: boolean;
  status: SessionStatus;
};

type AuthActions = {
  enableDevMode: (role: Role) => void;
  resetFeedback: () => void;
  setAuthError: (value: string | null) => void;
  setDevRole: (value: Role) => void;
  signIn: (params: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (params: { name: string; email: string; password: string }) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
};

const SessionStateContext = createContext<SessionState | null>(null);
const AuthActionsContext = createContext<AuthActions | null>(null);

const ACTOR_CACHE_KEY = "rn-gestor.current-actor";
export const DEV_MODE_ROLES: Role[] = [...ROLE_ORDER];

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

function buildDevActor(role: Role): CurrentActor {
  return {
    authUserId: getDevActorAuthUserId(role),
    role,
    status: "APROVADO",
    userId: null,
    userName: `Modo local ${role}`,
    userEmail: `${role.toLowerCase()}@rn-gestor.local`
  };
}

async function fetchActorWithRetry(accessToken: string) {
  try {
    return await fetchCurrentActor(accessToken);
  } catch (error) {
    const isRetryable =
      error instanceof ApiClientError &&
      (error.status >= 500 || error.code === "REQUEST_TIMEOUT" || error.code === "INTERNAL_ERROR");

    if (!isRetryable) {
      throw error;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 600));
    return fetchCurrentActor(accessToken);
  }
}

function useSessionState(params: {
  actor: CurrentActor | null;
  accessToken: string | null;
  authBootstrapped: boolean;
  authError: string | null;
  authInfo: string | null;
  authSubmitting: boolean;
  canUseDevMode: boolean;
  devModeEnabled: boolean;
  devRole: Role;
  sessionChecking: boolean;
  profileState: ProfileState;
}) {
  const effectiveActor = params.devModeEnabled ? buildDevActor(params.devRole) : params.actor;
  const effectiveAccessToken = params.devModeEnabled ? null : params.accessToken;
  const profileLoading = params.profileState === "loading";

  const status: SessionStatus =
    !params.authBootstrapped ||
    params.sessionChecking ||
    (effectiveAccessToken && !effectiveActor && profileLoading)
      ? "loading"
      : effectiveActor
        ? "ready"
        : effectiveAccessToken && params.profileState === "error"
          ? "profile_error"
          : effectiveAccessToken
            ? "loading"
            : "signed_out";

  return useMemo(
    () => ({
      accessToken: effectiveAccessToken,
      actor: effectiveActor,
      authBootstrapped: params.authBootstrapped,
      authError: params.authError,
      authInfo: params.authInfo,
      authSubmitting: params.authSubmitting,
      canUseDevMode: params.canUseDevMode,
      devModeEnabled: params.devModeEnabled,
      devRole: params.devRole,
      profileLoading,
      sessionChecking: params.sessionChecking,
      status
    }),
    [
      effectiveAccessToken,
      effectiveActor,
      params.authBootstrapped,
      params.authError,
      params.authInfo,
      params.authSubmitting,
      params.canUseDevMode,
      params.devModeEnabled,
      params.devRole,
      params.sessionChecking,
      profileLoading,
      status
    ]
  );
}

function useActorProfile() {
  const clientRef = useRef<ReturnType<typeof createSupabaseBrowserClient>>(null);
  if (typeof window !== "undefined" && !clientRef.current) {
    clientRef.current = createSupabaseBrowserClient();
  }

  const supabase = clientRef.current;

  const validatedTokenRef = useRef<string | null>(null);
  const actorRef = useRef<CurrentActor | null>(null);
  const profileStateRef = useRef<ProfileState>("idle");

  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [sessionChecking, setSessionChecking] = useState(false);
  const [profileState, setProfileState] = useState<ProfileState>("idle");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [actor, setActor] = useState<CurrentActor | null>(null);
  const [devRole, setDevRole] = useState<Role>("ADMINISTRADOR");
  const [devModeEnabled, setDevModeEnabled] = useState(false);
  const canUseDevMode = process.env.NODE_ENV !== "production";

  useEffect(() => {
    actorRef.current = actor;
  }, [actor]);

  useEffect(() => {
    profileStateRef.current = profileState;
  }, [profileState]);

  useEffect(() => {
    if (!supabase) {
      setAuthBootstrapped(true);
      setSessionChecking(false);
      return;
    }
    const currentSupabase = supabase;

    let active = true;

    function resetAnonymousState() {
      validatedTokenRef.current = null;
      setAccessToken(null);
      setActor(null);
      setSessionChecking(false);
      setProfileState("idle");
      setAuthBootstrapped(true);
    }

    async function refreshActorProfile(nextAccessToken: string) {
      const hadActor = Boolean(actorRef.current);

      try {
        const nextActor = await fetchActorWithRetry(nextAccessToken);
        if (!active) return;
        setActor(nextActor);
        writeCachedActor(nextActor);
        setAuthError(null);
        setProfileState("ready");
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
          setProfileState("idle");
          syncBrowserSessionHint(null);
          await currentSupabase.auth.signOut();
          return;
        }

        setAuthError(error instanceof Error ? error.message : "Falha ao carregar perfil de acesso.");
        if (!hadActor) {
          setProfileState("error");
        }
      }
    }

    async function hydrateActor(event: AuthChangeEvent, session: Session | null) {
      if (!active) return;

      syncBrowserSessionHint(session);

      const nextAccessToken = session?.access_token ?? null;
      if (!nextAccessToken) {
        resetAnonymousState();
        return;
      }

      if (validatedTokenRef.current === nextAccessToken) {
        setAccessToken(nextAccessToken);
        setSessionChecking(false);
        setAuthBootstrapped(true);
        if (!actorRef.current && profileStateRef.current === "idle") {
          setProfileState("loading");
          void refreshActorProfile(nextAccessToken);
        }
        return;
      }

      validatedTokenRef.current = nextAccessToken;
      setDevModeEnabled(false);
      setAccessToken(nextAccessToken);
      setSessionChecking(false);

      const nextUser = session?.user ?? null;
      const cachedActor =
        nextUser ? readCachedActor(nextUser.id) ?? (actorRef.current?.authUserId === nextUser.id ? actorRef.current : null) : null;
      const isTokenRefreshForSameUser =
        event === "TOKEN_REFRESHED" && nextUser?.id != null && actorRef.current?.authUserId === nextUser.id;

      try {
        if (cachedActor) {
          setActor(cachedActor);
          setProfileState("ready");
        } else {
          setActor(null);
          setProfileState("loading");
        }

        setAuthError(null);

        setSessionChecking(false);
        setAuthBootstrapped(true);

        if (!isTokenRefreshForSameUser || !cachedActor) {
          void refreshActorProfile(nextAccessToken);
        }
      } catch (error) {
        if (!active) return;
        clearCachedActor();
        validatedTokenRef.current = null;
        setActor(null);
        setAccessToken(null);
        setAuthError(error instanceof Error ? error.message : "Falha ao validar sessao.");
        setProfileState("idle");
        syncBrowserSessionHint(null);

        if (
          error instanceof ApiClientError &&
          ["UNAUTHENTICATED", "INVALID_SESSION", "PROFILE_NOT_FOUND", "ACCOUNT_NOT_APPROVED"].includes(error.code ?? "")
        ) {
          await currentSupabase.auth.signOut();
        }
      } finally {
        if (active) {
          setSessionChecking(false);
          setAuthBootstrapped(true);
        }
      }
    }

    let localBootstrapFallback: number | null = null;

    function clearLocalBootstrapFallback() {
      if (!localBootstrapFallback) return;
      window.clearTimeout(localBootstrapFallback);
      localBootstrapFallback = null;
    }

    const {
      data: { subscription }
    } = currentSupabase.auth.onAuthStateChange((event, session) => {
      void hydrateActor(event, session).finally(clearLocalBootstrapFallback);
    });

    localBootstrapFallback = canUseDevMode
      ? window.setTimeout(() => {
          if (active) {
            resetAnonymousState();
          }
        }, 2_500)
      : null;

    void currentSupabase.auth
      .getSession()
      .then(({ data }) => hydrateActor("INITIAL_SESSION", data.session))
      .catch(() => {
        if (active) {
          resetAnonymousState();
        }
      })
      .finally(clearLocalBootstrapFallback);

    return () => {
      active = false;
      clearLocalBootstrapFallback();
      subscription.unsubscribe();
    };
  }, [canUseDevMode, supabase]);

  useEffect(() => {
    if (!authBootstrapped) return;
    cleanupAuthCallbackUrl();
  }, [authBootstrapped]);

  return {
    supabase,
    validatedTokenRef,
    actor,
    setActor,
    accessToken,
    setAccessToken,
    authBootstrapped,
    authError,
    authInfo,
    authSubmitting,
    canUseDevMode,
    devModeEnabled,
    devRole,
    profileState,
    sessionChecking,
    setAuthError,
    setAuthInfo,
    setAuthSubmitting,
    setAuthBootstrapped,
    setDevModeEnabled,
    setDevRole,
    setProfileState,
    setSessionChecking
  };
}

function useAuthActions(state: ReturnType<typeof useActorProfile>): AuthActions {
  const {
    supabase,
    validatedTokenRef,
    setAuthError,
    setAuthInfo,
    setAuthSubmitting,
    setDevModeEnabled,
    setActor,
    setAccessToken,
    setProfileState,
    setAuthBootstrapped,
    setSessionChecking,
    setDevRole
  } = state;

  return useMemo(
    () => ({
      resetFeedback() {
        setAuthError(null);
        setAuthInfo(null);
      },
      async signIn(params) {
        if (!supabase) {
          setAuthError("Autenticacao indisponivel no ambiente local sem variaveis do Supabase.");
          return;
        }

        setAuthSubmitting(true);
        setDevModeEnabled(false);
        setAuthError(null);
        setAuthInfo(null);

        try {
          const { error } = await supabase.auth.signInWithPassword({
            email: params.email.trim(),
            password: params.password.trim()
          });

          if (error) throw error;

          setAuthInfo("Sessao iniciada.");
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : "Falha de autenticacao.");
        } finally {
          setAuthSubmitting(false);
        }
      },
      async signUp(params) {
        if (!supabase) {
          setAuthError("Cadastro indisponivel no ambiente local sem variaveis do Supabase.");
          return;
        }

        setAuthSubmitting(true);
        setDevModeEnabled(false);
        setAuthError(null);
        setAuthInfo(null);

        try {
          const { data, error } = await supabase.auth.signUp({
            email: params.email.trim(),
            password: params.password.trim(),
            options: {
              emailRedirectTo: getCurrentAuthRedirectUrl(),
              data: {
                full_name: params.name.trim()
              }
            }
          });

          if (error) throw error;

          if (data.session) {
            setAuthInfo("Conta criada. Aguarde aprovacao para acessar o sistema.");
          } else {
            setAuthInfo("Conta criada. Confirme o email se necessario e aguarde aprovacao para acessar o sistema.");
          }
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : "Falha de autenticacao.");
        } finally {
          setAuthSubmitting(false);
        }
      },
      async signOut() {
        if (!supabase) {
          setAuthError("Sessao local sem Supabase para encerrar.");
          return;
        }

        validatedTokenRef.current = null;
        setAuthError(null);
        setAuthInfo(null);
        setDevModeEnabled(false);
        setActor(null);
        setAccessToken(null);
        clearCachedActor();
        setProfileState("idle");
        syncBrowserSessionHint(null);
        await supabase.auth.signOut();
      },
      enableDevMode(role) {
        setDevRole(role);
        setDevModeEnabled(true);
        setAuthError(null);
        setAuthInfo(null);
        setActor(buildDevActor(role));
        setAccessToken(null);
        validatedTokenRef.current = null;
        clearCachedActor();
        setAuthBootstrapped(true);
        setSessionChecking(false);
        setProfileState("ready");
      },
      async requestPasswordReset(email) {
        const client = createSupabaseBrowserClient();
        if (!client) throw new Error("Auth indisponivel no navegador.");
        const redirectTo = getCurrentAuthRedirectUrl();
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw new Error(error.message);
        setAuthInfo("Enviamos um email com o link de recuperacao.");
      },
      setAuthError,
      setDevRole
    }),
    [
      supabase,
      validatedTokenRef,
      setAccessToken,
      setActor,
      setAuthBootstrapped,
      setAuthError,
      setAuthInfo,
      setAuthSubmitting,
      setDevModeEnabled,
      setDevRole,
      setProfileState,
      setSessionChecking
    ]
  );
}

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const actorProfile = useActorProfile();
  const sessionState = useSessionState({
    actor: actorProfile.actor,
    accessToken: actorProfile.accessToken,
    authBootstrapped: actorProfile.authBootstrapped,
    authError: actorProfile.authError,
    authInfo: actorProfile.authInfo,
    authSubmitting: actorProfile.authSubmitting,
    canUseDevMode: actorProfile.canUseDevMode,
    devModeEnabled: actorProfile.devModeEnabled,
    devRole: actorProfile.devRole,
    sessionChecking: actorProfile.sessionChecking,
    profileState: actorProfile.profileState
  });
  const actions = useAuthActions(actorProfile);

  return (
    <SessionStateContext.Provider value={sessionState}>
      <AuthActionsContext.Provider value={actions}>{children}</AuthActionsContext.Provider>
    </SessionStateContext.Provider>
  );
}

export function useAuthSessionState() {
  const context = useContext(SessionStateContext);

  if (!context) {
    throw new Error("useAuthSessionState deve ser usado dentro de AuthSessionProvider.");
  }

  return context;
}

export function useAuthActionsContext() {
  const context = useContext(AuthActionsContext);

  if (!context) {
    throw new Error("useAuthActionsContext deve ser usado dentro de AuthSessionProvider.");
  }

  return context;
}

export function useAuthSession() {
  return {
    ...useAuthSessionState(),
    ...useAuthActionsContext()
  };
}
