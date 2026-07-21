"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Rede de seguranca para falhas assincronas que o error boundary de rota NAO
 * pega: `unhandledrejection` (ex.: as chamadas `void algoAsync()` do grid) e
 * `error` global. Antes disto, uma promise rejeitada sumia em silencio — o
 * usuario clicava e "nada acontecia", sem log nem sinal (foi assim que o form
 * editor deixava de abrir em linhas seletas).
 *
 * Faz tres coisas: loga estruturado no console, reporta best-effort para
 * /api/v1/client-errors, e mostra um toast dismissivel pro usuario saber que
 * algo falhou em segundo plano. Throttle evita flood; um guard evita o loop de
 * "reportar a falha do proprio report".
 */

const REPORT_ENDPOINT = "/api/v1/client-errors";
const MAX_REPORTS_PER_WINDOW = 8;
const WINDOW_MS = 60_000;
const TOAST_TTL_MS = 8_000;

type ErrorKind = "unhandledrejection" | "error";

function describeError(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return { message: reason.message || reason.name, stack: reason.stack };
  }
  if (typeof reason === "string") return { message: reason };
  try {
    return { message: JSON.stringify(reason) };
  } catch {
    return { message: String(reason) };
  }
}

export function GlobalErrorListener() {
  const [toastCount, setToastCount] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportTimestampsRef = useRef<number[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const reportingRef = useRef(false);

  useEffect(() => {
    function withinRateLimit(): boolean {
      const now = Date.now();
      const recent = reportTimestampsRef.current.filter((ts) => now - ts < WINDOW_MS);
      reportTimestampsRef.current = recent;
      if (recent.length >= MAX_REPORTS_PER_WINDOW) return false;
      recent.push(now);
      return true;
    }

    function report(kind: ErrorKind, reason: unknown, source?: string) {
      const { message, stack } = describeError(reason);

      // Dedupe curto: mesma assinatura nao vira N toasts/POSTs seguidos.
      const signature = `${kind}:${message}:${stack?.slice(0, 120) ?? ""}`;
      if (seenRef.current.has(signature)) return;
      seenRef.current.add(signature);
      setTimeout(() => seenRef.current.delete(signature), WINDOW_MS);

      console.error(`[global-error:${kind}]`, reason);

      setToastCount((count) => count + 1);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setToastCount(0), TOAST_TTL_MS);

      if (!withinRateLimit()) return;
      // Guard anti-loop: se o proprio POST falhar, nao re-reportamos.
      if (reportingRef.current) return;
      reportingRef.current = true;

      void fetch(REPORT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          kind,
          message: message.slice(0, 2000),
          stack: stack?.slice(0, 8000),
          source: source?.slice(0, 1000),
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined
        })
      })
        .catch(() => {
          /* best-effort: nunca deixe o report derrubar nada */
        })
        .finally(() => {
          reportingRef.current = false;
        });
    }

    function onRejection(event: PromiseRejectionEvent) {
      report("unhandledrejection", event.reason);
    }

    function onError(event: ErrorEvent) {
      // Ignora erros de carregamento de recurso (img/script) que nao tem .error.
      if (!event.error && !event.message) return;
      report("error", event.error ?? event.message, event.filename);
    }

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);

    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (toastCount === 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 2147483647,
        maxWidth: 360,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 10,
        background: "#fff",
        border: "1px solid #f0c2c2",
        borderLeft: "4px solid #d93025",
        boxShadow: "0 6px 24px rgba(0,0,0,0.14)",
        fontFamily: "Segoe UI, Roboto, Arial, sans-serif",
        color: "#1f2328"
      }}
    >
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
        <strong style={{ display: "block", marginBottom: 2 }}>
          Algo falhou em segundo plano{toastCount > 1 ? ` (${toastCount})` : ""}
        </strong>
        <span style={{ color: "#6b7280" }}>
          Uma ação não completou. Se algo não abriu ou não salvou, tente de novo ou recarregue a página.
        </span>
      </div>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => setToastCount(0)}
        style={{
          border: "none",
          background: "transparent",
          color: "#6b7280",
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
          padding: 0
        }}
      >
        ×
      </button>
    </div>
  );
}
