"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api/http-client";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { formatPreco } from "@/components/vendedor/format";
import { fecharVenda, fetchVendidos, type VendidoItem } from "@/components/vendedor/vender/api";

const PAGE_SIZE = 24;

const ESTAGIO_LABEL: Record<string, string> = {
  aberto: "Aberto",
  fechado: "Fechado",
  na_garantia: "Na garantia",
  finalizado: "Finalizado"
};

function CoverThumb({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="vendedor-card-cover is-empty" aria-hidden="true">
        <span>Sem foto</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="vendedor-card-cover" src={url} alt={alt} loading="lazy" />;
}

/**
 * Navegador de veículos com FICHA FECHADA/INCOMPLETA (vendas em processo:
 * aberto, fechado, na_garantia). Cards com a capa do veículo — clicar abre a
 * venda em modo edição; "Fechar" registra a entrega e move o estágio para
 * fechado. Scroll infinito. Reporta o total para o contador da aba.
 */
export function VendidosBrowser({
  onSelect,
  onCount
}: {
  onSelect: (carroId: string) => void;
  onCount: (total: number) => void;
}) {
  const auth = useVendedorAuth();
  const [items, setItems] = useState<VendidoItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const reqRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Fechamento da venda: confirma entrega + data.
  const [closing, setClosing] = useState<VendidoItem | null>(null);
  const [closeDate, setCloseDate] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);

  const load = useCallback(
    async (nextPage: number) => {
      const token = (reqRef.current += 1);
      setLoading(true);
      setError(null);
      try {
        const result = await fetchVendidos(auth, { page: nextPage, pageSize: PAGE_SIZE });
        if (token !== reqRef.current) return;
        setItems((prev) => (nextPage === 1 ? result.items : [...prev, ...result.items]));
        setHasMore(result.items.length === PAGE_SIZE);
        setPage(nextPage);
        onCount(result.total);
      } catch (err) {
        if (token !== reqRef.current) return;
        setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao carregar vendidos.");
      } finally {
        if (token === reqRef.current) setLoading(false);
      }
    },
    [auth, onCount]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  // Scroll infinito.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load(page + 1);
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, load, page]);

  async function confirmarFechamento() {
    if (!closing || closeBusy) return;
    if (!closeDate.trim()) {
      setError("Informe a data de entrega para fechar a venda.");
      return;
    }
    setCloseBusy(true);
    setError(null);
    try {
      await fecharVenda(auth, closing.vendaId, closeDate.trim());
      setInfo(`Venda de ${closing.placa ?? "veículo"} fechada (entregue em ${closeDate.split("-").reverse().join("/")}).`);
      setClosing(null);
      setCloseDate("");
      await load(1);
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao fechar a venda.");
    } finally {
      setCloseBusy(false);
    }
  }

  return (
    <div className="vender-step">
      <p className="vendedor-hint">
        Vendas em processo — toque no card para abrir e atualizar; use <strong>Fechar</strong> quando o veículo for entregue.
      </p>

      {error ? <p className="vendedor-error">{error}</p> : null}
      {info ? <p className="vendedor-ok">{info}</p> : null}
      {!loading && items.length === 0 && !error ? (
        <p className="vendedor-empty">Nenhuma venda em processo. Inicie uma venda a partir de um veículo.</p>
      ) : null}

      <div className="vendedor-grid is-compacto" data-testid="vender-vendidos-list">
        {items.map((item) => {
          const titulo = item.modelo || item.nome || item.placa || "Veículo";
          const preco = formatPreco(item.precoOriginal);
          return (
            <article key={item.vendaId} className="vendedor-card is-compacto vender-vendido-card">
              <button
                type="button"
                className="vender-vendido-open"
                onClick={() => onSelect(item.carroId)}
                data-testid={`vender-vendido-${item.carroId}`}
              >
                <CoverThumb url={item.coverUrl} alt={titulo} />
                <span className="vendedor-card-body">
                  <span className="vendedor-card-name">{titulo}</span>
                  {item.placa ? <span className="vendedor-card-placa">{item.placa}</span> : null}
                  <span className="vendedor-card-meta">
                    {[item.cor, item.anoMod].filter(Boolean).join(" · ")}
                  </span>
                  {preco ? <span className="vendedor-card-price">{preco}</span> : null}
                </span>
              </button>
              <div className="vender-vendido-foot">
                <span className={`vender-estagio-badge is-${item.estagio}`}>{ESTAGIO_LABEL[item.estagio] ?? item.estagio}</span>
                {item.estagio !== "fechado" ? (
                  <button
                    type="button"
                    className="vendedor-btn-ghost"
                    onClick={() => {
                      setClosing(item);
                      setCloseDate(item.dataEntrega ?? new Date().toISOString().slice(0, 10));
                    }}
                    data-testid={`vender-fechar-${item.carroId}`}
                  >
                    Fechar
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {loading ? <p className="vendedor-hint">Carregando...</p> : null}
      {hasMore ? <div ref={sentinelRef} className="vendedor-scroll-sentinel" aria-hidden="true" /> : null}

      {closing ? (
        <div className="vendedor-modal-overlay" role="dialog" aria-modal="true" data-testid="vender-fechar-dialog">
          <div className="vendedor-modal vender-fechar-modal">
            <strong>Fechar venda — {closing.placa ?? "veículo"}</strong>
            <p>O veículo foi entregue ao cliente? Informe a data de entrega para fechar a venda.</p>
            <label className="vendedor-field">
              <span>Data de entrega *</span>
              <input type="date" value={closeDate} onChange={(event) => setCloseDate(event.target.value)} />
            </label>
            <div className="vender-fechar-actions">
              <button type="button" className="vendedor-btn-ghost" onClick={() => setClosing(null)} disabled={closeBusy}>
                Ainda não foi entregue
              </button>
              <button
                type="button"
                className="vendedor-btn-primary"
                onClick={() => void confirmarFechamento()}
                disabled={closeBusy}
                data-testid="vender-fechar-confirmar"
              >
                {closeBusy ? "Fechando..." : "Confirmar entrega e fechar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
