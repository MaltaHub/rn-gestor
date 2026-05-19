/**
 * Tipos do print-composer.
 *
 * O payload `config` carrega o estado completo do composer; `anchor_filter` e
 * um pre-filtro independente aplicado ao dataset ANTES do print job.
 */

import type { PrintHighlightRule } from "@/components/ui-grid/print-highlights";
import type { PrintSortRule } from "@/components/ui-grid/print-job";
import type { PrintScope, PrintSortDirection, SheetKey } from "@/components/ui-grid/types";

export type PrintAnchorFilter = {
  // Mapa coluna -> lista de valores literais aceitos (whitelist). Vazio = sem filtro.
  values: Record<string, string[]>;
};

export type PrintTemplateConfig = {
  title: string;
  scope: PrintScope;
  columns: string[];
  columnLabels: Record<string, string>;
  filters: Record<string, string[]>;
  displayColumnOverrides: Record<string, string>;
  sortColumn: string;
  sortDirection: PrintSortDirection;
  sortRules?: PrintSortRule[];
  sectionColumn: string;
  sectionValues: string[];
  includeOthers: boolean;
  highlightOpacityPercent: number;
  highlightRules: PrintHighlightRule[];
};

export type PrintTemplate = {
  id: string;
  user_id: string;
  sheet_key: SheetKey;
  title: string;
  config: PrintTemplateConfig;
  anchor_filter: PrintAnchorFilter | null;
  created_at: string;
  updated_at: string;
};

export type PrintTemplatePersistInput = {
  sheet_key: SheetKey;
  title: string;
  config: PrintTemplateConfig;
  anchor_filter?: PrintAnchorFilter | null;
};

export type PrintTemplateUpdateInput = {
  title?: string;
  config?: PrintTemplateConfig;
  anchor_filter?: PrintAnchorFilter | null;
};
