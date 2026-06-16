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
import { buildMensagemVenda } from "@/lib/domain/vendas/calculo";

export type VendaDocEntrada = {
  tipo?: string | null;
  valor?: number | null;
};

export type VendaDocContext = {
  // Veiculo
  placa?: string | null;
  modelo?: string | null;
  /** Codigo oficial do modelo (modelos.codigo_oficial), acoplado via modelo_id. */
  codigoOficial?: string | null;
  cor?: string | null;
  anoFab?: number | null;
  anoMod?: number | null;
  hodometro?: number | null;
  anoIpvaPago?: number | null;
  chassi?: string | null;
  renavam?: string | null;
  // Venda
  valorTotal?: number | null;
  valorEntrada?: number | null;
  desconto?: number | null;
  formaPagamento?: string | null;
  dataVenda?: string | null;
  dataEntrega?: string | null;
  observacao?: string | null;
  debitos?: string | null;
  // Comprador
  compradorNome?: string | null;
  compradorDocumento?: string | null;
  compradorRg?: string | null;
  compradorTelefone?: string | null;
  compradorEmail?: string | null;
  compradorEndereco?: string | null;
  compradorCep?: string | null;
  compradorCidadeEstado?: string | null;
  // Financiamento (consorcio reusa: banco = administradora)
  financBanco?: string | null;
  financValor?: number | null;
  financParcelasQtde?: number | null;
  financParcelaValor?: number | null;
  // Cartao de credito (pagamento principal)
  cartaoParcelasQtde?: number | null;
  cartaoParcelaValor?: number | null;
  // Transferencia
  tipoTransferencia?: string | null;
  valorTransferencia?: number | null;
  // Entradas (venda_entradas)
  entradas?: VendaDocEntrada[] | null;
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
  { grupo: "Veículo", token: "codigo_oficial", label: "Código oficial do modelo" },
  { grupo: "Veículo", token: "cor", label: "Cor" },
  { grupo: "Veículo", token: "ano", label: "Ano" },
  { grupo: "Veículo", token: "km", label: "KM" },
  { grupo: "Veículo", token: "ipva", label: "IPVA (PAGO se do ano)" },
  { grupo: "Veículo", token: "chassi", label: "Chassi" },
  { grupo: "Veículo", token: "renavam", label: "Renavam" },
  { grupo: "Valores", token: "preço", label: "Preço (R$)" },
  { grupo: "Valores", token: "preço.extenso", label: "Preço por extenso" },
  { grupo: "Valores", token: "desconto", label: "Desconto (R$)" },
  { grupo: "Valores", token: "entrada", label: "Entrada total (R$)" },
  { grupo: "Valores", token: "entrada.extenso", label: "Entrada por extenso" },
  { grupo: "Valores", token: "entrada.detalhe", label: "Entradas detalhadas" },
  { grupo: "Valores", token: "parcela", label: "Parcela (R$)" },
  { grupo: "Valores", token: "parcela.extenso", label: "Parcela por extenso" },
  { grupo: "Valores", token: "forma_pagamento", label: "Forma de pagamento" },
  { grupo: "Comprador", token: "comprador.nome", label: "Nome" },
  { grupo: "Comprador", token: "comprador.cpf", label: "CPF/CNPJ" },
  { grupo: "Comprador", token: "comprador.rg", label: "RG" },
  { grupo: "Comprador", token: "comprador.telefone", label: "Telefone" },
  { grupo: "Comprador", token: "comprador.email", label: "E-mail" },
  { grupo: "Comprador", token: "comprador.endereço", label: "Endereço" },
  { grupo: "Comprador", token: "comprador.cep", label: "CEP" },
  { grupo: "Comprador", token: "comprador.cidade_estado", label: "Cidade - Estado" },
  { grupo: "Veículo", token: "debitos", label: "Débitos do veículo" },
  { grupo: "Financiamento", token: "financ.banco", label: "Banco" },
  { grupo: "Financiamento", token: "financ.valor", label: "Valor financiado (R$)" },
  { grupo: "Financiamento", token: "financ.parcelas", label: "Qtde parcelas" },
  { grupo: "Cartão", token: "cartao.parcelas", label: "Qtde parcelas cartão" },
  { grupo: "Cartão", token: "cartao.parcela", label: "Parcela cartão (R$)" },
  { grupo: "Transferência", token: "transferencia.tipo", label: "Quem transfere" },
  { grupo: "Transferência", token: "transferencia.valor", label: "Valor transferência (R$)" },
  { grupo: "Datas", token: "data_venda", label: "Data da venda" },
  { grupo: "Datas", token: "data_entrega", label: "Data de entrega" },
  { grupo: "Datas", token: "hoje", label: "Data de hoje" },
  { grupo: "Pessoas", token: "vendedor", label: "Vendedor" },
  { grupo: "Outros", token: "mensagem.venda", label: "Mensagem da venda" },
  { grupo: "Outros", token: "observação", label: "Observação" }
];

const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  // Vendas 2.0
  financiamento: "financiamento",
  a_vista_pix: "à vista no PIX",
  cartao_credito: "cartão de crédito",
  consorcio: "consórcio",
  // Codes legados (vendas anteriores ao remap mantem render correto)
  a_vista: "à vista",
  financiado: "financiado",
  parcelado: "parcelado",
  misto: "misto"
};

const TRANSFERENCIA_LABEL: Record<string, string> = {
  loja: "pela loja",
  financiamento: "pelo financiamento",
  cliente: "pelo cliente"
};

const ENTRADA_TIPO_LABEL: Record<string, string> = {
  pix: "PIX",
  cartao_credito: "cartão de crédito",
  carro_troca: "carro na troca",
  outro: "outra"
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

const MESES_EXTENSO = [
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

/** Data por extenso no padrao de documento: "13 de junho de 2026". */
function formatDataExtenso(dia: number, mes1a12: number, ano: number): string | null {
  const mes = MESES_EXTENSO[mes1a12 - 1];
  if (!mes) return null;
  return `${dia} de ${mes} de ${ano}`;
}

/**
 * Formata data BR no padrao de documento ("XX de mes por extenso de XXXX").
 * Strings date-only (YYYY-MM-DD) sao lidas pelos componentes diretos para
 * evitar o shift de fuso (Date trata como UTC e o dia rola). Ver gotcha em
 * CLAUDE.md / lib/domain/string-transform.ts.
 */
function formatDateBR(iso?: string | null): string | null {
  if (!iso) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (dateOnly) return formatDataExtenso(Number(dateOnly[3]), Number(dateOnly[2]), Number(dateOnly[1]));
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const d = new Date(time);
  return formatDataExtenso(d.getDate(), d.getMonth() + 1, d.getFullYear());
}

function hojeBR(): string {
  const d = new Date();
  return formatDataExtenso(d.getDate(), d.getMonth() + 1, d.getFullYear()) ?? "";
}

// Chaves NORMALIZADAS -> extrator. Aliases acento/sem-acento e sinonimos.
const RESOLVERS: Record<string, (ctx: VendaDocContext) => string | null> = {
  placa: (c) => c.placa ?? null,
  modelo: (c) => c.modelo ?? null,
  codigo_oficial: (c) => c.codigoOficial ?? null,
  "modelo.codigo": (c) => c.codigoOficial ?? null,
  cor: (c) => c.cor ?? null,
  ano: (c) => {
    const ano = c.anoMod ?? c.anoFab;
    return ano == null ? null : String(ano);
  },
  km: (c) =>
    c.hodometro == null || !Number.isFinite(c.hodometro)
      ? null
      : new Intl.NumberFormat("pt-BR").format(c.hodometro),
  hodometro: (c) =>
    c.hodometro == null || !Number.isFinite(c.hodometro)
      ? null
      : new Intl.NumberFormat("pt-BR").format(c.hodometro),
  ipva: (c) =>
    c.anoIpvaPago != null && c.anoIpvaPago === new Date().getFullYear() ? "IPVA PAGO" : "",
  chassi: (c) => c.chassi ?? null,
  chassis: (c) => c.chassi ?? null,
  renavam: (c) => c.renavam ?? null,

  preco: (c) => formatBRL(c.valorTotal),
  valor_total: (c) => formatBRL(c.valorTotal),
  valor: (c) => formatBRL(c.valorTotal),
  desconto: (c) => formatBRL(c.desconto),
  entrada: (c) => formatBRL(c.valorEntrada),
  valor_entrada: (c) => formatBRL(c.valorEntrada),
  "entrada.total": (c) => formatBRL(c.valorEntrada),
  "entrada.detalhe": (c) => {
    const entradas = (c.entradas ?? []).filter((e) => e.valor != null && e.valor > 0);
    if (entradas.length === 0) return null;
    return entradas
      .map((e) => {
        const label = ENTRADA_TIPO_LABEL[e.tipo ?? ""] ?? e.tipo ?? "entrada";
        const valor = formatBRL(e.valor);
        return valor ? `${label} ${valor}` : label;
      })
      .join(" + ");
  },
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
  "comprador.rg": (c) => c.compradorRg ?? null,
  "comprador.telefone": (c) => c.compradorTelefone ?? null,
  "comprador.email": (c) => c.compradorEmail ?? null,
  "comprador.endereco": (c) => c.compradorEndereco ?? null,
  "comprador.cep": (c) => c.compradorCep ?? null,
  "comprador.cidade_estado": (c) => c.compradorCidadeEstado ?? null,
  "comprador.cidade": (c) => c.compradorCidadeEstado ?? null,
  debitos: (c) => c.debitos ?? null,

  "financ.banco": (c) => c.financBanco ?? null,
  banco: (c) => c.financBanco ?? null,
  "financ.valor": (c) => formatBRL(c.financValor),
  financiado: (c) => formatBRL(c.financValor),
  "financ.parcelas": (c) => (c.financParcelasQtde == null ? null : String(c.financParcelasQtde)),

  "cartao.parcelas": (c) => (c.cartaoParcelasQtde == null ? null : String(c.cartaoParcelasQtde)),
  "cartao.parcela": (c) => formatBRL(c.cartaoParcelaValor),

  "transferencia.tipo": (c) =>
    c.tipoTransferencia ? TRANSFERENCIA_LABEL[c.tipoTransferencia] ?? c.tipoTransferencia : null,
  transferencia: (c) =>
    c.tipoTransferencia ? TRANSFERENCIA_LABEL[c.tipoTransferencia] ?? c.tipoTransferencia : null,
  "transferencia.valor": (c) => formatBRL(c.valorTransferencia),

  data_venda: (c) => formatDateBR(c.dataVenda),
  data_entrega: (c) => formatDateBR(c.dataEntrega),
  hoje: () => hojeBR(),
  observacao: (c) => c.observacao ?? null,
  vendedor: (c) => c.vendedor ?? null,

  "mensagem.venda": (c) =>
    buildMensagemVenda({
      carro: {
        modelo: c.modelo,
        placa: c.placa,
        cor: c.cor,
        anoFab: c.anoFab,
        anoMod: c.anoMod,
        hodometro: c.hodometro,
        anoIpvaPago: c.anoIpvaPago
      },
      venda: {
        valorTotal: c.valorTotal,
        desconto: c.desconto,
        formaPagamento: c.formaPagamento,
        financValor: c.financValor,
        financBanco: c.financBanco,
        financParcelasQtde: c.financParcelasQtde,
        financParcelaValor: c.financParcelaValor,
        cartaoParcelasQtde: c.cartaoParcelasQtde,
        cartaoParcelaValor: c.cartaoParcelaValor,
        tipoTransferencia: c.tipoTransferencia
      },
      entradas: c.entradas ?? []
    })
};

// Bases monetarias que aceitam `.extenso`.
const VALOR_EXTENSO: Record<string, (ctx: VendaDocContext) => number | null | undefined> = {
  preco: (c) => c.valorTotal,
  valor_total: (c) => c.valorTotal,
  valor: (c) => c.valorTotal,
  desconto: (c) => c.desconto,
  entrada: (c) => c.valorEntrada,
  valor_entrada: (c) => c.valorEntrada,
  "entrada.total": (c) => c.valorEntrada,
  parcela: (c) => c.financParcelaValor,
  "financ.parcela": (c) => c.financParcelaValor,
  "financ.valor": (c) => c.financValor,
  financiado: (c) => c.financValor,
  "cartao.parcela": (c) => c.cartaoParcelaValor,
  "transferencia.valor": (c) => c.valorTransferencia
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
