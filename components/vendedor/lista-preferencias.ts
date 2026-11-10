"use client";

import { useCallback, useState } from "react";
import { ORDENS_LISTA, type OrdemLista } from "@/lib/domain/vendedor/types";

/**
 * O que a lista do /vender e do /word lembra:
 *  - a BUSCA digitada, para atravessar as abas (vale para a aba do navegador);
 *  - a ORDEM escolhida (este navegador). Padrão: "recentes".
 * O veículo aberto NÃO é lembrado (pedido do Kaic, 2026-11-10): a ordem
 * "Recentes" já traz o último manipulado para o topo, e reabrir sozinho o
 * mesmo carro atrapalhava. A área do vendedor só monta no cliente (depois do
 * login), então ler o storage no estado inicial não quebra a hidratação.
 */
const BUSCA_KEY = "rn.vendedor.busca";
const ORDEM_KEY = "rn.vendedor.ordem";

function ler(storage: "session" | "local", key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return (storage === "session" ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

function gravar(storage: "session" | "local", key: string, value: string | null) {
  try {
    const alvo = storage === "session" ? window.sessionStorage : window.localStorage;
    if (value) alvo.setItem(key, value);
    else alvo.removeItem(key);
  } catch {
    // Sem storage: vale só nesta tela.
  }
}

export function useListaPreferencias() {
  const [q, setQState] = useState(() => ler("session", BUSCA_KEY) ?? "");
  const [ordem, setOrdemState] = useState<OrdemLista>(() => {
    const salva = ler("local", ORDEM_KEY);
    return (ORDENS_LISTA as string[]).includes(salva ?? "") ? (salva as OrdemLista) : "recentes";
  });

  const setQ = useCallback((value: string) => {
    setQState(value);
    gravar("session", BUSCA_KEY, value.trim() ? value : null);
  }, []);

  const setOrdem = useCallback((value: OrdemLista) => {
    setOrdemState(value);
    gravar("local", ORDEM_KEY, value === "recentes" ? null : value);
  }, []);

  return { q, setQ, ordem, setOrdem };
}
