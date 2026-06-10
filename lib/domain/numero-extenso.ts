/**
 * lib/domain/numero-extenso.ts
 *
 * Numero por extenso em pt-BR. Usado pelo editor Word (/vendedor/word) na funcao
 * `${campo.extenso}`, que escreve uma quantia por extenso (ex.: contratos/recibos).
 *
 * Funcao pura, sem dependencias — testada em `__tests__/numero-extenso.test.ts`.
 */

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = [
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove"
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos"
];

// Escalas acima de mil: [singular, plural]. Indice = posicao do grupo de 3 digitos.
const ESCALAS: Array<[string, string]> = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
  ["trilhão", "trilhões"]
];

/** Extenso de um grupo de 1..999. */
function tresDigitos(n: number): string {
  if (n === 100) return "cem";
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (centena > 0) partes.push(CENTENAS[centena]);
  if (resto > 0) {
    if (resto < 10) partes.push(UNIDADES[resto]);
    else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
    else {
      const dezena = Math.floor(resto / 10);
      const unidade = resto % 10;
      partes.push(unidade === 0 ? DEZENAS[dezena] : `${DEZENAS[dezena]} e ${UNIDADES[unidade]}`);
    }
  }
  return partes.join(" e ");
}

/**
 * Extenso de um inteiro nao-negativo (cardinal). Ex.: 1234 -> "mil duzentos e
 * trinta e quatro". Conector "e" entre grupos quando o grupo seguinte e < 100
 * ou multiplo exato de 100 (regra usual pt-BR: "mil e um", "um milhão e cem").
 */
export function inteiroPorExtenso(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "zero";

  const grupos: number[] = [];
  let resto = n;
  while (resto > 0) {
    grupos.push(resto % 1000);
    resto = Math.floor(resto / 1000);
  }

  const partes: Array<{ texto: string; valor: number }> = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (g === 0) continue;
    let texto: string;
    if (i === 0) {
      texto = tresDigitos(g);
    } else if (i === 1) {
      texto = g === 1 ? "mil" : `${tresDigitos(g)} mil`;
    } else {
      const [singular, plural] = ESCALAS[i];
      texto = `${tresDigitos(g)} ${g === 1 ? singular : plural}`;
    }
    partes.push({ texto, valor: g });
  }

  let out = partes[0].texto;
  for (let i = 1; i < partes.length; i++) {
    const menor = partes[i];
    const usaE = menor.valor < 100 || menor.valor % 100 === 0;
    out += (usaE ? " e " : " ") + menor.texto;
  }
  return out;
}

/**
 * Quantia em reais por extenso. Ex.: 1234.56 -> "mil duzentos e trinta e quatro
 * reais e cinquenta e seis centavos". Milhoes/bilhoes exatos levam "de reais"
 * ("um milhão de reais"). Valor 0 -> "zero reais".
 */
export function valorPorExtenso(value: number): string {
  const negativo = value < 0;
  const centavosTotais = Math.round(Math.abs(value) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;

  const partes: string[] = [];
  if (reais > 0) {
    const exatoMilhoes = reais >= 1_000_000 && reais % 1_000_000 === 0;
    const unidade = reais === 1 ? "real" : "reais";
    partes.push(`${inteiroPorExtenso(reais)} ${exatoMilhoes ? "de " : ""}${unidade}`);
  }
  if (centavos > 0) {
    partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  }
  if (partes.length === 0) return "zero reais";

  const texto = partes.join(" e ");
  return negativo ? `menos ${texto}` : texto;
}
