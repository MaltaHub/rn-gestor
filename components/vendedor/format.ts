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

const BRL_CENTAVOS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Moeda BR com centavos (resumo da venda, parcelas). */
export function formatValor(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return BRL_CENTAVOS.format(value);
}

/**
 * Decimal BR digitado ("50.000,00" / "50000,00") -> number.
 * Vazio -> null; invalido -> NaN (caller decide a mensagem).
 */
export function parseDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Inteiro digitado ("48") -> number. Vazio -> null; invalido -> NaN. */
export function parseInteiro(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : NaN;
}
