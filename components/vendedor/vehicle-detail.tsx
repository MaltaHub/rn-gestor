"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchVehiclePhotos, type VehiclePhotoItem } from "@/components/ui-grid/api";
import { matchDocumentType } from "@/components/files/document-slots";
import { fetchPainelVeiculo } from "@/components/vendedor/api";
import { formatPreco } from "@/components/vendedor/format";
import { Icon } from "@/components/vendedor/ui/icons";
import { useVendedorAuth } from "@/components/vendedor/use-vendedor-auth";
import { SituacaoBadge } from "@/components/vendedor/veiculos/veiculos-ui";
import { VehicleSharePhotos } from "@/components/vendedor/vehicle-share-photos";
import styles from "@/components/vendedor/detail.module.css";
import type { PainelVeiculo } from "@/lib/domain/vendedor/types";

function Galeria({ fotos, alt }: { fotos: VehiclePhotoItem[]; alt: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [fotos]);
  const atual = fotos[Math.min(index, fotos.length - 1)];
  const ir = (delta: number) => setIndex((prev) => (prev + delta + fotos.length) % fotos.length);

  return (
    <div className={styles.gallery}>
      <div className={styles.stage} data-testid="vendedor-carousel">
        {atual?.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={atual.previewUrl} alt={`${alt} — foto ${index + 1}`} decoding="async" />
        ) : (
          <span className={styles.stageEmpty}>
            <Icon name="image" size={32} strokeWidth={1.4} />
            Veículo sem fotos cadastradas.
          </span>
        )}
        {fotos.length > 1 ? (
          <>
            <button type="button" className={`${styles.nav} ${styles.prev}`} onClick={() => ir(-1)} aria-label="Foto anterior">
              <Icon name="chevronLeft" size={20} />
            </button>
            <button type="button" className={`${styles.nav} ${styles.next}`} onClick={() => ir(1)} aria-label="Próxima foto">
              <Icon name="chevronRight" size={20} />
            </button>
            <span className={styles.counter}>
              {index + 1} / {fotos.length}
            </span>
          </>
        ) : null}
      </div>
      {fotos.length > 1 ? (
        <div className={styles.thumbs}>
          {fotos.map((foto, idx) => (
            <button
              key={foto.id}
              type="button"
              className={styles.thumb}
              aria-current={idx === index ? "true" : undefined}
              onClick={() => setIndex(idx)}
              aria-label={`Ir para a foto ${idx + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto.previewUrl ?? ""} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Ficha do veículo para o vendedor: fotos, dados, situação da venda e arquivos. */
export function VehicleDetail({ carroId }: { carroId: string }) {
  const auth = useVendedorAuth();
  const router = useRouter();
  const [painel, setPainel] = useState<PainelVeiculo | null>(null);
  const [fotos, setFotos] = useState<VehiclePhotoItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    Promise.all([fetchPainelVeiculo(auth, carroId, controller.signal), fetchVehiclePhotos({ requestAuth: auth, carroId })])
      .then(([dados, galeria]) => {
        if (controller.signal.aborted) return;
        setPainel(dados);
        setFotos(galeria.photos);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Falha ao carregar o veículo.");
      });
    return () => controller.abort();
  }, [auth, carroId]);

  const grupos = useMemo(() => {
    if (!painel) return [];
    const map = new Map<string, PainelVeiculo["arquivos"]>();
    for (const arquivo of painel.arquivos) {
      const label = matchDocumentType(arquivo.fileName, painel.carro.placa)?.label ?? "Outros";
      map.set(label, [...(map.get(label) ?? []), arquivo]);
    }
    return Array.from(map.entries());
  }, [painel]);

  if (error) {
    return (
      <section className={styles.page}>
        <button type="button" className={styles.back} onClick={() => router.push("/vendedor")} data-testid="vendedor-detail-back">
          <Icon name="chevronLeft" size={16} />
          Voltar
        </button>
        <p className={styles.error} data-testid="vendedor-detail-error">
          {error}
        </p>
      </section>
    );
  }

  if (!painel) {
    return (
      <section className={styles.page}>
        <p className={styles.muted}>Carregando...</p>
      </section>
    );
  }

  const { carro, situacao, venda } = painel;
  const nome = carro.modelo ?? carro.placa;
  const ano = carro.anoFab && carro.anoMod && carro.anoFab !== carro.anoMod ? `${carro.anoFab}/${carro.anoMod}` : carro.anoMod ?? carro.anoFab;
  const ipvaAno = new Date().getFullYear();
  const fatos: Array<[string, string | null]> = [
    ["Ano", ano != null ? String(ano) : null],
    ["Cor", carro.cor],
    ["KM", carro.hodometro != null ? carro.hodometro.toLocaleString("pt-BR") : null],
    ["Local", carro.local],
    ["IPVA", carro.anoIpvaPago != null && carro.anoIpvaPago >= ipvaAno ? `${ipvaAno} pago` : "Sem registro do ano"],
    ["Chave reserva", carro.temChaveReserva == null ? null : carro.temChaveReserva ? "Sim" : "Não"],
    ["Manual", carro.temManual == null ? null : carro.temManual ? "Sim" : "Não"],
    ["Comprador", typeof venda?.comprador_nome === "string" ? venda.comprador_nome : null]
  ];

  return (
    <section className={styles.page} data-testid="vendedor-detail">
      <button type="button" className={styles.back} onClick={() => router.push("/vendedor")} data-testid="vendedor-detail-back">
        <Icon name="chevronLeft" size={16} />
        Voltar
      </button>

      <div className={styles.layout}>
        <Galeria fotos={fotos} alt={nome} />
        <aside className={styles.side}>
          <h1 className={styles.title} data-testid="vendedor-detail-name">
            {nome} <span className={styles.placa}>{carro.placa}</span>
            <SituacaoBadge situacao={situacao} />
          </h1>
          <p className={styles.price}>{formatPreco(carro.preco) ?? "Sem preço"}</p>
          <dl className={styles.facts} data-testid="vendedor-info">
            {fatos
              .filter(([, valor]) => valor)
              .map(([label, valor]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
          </dl>
          <div className={styles.actions}>
            <Link
              className={`${styles.btn} ${styles.primary}`}
              href={situacao === "disponivel" ? `/vendedor/vender?carro=${carro.id}&iniciar=1` : `/vendedor/vender?carro=${carro.id}`}
              data-testid="vendedor-sell-open"
            >
              <Icon name="sale" size={17} />
              {situacao === "disponivel" ? "Vender este veículo" : "Abrir a venda"}
            </Link>
            <button type="button" className={styles.btn} onClick={() => setShareOpen(true)} disabled={fotos.length === 0} data-testid="vendedor-share-open">
              <Icon name="whatsapp" size={17} />
              Compartilhar fotos
            </button>
            {venda ? (
              <Link className={styles.btn} href={`/vendedor/word?carro=${carro.id}`}>
                <Icon name="file" size={17} />
                Documentos no Word
              </Link>
            ) : null}
          </div>
        </aside>
      </div>

      <section className={styles.card} aria-label="Arquivos do veículo" data-testid="vendedor-docs">
        <h2 className={styles.cardTitle}>Arquivos do veículo</h2>
        {grupos.length === 0 ? (
          <p className={styles.muted}>Nenhum documento na pasta deste veículo.</p>
        ) : (
          grupos.map(([label, arquivos]) => (
            <div key={label} className={styles.group}>
              <span className={styles.groupLabel}>{label}</span>
              {arquivos.map((arquivo) => (
                <div key={arquivo.id} className={styles.file}>
                  <Icon name={arquivo.mimeType.startsWith("image/") ? "image" : "file"} size={16} />
                  <span className={styles.fileName} title={arquivo.fileName}>
                    {arquivo.fileName}
                  </span>
                  {arquivo.previewUrl ? (
                    <a className={styles.link} href={arquivo.previewUrl} target="_blank" rel="noopener noreferrer" data-testid={`vendedor-doc-open-${arquivo.id}`}>
                      Abrir
                    </a>
                  ) : null}
                  {arquivo.downloadUrl ? (
                    <a className={styles.link} href={arquivo.downloadUrl} data-testid={`vendedor-doc-download-${arquivo.id}`}>
                      Baixar
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      {shareOpen ? <VehicleSharePhotos carroId={carroId} carroName={nome} onClose={() => setShareOpen(false)} /> : null}
    </section>
  );
}
