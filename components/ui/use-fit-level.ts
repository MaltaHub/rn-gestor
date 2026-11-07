"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Barra que NUNCA quebra linha: mede a própria largura e sobe o "nível de
 * aperto" (0 = tudo à vista) até o conteúdo caber. Cada nível é uma
 * otimização de layout que a barra aplica (esconder rótulos, mandar itens para
 * o "Mais"...). Volta ao nível 0 quando a largura ou o conteúdo mudam.
 *
 * A barra precisa de `overflow: hidden` e filhos sem encolher além do mínimo,
 * para que o excesso apareça em scrollWidth.
 */
export function useFitLevel<T extends HTMLElement>(maxLevel: number, contentKey: string) {
  const ref = useRef<T | null>(null);
  const [level, setLevel] = useState(0);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((current) => (current === next ? current : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Largura ou conteúdo mudaram: recomeça do nível mais folgado.
  useLayoutEffect(() => {
    setLevel(0);
  }, [width, contentKey]);

  // A cada render: ainda transborda? aperta mais um nível (antes de pintar).
  // Sem deps de propósito: o conteúdo (contagem, selos) muda sem avisar; o
  // ciclo é limitado por maxLevel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || level >= maxLevel) return;
    if (element.scrollWidth > element.clientWidth + 1) setLevel(level + 1);
  });

  return { ref, level };
}
