import { CAR_COLOR_OPTIONS } from "@/lib/domain/car-colors";

function readModeloName(modelos: unknown): string {
  if (!modelos) return "";
  const entry = Array.isArray(modelos) ? modelos[0] : modelos;
  const modelo = (entry as { modelo?: unknown } | null)?.modelo;
  return typeof modelo === "string" ? modelo.trim() : "";
}

export type CarroTitleInput = {
  nome?: string | null;
  placa?: string | null;
  ano_mod?: number | null;
  ano_fab?: number | null;
  hodometro?: number | null;
  cor?: string | null;
  modelos?: unknown;
};

/**
 * Titulo do veiculo como no form de CARROS, porem SEM a placa e separado apenas
 * por espacos: "modelo ano km Cor". Cai para nome/placa quando faltam dados.
 */
export function buildVehicleTitle(carro: CarroTitleInput): string {
  const modelo = readModeloName(carro.modelos);
  const ano = carro.ano_mod ?? carro.ano_fab;
  const anoStr = ano != null ? String(ano) : "";
  const km =
    carro.hodometro != null && Number.isFinite(carro.hodometro)
      ? `${new Intl.NumberFormat("pt-BR").format(carro.hodometro)} KM`
      : "";
  const rawColor = (carro.cor ?? "").trim();
  const cor = CAR_COLOR_OPTIONS.find((option) => option.value === rawColor)?.label ?? rawColor;

  const summary = [modelo, anoStr, km, cor].filter(Boolean).join(" ").trim();

  return summary || carro.nome?.trim() || carro.placa?.trim() || "Veiculo disponivel";
}
