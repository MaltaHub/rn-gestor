"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, fetchVendedorCarros, type VendedorCarroListItem } from "@/components/ui-grid/api";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { VehicleCard, type VehicleListMode } from "@/components/vendedor/vehicle-card";

const PAGE_SIZE = 24;
const MODE_STORAGE_KEY = "vendedor.listMode";
const MODES: { key: VehicleListMode; label: string }[] = [
  { key: "grande", label: "Grande" },
  { key: "compacto", label: "Compacto" },
  { key: "sem-capa", label: "Sem capa" }
];

function readStoredMode(): VehicleListMode {
  if (typeof window === "undefined") return "grande";
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  return stored === "compacto" || stored === "sem-capa" || stored === "grande" ? stored : "grande";
}

export function VendedorHome() {
  const auth = useVendedorAuth();
  const router = useRouter();
  const [mode, setMode] = useState<VehicleListMode>("grande");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<VendedorCarroListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reqRef = useRef(0);

  // Compartilha o link fixo do catalogo publico: usa a folha de compartilhar
  // nativa (mobile) ou copia para a area de transferencia (desktop).
  const shareCatalogo = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/catalogo`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Catalogo Roberto Automoveis", text: "Veja os veiculos disponiveis", url });
      } catch {
        // compartilhamento cancelado/indisponivel — silencioso
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie o link do catalogo:", url);
    }
  }, []);

  useEffect(() => {
    setMode(readStoredMode());
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [q]);

  const load = useCallback(
    async (nextPage: number, query: string) => {
      const token = (reqRef.current += 1);
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchVendedorCarros({ requestAuth: auth, q: query, page: nextPage, pageSize: PAGE_SIZE });
        if (token !== reqRef.current) return;
        setItems((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
        setPage(nextPage);
      } catch (err) {
        if (token !== reqRef.current) return;
        setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao carregar veiculos.");
      } finally {
        if (token === reqRef.current) setLoading(false);
      }
    },
    [auth]
  );

  useEffect(() => {
    void load(1, debouncedQ);
  }, [debouncedQ, load]);

  function changeMode(next: VehicleListMode) {
    setMode(next);
    if (typeof window !== "undefined") window.localStorage.setItem(MODE_STORAGE_KEY, next);
  }

  return (
    <section className="vendedor-home">
      <div className="vendedor-home-toolbar">
        <input
          type="search"
          className="vendedor-search"
          placeholder="Buscar veiculo por nome ou placa..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
          data-testid="vendedor-search"
          aria-label="Buscar veiculo"
        />
        <div className="vendedor-mode-switch" role="group" aria-label="Modo de listagem">
          {MODES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`vendedor-mode-btn ${mode === item.key ? "is-active" : ""}`.trim()}
              aria-pressed={mode === item.key}
              onClick={() => changeMode(item.key)}
              data-testid={`vendedor-mode-${item.key}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`vendedor-share-catalogo ${copied ? "is-copied" : ""}`.trim()}
          onClick={() => void shareCatalogo()}
          aria-label="Copiar ou compartilhar o link do catalogo"
          data-testid="vendedor-share-catalogo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
            <path
              fill="currentColor"
              d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92Z"
            />
          </svg>
          {copied ? "Link copiado!" : "Copiar link do catalogo"}
        </button>
      </div>

      {error ? <p className="vendedor-error" data-testid="vendedor-error">{error}</p> : null}

      {items.length === 0 && !loading && !error ? (
        <p className="vendedor-empty">Nenhum veiculo disponivel encontrado.</p>
      ) : (
        <div className={`vendedor-grid is-${mode}`} data-testid="vendedor-grid">
          {items.map((carro) => (
            <VehicleCard
              key={carro.id}
              carro={carro}
              mode={mode}
              onOpen={(id) => router.push(`/vendedor/veiculo/${id}`)}
            />
          ))}
        </div>
      )}

      {loading ? <p className="vendedor-hint">Carregando...</p> : null}

      {hasMore && !loading ? (
        <button
          type="button"
          className="vendedor-loadmore"
          onClick={() => void load(page + 1, debouncedQ)}
          data-testid="vendedor-loadmore"
        >
          Carregar mais
        </button>
      ) : null}
    </section>
  );
}
