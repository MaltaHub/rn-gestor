/**
 * Formatação usada pelos documentos da venda (variáveis e cláusulas).
 * Funções puras; datas YYYY-MM-DD são lidas pelos componentes (sem `Date`)
 * para não rolar o dia com o fuso (gotcha #11 do CLAUDE.md).
 */
import { valorPorExtenso } from "@/lib/domain/numero-extenso";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const INTEIRO = new Intl.NumberFormat("pt-BR");

export function isNumero(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatBRL(value: number | null | undefined): string | null {
  return isNumero(value) ? BRL.format(value) : null;
}

/** "R$ 10.000,00 (dez mil reais)" — valor com o extenso entre parênteses. */
export function valorComExtenso(value: number | null | undefined): string | null {
  if (!isNumero(value)) return null;
  return `${BRL.format(value)} (${valorPorExtenso(value)})`;
}

export function formatKm(value: number | null | undefined): string | null {
  return isNumero(value) ? INTEIRO.format(value) : null;
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

function dataExtenso(dia: number, mes: number, ano: number): string | null {
  const nome = MESES[mes - 1];
  return nome ? `${dia} de ${nome} de ${ano}` : null;
}

type Ymd = { y: number; m: number; d: number };

function parseYmd(iso: string | null | undefined): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** "13 de junho de 2026" a partir de YYYY-MM-DD (ou de um timestamp ISO). */
export function formatDataExtenso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ymd = parseYmd(iso);
  if (ymd) return dataExtenso(ymd.d, ymd.m, ymd.y);
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const date = new Date(time);
  return dataExtenso(date.getDate(), date.getMonth() + 1, date.getFullYear());
}

/** "13/06/2026" a partir de YYYY-MM-DD. */
export function formatDataCurta(iso: string | null | undefined): string | null {
  const ymd = parseYmd(iso);
  if (!ymd) return null;
  return `${String(ymd.d).padStart(2, "0")}/${String(ymd.m).padStart(2, "0")}/${ymd.y}`;
}

export function hojeExtenso(now: Date = new Date()): string {
  return dataExtenso(now.getDate(), now.getMonth() + 1, now.getFullYear()) ?? "";
}

/** Soma dias a uma data YYYY-MM-DD (aritmética em UTC, sem desvio de fuso). */
export function somarDias(iso: string | null | undefined, dias: number): string | null {
  const ymd = parseYmd(iso);
  if (!ymd) return null;
  const utc = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + dias));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Junta itens como em português: "a", "a e b", "a, b e c". */
export function juntarLista(itens: string[]): string {
  const limpos = itens.filter((item) => item.trim());
  if (limpos.length <= 1) return limpos[0] ?? "";
  return `${limpos.slice(0, -1).join(", ")} e ${limpos[limpos.length - 1]}`;
}

/** Primeira letra maiúscula (o resto como veio). */
export function capitalizar(texto: string): string {
  return texto ? texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1) : texto;
}
