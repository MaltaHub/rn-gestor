"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Pilha global de diálogos abertos. Quem abre por último fica na frente
 * (z-index maior) e é o único que responde a Esc e prende o foco — é o que
 * permite a cadeia "form → + modelo → + marca…" até o usuário terminar.
 */

type Layer = { id: number };

let layers: Layer[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return layers;
}

const SERVER_SNAPSHOT: Layer[] = [];

/** Base acima de tudo do app (gaveta 40, barras 20, toasts 80). */
export const DIALOG_BASE_Z = 1000;

export function useDialogLayer(open: boolean) {
  const [id] = useState(() => nextId++);
  const stack = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);

  useEffect(() => {
    if (!open) return;
    layers = [...layers, { id }];
    emit();
    return () => {
      layers = layers.filter((layer) => layer.id !== id);
      emit();
    };
  }, [id, open]);

  const index = stack.findIndex((layer) => layer.id === id);
  return {
    isTop: index >= 0 && index === stack.length - 1,
    zIndex: DIALOG_BASE_Z + Math.max(0, index) * 10,
    depth: Math.max(0, index)
  };
}

/** Há algum diálogo aberto? (atalhos globais do grid devem se calar). */
export function useAnyDialogOpen() {
  return useSyncExternalStore(subscribe, () => layers.length > 0, () => false);
}

export function isAnyDialogOpen() {
  return layers.length > 0;
}
