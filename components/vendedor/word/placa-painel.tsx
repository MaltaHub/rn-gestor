"use client";

import Link from "next/link";
import type { JSONContent } from "@tiptap/core";
import { estadoDoItem } from "@/components/vendedor/checklist-painel";
import { Icon } from "@/components/vendedor/ui/icons";
import { SituacaoBadge, VeiculoThumb } from "@/components/vendedor/veiculos/veiculos-ui";
import { formatPreco } from "@/components/vendedor/format";
import { DocThumbPage, THUMB_TYPOGRAPHY_CSS } from "@/components/vendedor/word/doc-thumb";
import styles from "@/components/vendedor/word/word-workspace.module.css";
import { categoriaLabel, type CategoriaDocumento } from "@/lib/domain/venda-documentos/categorias";
import { categoriaDoDocumento, type ItemChecklist } from "@/lib/domain/venda-documentos/checklist";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import type { VendaDocumentoRow } from "@/lib/domain/db";
import type { PainelVeiculo } from "@/lib/domain/vendedor/types";

const RELEVANCIA_HINT = { obrigatorio: "Obrigatório", recomendado: "Recomendado", opcional: "Opcional" } as const;

/**
 * Tudo da placa no Word: o veículo e a venda, o checklist dos documentos da
 * venda (gera uma categoria em um clique) e as miniaturas reais dos documentos.
 */
export function PlacaPainel({
  painel,
  checklist,
  documentos,
  contexto,
  criando,
  onGerar,
  onNovo,
  onAbrir,
  onExcluir
}: {
  painel: PainelVeiculo;
  checklist: ItemChecklist[];
  documentos: VendaDocumentoRow[] | null;
  contexto: VendaDocContext | null;
  criando: string | null;
  onGerar: (categoria: CategoriaDocumento) => void;
  onNovo: () => void;
  onAbrir: (docId: string) => void;
  onExcluir: (doc: VendaDocumentoRow) => void;
}) {
  const { carro, venda } = painel;
  const ano = carro.anoFab && carro.anoMod && carro.anoFab !== carro.anoMod ? `${carro.anoFab}/${carro.anoMod}` : carro.anoMod ?? carro.anoFab;
  const valor = typeof venda?.valor_total === "number" ? venda.valor_total : carro.preco;

  return (
    <div className={styles.painel} data-testid="word-placa-painel">
      <header className={styles.hero}>
        <VeiculoThumb url={carro.coverUrl} alt={carro.modelo ?? carro.placa} width={120} height={90} />
        <div className={styles.heroBody}>
          <h1 className={styles.heroTitle}>
            {carro.modelo ?? "Veículo"} <span className={styles.placa}>{carro.placa}</span>
            <SituacaoBadge situacao={painel.situacao} />
          </h1>
          <div className={styles.heroMeta}>
            {ano ? <span>{ano}</span> : null}
            {carro.cor ? <span>{carro.cor}</span> : null}
            {venda?.comprador_nome ? (
              <span>
                Comprador <strong>{String(venda.comprador_nome)}</strong>
              </span>
            ) : null}
            {valor != null ? (
              <span>
                Valor <strong>{formatPreco(valor)}</strong>
              </span>
            ) : null}
          </div>
        </div>
        <Link className={styles.btn} href={`/vendedor/vender?carro=${carro.id}`}>
          <Icon name="sale" size={16} />
          Abrir no Vender
        </Link>
      </header>

      {!venda ? (
        <div className={styles.empty}>
          <Icon name="file" size={28} />
          <p>
            <strong>{carro.placa}</strong> ainda não tem venda registrada. Os documentos (recibo, contrato, termos) nascem da venda —
            registre-a no Vender e volte aqui.
          </p>
          <Link className={`${styles.btn} ${styles.btnPrimary}`} href={`/vendedor/vender?carro=${carro.id}`}>
            Iniciar venda
          </Link>
        </div>
      ) : (
        <>
          <section className={styles.section} aria-label="Checklist dos documentos da venda">
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Documentos desta venda</h2>
              <span className={styles.sectionSub}>O que a situação atual pede — gere com um clique.</span>
            </div>
            <div className={styles.checklist}>
              {checklist.map((item) => {
                const estado = estadoDoItem(item);
                return (
                  <div key={item.categoria.key} className={styles.checkItem} data-estado={estado} data-testid={`word-check-${item.categoria.key}`}>
                    <span className={styles.checkIcon}>
                      <Icon name={estado === "gerado" ? "check" : estado === "obrigatorio" ? "alert" : "file"} size={15} />
                    </span>
                    <span className={styles.checkBody}>
                      <span className={styles.checkLabel}>{item.categoria.label}</span>
                      <span className={styles.checkHint}>
                        {estado === "gerado"
                          ? `${item.documentos.length} gerado${item.documentos.length > 1 ? "s" : ""}${item.arquivado ? " · via assinada arquivada" : ""}`
                          : RELEVANCIA_HINT[estado]}
                      </span>
                    </span>
                    {estado === "gerado" ? (
                      <button type="button" className={styles.linkBtn} onClick={() => onAbrir(item.documentos[0].id)}>
                        Abrir
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => onGerar(item.categoria.key)}
                        disabled={criando === item.categoria.key}
                        data-testid={`word-gerar-${item.categoria.key}`}
                      >
                        {criando === item.categoria.key ? "Gerando..." : "Gerar"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.section} aria-label="Documentos gerados">
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Documentos ({documentos?.length ?? painel.documentos.length})</h2>
              <span className={styles.spacer} />
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onNovo} data-testid="word-novo-documento">
                <Icon name="fileplus" size={16} />
                Novo documento
              </button>
            </div>
            <style dangerouslySetInnerHTML={{ __html: THUMB_TYPOGRAPHY_CSS }} />
            {documentos === null ? (
              <p className={styles.sectionSub}>Carregando documentos...</p>
            ) : (
              <div className={styles.thumbGrid}>
                {documentos.map((doc) => (
                  <div key={doc.id} className={styles.thumbCard}>
                    <DocThumbPage conteudo={doc.conteudo as JSONContent} contexto={contexto} />
                    <button
                      type="button"
                      className={styles.thumbOpen}
                      aria-label={`Abrir documento ${doc.titulo}`}
                      title={`Abrir "${doc.titulo}"`}
                      onClick={() => onAbrir(doc.id)}
                    />
                    <div className={styles.thumbMeta}>
                      <span className={styles.thumbText}>
                        <span className={styles.thumbTitle}>{doc.titulo}</span>
                        <span className={styles.thumbCat}>{categoriaLabel(categoriaDoDocumento(doc))}</span>
                      </span>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Excluir documento"
                        aria-label={`Excluir documento ${doc.titulo}`}
                        onClick={() => onExcluir(doc)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className={styles.thumbNew} onClick={onNovo}>
                  <Icon name="plus" size={26} />
                  Novo documento
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
