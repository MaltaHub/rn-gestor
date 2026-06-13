"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiClientError,
  fetchVendedorCarros,
  type VendedorCarroFiltro,
  type VendedorCarroListItem
} from "@/components/ui-grid/api";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { VehicleCard } from "@/components/vendedor/vehicle-card";

const PAGE_SIZE = 24;

const FILTROS: { key: Exclude<VendedorCarroFiltro, "todos">; label: string }[] = [
  { key: "disponivel", label: "Disponível" },
  { key: "em_andamento", label: "Em andamento" },
  { key: "finalizados", label: "Finalizados" }
];

const VAZIO_LABEL: Record<string, string> = {
  disponivel: "Nenhum veículo disponível.",
  em_andamento: "Nenhuma venda em andamento.",
  finalizados: "Nenhuma venda finalizada."
};

export function VendedorHome() {
  const auth = useVendedorAuth();
  const router = useRouter();
  const [filtro, setFiltro] = useState<Exclude<VendedorCarroFiltro, "todos">>("disponivel");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<VendedorCarroListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const reqRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Busca por placa ignora o filtro (global), evitando atrito: o vendedor
  // digita a placa e o veículo aparece esteja onde estiver.
  const buscando = debouncedQ.length > 0;

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
    const timeout = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [q]);

  const load = useCallback(
    async (nextPage: number, query: string, ativo: Exclude<VendedorCarroFiltro, "todos">) => {
      const token = (reqRef.current += 1);
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchVendedorCarros({
          requestAuth: auth,
          q: query,
          page: nextPage,
          pageSize: PAGE_SIZE,
          // Com busca, procura em todos os veículos (global por placa/nome).
          filtro: query ? "todos" : ativo
        });
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
    void load(1, debouncedQ, filtro);
  }, [debouncedQ, filtro, load]);

  // Scroll infinito: carrega a próxima página quando a sentinela se aproxima
  // do viewport (margem de 600px pra chegar antes do usuário).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void load(page + 1, debouncedQ, filtro);
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, load, page, debouncedQ, filtro]);

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
        <div className="vendedor-mode-switch" role="group" aria-label="Filtro de veículos">
          {FILTROS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`vendedor-mode-btn ${!buscando && filtro === item.key ? "is-active" : ""}`.trim()}
              aria-pressed={!buscando && filtro === item.key}
              onClick={() => setFiltro(item.key)}
              data-testid={`vendedor-filtro-${item.key}`}
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
        <p className="vendedor-empty">{buscando ? "Nenhum veículo encontrado." : VAZIO_LABEL[filtro]}</p>
      ) : (
        <div className="vendedor-grid is-grande" data-testid="vendedor-grid">
          {items.map((carro) => (
            <VehicleCard
              key={carro.id}
              carro={carro}
              mode="grande"
              onOpen={(id) => router.push(`/vendedor/veiculo/${id}`)}
            />
          ))}
        </div>
      )}

      {loading ? <p className="vendedor-hint">Carregando...</p> : null}

      {hasMore ? <div ref={sentinelRef} className="vendedor-scroll-sentinel" aria-hidden="true" data-testid="vendedor-loadmore" /> : null}
    </section>
  );
}
