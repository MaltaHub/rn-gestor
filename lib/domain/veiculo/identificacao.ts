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

/** Estrutural: 11 dígitos e não tudo-igual (sem exigir o DV). */
export function isRenavamFormat(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length < 9 || d.length > 11) return false;
  const padded = d.padStart(11, "0");
  return !/^(\d)\1{10}$/.test(padded);
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

/** Token VIN limpo: 17 chars do alfabeto VIN com AO MENOS uma letra e um dígito. */
function isVinToken(token: string): boolean {
  return CHASSI_RE.test(token) && /[A-Z]/.test(token) && /[0-9]/.test(token);
}

/**
 * Extrai placa/chassi/renavam do texto do CRLV (de pdf.js ou OCR).
 *
 * Estratégia (precisão > recall, para NÃO gravar dado errado):
 *   1. Tokeniza o texto (cada campo do CRLV-e digital vira um token contíguo).
 *   2. Para cada campo, prefere o token logo após o rótulo (CHASSI/RENAVAM/PLACA),
 *      senão o único token do documento que casa o formato exato.
 *   3. Fallback p/ OCR fragmentado: compacta SÓ uma janela curta após o rótulo
 *      (nunca o documento inteiro — isso atravessava campos e pegava lixo).
 * Renavam exige DV (módulo 11) para evitar pegar outro número. A UI ainda mostra
 * os campos para o usuário CONFIRMAR/corrigir antes de gravar.
 */
export function parseCrlvText(rawText: string): CrlvFields {
  const upper = (rawText ?? "").toUpperCase();
  const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
  const labelAt = (label: string) => tokens.indexOf(label);

  // ---- chassi (VIN 17) ----
  let chassi: string | null = null;
  const ci = labelAt("CHASSI");
  if (ci >= 0) chassi = tokens.slice(ci + 1, ci + 5).find(isVinToken) ?? null;
  if (!chassi) chassi = tokens.find(isVinToken) ?? null;
  if (!chassi) {
    const win = windowAfterLabel(upper, /CHASSI[^A-Z0-9]*/, 60);
    if (win) {
      const c = normalizeChassi(win).slice(0, 17);
      if (isValidChassi(c) && /[A-Z]/.test(c)) chassi = c;
    }
  }

  // ---- renavam (9–11 dígitos + DV módulo 11) ----
  const isRenavamTok = (t: string) => /^[0-9]{9,11}$/.test(t) && isValidRenavam(t);
  let renavam: string | null = null;
  const ri = labelAt("RENAVAM");
  if (ri >= 0) renavam = tokens.slice(ri + 1, ri + 5).find(isRenavamTok) ?? null;
  if (!renavam) renavam = tokens.find(isRenavamTok) ?? null;
  if (!renavam) {
    const win = windowAfterLabel(upper, /RENAVAM[^0-9]*/, 40);
    if (win) {
      const d = onlyDigits(win).slice(0, 11);
      if (isValidRenavam(d)) renavam = d;
    }
  }
  if (renavam) renavam = formatRenavam(renavam.padStart(11, "0"));

  // ---- placa (Mercosul ou antiga) ----
  let placa: string | null = null;
  const pi = labelAt("PLACA");
  if (pi >= 0) placa = tokens.slice(pi + 1, pi + 3).map(normalizePlaca).find(isValidPlaca) ?? null;
  if (!placa) placa = tokens.map(normalizePlaca).find(isValidPlaca) ?? null;
  if (!placa) {
    const win = windowAfterLabel(upper, /PLACA[^A-Z0-9]*/, 12);
    if (win) {
      const candidate = normalizePlaca(win).slice(0, 7);
      if (isValidPlaca(candidate)) placa = candidate;
    }
  }

  return { placa, chassi: chassi ? normalizeChassi(chassi) : null, renavam };
}
