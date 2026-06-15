/**
 * lib/domain/vendas/validacao.ts
 *
 * Validadores e máscaras puros dos campos do fluxo de vendas (CPF, CNPJ, RG,
 * CEP, telefone, e-mail). Sem dependências de rede — a consulta de CEP (ViaCEP)
 * fica na UI. Testado em `__tests__/validacao.test.ts`.
 */

export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** CPF (11 dígitos) com dígitos verificadores válidos. */
export function isValidCPF(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

/** CNPJ (14 dígitos) com dígitos verificadores válidos. */
export function isValidCNPJ(raw: string): boolean {
  const cnpj = onlyDigits(raw);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (len: number): number => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cnpj[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** CPF (11) ou CNPJ (14), conforme a quantidade de dígitos. */
export function isValidCpfCnpj(raw: string): boolean {
  const digits = onlyDigits(raw);
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
}

/** CEP: 8 dígitos. */
export function isValidCEP(raw: string): boolean {
  return /^\d{8}$/.test(onlyDigits(raw));
}

/** E-mail em formato plausível. */
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((raw ?? "").trim());
}

/** Telefone BR: 10 (fixo) ou 11 (celular) dígitos. */
export function isValidTelefone(raw: string): boolean {
  const d = onlyDigits(raw);
  return d.length === 10 || d.length === 11;
}

/** RG varia por estado; validação básica: 5–14 dígitos (aceita "X" final). */
export function isValidRG(raw: string): boolean {
  const cleaned = (raw ?? "").replace(/[.\-\s]/g, "");
  return /^[0-9]{4,13}[0-9Xx]$/.test(cleaned);
}

// ---- Máscaras (formatação para exibição) ----

export function formatCPF(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatCNPJ(raw: string): string {
  const d = onlyDigits(raw).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** Formata como CPF (≤11 dígitos) ou CNPJ (>11). */
export function formatCpfCnpj(raw: string): string {
  return onlyDigits(raw).length > 11 ? formatCNPJ(raw) : formatCPF(raw);
}

export function formatCEP(raw: string): string {
  const d = onlyDigits(raw).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

export function formatTelefone(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
