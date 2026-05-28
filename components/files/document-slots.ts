// Catalogo de "documentos" usados no pop-up de classificacao de upload.
//
// Cada slot vira um TOKEN no nome do arquivo, que a automacao do banco
// (fn_documentos_parse_token) le pra preencher a tabela `documentos`.
//
// - Slots com `campo`+`valor`: alimentam a automacao. O arquivo e renomeado pra
//   `<campo>_<valor>_<placa>__<nome-antigo>` -> documentos.<campo> = <valor>.
// - Slots so com `key` (sem campo/valor): apenas organizam o arquivo; o sistema
//   renomeia pra `<key>_<placa>__<nome-antigo>` (nao mexe em `documentos`).
//
// Editar este catalogo e seguro: e so dados. Adicione/edite documentos a vontade.

export type DocumentSlot = {
  /** Identificador/token curto (snake_case). Usado quando o slot e organizacional. */
  key: string;
  /** Rotulo exibido no pop-up. */
  label: string;
  /** Grupo para agrupar no dropdown (optgroup). */
  group: string;
  /** Campo da tabela `documentos` que este slot preenche (se alimentar a automacao). */
  campo?: string;
  /** Valor (code do lookup) gravado no campo. */
  valor?: string;
};

// Branco ("Em branco" / pendente) e uma opcao de TODOS os campos de estado.
export const DOCUMENT_SLOTS: DocumentSlot[] = [
  // ---- Transferencia (estado_transferencia) ----
  { key: "transf_branco", label: "Transferencia: em branco", group: "Transferencia", campo: "estado_transferencia", valor: "BRANCO" },
  { key: "crlv_virado", label: "CRLV virado", group: "Transferencia", campo: "estado_transferencia", valor: "VIRADO" },
  { key: "transf_aguardando", label: "Transferencia: aguardando", group: "Transferencia", campo: "estado_transferencia", valor: "AGUARDANDO" },
  { key: "transf_andamento", label: "Transferencia: em andamento", group: "Transferencia", campo: "estado_transferencia", valor: "EM_ANDAMENTO" },
  { key: "transf_concluida", label: "Transferencia: concluida", group: "Transferencia", campo: "estado_transferencia", valor: "CONCLUIDA" },
  { key: "transf_problema", label: "Transferencia: problema", group: "Transferencia", campo: "estado_transferencia", valor: "PROBLEMA" },

  // ---- Envelope ----
  { key: "env_branco", label: "Envelope: em branco", group: "Envelope", campo: "envelope", valor: "BRANCO" },
  { key: "env_presente", label: "Envelope: presente", group: "Envelope", campo: "envelope", valor: "PRESENTE" },
  { key: "env_aberto", label: "Envelope: aberto", group: "Envelope", campo: "envelope", valor: "ABERTO" },
  { key: "env_pronto", label: "Envelope: pronto", group: "Envelope", campo: "envelope", valor: "PRONTO" },
  { key: "env_fechado", label: "Envelope: fechado", group: "Envelope", campo: "envelope", valor: "FECHADO" },
  { key: "env_ausente", label: "Envelope: ausente", group: "Envelope", campo: "envelope", valor: "AUSENTE" },
  { key: "env_problema", label: "Envelope: problema", group: "Envelope", campo: "envelope", valor: "PROBLEMA" },

  // ---- Chave reserva ----
  { key: "chave_branco", label: "Chave reserva: em branco", group: "Chave reserva", campo: "chave_reserva", valor: "BRANCO" },
  { key: "chave_no_envelope", label: "Chave reserva: no envelope", group: "Chave reserva", campo: "chave_reserva", valor: "NO_ENVELOPE" },
  { key: "chave_aguardando", label: "Chave reserva: aguardando", group: "Chave reserva", campo: "chave_reserva", valor: "AGUARDANDO" },
  { key: "chave_ausente", label: "Chave reserva: ausente", group: "Chave reserva", campo: "chave_reserva", valor: "AUSENTE" },
  { key: "chave_problema", label: "Chave reserva: problema", group: "Chave reserva", campo: "chave_reserva", valor: "PROBLEMA" },

  // ---- Pericia ----
  { key: "pericia_branco", label: "Pericia: em branco", group: "Pericia", campo: "pericia", valor: "BRANCO" },
  { key: "pericia_autentica", label: "Pericia: autentica", group: "Pericia", campo: "pericia", valor: "AUTENTICA" },
  { key: "pericia_ausente", label: "Pericia: ausente", group: "Pericia", campo: "pericia", valor: "AUSENTE" },
  { key: "pericia_problema", label: "Pericia: problema", group: "Pericia", campo: "pericia", valor: "PROBLEMA" },

  // ---- Tipo de processo ----
  { key: "proc_branco", label: "Tipo de processo: em branco", group: "Tipo de processo", campo: "tipo_de_processo", valor: "BRANCO" },
  { key: "proc_procuracao", label: "Procuracao", group: "Tipo de processo", campo: "tipo_de_processo", valor: "PROCURACAO" },
  { key: "proc_transferencia", label: "Transferencia (processo)", group: "Tipo de processo", campo: "tipo_de_processo", valor: "TRANSFERENCIA" },

  // ---- Proposito ----
  { key: "proposito_branco", label: "Proposito: em branco", group: "Proposito", campo: "proposito", valor: "BRANCO" },
  { key: "proposito_venda", label: "Proposito: venda", group: "Proposito", campo: "proposito", valor: "VENDA" },
  { key: "proposito_repasse", label: "Proposito: repasse", group: "Proposito", campo: "proposito", valor: "REPASSE" },

  // ---- Recibo de compra ----
  { key: "recibo_branco", label: "Recibo de compra: em branco", group: "Recibo de compra", campo: "recibo_compra", valor: "BRANCO" },
  { key: "recibo_presente", label: "Recibo de compra: presente", group: "Recibo de compra", campo: "recibo_compra", valor: "PRESENTE" },
  { key: "recibo_ausente", label: "Recibo de compra: ausente", group: "Recibo de compra", campo: "recibo_compra", valor: "AUSENTE" },
  { key: "recibo_problema", label: "Recibo de compra: problema", group: "Recibo de compra", campo: "recibo_compra", valor: "PROBLEMA" },

  // ---- Documentos-arquivo (organizacionais; nao mexem na automacao) ----
  { key: "crlv", label: "CRLV (arquivo)", group: "Outros documentos" },
  { key: "atpv", label: "ATPV (arquivo)", group: "Outros documentos" },
  { key: "comprovante", label: "Comprovante", group: "Outros documentos" },
  { key: "contrato", label: "Contrato", group: "Outros documentos" }
];

/**
 * Normaliza a placa pro token. Precisa casar com o parser do banco, que usa
 * `lower(btrim(placa))` — entao mantemos o hifen (placas ABC-1234), so tirando
 * espacos e caixa. NAO remover o hifen, senao o match falha.
 */
function placaToken(placa: string): string {
  return placa.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Renomeia o arquivo embutindo o token que a automacao reconhece, preservando
 * o nome antigo como sufixo. Ex.: slot crlv_virado + placa ABC1234 + "scan.pdf"
 *   -> "estado_transferencia_virado_abc1234__scan.pdf"
 */
export function buildTokenFileName(slot: DocumentSlot, placa: string, originalName: string): string {
  const placaPart = placaToken(placa);
  const prefix =
    slot.campo && slot.valor
      ? `${slot.campo}_${slot.valor.toLowerCase()}_${placaPart}`
      : `${slot.key}_${placaPart}`;
  return `${prefix}__${originalName}`;
}

/** Cria um novo File com o nome-token, mantendo conteudo/tipo. */
export function renameFileForSlot(file: File, slot: DocumentSlot, placa: string): File {
  const nextName = buildTokenFileName(slot, placa, file.name);
  return new File([file], nextName, { type: file.type, lastModified: file.lastModified });
}

/** Prefixo-token de um slot (sem o nome antigo). Usado pra detectar presenca. */
export function slotTokenPrefix(slot: DocumentSlot, placa: string): string {
  const placaPart = placaToken(placa);
  return slot.campo && slot.valor
    ? `${slot.campo}_${slot.valor.toLowerCase()}_${placaPart}`
    : `${slot.key}_${placaPart}`;
}

/** True se algum arquivo da pasta ja foi classificado neste slot. */
export function isSlotPresent(slot: DocumentSlot, placa: string, fileNames: string[]): boolean {
  const prefix = slotTokenPrefix(slot, placa);
  return fileNames.some((name) => name.toLowerCase().includes(prefix));
}
