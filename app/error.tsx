"use client";

import { useEffect } from "react";

/**
 * Error boundary de rota (Next.js). Sem isto, qualquer erro de render derrubava
 * o app inteiro (tela branca). Aqui o usuario ve uma mensagem + "Tentar de novo"
 * (reset re-renderiza o segmento) ou "Recarregar a pagina".
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <div
      role="alert"
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
        fontFamily: "Segoe UI, Roboto, Arial, sans-serif",
        color: "#1f2328"
      }}
    >
      <strong style={{ fontSize: 18 }}>Algo travou nesta tela</strong>
      <p style={{ color: "#6b7280", maxWidth: 460, margin: 0 }}>
        Pode ter sido uma instabilidade momentânea com a API. Seus dados estão a salvo — tente de novo ou recarregue.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "1px solid #1a73e8",
            background: "#1a73e8",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Tentar de novo
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#334155",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Recarregar a página
        </button>
      </div>
    </div>
  );
}
