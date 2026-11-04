import { CAR_COLOR_OPTIONS } from "@/lib/domain/car-colors";
import {
  formatChassi,
  formatRenavam,
  isRenavamFormat,
  isValidChassi,
  isValidPlaca,
  normalizePlaca
} from "@/lib/domain/veiculo/identificacao";

/**
 * ALLOW-LIST de destinos do OCR. O cliente só manda a CHAVE; tabela/coluna,
 * validação e formatação vivem aqui (invariante: nunca aceitar coluna livre).
 *
 * - write: grava em `carros.<column>` do veículo da pasta;
 * - check: confere com o veículo da pasta (trava — recusa o arquivo se não bate);
 * - none:  só extrai e mostra.
 */

export type OcrDestinationKind = "write" | "check" | "none";

export type OcrDestination = {
  key: string;
  label: string;
  kind: OcrDestinationKind;
  column?: "chassi" | "renavam" | "ano_fab" | "ano_mod" | "cor" | "hodometro" | "placa";
  /** Mensagem de erro quando inválido; null = ok. */
  validate: (value: string) => string | null;
  /** Valor que vai para o banco. */
  format: (value: string) => string | number;
};

function yearValidator(value: string) {
  const year = Number(value.replace(/\D/g, ""));
  return year >= 1950 && year <= 2100 ? null : "Ano inválido (4 dígitos).";
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
    key: "carros.chassi",
    label: "Chassi (veículo)",
    kind: "write",
    column: "chassi",
    validate: (value) => (isValidChassi(value) ? null : "Chassi inválido (17 caracteres, sem I/O/Q)."),
    format: (value) => formatChassi(value)
  },
  {
    key: "carros.renavam",
    label: "Renavam (veículo)",
    kind: "write",
    column: "renavam",
    validate: (value) => (isRenavamFormat(value) ? null : "Renavam inválido (11 dígitos)."),
    format: (value) => formatRenavam(value)
  },
  {
    key: "carros.ano_fab",
    label: "Ano de fabricação (veículo)",
    kind: "write",
    column: "ano_fab",
    validate: yearValidator,
    format: (value) => Number(value.replace(/\D/g, ""))
  },
  {
    key: "carros.ano_mod",
    label: "Ano do modelo (veículo)",
    kind: "write",
    column: "ano_mod",
    validate: yearValidator,
    format: (value) => Number(value.replace(/\D/g, ""))
  },
  {
    key: "carros.cor",
    label: "Cor (veículo)",
    kind: "write",
    column: "cor",
    validate: (value) => (colorToken(value) ? null : "Cor não reconhecida na lista de cores."),
    format: (value) => colorToken(value) ?? value
  },
  {
    key: "carros.hodometro",
    label: "Hodômetro em km (veículo)",
    kind: "write",
    column: "hodometro",
    validate: (value) => (/^\d{1,7}$/.test(value.replace(/\D/g, "")) && value.replace(/\D/g, "") !== "" ? null : "Hodômetro inválido."),
    format: (value) => Number(value.replace(/\D/g, ""))
  }
];

const BY_KEY = new Map(OCR_DESTINATIONS.map((destination) => [destination.key, destination]));

export const OCR_DESTINATION_KEYS = OCR_DESTINATIONS.map((destination) => destination.key);

export function getOcrDestination(key: string) {
  return BY_KEY.get(key) ?? BY_KEY.get("none")!;
}

export function isOcrDestinationKey(key: string) {
  return BY_KEY.has(key);
}
