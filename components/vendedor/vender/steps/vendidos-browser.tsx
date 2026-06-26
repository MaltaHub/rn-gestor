"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api/http-client";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { formatPreco } from "@/components/vendedor/format";
import { concluirVenda, fecharVenda, fetchVendidos, type VendidoItem } from "@/components/vendedor/vender/api";

const PAGE_SIZE = 24;

const ESTAGIO_LABEL: Record<string, string> = {
  aberto: "Aberto",
  fechado: "Fechado",
  na_garantia: "Na garantia",
  finalizado: "Finalizado"
};

type FiltroKey = "reservados" | "aberto" | "fechado_garantia" | "finalizados";

const FILTROS: { key: FiltroKey; label: string }[] = [
  { key: "reservados", label: "Reservados" },
  { key: "aberto", label: "Vendido · aberto" },
  { key: "fechado_garantia", label: "Fechado · garantia" },
  { key: "finalizados", label: "Finalizados" }
];

const ESTAGIOS_POR_FILTRO: Record<FiltroKey, string[]> = {
  reservados: ["aberto"],
  aberto: ["aberto"],
  fechado_garantia: ["fechado", "na_garantia"],
  finalizados: ["finalizado"]
};

// O filtro "Reservados" lista vendas 'aberta' (carro RESERVADO); os demais, 'concluida'.
const ESTADO_POR_FILTRO: Record<FiltroKey, string> = {
  reservados: "aberta",
  aberto: "concluida",
  fechado_garantia: "concluida",
  finalizados: "concluida"
};

const TODOS_ESTAGIOS = ["aberto", "fechado", "na_garantia", "finalizado"];

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
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroKey>("reservados");
  const reqRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Busca por placa/modelo/nome é GLOBAL (ignora o filtro): ao buscar, a lista
  // vem com todos os estágios e o filtro client-side mostra o que casa.
  const needle = q.trim().toLowerCase();
  const buscando = needle.length > 0;
  const visibleItems = buscando
    ? items.filter((item) =>
        [item.placa, item.modelo, item.nome].some((v) => (v ?? "").toLowerCase().includes(needle))
      )
    : items;

  // Fechamento da venda: confirma entrega + data.
  const [closing, setClosing] = useState<VendidoItem | null>(null);
  const [closeDate, setCloseDate] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);

  // Estágios buscados: ao buscar, todos; senão, os do filtro ativo.
  const estagiosAtuais = buscando ? TODOS_ESTAGIOS : ESTAGIOS_POR_FILTRO[filtro];
  // Estado da venda: "Reservados" => 'aberta'; demais (e busca) => 'concluida'.
  const estadoAtual = buscando ? "concluida" : ESTADO_POR_FILTRO[filtro];

  const load = useCallback(
    async (nextPage: number, estagios: string[], estado: string) => {
      const token = (reqRef.current += 1);
      setLoading(true);
      setError(null);
      try {
        const result = await fetchVendidos(auth, { page: nextPage, pageSize: PAGE_SIZE, estagioIn: estagios, estadoVenda: estado });
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

  // Recarrega ao trocar de filtro ou alternar busca on/off.
  useEffect(() => {
    void load(1, estagiosAtuais, estadoAtual);
    // estagiosAtuais/estadoAtual derivam de filtro+buscando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, buscando, load]);

  // Scroll infinito.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load(page + 1, estagiosAtuais, estadoAtual);
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, load, page, filtro, buscando]);

  async function confirmarFechamento() {
    if (!closing || closeBusy) return;
    if (!closeDate.trim()) {
      setError("Informe a data de entrega.");
      return;
    }
    const isReserva = closing.estadoVenda === "aberta";
    setCloseBusy(true);
    setError(null);
    try {
      const dataBr = closeDate.split("-").reverse().join("/");
      if (isReserva) {
        // Concluir: reserva 'aberta' -> 'concluida' (carro VENDIDO) + entrega.
        await concluirVenda(auth, closing.vendaId, closeDate.trim());
        setInfo(`Venda de ${closing.placa ?? "veículo"} concluída (entrega ${dataBr}). Carro VENDIDO.`);
      } else {
        await fecharVenda(auth, closing.vendaId, closeDate.trim());
        setInfo(`Venda de ${closing.placa ?? "veículo"} fechada (entregue em ${dataBr}).`);
      }
      setClosing(null);
      setCloseDate("");
      await load(1, estagiosAtuais, estadoAtual);
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : "Falha ao concluir/fechar a venda.");
    } finally {
      setCloseBusy(false);
    }
  }

  return (
    <div className="vender-step">
      <p className="vendedor-hint">
        <strong>Reservados</strong> são vendas em aberto (carro RESERVADO): toque para editar e use <strong>Concluir</strong>
        (define a entrega) quando o cliente retirar. Os demais já estão vendidos.
      </p>

      <div className="vender-vendidos-toolbar">
        <input
          type="search"
          className="vendedor-search is-compact"
          placeholder="Buscar por placa, modelo ou nome..."
          value={q}
          onChange={(event) => setQ(event.target.value)}
          aria-label="Buscar venda em processo"
          data-testid="vender-vendidos-busca"
        />
        <div className="vendedor-mode-switch" role="group" aria-label="Filtro de estágio">
          {FILTROS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`vendedor-mode-btn ${!buscando && filtro === item.key ? "is-active" : ""}`.trim()}
              aria-pressed={!buscando && filtro === item.key}
              onClick={() => setFiltro(item.key)}
              data-testid={`vender-vendidos-filtro-${item.key}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="vendedor-error">{error}</p> : null}
      {info ? <p className="vendedor-ok">{info}</p> : null}
      {!loading && visibleItems.length === 0 && !error ? (
        <p className="vendedor-empty">
          {needle ? "Nenhuma venda encontrada para a busca." : "Nenhuma venda em processo. Inicie uma venda a partir de um veículo."}
        </p>
      ) : null}

      <div className="vendedor-grid is-compacto" data-testid="vender-vendidos-list">
        {visibleItems.map((item) => {
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
                <span className={`vender-estagio-badge is-${item.estadoVenda === "aberta" ? "reservado" : item.estagio}`}>
                  {item.estadoVenda === "aberta" ? "Reservado" : ESTAGIO_LABEL[item.estagio] ?? item.estagio}
                </span>
                {item.estadoVenda === "aberta" || item.estagio === "aberto" ? (
                  <button
                    type="button"
                    className="vendedor-btn-ghost"
                    onClick={() => {
                      setClosing(item);
                      setCloseDate(item.dataEntrega ?? new Date().toISOString().slice(0, 10));
                    }}
                    data-testid={`vender-concluir-${item.carroId}`}
                  >
                    {item.estadoVenda === "aberta" ? "Concluir" : "Fechar"}
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
            <strong>
              {closing.estadoVenda === "aberta" ? "Concluir venda" : "Fechar venda"} — {closing.placa ?? "veículo"}
            </strong>
            <p>
              {closing.estadoVenda === "aberta"
                ? "Defina a data de entrega para concluir a venda. O carro será marcado como VENDIDO e o envelope entra em FECHANDO."
                : "O veículo foi entregue ao cliente? Informe a data de entrega para fechar a venda."}
            </p>
            <label className="vendedor-field">
              <span>Data de entrega *</span>
              <input type="date" value={closeDate} onChange={(event) => setCloseDate(event.target.value)} />
            </label>
            <div className="vender-fechar-actions">
              <button type="button" className="vendedor-btn-ghost" onClick={() => setClosing(null)} disabled={closeBusy}>
                Ainda não
              </button>
              <button
                type="button"
                className="vendedor-btn-primary"
                onClick={() => void confirmarFechamento()}
                disabled={closeBusy}
                data-testid="vender-fechar-confirmar"
              >
                {closeBusy
                  ? "Salvando..."
                  : closing.estadoVenda === "aberta"
                    ? "Concluir venda"
                    : "Confirmar entrega e fechar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
