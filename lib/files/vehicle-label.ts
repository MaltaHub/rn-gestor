import { CAR_COLOR_OPTIONS } from "@/lib/domain/car-colors";

export type VehicleLabelInput = {
  placa?: string | null;
  modelo?: string | null;
  ano_mod?: number | string | null;
  ano_fab?: number | string | null;
  hodometro?: number | string | null;
  cor?: string | null;
};

function formatKm(raw: number | string | null | undefined) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const parsed = typeof raw === "number" ? raw : Number(text.replace(/\./g, "").replace(",", "."));
  return `${Number.isFinite(parsed) ? new Intl.NumberFormat("pt-BR").format(parsed) : text} KM`;
}

export function carColorLabel(raw: string | null | undefined) {
  const value = String(raw ?? "").trim();
  return CAR_COLOR_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** "PLACA — Modelo 2020 45.000 KM — Prata" (partes vazias somem). */
export function buildVehicleLabel(input: VehicleLabelInput) {
  const placa = String(input.placa ?? "").trim().toUpperCase();
  const modelo = String(input.modelo ?? "").trim();
  const ano = String(input.ano_mod ?? input.ano_fab ?? "").trim();
  const rawColor = String(input.cor ?? "").trim();
  const color = CAR_COLOR_OPTIONS.find((option) => option.value === rawColor)?.label ?? rawColor;

  const base = [modelo, ano, formatKm(input.hodometro)].filter(Boolean).join(" ");
  return [placa, base, color].filter(Boolean).join(" — ");
}
