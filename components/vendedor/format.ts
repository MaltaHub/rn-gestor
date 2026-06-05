import type { VendedorCarroListItem } from "@/components/ui-grid/api";

type ModeloRelation = VendedorCarroListItem["modelos"];

export function readModelo(modelos: ModeloRelation): string | null {
  if (!modelos) return null;
  const entry = Array.isArray(modelos) ? modelos[0] : modelos;
  const modelo = entry?.modelo;
  return typeof modelo === "string" && modelo.trim() ? modelo.trim() : null;
}

/** Nome completo do veículo: `nome` quando houver, senão modelo, senão a placa. */
export function carroDisplayName(carro: Pick<VendedorCarroListItem, "nome" | "placa" | "modelos">): string {
  return carro.nome?.trim() || readModelo(carro.modelos) || carro.placa;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function formatPreco(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return BRL.format(value);
}
