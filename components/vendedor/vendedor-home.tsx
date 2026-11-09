"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { copyDialog } from "@/components/ui/dialog/confirm";
import { fetchVendedorShareToken } from "@/components/ui-grid/api";
import { formatPreco } from "@/components/vendedor/format";
import { Icon } from "@/components/vendedor/ui/icons";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { useVeiculosVendedor } from "@/components/vendedor/use-veiculos";
import { SituacaoBadge, VeiculoFiltros } from "@/components/vendedor/veiculos/veiculos-ui";
import styles from "@/components/vendedor/home.module.css";
import type { SituacaoFiltro, VeiculoVendedorItem } from "@/lib/domain/vendedor/types";

const FILTROS_HOME: SituacaoFiltro[] = ["disponivel", "reservado", "vendido", "entregue"];

const VAZIO: Record<string, string> = {
  disponivel: "Nenhum veículo disponível.",
  reservado: "Nenhum veículo reservado.",
  vendido: "Nenhuma venda aguardando entrega.",
  entregue: "Nenhuma venda entregue nos últimos 90 dias."
};

function CardVeiculo({ item, onOpen }: { item: VeiculoVendedorItem; onOpen: (id: string) => void }) {
  const nome = item.modelo ?? item.placa;
  const ano = item.anoFab && item.anoMod && item.anoFab !== item.anoMod ? `${item.anoFab}/${item.anoMod}` : item.anoMod ?? item.anoFab;
  const detalhe = item.venda?.compradorNome ?? [ano, item.cor, item.hodometro != null ? `${item.hodometro.toLocaleString("pt-BR")} km` : null].filter(Boolean).join(" · ");
  return (
    <article className={styles.card} data-testid={`vendedor-card-${item.carroId}`}>
      <button type="button" className={styles.open} onClick={() => onOpen(item.carroId)} aria-label={`Abrir ${nome} ${item.placa}`} />
      <span className={styles.cover}>
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.coverEmpty}>
            <Icon name="car" size={34} strokeWidth={1.4} />
          </span>
        )}
        <span className={styles.badge}>
          <SituacaoBadge situacao={item.situacao} />
        </span>
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{nome}</span>
        <span className={styles.meta}>
          <span className={styles.placa}>{item.placa}</span>
          <span className={styles.metaText}>{detalhe}</span>
        </span>
        <span className={styles.foot}>
          <span className={styles.price}>{formatPreco(item.venda?.valorTotal ?? item.preco) ?? "Sem preço"}</span>
          {item.situacao === "disponivel" ? (
            <Link className={styles.sell} href={`/vendedor/vender?carro=${item.carroId}&iniciar=1`} data-testid={`vendedor-vender-${item.carroId}`}>
              Vender
            </Link>
          ) : (
            <Link className={styles.sell} href={`/vendedor/vender?carro=${item.carroId}`}>
              Venda
            </Link>
          )}
        </span>
      </span>
    </article>
  );
}

/** Início do vendedor: a vitrine com busca por placa/modelo/chassi e situação da venda. */
export function VendedorHome() {
  const auth = useVendedorAuth();
  const router = useRouter();
  const [situacao, setSituacao] = useState<SituacaoFiltro>("disponivel");
  const [q, setQ] = useState("");
  const lista = useVeiculosVendedor(auth, { situacao, q });
  const [copied, setCopied] = useState(false);
  const [vendedorToken, setVendedorToken] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Token do vendedor (uma vez): personaliza o WhatsApp dos links do catálogo.
  useEffect(() => {
    let active = true;
    fetchVendedorShareToken(auth)
      .then((data) => {
        if (active) setVendedorToken(data.vendedorToken);
      })
      .catch(() => {
        // Sem token: os links caem no número padrão da loja.
      });
    return () => {
      active = false;
    };
  }, [auth]);

  const catalogoPath = vendedorToken ? `/catalogo?v=${encodeURIComponent(vendedorToken)}` : "/catalogo";

  const copiarCatalogo = useCallback(async () => {
    const url = `${window.location.origin}${catalogoPath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      void copyDialog({ title: "Copie o link do catálogo", value: url });
    }
  }, [catalogoPath]);

  const { hasMore, loading, loadMore } = lista;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: "600px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  return (
    <section className={styles.page} data-testid="vendedor-home">
      <div className={styles.top}>
        <div className={styles.filters}>
          <VeiculoFiltros
            q={q}
            onQ={setQ}
            situacao={situacao}
            onSituacao={setSituacao}
            contagens={lista.contagens}
            opcoes={FILTROS_HOME}
            buscando={lista.buscando}
            testIdPrefix="vendedor"
          />
        </div>
        <div className={styles.catalogo}>
          <button type="button" className={styles.btn} onClick={() => void copiarCatalogo()} data-copied={copied ? "true" : undefined} data-testid="vendedor-copy-catalogo">
            <Icon name={copied ? "check" : "link"} size={16} />
            {copied ? "Link copiado" : "Copiar link do catálogo"}
          </button>
          <a className={styles.btn} href={catalogoPath} target="_blank" rel="noopener noreferrer" data-testid="vendedor-open-catalogo">
            <Icon name="external" size={16} />
            Catálogo
          </a>
        </div>
      </div>

      {lista.error ? <p className={styles.error} data-testid="vendedor-error">{lista.error}</p> : null}

      {lista.itens.length === 0 && !lista.loading && !lista.error ? (
        <p className={styles.empty}>{lista.buscando ? "Nenhum veículo encontrado." : VAZIO[situacao]}</p>
      ) : (
        <div className={styles.grid} data-testid="vendedor-grid">
          {lista.itens.map((item) => (
            <CardVeiculo key={item.carroId} item={item} onOpen={(id) => router.push(`/vendedor/veiculo/${id}`)} />
          ))}
          {lista.loading ? Array.from({ length: lista.itens.length === 0 ? 8 : 4 }, (_, i) => <div key={`sk-${i}`} className={styles.skeleton} aria-hidden="true" />) : null}
        </div>
      )}

      {hasMore ? <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" data-testid="vendedor-loadmore" /> : null}
    </section>
  );
}
