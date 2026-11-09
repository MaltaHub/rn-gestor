/**
 * lib/domain/documentos-insights.ts
 *
 * UNICA FONTE DE VERDADE para a logica de insights de documentos.
 * Espelha o padrao de lib/domain/anuncios-insights.ts.
 *
 * Regras de negocio (triggers SQL ja garantem os dados):
 * - Carro criado -> linha de documentos com envelope 'AUSENTE'.
 * - estado_veiculo 'PRONTO' -> linha de documentos garantida (slot).
 * - Carro 'VENDIDO' -> envelope forcado para 'FECHANDO'.
 * - documentos.estado_transferencia = situacao do CRLV: AGUARDANDO (nao chegou)
 *   | BRANCO (nome do antigo dono) | PROCURACAO | VIRADO (transferido; titular em
 *   responsavel_virado_id). Trigger fn_documentos_normaliza_crlv mantem isso.
 *
 * Insights derivados:
 * - DOCUMENTO_SEM_LINHA: carro DISPONIVEL (legado) sem linha em documentos ->
 *   linha virtual "missing" no grid, clique cria a linha.
 * - FINALIZAR_DOCUMENTO: veiculo vendido com envelope ainda nao 'FECHADO'
 *   (tipicamente 'FECHANDO') -> destacar e contabilizar ate fechar.
 *   E o UNICO insight de vendidos: contar "envelopes FECHANDO" separado era
 *   redundante (o trigger forca VENDIDO -> FECHANDO, mesmo conjunto).
 */

export const ENVELOPE_FECHADO = "FECHADO";

export const DOCUMENTO_INSIGHT_CODE = {
  /** Veiculo sem linha em documentos (legado anterior aos triggers) */
  DOCUMENTO_SEM_LINHA: "DOCUMENTO_SEM_LINHA",
  /** Veiculo vendido: finalizar a documentacao e fechar o envelope */
  FINALIZAR_DOCUMENTO: "FINALIZAR_DOCUMENTO",
  /** Veiculo PRONTO com o CRLV ainda AGUARDANDO (documento nao chegou) */
  CRLV_AGUARDANDO: "CRLV_AGUARDANDO",
} as const;

export type DocumentoInsightCode =
  (typeof DOCUMENTO_INSIGHT_CODE)[keyof typeof DOCUMENTO_INSIGHT_CODE];

/** Peso: o insight de maior peso ANULA os demais (so 1 por linha). */
export const DOCUMENTO_INSIGHT_WEIGHT: Record<DocumentoInsightCode, number> = {
  [DOCUMENTO_INSIGHT_CODE.FINALIZAR_DOCUMENTO]: 100,
  [DOCUMENTO_INSIGHT_CODE.CRLV_AGUARDANDO]: 75,
  [DOCUMENTO_INSIGHT_CODE.DOCUMENTO_SEM_LINHA]: 50,
};

export const DOCUMENTO_INSIGHT_MESSAGES: Record<DocumentoInsightCode, string> = {
  [DOCUMENTO_INSIGHT_CODE.DOCUMENTO_SEM_LINHA]:
    "Veiculo sem linha de documentos. Abra para criar o registro.",
  [DOCUMENTO_INSIGHT_CODE.FINALIZAR_DOCUMENTO]:
    "Veiculo vendido: finalizar a documentacao e fechar o envelope.",
  [DOCUMENTO_INSIGHT_CODE.CRLV_AGUARDANDO]:
    "Veiculo PRONTO com o CRLV aguardando (o documento ainda nao chegou).",
};

/** Classe CSS da linha do grid (definidas em globals.css). */
export const DOCUMENTO_INSIGHT_ROW_CLASS: Record<DocumentoInsightCode, string> = {
  [DOCUMENTO_INSIGHT_CODE.DOCUMENTO_SEM_LINHA]: "sheet-row-missing-data",
  [DOCUMENTO_INSIGHT_CODE.FINALIZAR_DOCUMENTO]: "sheet-row-warning",
  [DOCUMENTO_INSIGHT_CODE.CRLV_AGUARDANDO]: "sheet-row-crlv-aguardando",
};

export type DocumentoInsightItem = {
  code: DocumentoInsightCode;
  message: string;
};

export type DocumentoInsightFlags = {
  /** Carro vendido com envelope ainda nao FECHADO */
  finalizarDocumento: boolean;
  /** Linha virtual: carro sem registro em documentos */
  missingData: boolean;
  /** Carro PRONTO com o CRLV ainda AGUARDANDO */
  crlvAguardando: boolean;
  insightMessage: string | null;
};

/** Decide se a linha (carro vendido + envelope) ainda precisa finalizar. */
export function needsFinalizarDocumento(params: {
  carroVendido: boolean;
  envelope: string | null | undefined;
}): boolean {
  if (!params.carroVendido) return false;
  const envelope = String(params.envelope ?? "").trim().toUpperCase();
  return envelope !== ENVELOPE_FECHADO;
}

/** Situacao do CRLV ainda AGUARDANDO (ou sem situacao): o documento nao chegou. */
export function isCrlvAguardando(estadoTransferencia: string | null | undefined): boolean {
  const v = String(estadoTransferencia ?? "").trim().toUpperCase();
  return v === "" || v === "AGUARDANDO";
}

/** Carro PRONTO (pronto pra vender) com o CRLV ainda aguardando. */
export function needsCrlvAguardando(params: {
  estadoVeiculo: string | null | undefined;
  estadoTransferencia: string | null | undefined;
}): boolean {
  const pronto = String(params.estadoVeiculo ?? "").trim().toUpperCase() === "PRONTO";
  return pronto && isCrlvAguardando(params.estadoTransferencia);
}

/** Coleta os insights ativos; o de maior peso anula os demais (1 por linha). */
export function collectDocumentoInsightItems(flags: DocumentoInsightFlags): DocumentoInsightItem[] {
  const raw: DocumentoInsightItem[] = [];

  if (flags.finalizarDocumento) {
    raw.push({
      code: DOCUMENTO_INSIGHT_CODE.FINALIZAR_DOCUMENTO,
      message:
        flags.insightMessage?.trim() ||
        DOCUMENTO_INSIGHT_MESSAGES[DOCUMENTO_INSIGHT_CODE.FINALIZAR_DOCUMENTO],
    });
  }

  if (flags.crlvAguardando) {
    raw.push({
      code: DOCUMENTO_INSIGHT_CODE.CRLV_AGUARDANDO,
      message:
        flags.insightMessage?.trim() ||
        DOCUMENTO_INSIGHT_MESSAGES[DOCUMENTO_INSIGHT_CODE.CRLV_AGUARDANDO],
    });
  }

  if (flags.missingData) {
    raw.push({
      code: DOCUMENTO_INSIGHT_CODE.DOCUMENTO_SEM_LINHA,
      message:
        flags.insightMessage?.trim() ||
        DOCUMENTO_INSIGHT_MESSAGES[DOCUMENTO_INSIGHT_CODE.DOCUMENTO_SEM_LINHA],
    });
  }

  if (raw.length === 0) return [];

  const dominant = raw.reduce((best, item) =>
    (DOCUMENTO_INSIGHT_WEIGHT[item.code] ?? 0) > (DOCUMENTO_INSIGHT_WEIGHT[best.code] ?? 0)
      ? item
      : best
  );

  return [dominant];
}

export function resolvePrimaryDocumentoInsight(flags: DocumentoInsightFlags): DocumentoInsightItem | null {
  return collectDocumentoInsightItems(flags)[0] ?? null;
}

export function getDocumentoRowClass(flags: DocumentoInsightFlags): string {
  const primary = resolvePrimaryDocumentoInsight(flags);
  if (!primary) return "";
  return DOCUMENTO_INSIGHT_ROW_CLASS[primary.code] ?? "";
}

/** Extrai flags normalizadas de uma linha bruta do grid (colunas privadas __). */
export function extractDocumentoInsightFlagsFromRow(row: Record<string, unknown>): DocumentoInsightFlags {
  return {
    finalizarDocumento: row.__finalizar_documento === true,
    missingData: row.__missing_data === true,
    crlvAguardando: row.__crlv_aguardando === true,
    insightMessage: typeof row.__insight_message === "string" ? row.__insight_message : null,
  };
}
