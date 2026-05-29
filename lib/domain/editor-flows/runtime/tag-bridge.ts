/**
 * TagBridge: contrato que liga as TAGs do editor de fluxos aos handlers reais
 * do grid (`holistic-sheet.tsx`). Implementacao concreta vive no grid e e
 * injetada via React context (Fase 6+).
 *
 * Em contexto sem grid (editor puro / dry-run), nao ha bridge — a interpreter
 * pausa SEM aplicar o efeito, deixando o usuario navegar ao grid pra liberar.
 */

import type { FlowRow } from "@/lib/domain/editor-flows/runtime/types";

export type TagApplyInput = {
  /** Linhas alvo da acao (resolvidas no momento da pausa). */
  rows: FlowRow[];
  /** Sheet de origem das rows. */
  sheet_key: string | null;
};

export type TagBridge = {
  applyTagSelecionar: (input: TagApplyInput) => Promise<void>;
  applyTagOcultar: (input: TagApplyInput) => Promise<void>;
  applyTagMarcarConferencia: (input: TagApplyInput) => Promise<void>;
  applyTagDesmarcarConferencia: (input: TagApplyInput) => Promise<void>;
  /** Fase 7: abre o dialog de mass update e resolve so quando o user submete. */
  applyTagAlteracaoEmMassa: (input: TagApplyInput) => Promise<void>;
  /** Fase 7: abre o print composer e resolve quando o user clica "Imprimir". */
  applyTagImprimir: (input: TagApplyInput) => Promise<void>;
  /** Fase 8: exclui as linhas. Lanca PERMISSION_DENIED se o user nao puder deletar. */
  applyTagExcluir: (input: TagApplyInput) => Promise<void>;
  /** Fase 8: finaliza os carros (so funciona em carros + role GERENTE+). */
  applyTagFinalizar: (input: TagApplyInput) => Promise<void>;
};

/**
 * Bridge no-op para uso fora do grid (editor dry-run, testes). Nao aplica
 * efeitos — apenas absorve as chamadas.
 */
export const NULL_TAG_BRIDGE: TagBridge = {
  async applyTagSelecionar() {
    /* no-op */
  },
  async applyTagOcultar() {
    /* no-op */
  },
  async applyTagMarcarConferencia() {
    /* no-op */
  },
  async applyTagDesmarcarConferencia() {
    /* no-op */
  },
  async applyTagAlteracaoEmMassa() {
    /* no-op */
  },
  async applyTagImprimir() {
    /* no-op */
  },
  async applyTagExcluir() {
    /* no-op */
  },
  async applyTagFinalizar() {
    /* no-op */
  }
};

export const TAG_NODE_TYPES = new Set([
  "TagSelecionar",
  "TagOcultar",
  "TagMarcarConferencia",
  "TagDesmarcarConferencia",
  "TagAlteracaoEmMassa",
  "TagImprimir",
  "TagExcluir",
  "TagFinalizar"
]);

/**
 * TAGs que pausam aguardando interacao com dialog (mass update, print
 * composer). O status persistido e `paused_awaiting_form` enquanto o dialog
 * esta aberto; ao submeter ou cancelar, transita pra `paused_at_tag` (avanca)
 * ou `paused_at_tag` (retry).
 */
export const TAG_AWAITING_FORM_TYPES = new Set(["TagAlteracaoEmMassa", "TagImprimir"]);
