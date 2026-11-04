import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const STORAGE_KEY = "rn-gestor.files.scroll.v1";
const MAX_ENTRIES = 300;

let memory: Record<string, number> | null = null;
let persistTimer: number | null = null;

function read(): Record<string, number> {
  if (memory) return memory;
  try {
    memory = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    memory = {};
  }
  return memory;
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      const entries = Object.entries(read());
      // Mantém as mais recentes (ordem de inserção) dentro do limite.
      const trimmed = Object.fromEntries(entries.slice(-MAX_ENTRIES));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // storage cheio/bloqueado: vale só na sessão.
    }
  }, 400);
}

/**
 * Lembra a rolagem de cada pasta (persistida): voltar a uma pasta mostra onde
 * o usuário parou. A chave atual fica num ref para que o evento de rolagem da
 * restauração nunca grave na pasta anterior.
 */
export function useScrollMemory(ref: RefObject<HTMLElement | null>, scrollKey: string, enabled: boolean) {
  const keyRef = useRef(scrollKey);

  useLayoutEffect(() => {
    keyRef.current = scrollKey;
    const element = ref.current;
    if (!enabled || !element) return;
    element.scrollTop = read()[scrollKey] ?? 0;
  }, [enabled, ref, scrollKey]);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const store = read();
        delete store[keyRef.current];
        store[keyRef.current] = element.scrollTop;
        schedulePersist();
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [enabled, ref]);
}
