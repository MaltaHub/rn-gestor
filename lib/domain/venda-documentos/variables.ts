/**
 * lib/domain/venda-documentos/variables.ts
 *
 * Indexador de variaveis do editor Word (/vendedor/word). Tokens `${...}` num
 * documento sao resolvidos contra o processo de venda (venda + carro + pessoas).
 *
 * - `${placa}`, `${comprador.nome}`, `${preco}` ... -> dado do processo.
 * - `${preco.extenso}` -> quantia por extenso, CAIXA ALTA entre parenteses, ex.:
 *   "(QUARENTA E CINCO MIL REAIS)". Funciona em campos monetarios (preco, entrada,
 *   parcela).
 *
 * Funcao pura (a camada de service monta o `VendaDocContext`). Aceita tokens com
 * ou sem acento (`preco`/`preco`). Testado em `__tests__/variables.test.ts`.
 */
import { valorPorExtenso } from "@/lib/domain/numero-extenso";

export type VendaDocContext = {
  // Veiculo
  placa?: string | null;
  modelo?: string | null;
  cor?: string | null;
  anoFab?: number | null;
  anoMod?: number | null;
  chassi?: string | null;
  renavam?: string | null;
  // Venda
  valorTotal?: number | null;
  valorEntrada?: number | null;
  formaPagamento?: string | null;
  dataVenda?: string | null;
  dataEntrega?: string | null;
  observacao?: string | null;
  // Comprador
  compradorNome?: string | null;
  compradorDocumento?: string | null;
  compradorTelefone?: string | null;
  compradorEmail?: string | null;
  compradorEndereco?: string | null;
  // Financiamento
  financBanco?: string | null;
  financParcelasQtde?: number | null;
  financParcelaValor?: number | null;
  // Pessoas
  vendedor?: string | null;
};

export type VariavelInfo = {
  grupo: string;
  token: string;
  label: string;
};

/** Catalogo de chips clicaveis exibidos no editor (token na forma acentuada). */
export const VARIAVEIS_DISPONIVEIS: VariavelInfo[] = [
  { grupo: "Veículo", token: "placa", label: "Placa" },
  { grupo: "Veículo", token: "modelo", label: "Modelo" },
  { grupo: "Veículo", token: "cor", label: "Cor" },
  { grupo: "Veículo", token: "ano", label: "Ano" },
  { grupo: "Veículo", token: "chassi", label: "Chassi" },
  { grupo: "Veículo", token: "renavam", label: "Renavam" },
  { grupo: "Valores", token: "preço", label: "Preço (R$)" },
  { grupo: "Valores", token: "preço.extenso", label: "Preço por extenso" },
  { grupo: "Valores", token: "entrada", label: "Entrada (R$)" },
  { grupo: "Valores", token: "entrada.extenso", label: "Entrada por extenso" },
  { grupo: "Valores", token: "parcela", label: "Parcela (R$)" },
  { grupo: "Valores", token: "parcela.extenso", label: "Parcela por extenso" },
  { grupo: "Valores", token: "forma_pagamento", label: "Forma de pagamento" },
  { grupo: "Comprador", token: "comprador.nome", label: "Nome" },
  { grupo: "Comprador", token: "comprador.cpf", label: "CPF/CNPJ" },
  { grupo: "Comprador", token: "comprador.telefone", label: "Telefone" },
  { grupo: "Comprador", token: "comprador.email", label: "E-mail" },
  { grupo: "Comprador", token: "comprador.endereço", label: "Endereço" },
  { grupo: "Financiamento", token: "financ.banco", label: "Banco" },
  { grupo: "Financiamento", token: "financ.parcelas", label: "Qtde parcelas" },
  { grupo: "Datas", token: "data_venda", label: "Data da venda" },
  { grupo: "Datas", token: "data_entrega", label: "Data de entrega" },
  { grupo: "Datas", token: "hoje", label: "Data de hoje" },
  { grupo: "Pessoas", token: "vendedor", label: "Vendedor" },
  { grupo: "Outros", token: "observação", label: "Observação" }
];

const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  a_vista: "à vista",
  financiado: "financiado",
  consorcio: "consórcio",
  parcelado: "parcelado",
  misto: "misto"
};

/** Lowercase + remove acentos; preserva o ponto (ex.: "comprador.endereço" -> "comprador.endereco"). */
function normalizeKey(token: string): string {
  return token
    .normalize("NFD")
    .replace(new RegExp("[\u0300-\u036f]", "g"), "")
    .trim()
    .toLowerCase();
}

function formatBRL(value?: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Formata data BR. Strings date-only (YYYY-MM-DD) sao lidas pelos componentes
 * diretos para evitar o shift de fuso (Date trata como UTC e o dia rola).
 * Ver gotcha em CLAUDE.md / lib/domain/string-transform.ts.
 */
function formatDateBR(iso?: string | null): string | null {
  if (!iso) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const d = new Date(time);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function hojeBR(): string {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Chaves NORMALIZADAS -> extrator. Aliases acento/sem-acento e sinonimos.
const RESOLVERS: Record<string, (ctx: VendaDocContext) => string | null> = {
  placa: (c) => c.placa ?? null,
  modelo: (c) => c.modelo ?? null,
  cor: (c) => c.cor ?? null,
  ano: (c) => {
    const ano = c.anoMod ?? c.anoFab;
    return ano == null ? null : String(ano);
  },
  chassi: (c) => c.chassi ?? null,
  chassis: (c) => c.chassi ?? null,
  renavam: (c) => c.renavam ?? null,

  preco: (c) => formatBRL(c.valorTotal),
  valor_total: (c) => formatBRL(c.valorTotal),
  valor: (c) => formatBRL(c.valorTotal),
  entrada: (c) => formatBRL(c.valorEntrada),
  valor_entrada: (c) => formatBRL(c.valorEntrada),
  parcela: (c) => formatBRL(c.financParcelaValor),
  "financ.parcela": (c) => formatBRL(c.financParcelaValor),
  forma_pagamento: (c) =>
    c.formaPagamento ? FORMA_PAGAMENTO_LABEL[c.formaPagamento] ?? c.formaPagamento : null,
  pagamento: (c) =>
    c.formaPagamento ? FORMA_PAGAMENTO_LABEL[c.formaPagamento] ?? c.formaPagamento : null,

  "comprador.nome": (c) => c.compradorNome ?? null,
  "comprador.documento": (c) => c.compradorDocumento ?? null,
  "comprador.cpf": (c) => c.compradorDocumento ?? null,
  "comprador.cnpj": (c) => c.compradorDocumento ?? null,
  "comprador.telefone": (c) => c.compradorTelefone ?? null,
  "comprador.email": (c) => c.compradorEmail ?? null,
  "comprador.endereco": (c) => c.compradorEndereco ?? null,

  "financ.banco": (c) => c.financBanco ?? null,
  banco: (c) => c.financBanco ?? null,
  "financ.parcelas": (c) => (c.financParcelasQtde == null ? null : String(c.financParcelasQtde)),

  data_venda: (c) => formatDateBR(c.dataVenda),
  data_entrega: (c) => formatDateBR(c.dataEntrega),
  hoje: () => hojeBR(),
  observacao: (c) => c.observacao ?? null,
  vendedor: (c) => c.vendedor ?? null
};

// Bases monetarias que aceitam `.extenso`.
const VALOR_EXTENSO: Record<string, (ctx: VendaDocContext) => number | null | undefined> = {
  preco: (c) => c.valorTotal,
  valor_total: (c) => c.valorTotal,
  valor: (c) => c.valorTotal,
  entrada: (c) => c.valorEntrada,
  valor_entrada: (c) => c.valorEntrada,
  parcela: (c) => c.financParcelaValor,
  "financ.parcela": (c) => c.financParcelaValor
};

/**
 * Resolve um token (sem o wrapper `${}`) contra o contexto.
 * - Dado ausente -> string vazia.
 * - Token desconhecido -> devolve o literal `${token}` (ajuda a achar erros de digitacao).
 */
export function resolveToken(ctx: VendaDocContext, rawToken: string): string {
  const key = normalizeKey(rawToken);

  if (key.endsWith(".extenso")) {
    const base = key.slice(0, -".extenso".length);
    const getter = VALOR_EXTENSO[base];
    if (!getter) return "${" + rawToken + "}";
    const value = getter(ctx);
    if (value == null || !Number.isFinite(value)) return "";
    return `(${valorPorExtenso(value).toUpperCase()})`;
  }

  const resolver = RESOLVERS[key];
  if (!resolver) return "${" + rawToken + "}";
  return resolver(ctx) ?? "";
}

const TOKEN_RE = /\$\{([^}]+)\}/g;

/** Substitui todos os `${...}` num texto plano (usado em previews/print de texto). */
export function resolveTokensInText(ctx: VendaDocContext, text: string): string {
  return text.replace(TOKEN_RE, (_match, token) => resolveToken(ctx, String(token)));
}
