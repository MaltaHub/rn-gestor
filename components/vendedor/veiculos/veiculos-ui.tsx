"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/vendedor/ui/icons";
import styles from "@/components/vendedor/veiculos/veiculos.module.css";
import { SITUACAO_LABEL, type SituacaoVenda } from "@/lib/domain/vendas/situacao";
import type { ContagemSituacoes, OrdemLista, SituacaoFiltro, VeiculoVendedorItem } from "@/lib/domain/vendedor/types";

export function SituacaoBadge({ situacao }: { situacao: SituacaoVenda }) {
  return (
    <span className={styles.badge} data-situacao={situacao}>
      {SITUACAO_LABEL[situacao]}
    </span>
  );
}

/** Carro de REPASSE: fora da vitrine (aparece só por busca). */
export function RepasseBadge() {
  return (
    <span className={styles.badge} data-situacao="repasse" title="Repasse: fora da vitrine e dos cálculos">
      Repasse
    </span>
  );
}

export function VeiculoThumb({ url, alt, width, height }: { url: string | null; alt: string; width: number; height: number }) {
  return (
    <span className={styles.thumb} style={{ width, height }}>
      {url ? (
        // <img>: URLs assinadas do Storage dispensam configurar o next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" decoding="async" width={width} height={height} />
      ) : (
        <Icon name="car" size={Math.round(Math.min(width, height) * 0.5)} strokeWidth={1.5} />
      )}
    </span>
  );
}

/**
 * Palco enquanto um veículo abre: o anterior some NA HORA (trocar de placa
 * não pode parecer que o sistema travou) e fica claro qual está vindo.
 */
export function AbrindoVeiculo({ item }: { item: Pick<VeiculoVendedorItem, "placa" | "modelo" | "coverUrl"> | null }) {
  return (
    <div className={styles.abrindo} role="status" aria-live="polite" data-testid="veiculo-abrindo">
      <div className={styles.abrindoHead}>
        <VeiculoThumb url={item?.coverUrl ?? null} alt="" width={96} height={72} />
        <div className={styles.abrindoBody}>
          <span className={styles.abrindoTitulo}>
            {item ? <span className={styles.placa}>{item.placa}</span> : null}
            <span>{item?.modelo ?? "Abrindo o veículo"}</span>
          </span>
          <span className={styles.abrindoHint}>
            <span className={styles.spinner} aria-hidden="true" />
            Carregando a venda e os documentos...
          </span>
        </div>
      </div>
      <div className={styles.skeleton} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export const FILTRO_LABEL: Record<SituacaoFiltro, string> = {
  disponivel: "Disponíveis",
  reservado: "Reservados",
  vendido: "Vendidos",
  entregue: "Entregues",
  finalizado: "Finalizados",
  todos: "Todos"
};

const ORDEM_OPCOES: Array<{ value: OrdemLista; label: string; icon: "clock" | "sortAz"; title: string }> = [
  { value: "recentes", label: "Recentes", icon: "clock", title: "Primeiro os veículos que você mexeu por último" },
  { value: "az", label: "A–Z", icon: "sortAz", title: "Pelo modelo, de A a Z" }
];

/** Busca + chips de situação com a contagem de cada uma + a ordem da lista. */
export function VeiculoFiltros({
  q,
  onQ,
  situacao,
  onSituacao,
  contagens,
  opcoes,
  buscando,
  ordem,
  onOrdem,
  total,
  placeholder = "Buscar por placa, modelo ou chassi...",
  testIdPrefix = "veiculos"
}: {
  q: string;
  onQ: (value: string) => void;
  situacao: SituacaoFiltro;
  onSituacao: (value: SituacaoFiltro) => void;
  contagens: ContagemSituacoes | null;
  opcoes: SituacaoFiltro[];
  buscando: boolean;
  /** Com `onOrdem`, mostra a escolha Recentes / A–Z. */
  ordem?: OrdemLista;
  onOrdem?: (value: OrdemLista) => void;
  /** Quantos veículos a lista atual tem (rodapé dos filtros). */
  total?: number | null;
  placeholder?: string;
  testIdPrefix?: string;
}) {
  return (
    <div className={styles.filters}>
      <label className={styles.search}>
        <Icon name="search" size={16} />
        <input
          type="search"
          value={q}
          onChange={(event) => onQ(event.target.value)}
          placeholder={placeholder}
          aria-label="Buscar veículo"
          data-testid={`${testIdPrefix}-busca`}
        />
      </label>
      <div className={styles.chips} role="group" aria-label="Situação do veículo">
        {opcoes.map((opcao) => {
          const count = opcao !== "todos" ? contagens?.[opcao] : undefined;
          return (
            <button
              key={opcao}
              type="button"
              className={styles.chip}
              aria-pressed={!buscando && situacao === opcao}
              onClick={() => onSituacao(opcao)}
              data-testid={`${testIdPrefix}-filtro-${opcao}`}
            >
              {FILTRO_LABEL[opcao]}
              {count != null ? <span className={styles.chipCount}>{count}</span> : null}
            </button>
          );
        })}
      </div>
      {onOrdem ? (
        <div className={styles.ordemRow}>
          <span className={styles.ordemTotal} data-testid={`${testIdPrefix}-total`}>
            {total == null ? "" : total === 1 ? "1 veículo" : `${total} veículos`}
          </span>
          <div className={styles.ordem} role="group" aria-label="Ordem da lista">
            {ORDEM_OPCOES.map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                className={styles.ordemBtn}
                aria-pressed={ordem === opcao.value}
                title={opcao.title}
                onClick={() => onOrdem(opcao.value)}
                data-testid={`${testIdPrefix}-ordem-${opcao.value}`}
              >
                <Icon name={opcao.icon} size={14} />
                {opcao.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function anoTexto(item: Pick<VeiculoVendedorItem, "anoFab" | "anoMod">) {
  if (item.anoFab && item.anoMod && item.anoFab !== item.anoMod) return `${item.anoFab}/${item.anoMod}`;
  return item.anoMod ?? item.anoFab ?? null;
}

/**
 * Lista compacta de veículos (navegação lateral): miniatura, placa, modelo,
 * situação e comprador. Rolagem infinita observando o próprio contêiner.
 */
export function VeiculoLista({
  itens,
  selecionadoId,
  onSelecionar,
  loading,
  error,
  hasMore,
  onLoadMore,
  vazio,
  carregandoId = null,
  testIdPrefix = "veiculo"
}: {
  itens: VeiculoVendedorItem[];
  selecionadoId: string | null;
  /** Veículo que está abrindo (mostra o indicador na própria linha). */
  carregandoId?: string | null;
  onSelecionar: (item: VeiculoVendedorItem) => void;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  vazio: string;
  testIdPrefix?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    }, { rootMargin: "300px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  return (
    <>
      {error ? <p className={styles.error}>{error}</p> : null}
      {itens.length === 0 && !loading && !error ? <p className={styles.empty}>{vazio}</p> : null}
      <ul className={styles.list}>
        {itens.map((item) => {
          const ano = anoTexto(item);
          const detalhe = item.venda?.compradorNome ?? [ano, item.cor].filter(Boolean).join(" · ");
          return (
            <li key={item.carroId}>
              <button
                type="button"
                className={styles.row}
                aria-current={selecionadoId === item.carroId ? "true" : undefined}
                aria-busy={carregandoId === item.carroId ? "true" : undefined}
                onClick={() => onSelecionar(item)}
                data-testid={`${testIdPrefix}-${item.carroId}`}
              >
                <VeiculoThumb url={item.coverUrl} alt={item.modelo ?? item.placa} width={52} height={40} />
                <span className={styles.rowBody}>
                  <span className={styles.rowTop}>
                    <span className={styles.placa}>{item.placa}</span>
                    <span className={styles.modelo}>{item.modelo ?? "Sem modelo"}</span>
                  </span>
                  <span className={styles.meta}>
                    <SituacaoBadge situacao={item.situacao} />
                    {item.proposito === "REPASSE" ? <RepasseBadge /> : null}
                    <span className={styles.metaText}>{detalhe}</span>
                    {carregandoId === item.carroId ? (
                      <span className={styles.spinner} role="status" aria-label="Abrindo" />
                    ) : item.documentos > 0 ? (
                      <span className={styles.docCount} title={`${item.documentos} documento(s) Word`}>
                        <Icon name="file" size={13} />
                        {item.documentos}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {loading ? <p className={styles.hint}>Carregando...</p> : null}
      {hasMore ? <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" /> : null}
    </>
  );
}
