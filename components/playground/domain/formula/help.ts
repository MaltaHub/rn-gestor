/**
 * Catalogo de funcoes do motor de formulas, usado para sugestoes/autocomplete na
 * barra de formula do playground. Mantem a descoberta das "operacoes dinamicas"
 * sem o usuario precisar decorar a sintaxe.
 */
export type FormulaFunctionHelp = {
  /** Nome canonico pt-BR (como sera inserido). */
  name: string;
  /** Assinatura legivel. */
  signature: string;
  /** Descricao curta. */
  description: string;
};

export const FORMULA_FUNCTION_HELP: FormulaFunctionHelp[] = [
  { name: "SOMA", signature: "SOMA(valores...)", description: "Soma os numeros." },
  { name: "MEDIA", signature: "MEDIA(valores...)", description: "Media dos numeros." },
  { name: "CONT.NUM", signature: "CONT.NUM(valores...)", description: "Conta quantos sao numeros." },
  { name: "CONT.VALORES", signature: "CONT.VALORES(valores...)", description: "Conta valores nao vazios (qtd de linhas)." },
  { name: "CONT.SE", signature: "CONT.SE(intervalo; criterio)", description: 'Conta os que casam o criterio (ex.: ">10" ou "x").' },
  { name: "SOMASE", signature: "SOMASE(intervalo; criterio; [soma])", description: "Soma onde o intervalo casa o criterio." },
  { name: "SE", signature: "SE(condicao; entao; [senao])", description: "Retorna 'entao' se a condicao for verdadeira." },
  { name: "MAXIMO", signature: "MAXIMO(valores...)", description: "Maior numero." },
  { name: "MINIMO", signature: "MINIMO(valores...)", description: "Menor numero." }
];

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function normalize(value: string): string {
  return value.toUpperCase().normalize("NFD").replace(DIACRITICS, "");
}

/** Extrai o "token" de funcao que esta sendo digitado no fim da formula. */
export function currentFormulaToken(value: string): string {
  const match = new RegExp("([A-Za-z\\u00c0-\\u00ff.]+)$").exec(value);
  return match ? match[1] : "";
}

/** Sugere funcoes que combinam com o token (sem acentos / maiusculas). Vazio -> todas. */
export function suggestFormulaFunctions(token: string): FormulaFunctionHelp[] {
  const query = normalize(token.trim());
  if (!query) return FORMULA_FUNCTION_HELP;
  return FORMULA_FUNCTION_HELP.filter((fn) => normalize(fn.name).includes(query));
}
