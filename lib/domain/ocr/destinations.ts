import { CAR_COLOR_OPTIONS } from "@/lib/domain/car-colors";
import { CODIGO_NOTA_FISCAL_EXEMPLO, isValidCodigoNotaFiscal, normalizeCodigoNotaFiscal } from "@/lib/domain/carros/codigo-nota-fiscal";
import { formatCpfCnpj, isValidCpfCnpj, onlyDigits } from "@/lib/domain/vendas/validacao";
import { findCatalogColumn, humanizeColumn, typedValue, type OcrCatalogTable } from "@/lib/domain/ocr/catalog";
import {
  formatChassi,
  formatRenavam,
  isRenavamFormat,
  isValidChassi,
  isValidPlaca,
  normalizePlaca
} from "@/lib/domain/veiculo/identificacao";

/**
 * Destinos do OCR. O cliente só manda a CHAVE (`tabela.coluna`); o servidor
 * resolve contra o CATÁLOGO (colunas editáveis do grid ligadas ao veículo —
 * catalog.ts) e recusa o resto (invariante: nunca aceitar coluna livre).
 *
 * - write: grava na coluna da tabela (linha do veículo da pasta);
 * - check: confere com o veículo da pasta (trava — recusa o arquivo se não bate);
 * - none:  só extrai e mostra.
 * Algumas colunas têm regra própria (chassi, renavam, anos, cor, hodômetro).
 */

export type OcrDestinationKind = "write" | "check" | "none";

export type OcrDestination = {
  key: string;
  label: string;
  kind: OcrDestinationKind;
  table?: string;
  column?: string;
  /** Rótulo curto da tabela (seletor e diálogo). */
  tableLabel?: string;
  /** Mensagem de erro quando inválido; null = ok. */
  validate: (value: string) => string | null;
  /** Valor que vai para o banco. */
  format: (value: string) => string | number | boolean;
};

function codigoNotaFiscalValidator(value: string) {
  return isValidCodigoNotaFiscal(normalizeCodigoNotaFiscal(value)) ? null : `Fora do formato ${CODIGO_NOTA_FISCAL_EXEMPLO}.`;
}

function yearValidator(value: string) {
  const year = Number(value.replace(/\D/g, ""));
  return year >= 1950 && year <= 2100 ? null : "Ano inválido (4 dígitos).";
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function digitsValidator(min: number, max: number, label: string) {
  return (value: string) => {
    const only = digits(value);
    return only.length >= min && only.length <= max ? null : `${label} inválido (${min === max ? min : `${min} a ${max}`} dígitos).`;
  };
}

const PERICIA_STATUS: Array<{ code: string; pattern: RegExp }> = [
  { code: "APROVADO_COM_APONTAMENTO", pattern: /aprovad[oa]\s*(c\/|com)\s*apontament/ },
  { code: "DESAPROVADO", pattern: /desaprovad|reprovad/ },
  { code: "APROVADO", pattern: /aprovad/ }
];

function periciaStatus(value: string) {
  const text = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return PERICIA_STATUS.find((entry) => entry.pattern.test(text))?.code ?? null;
}

function colorToken(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  return CAR_COLOR_OPTIONS.find((option) => option.value === normalized || option.label.toLowerCase() === normalized)?.value ?? null;
}

export const OCR_DESTINATIONS: OcrDestination[] = [
  { key: "none", label: "Só extrair (não grava)", kind: "none", validate: () => null, format: (value) => value },
  {
    key: "check.placa",
    label: "Conferir placa da pasta (trava)",
    kind: "check",
    column: "placa",
    validate: (value) => (isValidPlaca(value) ? null : "Placa inválida."),
    format: (value) => normalizePlaca(value)
  },
  {
    key: "check.codigo_nota_fiscal",
    label: "Conferir código da nota do veículo (trava)",
    kind: "check",
    column: "codigo_nota_fiscal",
    validate: codigoNotaFiscalValidator,
    format: normalizeCodigoNotaFiscal
  },
  {
    key: "carros.codigo_nota_fiscal",
    label: "Código da nota fiscal (veículo)",
    kind: "write",
    table: "carros",
    tableLabel: "Veículo",
    column: "codigo_nota_fiscal",
    validate: codigoNotaFiscalValidator,
    format: normalizeCodigoNotaFiscal
  },
  {
    key: "carros.chassi",
    label: "Chassi (veículo)",
    kind: "write",
    table: "carros",
    tableLabel: "Veículo",
    column: "chassi",
    validate: (value) => (isValidChassi(value) ? null : "Chassi inválido (17 caracteres, sem I/O/Q)."),
    format: (value) => formatChassi(value)
  },
  {
    key: "carros.renavam",
    label: "Renavam (veículo)",
    kind: "write",
    table: "carros",
    tableLabel: "Veículo",
    column: "renavam",
    validate: (value) => (isRenavamFormat(value) ? null : "Renavam inválido (11 dígitos)."),
    format: (value) => formatRenavam(value)
  },
  {
    key: "carros.crv",
    label: "CRV — número (veículo)",
    kind: "write",
    table: "carros",
    tableLabel: "Veículo",
    column: "crv",
    validate: digitsValidator(6, 20, "CRV"),
    format: digits
  },
  {
    key: "carros.crv_codigo_seguranca",
    label: "Código de segurança do CRV (veículo)",
    kind: "write",
    table: "carros",
    tableLabel: "Veículo",
    column: "crv_codigo_seguranca",
    validate: digitsValidator(6, 20, "Código de segurança"),
    format: digits
  },
  {
    key: "notas_fiscais.chave_acesso",
    label: "Chave de acesso (nota fiscal)",
    kind: "write",
    table: "notas_fiscais",
    tableLabel: "Notas fiscais",
    column: "chave_acesso",
    validate: digitsValidator(44, 44, "Chave de acesso"),
    format: digits
  },
  {
    key: "remetentes.cpf_cnpj",
    label: "CPF/CNPJ (fornecedor)",
    kind: "write",
    table: "remetentes",
    tableLabel: "Fornecedor do veículo",
    column: "cpf_cnpj",
    validate: (value) => (isValidCpfCnpj(value) ? null : "CPF/CNPJ inválido."),
    format: (value) => formatCpfCnpj(value)
  },
  {
    // Titular do CRLV virado: grava SÓ os números (é a chave do cadastro).
    key: "responsaveis_virado.cpf_cnpj",
    label: "CPF/CNPJ (titular do CRLV virado)",
    kind: "write",
    table: "responsaveis_virado",
    tableLabel: "Titular do CRLV virado",
    column: "cpf_cnpj",
    validate: (value) => (isValidCpfCnpj(value) ? null : "CPF/CNPJ inválido."),
    format: (value) => onlyDigits(value)
  },
  {
    key: "pericias.status",
    label: "Status (perícia)",
    kind: "write",
    table: "pericias",
    tableLabel: "Perícias",
    column: "status",
    validate: (value) => (periciaStatus(value) ? null : "Use aprovado, desaprovado ou aprovado c/ apontamento."),
    format: (value) => periciaStatus(value) ?? value
  },
  {
    key: "carros.ano_fab",
    label: "Ano de fabricação (veículo)",
    kind: "write",
    table: "carros",
    tableLabel: "Veículo",
    column: "ano_fab",
    validate: yearValidator,
    format: (value) => Number(value.replace(/\D/g, ""))
  },
  {
    key: "carros.ano_mod",
    label: "Ano do modelo (veículo)",
    kind: "write",
    table: "carros",
    tableLabel: "Veículo",
    column: "ano_mod",
    validate: yearValidator,
    format: (value) => Number(value.replace(/\D/g, ""))
  },
  {
    key: "carros.cor",
    label: "Cor (veículo)",
    kind: "write",
    table: "carros",
    tableLabel: "Veículo",
    column: "cor",
    validate: (value) => (colorToken(value) ? null : "Cor não reconhecida na lista de cores."),
    format: (value) => colorToken(value) ?? value
  },
  {
    key: "carros.hodometro",
    label: "Hodômetro em km (veículo)",
    kind: "write",
    table: "carros",
    tableLabel: "Veículo",
    column: "hodometro",
    validate: (value) => (/^\d{1,7}$/.test(value.replace(/\D/g, "")) && value.replace(/\D/g, "") !== "" ? null : "Hodômetro inválido."),
    format: (value) => Number(value.replace(/\D/g, ""))
  }
];

const BY_KEY = new Map(OCR_DESTINATIONS.map((destination) => [destination.key, destination]));

/** Destinos fixos (sem catálogo): só extrair e a trava de placa. */
export const OCR_SPECIAL_DESTINATION_KEYS = ["none", "check.placa", "check.codigo_nota_fiscal"] as const;

const KEY_PATTERN = /^[a-z_]+\.[a-z0-9_]+$/;

export function isOcrDestinationKeyShape(key: string) {
  return BY_KEY.has(key) || KEY_PATTERN.test(key);
}

/**
 * Resolve uma chave. Com catálogo: só colunas dele (o servidor SEMPRE passa o
 * catálogo). Sem catálogo (cliente ainda carregando): `tabela.coluna` vira
 * texto genérico — a palavra final é do servidor.
 */
export function resolveOcrDestination(key: string, catalog: OcrCatalogTable[] | null): OcrDestination {
  const special = BY_KEY.get(key);
  const found = catalog ? findCatalogColumn(catalog, key) : null;
  if (special) {
    return found && special.kind === "write" ? { ...special, label: `${found.column.label} (${found.table.label})`, tableLabel: found.table.label } : special;
  }
  if (found) {
    const { table, column } = found;
    return {
      key,
      label: `${column.label} (${table.label})`,
      kind: "write",
      table: table.table,
      tableLabel: table.label,
      column: column.column,
      validate: (value) => {
        const result = typedValue(column.type, value);
        return result.ok ? null : result.error;
      },
      format: (value) => {
        const result = typedValue(column.type, value);
        return result.ok ? result.value : value;
      }
    };
  }
  if (!catalog && KEY_PATTERN.test(key)) {
    const [table, column] = key.split(".");
    return {
      key,
      label: `${humanizeColumn(column)} (${table})`,
      kind: "write",
      table,
      column,
      validate: (value) => (value.trim() ? null : "Vazio."),
      format: (value) => value.trim()
    };
  }
  return BY_KEY.get("none")!;
}

export function getOcrDestination(key: string) {
  return resolveOcrDestination(key, null);
}

/** No servidor: a chave existe (especial ou coluna do catálogo)? */
export function isAllowedOcrDestination(key: string, catalog: OcrCatalogTable[]) {
  return (OCR_SPECIAL_DESTINATION_KEYS as readonly string[]).includes(key) || Boolean(findCatalogColumn(catalog, key));
}
