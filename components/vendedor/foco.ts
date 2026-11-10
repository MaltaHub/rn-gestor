"use client";

/**
 * Veículo EM FOCO na área do vendedor: o que foi aberto no /vender (ou no
 * /word) já aparece selecionado — e a lista filtrada pela placa — ao trocar
 * de aba. Vale para a aba do navegador (sessionStorage); sem storage, cada
 * tela começa vazia.
 */
export type FocoVeiculo = { carroId: string; placa: string };

const KEY = "rn.vendedor.foco";

export function lerFoco(): FocoVeiculo | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const foco = JSON.parse(raw) as Partial<FocoVeiculo>;
    return typeof foco.carroId === "string" && typeof foco.placa === "string" ? { carroId: foco.carroId, placa: foco.placa } : null;
  } catch {
    return null;
  }
}

export function gravarFoco(foco: FocoVeiculo | null) {
  try {
    if (foco) window.sessionStorage.setItem(KEY, JSON.stringify(foco));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Sem storage: o foco não atravessa as abas.
  }
}
