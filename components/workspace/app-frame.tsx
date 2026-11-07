"use client";

import { useEffect, type ReactNode } from "react";

import type { CurrentActor } from "@/components/ui-grid/types";
import styles from "@/components/workspace/app-frame.module.css";
import { WorkspaceHeader } from "@/components/workspace/workspace-header";

/**
 * Layout global das páginas internas: cabeçalho + área de conteúdo do tamanho
 * da tela. A PÁGINA nunca rola; quem rola é o conteúdo (ou, com `fill`, a
 * própria tela da página — grid, explorer, playground — que cuida da rolagem).
 */
export function AppFrame(props: {
  actor: CurrentActor;
  title: string;
  actions?: ReactNode;
  /** A página ocupa a área inteira e rola por dentro (sem rolagem do conteúdo). */
  fill?: boolean;
  className?: string;
  bodyClassName?: string;
  testId?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(styles.locked);
    return () => root.classList.remove(styles.locked);
  }, []);

  return (
    <div className={`${styles.frame} ${props.className ?? ""}`} data-testid={props.testId}>
      <WorkspaceHeader actor={props.actor} title={props.title} actions={props.actions} />
      <main className={`${styles.body} ${props.bodyClassName ?? ""}`} data-fill={props.fill ? "true" : undefined}>
        {props.children}
      </main>
    </div>
  );
}
