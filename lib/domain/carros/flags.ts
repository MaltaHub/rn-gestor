export type VehicleFlagsInput = {
  ano_ipva_pago?: number | null;
  tem_manual?: boolean | null;
  tem_chave_r?: boolean | null;
};

export type VehicleFlag = {
  /** Rótulo exibido no selo. */
  label: string;
  /** Selo de destaque (IPVA do ano corrente) — recebe estilo solido. */
  highlight: boolean;
};

/**
 * Selos do veiculo para as paginas publicas (catalogo/galeria):
 * - "IPVA PAGO" quando o IPVA pago e do ano corrente (`ano_ipva_pago === ano atual`).
 * - "Manual" / "Chave Reserva" quando os respectivos booleanos estao marcados.
 */
export function buildVehicleFlags(
  carro: VehicleFlagsInput,
  currentYear: number = new Date().getFullYear()
): VehicleFlag[] {
  const flags: VehicleFlag[] = [];

  if (carro.ano_ipva_pago != null && carro.ano_ipva_pago === currentYear) {
    flags.push({ label: "IPVA PAGO", highlight: true });
  }
  if (carro.tem_manual) {
    flags.push({ label: "Manual", highlight: false });
  }
  if (carro.tem_chave_r) {
    flags.push({ label: "Chave Reserva", highlight: false });
  }

  return flags;
}
