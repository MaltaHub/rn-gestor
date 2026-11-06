// Catalogo de documentos do veiculo (pasta "Documentos" de cada carro).
//
// Fonte de verdade: DOCUMENT_TYPES — UM tipo por documento. O processo de uma
// loja de usados gira em 4 eixos + pericia, e SO estes registram dados (o
// banco le o token no nome do arquivo — fn_documentos_parse_token):
//   crlv_branco   -> documentos.estado_transferencia = BRANCO (nunca rebaixa VIRADO)
//   procuracao    -> documentos.estado_transferencia = PROCURACAO (nunca rebaixa VIRADO)
//   crlv_virado   -> documentos.estado_transferencia = VIRADO
//   nota_entrada  -> cria a nota fiscal de ENTRADA ligada ao arquivo
//   nota_saida    -> cria a nota fiscal de SAIDA ligada ao arquivo
//   pericia       -> cria a pericia ligada ao arquivo
// Os demais tipos so arquivam.
//
// O nome do arquivo VIRA o token:  <key>_<placa>.<ext>   ex.: crlv_virado_abc1d23.pdf
// Repetido na pasta: <token>-2.<ext>, <token>-3.<ext>...

export type DocumentType = {
  /** Identificador/token curto (snake_case) — o mesmo que o banco reconhece. */
  key: string;
  /** Rotulo exibido. */
  label: string;
  /** Etapa do processo (agrupa as opcoes). */
  group: "Compra" | "Transferência" | "Venda";
  /** O que acontece ao classificar (so nos tipos que registram dados). */
  registra?: string;
};

export const DOCUMENT_TYPES: DocumentType[] = [
  // ----- Compra -----
  { key: "crlv_branco", label: "CRLV BRANCO", group: "Compra", registra: "CRLV = BRANCO (ainda no nome do antigo dono)" },
  { key: "nota_entrada", label: "Nota fiscal de entrada", group: "Compra", registra: "cria a nota de entrada" },
  { key: "pericia", label: "Perícia", group: "Compra", registra: "cria a perícia" },
  { key: "procuracao", label: "Procuração", group: "Compra", registra: "CRLV = PROCURAÇÃO (se ainda não virado)" },
  { key: "atpv", label: "ATPV", group: "Compra" },
  { key: "pesquisa", label: "Pesquisa", group: "Compra" },
  // ----- Transferencia -----
  { key: "crlv_virado", label: "CRLV VIRADO", group: "Transferência", registra: "CRLV = VIRADO (transferido)" },
  // ----- Venda -----
  { key: "nota_saida", label: "Nota fiscal de saída", group: "Venda", registra: "cria a nota de saída" },
  { key: "recibo_venda", label: "Recibo de venda", group: "Venda" },
  { key: "termo_entrega", label: "Termo de entrega", group: "Venda" },
  { key: "comp_endereco_venda", label: "Comp. endereço (venda)", group: "Venda" },
  { key: "identidade_consumidor_final", label: "Identidade consumidor final", group: "Venda" }
];

/** Tokens antigos ainda reconhecidos na leitura (arquivos de antes da reestruturação). */
const LEGACY_TOKENS: Array<{ token: string; key: string }> = [
  { token: "estado_transferencia_virado", key: "crlv_virado" },
  { token: "crlv", key: "crlv_branco" }
];

// ---- Slots (lista plana usada pelo pop-up de classificacao) ----
export type DocumentSlot = { key: string; label: string; group: string; registra?: string };

export const DOCUMENT_SLOTS: DocumentSlot[] = DOCUMENT_TYPES.map(({ key, label, group, registra }) => ({ key, label, group, registra }));

const TYPE_BY_KEY = new Map(DOCUMENT_TYPES.map((type) => [type.key, type]));

/** Slot de CRLV (branco ou virado): dispara a validação de placa por OCR. */
export function isCrlvSlot(slot: Pick<DocumentSlot, "key">): boolean {
  return slot.key === "crlv_branco" || slot.key === "crlv_virado";
}

/** Placa normalizada pro token (mantem hifen; casa com lower(btrim(placa)) do parser). */
function placaToken(placa: string): string {
  return placa.trim().toLowerCase().replace(/\s+/g, "");
}

/** Prefixo-token de um tipo: <key>_<placa>. */
export function slotTokenPrefix(slot: Pick<DocumentSlot, "key">, placa: string): string {
  return `${slot.key}_${placaToken(placa)}`;
}

/** Extensão (com ponto, minúscula); ".pdf.pdf" vira ".pdf". */
function extensionOf(name: string) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return match ? `.${match[1].toLowerCase()}` : "";
}

/**
 * Nome curto e único na pasta. `taken` (nomes já usados, minúsculos) é
 * atualizado — passe o mesmo Set para vários arquivos do mesmo envio.
 */
export function uniqueTokenName(token: string, extension: string, taken?: Set<string>) {
  let name = `${token}${extension}`;
  for (let attempt = 2; taken?.has(name.toLowerCase()); attempt += 1) name = `${token}-${attempt}${extension}`;
  taken?.add(name.toLowerCase());
  return name;
}

export function buildTokenFileName(slot: Pick<DocumentSlot, "key">, placa: string, originalName: string, taken?: Set<string>): string {
  return uniqueTokenName(slotTokenPrefix(slot, placa), extensionOf(originalName), taken);
}

export function renameFileForSlot(file: File, slot: Pick<DocumentSlot, "key">, placa: string, taken?: Set<string>): File {
  return new File([file], buildTokenFileName(slot, placa, file.name, taken), { type: file.type, lastModified: file.lastModified });
}

/** Tipo de documento a que um arquivo pertence (pelo token+placa no nome), ou null. */
export function matchDocumentType(fileName: string, placa: string): DocumentType | null {
  const lower = fileName.toLowerCase();
  const placaPart = placaToken(placa);
  for (const type of DOCUMENT_TYPES) {
    if (lower.includes(`${type.key}_${placaPart}`)) return type;
  }
  for (const legacy of LEGACY_TOKENS) {
    if (lower.includes(`${legacy.token}_${placaPart}`)) return TYPE_BY_KEY.get(legacy.key) ?? null;
  }
  return null;
}

export function isSlotPresent(slot: Pick<DocumentSlot, "key">, placa: string, fileNames: string[]): boolean {
  return fileNames.some((name) => matchDocumentType(name, placa)?.key === slot.key);
}
