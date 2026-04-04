"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { ApiClientError, fetchCurrentActor } from "@/components/ui-grid/api";
import type { CurrentActor, Role } from "@/components/ui-grid/types";
import { ROLE_ORDER } from "@/lib/domain/access";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { syncBrowserSessionHint } from "@/lib/supabase/session-hint";

type ProfileState = "idle" | "loading" | "ready" | "error";

type AuthContextValue = {
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
  status: "loading" | "signed_out" | "ready" | "profile_error";
  enableDevMode: (role: Role) => void;
  resetFeedback: () => void;
  setAuthError: (value: string | null) => void;
  setDevRole: (value: Role) => void;
  signIn: (params: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (params: { name: string; email: string; password: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTOR_CACHE_KEY = "rn-gestor.current-actor";
const DEV_MODE_ROLES: Role[] = [...ROLE_ORDER];

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
    authUserId: null,
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

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
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
      } finally {
        if (!active) return;
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

    const {
      data: { subscription }
    } = currentSupabase.auth.onAuthStateChange((event, session) => {
      void hydrateActor(event, session);
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

  function resetFeedback() {
    setAuthError(null);
    setAuthInfo(null);
  }

  async function signIn(params: { email: string; password: string }) {
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
  }

  async function signUp(params: { name: string; email: string; password: string }) {
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
  }

  async function signOut() {
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
  }

  function enableDevMode(role: Role) {
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
  }

  const effectiveActor = devModeEnabled ? buildDevActor(devRole) : actor;
  const effectiveAccessToken = devModeEnabled ? null : accessToken;
  const profileLoading = profileState === "loading";

  const status =
    !authBootstrapped || sessionChecking || (effectiveAccessToken && !effectiveActor && profileLoading)
      ? "loading"
      : effectiveActor
        ? "ready"
        : effectiveAccessToken && profileState === "error"
          ? "profile_error"
          : effectiveAccessToken
            ? "loading"
            : "signed_out";

  return (
    <AuthContext.Provider
      value={{
        accessToken: effectiveAccessToken,
        actor: effectiveActor,
        authBootstrapped,
        authError,
        authInfo,
        authSubmitting,
        canUseDevMode,
        devModeEnabled,
        devRole,
        profileLoading,
        sessionChecking,
        status,
        enableDevMode,
        resetFeedback,
        setAuthError,
        setDevRole,
        signIn,
        signOut,
        signUp
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuthSession deve ser usado dentro de AuthSessionProvider.");
  }

  return context;
}

export { DEV_MODE_ROLES };
