"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActionsContext } from "@/components/auth/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/domain/password-policy";
import styles from "@/components/auth/auth.module.css";

type Phase = "checking" | "ready" | "invalid" | "done";

const MENSAGENS_ERRO_LINK: Record<string, string> = {
  otp_expired: "Este link de recuperação expirou. Solicite um novo em \"Esqueci minha senha\".",
  access_denied: "Este link de recuperação já foi usado ou não é mais válido. Solicite um novo."
};

/**
 * Lê o retorno do link do email. Existem DOIS formatos e a página aceita os dois:
 *
 * - `#access_token=...&type=recovery` — o Supabase já trocou o token por sessão
 *   antes de redirecionar (acontece quando quem pediu passou um `redirectTo`).
 * - `?token_hash=...&type=recovery` — o link aponta direto pra cá e a troca por
 *   sessão é nossa, via `verifyOtp`. É o formato que o template do email usa,
 *   porque é o único que funciona com o botão do DASHBOARD do Supabase: ele não
 *   passa `redirectTo`, então o link cairia no site_url (a home).
 */
function readRecoveryParamsFromUrl() {
  if (typeof window === "undefined") {
    return { hasRecoveryToken: false, errorDescription: null as string | null, tokenHash: null as string | null };
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  const pick = (chave: string) => hash.get(chave) ?? search.get(chave);

  const codigoErro = pick("error_code");
  const descricao = pick("error_description");
  const tokenHash = pick("token_hash");

  return {
    tokenHash,
    hasRecoveryToken: Boolean(pick("access_token") || pick("code") || tokenHash),
    errorDescription: codigoErro
      ? MENSAGENS_ERRO_LINK[codigoErro] ?? descricao?.replace(/\+/g, " ") ?? null
      : descricao?.replace(/\+/g, " ") ?? null
  };
}

/** Erro do verifyOtp -> mensagem que explica o que fazer. */
function traduzErroVerificacao(mensagem: string): string {
  const texto = mensagem.toLowerCase();
  if (texto.includes("expired")) return MENSAGENS_ERRO_LINK.otp_expired;
  if (texto.includes("invalid") || texto.includes("not found")) return MENSAGENS_ERRO_LINK.access_denied;
  return mensagem;
}

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

    const markInvalid = (mensagem?: string) => {
      if (!active || resolvedRef.current) return;
      resolvedRef.current = true;
      if (mensagem) setError(mensagem);
      setPhase("invalid");
    };

    const { hasRecoveryToken, errorDescription, tokenHash } = readRecoveryParamsFromUrl();

    // O proprio Supabase avisa link expirado/usado pelo hash (error_code=otp_expired).
    if (errorDescription) {
      markInvalid(errorDescription);
      return () => {
        active = false;
      };
    }

    // O supabase-js consome o token da URL ao iniciar e dispara este evento.
    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))) {
        markReady();
      }
    });

    // Formato ?token_hash=: o link aponta direto pra ca, entao a troca do token
    // por sessao e' nossa. E' o caminho do botao do dashboard do Supabase.
    if (tokenHash) {
      void client.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then(({ error: erroOtp }) => {
        if (erroOtp) markInvalid(traduzErroVerificacao(erroOtp.message));
        else markReady();
      });
    }

    // getSession() so resolve DEPOIS do supabase-js terminar de ler a URL. Se ele
    // resolveu sem sessao e a URL nao traz token, nao ha o que esperar.
    void client.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
      else if (!hasRecoveryToken) markInvalid();
    });

    // Rede de seguranca para o caso "tem token mas o evento nunca chegou".
    // Generosa de proposito: quando a sessao da URL foi emitida ha mais de 120s
    // o supabase-js a revalida com um round-trip, e o timeout antigo (3.5s fixo)
    // estourava antes disso em carga fria — link valido virava "invalido".
    const timeout = window.setTimeout(() => markInvalid(), hasRecoveryToken ? 20_000 : 8_000);

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
    const problema = validateNewPassword({ novaSenha: senha, confirmacao: confirm.trim() });
    if (problema) {
      setError(problema);
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
            {/* Quando o Supabase diz o motivo (expirado, já usado), mostramos o
                dele — é mais útil que o texto genérico. */}
            <p className={styles.error} data-testid="reset-invalid">
              {error ?? 'Link de recuperação inválido ou expirado. Solicite um novo em "Esqueci minha senha".'}
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
