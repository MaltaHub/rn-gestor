"use client";

import type { VendedorCarroListItem } from "@/components/ui-grid/api";
import { carroDisplayName, formatPreco, readModelo } from "@/components/vendedor/format";

export type VehicleListMode = "grande" | "compacto" | "sem-capa";

function CoverImage({ url, alt }: { url: string | null | undefined; alt: string }) {
  if (!url) {
    return (
      <div className="vendedor-card-cover is-empty" aria-hidden="true">
        <span>Sem foto</span>
      </div>
    );
  }
  // <img> evita configurar domínios remotos do next/image para URLs assinadas.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="vendedor-card-cover" src={url} alt={alt} loading="lazy" />;
}

export function VehicleCard({
  carro,
  mode,
  onOpen
}: {
  carro: VendedorCarroListItem;
  mode: VehicleListMode;
  onOpen: (id: string) => void;
}) {
  const name = carroDisplayName(carro);
  const preco = formatPreco(carro.preco_original);
  const subtitle = [readModelo(carro.modelos) && carro.nome ? readModelo(carro.modelos) : null, carro.ano_mod, carro.cor]
    .filter(Boolean)
    .join(" · ");

  if (mode === "sem-capa") {
    return (
      <button
        type="button"
        className="vendedor-card is-sem-capa"
        data-testid={`vendedor-card-${carro.id}`}
        onClick={() => onOpen(carro.id)}
      >
        <span className="vendedor-card-name">{name}</span>
        <span className="vendedor-card-meta">
          {carro.placa}
          {preco ? ` · ${preco}` : ""}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`vendedor-card is-${mode}`}
      data-testid={`vendedor-card-${carro.id}`}
      onClick={() => onOpen(carro.id)}
    >
      <CoverImage url={carro.cover_url} alt={name} />
      <span className="vendedor-card-body">
        <span className="vendedor-card-name">{name}</span>
        {carro.placa ? <span className="vendedor-card-placa">{carro.placa}</span> : null}
        {subtitle ? <span className="vendedor-card-meta">{subtitle}</span> : null}
        {preco ? <span className="vendedor-card-price">{preco}</span> : null}
      </span>
    </button>
  );
}
