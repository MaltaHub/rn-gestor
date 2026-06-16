/**
 * lib/domain/veiculo/identificacao.ts
 *
 * Validadores/normalizadores de identificação do veículo (chassi/VIN, RENAVAM,
 * placa) e o parser do texto do CRLV (`parseCrlvText`). Puros e sem rede — o
 * OCR/extração de texto fica na UI (`components/files/crlv-extract.ts`).
 * Testado em `__tests__/identificacao.test.ts`.
 */
import { onlyDigits } from "@/lib/domain/vendas/validacao";

// VIN/chassi: 17 caracteres, alfabeto sem I, O e Q (evita ambiguidade com 1/0).
const CHASSI_CHARS = "A-HJ-NPR-Z0-9";
const CHASSI_RE = new RegExp(`^[${CHASSI_CHARS}]{17}$`);

export function normalizeChassi(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidChassi(raw: string): boolean {
  return CHASSI_RE.test(normalizeChassi(raw));
}

export function formatChassi(raw: string): string {
  return normalizeChassi(raw).slice(0, 17);
}

/**
 * RENAVAM (11 dígitos) com dígito verificador módulo 11.
 * Algoritmo DETRAN: pesos [3,2,9,8,7,6,5,4,3,2] sobre os 10 primeiros dígitos;
 * `dv = (soma*10) % 11`, com 10 → 0. Aceita 9/10 dígitos (RENAVAM antigo) com
 * zero-padding à esquerda para 11.
 */
export function isValidRenavam(raw: string): boolean {
  let r = onlyDigits(raw);
  if (r.length < 9 || r.length > 11) return false;
  r = r.padStart(11, "0");
  if (/^0{11}$/.test(r)) return false;

  const base = r.slice(0, 10);
  const dv = Number(r[10]);
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(base[i]) * weights[i];
  const mod = (sum * 10) % 11;
  return (mod === 10 ? 0 : mod) === dv;
}

export function formatRenavam(raw: string): string {
  return onlyDigits(raw).slice(0, 11);
}

const PLACA_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const PLACA_ANTIGA = /^[A-Z]{3}[0-9]{4}$/;

export function normalizePlaca(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidPlaca(raw: string): boolean {
  const p = normalizePlaca(raw);
  return PLACA_MERCOSUL.test(p) || PLACA_ANTIGA.test(p);
}

/** True se as duas placas, normalizadas, são iguais (e válidas). */
export function placasIguais(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePlaca(a ?? "");
  const nb = normalizePlaca(b ?? "");
  return Boolean(na) && na === nb;
}

export type CrlvFields = { placa: string | null; chassi: string | null; renavam: string | null };

/** Janela de texto logo após um rótulo (ex.: "CHASSI"), p/ ancorar a busca. */
function windowAfterLabel(upper: string, label: RegExp, size: number): string | null {
  const m = label.exec(upper);
  if (!m) return null;
  const start = m.index + m[0].length;
  return upper.slice(start, start + size);
}

/**
 * Extrai placa/chassi/renavam do texto do CRLV (de pdf.js ou OCR). Heurístico:
 * ancora nos rótulos e cai para busca por formato. O OCR às vezes mete espaços
 * no meio do número, então também procura no texto "compactado" (só A-Z0-9).
 * A UI mostra os campos para o usuário confirmar/corrigir.
 */
export function parseCrlvText(rawText: string): CrlvFields {
  const upper = (rawText ?? "").toUpperCase();
  const compact = upper.replace(/[^A-Z0-9]/g, "");

  // ---- chassi (17 VIN) ----
  let chassi: string | null = null;
  const chassiWin = windowAfterLabel(upper, /CHASSI[^A-Z0-9]*/, 60);
  if (chassiWin) {
    const candidate = normalizeChassi(chassiWin).slice(0, 17);
    if (isValidChassi(candidate)) chassi = candidate;
  }
  if (!chassi) {
    const matches = compact.match(new RegExp(`[${CHASSI_CHARS}]{17}`, "g")) ?? [];
    // exige ao menos uma letra (evita casar com sequências só numéricas)
    chassi = matches.find((c) => isValidChassi(c) && /[A-Z]/.test(c)) ?? null;
  }

  // ---- renavam (11 dígitos + DV) ----
  let renavam: string | null = null;
  const renWin = windowAfterLabel(upper, /RENAVAM[^0-9]*/, 40);
  if (renWin) {
    const digits = onlyDigits(renWin).slice(0, 11);
    if (digits.length === 11) renavam = digits;
  }
  if (!renavam || !isValidRenavam(renavam)) {
    const all = compact.match(/[0-9]{11}/g) ?? [];
    const valid = all.find((d) => isValidRenavam(d));
    if (valid) renavam = valid;
    else if (!renavam && all[0]) renavam = all[0];
  }

  // ---- placa (Mercosul ou antiga) ----
  let placa: string | null = null;
  const placaWin = windowAfterLabel(upper, /PLACA[^A-Z0-9]*/, 12);
  if (placaWin) {
    const candidate = normalizePlaca(placaWin).slice(0, 7);
    if (isValidPlaca(candidate)) placa = candidate;
  }
  if (!placa) {
    const matches = upper.match(/[A-Z]{3}[ -]?[0-9][A-Z0-9][0-9]{2}/g) ?? [];
    placa = matches.map(normalizePlaca).find(isValidPlaca) ?? null;
  }

  return { placa, chassi, renavam };
}
