// Catalogo de documentos do veiculo.
//
// Fonte de verdade: DOCUMENT_TYPES — UM tipo por documento (perica, envelope,
// recibo, ATPV...). Tipos "de estado" (com `campo` + `values`) alimentam a
// automacao do banco via token no nome do arquivo; tipos organizacionais (so
// `key`) apenas arquivam.
//
// O nome do arquivo recebe um TOKEN que fn_documentos_parse_token le:
//   <campo>_<valor>_<placa>__<nome-antigo>   (tipos de estado)
//   <key>_<placa>__<nome-antigo>             (organizacionais)

export type DocumentTypeValue = { value: string; label: string };

export type DocumentType = {
  /** Identificador/token curto (snake_case). */
  key: string;
  /** Rotulo exibido no slot/quadrado. */
  label: string;
  /** Campo da tabela `documentos` (quando e um tipo de estado). */
  campo?: string;
  /** Estados possiveis (quando e um tipo de estado). */
  values?: DocumentTypeValue[];
};

const BRANCO: DocumentTypeValue = { value: "BRANCO", label: "Em branco" };

export const DOCUMENT_TYPES: DocumentType[] = [
  // ----- Compra (estado: alimentam colunas de `documentos` via token) -----
  {
    key: "pericia",
    label: "Pericia",
    campo: "pericia",
    values: [BRANCO, { value: "AUTENTICA", label: "Autentica" }, { value: "AUSENTE", label: "Ausente" }, { value: "PROBLEMA", label: "Problema" }]
  },
  {
    key: "recibo_compra",
    label: "Recibo de compra",
    campo: "recibo_compra",
    values: [BRANCO, { value: "PRESENTE", label: "Presente" }, { value: "AUSENTE", label: "Ausente" }, { value: "PROBLEMA", label: "Problema" }]
  },
  // ----- Transferencia (estado) -----
  {
    key: "estado_transferencia",
    label: "CRLV (VIRADO)",
    campo: "estado_transferencia",
    values: [
      BRANCO,
      { value: "AGUARDANDO", label: "Aguardando" },
      { value: "EM_ANDAMENTO", label: "Em andamento" },
      { value: "CONCLUIDA", label: "Concluida" },
      { value: "VIRADO", label: "Virado" },
      { value: "PROBLEMA", label: "Problema" }
    ]
  },
  // ----- Compra (organizacionais: so arquivam o arquivo) -----
  { key: "crlv", label: "CRLV (COMPRA)" },
  { key: "atpv", label: "ATPV" },
  { key: "nota_entrada", label: "Nota de entrada" },
  { key: "procuracao", label: "Procuracao" },
  { key: "pesquisa", label: "Pesquisa" },
  // ----- Venda (organizacionais) -----
  { key: "recibo_venda", label: "Recibo de venda" },
  { key: "nota_saida", label: "Nota de saida" },
  { key: "termo_entrega", label: "Termo de entrega" },
  { key: "comp_endereco_venda", label: "Comp. endereco (venda)" },
  { key: "identidade_consumidor_final", label: "Identidade consumidor final" }
];

// ---- Slots derivados (compat: pop-up de classificacao usa lista plana) ----
export type DocumentSlot = { key: string; label: string; group: string; campo?: string; valor?: string };

export const DOCUMENT_SLOTS: DocumentSlot[] = DOCUMENT_TYPES.flatMap((type) => {
  if (type.campo && type.values) {
    return type.values.map((v) => ({
      key: `${type.key}_${v.value.toLowerCase()}`,
      label: `${type.label}: ${v.label}`,
      group: type.label,
      campo: type.campo,
      valor: v.value
    }));
  }
  return [{ key: type.key, label: type.label, group: "Outros documentos" }];
});

/** Placa normalizada pro token (mantem hifen; casa com lower(btrim(placa)) do parser). */
function placaToken(placa: string): string {
  return placa.trim().toLowerCase().replace(/\s+/g, "");
}

/** Prefixo-token de um slot (campo+valor) ou organizacional (key). */
export function slotTokenPrefix(slot: DocumentSlot, placa: string): string {
  const placaPart = placaToken(placa);
  return slot.campo && slot.valor ? `${slot.campo}_${slot.valor.toLowerCase()}_${placaPart}` : `${slot.key}_${placaPart}`;
}

export function buildTokenFileName(slot: DocumentSlot, placa: string, originalName: string): string {
  return `${slotTokenPrefix(slot, placa)}__${originalName}`;
}

export function renameFileForSlot(file: File, slot: DocumentSlot, placa: string): File {
  return new File([file], buildTokenFileName(slot, placa, file.name), { type: file.type, lastModified: file.lastModified });
}

/** Token de um TIPO + valor escolhido (ou so o tipo, organizacional). */
export function tokenPrefixForType(type: DocumentType, value: string | null, placa: string): string {
  const placaPart = placaToken(placa);
  return type.campo && value ? `${type.campo}_${value.toLowerCase()}_${placaPart}` : `${type.key}_${placaPart}`;
}

export function renameFileForType(file: File, type: DocumentType, value: string | null, placa: string): File {
  const nextName = `${tokenPrefixForType(type, value, placa)}__${file.name}`;
  return new File([file], nextName, { type: file.type, lastModified: file.lastModified });
}

export function isSlotPresent(slot: DocumentSlot, placa: string, fileNames: string[]): boolean {
  const prefix = slotTokenPrefix(slot, placa).toLowerCase();
  return fileNames.some((name) => name.toLowerCase().includes(prefix));
}

/** True se ja existe arquivo classificado neste tipo (qualquer estado). */
export function isTypePresent(type: DocumentType, placa: string, fileNames: string[]): boolean {
  const placaPart = placaToken(placa);
  const lowerNames = fileNames.map((name) => name.toLowerCase());
  if (type.campo && type.values) {
    return type.values.some((v) =>
      lowerNames.some((name) => name.includes(`${type.campo}_${v.value.toLowerCase()}_${placaPart}`))
    );
  }
  return lowerNames.some((name) => name.includes(`${type.key}_${placaPart}`));
}
