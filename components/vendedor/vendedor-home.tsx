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

  // Copia o link fixo do catalogo publico para a area de transferencia.
  const copyCatalogoLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/catalogo`;
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
        <div className="vendedor-catalogo-links">
          <button
            type="button"
            className={`vendedor-catalogo-btn ${copied ? "is-copied" : ""}`.trim()}
            onClick={() => void copyCatalogoLink()}
            aria-label="Copiar o link do catalogo"
            data-testid="vendedor-copy-catalogo"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
              <path
                fill="currentColor"
                d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"
              />
            </svg>
            {copied ? "Link copiado!" : "Copiar link"}
          </button>
          <a
            className="vendedor-catalogo-btn is-secondary"
            href="/catalogo"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir o catalogo em nova aba"
            data-testid="vendedor-open-catalogo"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
              <path
                fill="currentColor"
                d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7ZM19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7Z"
              />
            </svg>
            Abrir
          </a>
        </div>
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
