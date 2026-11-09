/**
 * lib/domain/venda-documentos/variables.ts
 *
 * Indexador de variaveis do editor Word (/vendedor/word). Tokens `${...}` num
 * documento sao resolvidos contra o processo de venda (venda + carro + pessoas).
 *
 * - `${placa}`, `${comprador.nome}`, `${preco}` ... -> dado do processo.
 * - `${preco.extenso}` -> quantia por extenso, CAIXA ALTA entre parenteses, ex.:
 *   "(QUARENTA E CINCO MIL REAIS)". Funciona em campos monetarios.
 * - Clausulas prontas (`${pagamento}`, `${transferencia.clausula}`, `${troca}`,
 *   `${garantia}`...) montam o texto conforme a venda (clausulas.ts) — um
 *   template serve para a vista, financiado, troca, cartao...
 *
 * Funcao pura (a camada de service monta o `VendaDocContext`). Aceita tokens com
 * ou sem acento. Testado em `__tests__/variables.test.ts`.
 */
import { valorPorExtenso } from "@/lib/domain/numero-extenso";
import { buildMensagemVenda } from "@/lib/domain/vendas/calculo";
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import {
  clausulaGarantia,
  clausulaIpva,
  clausulaPagamento,
  clausulaTransferencia,
  clausulaTroca,
  descricaoVeiculoVendido,
  garantiaFim,
  qualificacaoComprador,
  saldoAPagar,
  simNao,
  valorFinal
} from "@/lib/domain/venda-documentos/clausulas";
import { formatBRL, formatDataExtenso, formatKm, hojeExtenso } from "@/lib/domain/venda-documentos/formato";

export type { VendaDocContext, VendaDocEntrada, VendaDocTroca } from "@/lib/domain/venda-documentos/contexto";

export type VariavelInfo = {
  grupo: string;
  token: string;
  label: string;
  /** Explicacao curta (tooltip) — usada nas clausulas prontas. */
  dica?: string;
};

/** Catalogo de chips clicaveis exibidos no editor (token na forma acentuada). */
export const VARIAVEIS_DISPONIVEIS: VariavelInfo[] = [
  {
    grupo: "Cláusulas prontas",
    token: "pagamento",
    label: "Forma de pagamento (completa)",
    dica: "Monta a frase conforme a venda: à vista, entrada, troca, financiamento, cartão ou consórcio."
  },
  {
    grupo: "Cláusulas prontas",
    token: "transferencia.clausula",
    label: "Transferência (frase)",
    dica: "Quem transfere o veículo (loja, financiadora ou comprador) e o valor, quando houver."
  },
  { grupo: "Cláusulas prontas", token: "ipva", label: "IPVA do ano (se pago)", dica: "\"IPVA 2026 PAGO\" quando o cadastro do veículo registra; senão fica vazio." },
  {
    grupo: "Cláusulas prontas",
    token: "troca",
    label: "Veículo da troca (frase)",
    dica: "Dados completos do veículo recebido na troca e o valor; vazio sem troca."
  },
  { grupo: "Cláusulas prontas", token: "garantia", label: "Garantia legal (frase)", dica: "90 dias contados da entrega (CDC, art. 26, II)." },
  {
    grupo: "Cláusulas prontas",
    token: "comprador.qualificacao",
    label: "Qualificação do comprador",
    dica: "Nome, CPF/CNPJ, RG, endereço, CEP e telefone numa linha."
  },
  {
    grupo: "Cláusulas prontas",
    token: "veiculo.descricao",
    label: "Descrição do veículo",
    dica: "Modelo, placa, ano, cor, chassi, renavam e KM numa linha."
  },
  { grupo: "Comprador", token: "comprador.nome", label: "Nome" },
  { grupo: "Comprador", token: "comprador.cpf", label: "CPF/CNPJ" },
  { grupo: "Comprador", token: "comprador.rg", label: "RG" },
  { grupo: "Comprador", token: "comprador.telefone", label: "Telefone" },
  { grupo: "Comprador", token: "comprador.email", label: "E-mail" },
  { grupo: "Comprador", token: "comprador.endereço", label: "Endereço" },
  { grupo: "Comprador", token: "comprador.cep", label: "CEP" },
  { grupo: "Comprador", token: "comprador.cidade_estado", label: "Cidade - Estado" },
  { grupo: "Veículo", token: "placa", label: "Placa" },
  { grupo: "Veículo", token: "modelo", label: "Modelo" },
  { grupo: "Veículo", token: "codigo_oficial", label: "Código oficial do modelo" },
  { grupo: "Veículo", token: "cor", label: "Cor" },
  { grupo: "Veículo", token: "ano", label: "Ano" },
  { grupo: "Veículo", token: "ano_fab", label: "Ano de fabricação" },
  { grupo: "Veículo", token: "km", label: "KM" },
  { grupo: "Veículo", token: "chassi", label: "Chassi" },
  { grupo: "Veículo", token: "renavam", label: "Renavam" },
  { grupo: "Veículo", token: "debitos", label: "Débitos do veículo" },
  { grupo: "Veículo", token: "veiculo.chave_reserva", label: "Chave reserva (sim/não)" },
  { grupo: "Veículo", token: "veiculo.manual", label: "Manual (sim/não)" },
  { grupo: "Valores", token: "valor_final", label: "Valor final (com desconto)" },
  { grupo: "Valores", token: "valor_final.extenso", label: "Valor final por extenso" },
  { grupo: "Valores", token: "preço", label: "Valor da venda (R$)" },
  { grupo: "Valores", token: "preço.extenso", label: "Valor da venda por extenso" },
  { grupo: "Valores", token: "desconto", label: "Desconto (R$)" },
  { grupo: "Valores", token: "entrada", label: "Entrada total (R$)" },
  { grupo: "Valores", token: "entrada.extenso", label: "Entrada por extenso" },
  { grupo: "Valores", token: "entrada.detalhe", label: "Entradas detalhadas" },
  { grupo: "Valores", token: "saldo", label: "Saldo após a entrada (R$)" },
  { grupo: "Valores", token: "saldo.extenso", label: "Saldo por extenso" },
  { grupo: "Valores", token: "forma_pagamento", label: "Forma de pagamento (nome)" },
  { grupo: "Financiamento e cartão", token: "financ.banco", label: "Banco / administradora" },
  { grupo: "Financiamento e cartão", token: "financ.valor", label: "Valor financiado (R$)" },
  { grupo: "Financiamento e cartão", token: "financ.parcelas", label: "Qtde parcelas" },
  { grupo: "Financiamento e cartão", token: "parcela", label: "Parcela (R$)" },
  { grupo: "Financiamento e cartão", token: "parcela.extenso", label: "Parcela por extenso" },
  { grupo: "Financiamento e cartão", token: "cartao.parcelas", label: "Qtde parcelas cartão" },
  { grupo: "Financiamento e cartão", token: "cartao.parcela", label: "Parcela cartão (R$)" },
  { grupo: "Transferência", token: "transferencia.tipo", label: "Quem transfere" },
  { grupo: "Transferência", token: "transferencia.valor", label: "Valor transferência (R$)" },
  { grupo: "Datas", token: "data_venda", label: "Data da venda" },
  { grupo: "Datas", token: "data_entrega", label: "Data de entrega" },
  { grupo: "Datas", token: "garantia.fim", label: "Fim da garantia (entrega + 90 dias)" },
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
    .replace(new RegExp("[̀-ͯ]", "g"), "")
    .trim()
    .toLowerCase();
}

const formaPagamento = (c: VendaDocContext) =>
  c.formaPagamento ? FORMA_PAGAMENTO_LABEL[c.formaPagamento] ?? c.formaPagamento : null;
const transferencia = (c: VendaDocContext) =>
  c.tipoTransferencia ? TRANSFERENCIA_LABEL[c.tipoTransferencia] ?? c.tipoTransferencia : null;
const km = (c: VendaDocContext) => formatKm(c.hodometro);

// Chaves NORMALIZADAS -> extrator. Aliases acento/sem-acento e sinonimos.
const RESOLVERS: Record<string, (ctx: VendaDocContext) => string | null> = {
  // Clausulas prontas
  pagamento: (c) => clausulaPagamento(c),
  "pagamento.clausula": (c) => clausulaPagamento(c),
  "transferencia.clausula": (c) => clausulaTransferencia(c),
  ipva: (c) => clausulaIpva(c),
  troca: (c) => clausulaTroca(c),
  garantia: (c) => clausulaGarantia(c),
  "comprador.qualificacao": (c) => qualificacaoComprador(c),
  "veiculo.descricao": (c) => descricaoVeiculoVendido(c),

  placa: (c) => c.placa ?? null,
  modelo: (c) => c.modelo ?? null,
  codigo_oficial: (c) => c.codigoOficial ?? null,
  "modelo.codigo": (c) => c.codigoOficial ?? null,
  cor: (c) => c.cor ?? null,
  ano: (c) => {
    const ano = c.anoMod ?? c.anoFab;
    return ano == null ? null : String(ano);
  },
  ano_fab: (c) => (c.anoFab == null ? null : String(c.anoFab)),
  ano_mod: (c) => (c.anoMod == null ? null : String(c.anoMod)),
  km,
  hodometro: km,
  chassi: (c) => c.chassi ?? null,
  chassis: (c) => c.chassi ?? null,
  renavam: (c) => c.renavam ?? null,
  "veiculo.chave_reserva": (c) => simNao(c.temChaveReserva),
  "veiculo.manual": (c) => simNao(c.temManual),

  preco: (c) => formatBRL(c.valorTotal),
  valor_total: (c) => formatBRL(c.valorTotal),
  valor: (c) => formatBRL(c.valorTotal),
  valor_final: (c) => formatBRL(valorFinal(c)),
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
  saldo: (c) => formatBRL(saldoAPagar(c)),
  parcela: (c) => formatBRL(c.financParcelaValor),
  "financ.parcela": (c) => formatBRL(c.financParcelaValor),
  forma_pagamento: formaPagamento,

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

  "transferencia.tipo": transferencia,
  transferencia,
  "transferencia.valor": (c) => formatBRL(c.valorTransferencia),

  data_venda: (c) => formatDataExtenso(c.dataVenda),
  data_entrega: (c) => formatDataExtenso(c.dataEntrega),
  "entrega.data": (c) => formatDataExtenso(c.dataEntrega),
  "garantia.fim": (c) => formatDataExtenso(garantiaFim(c)),
  hoje: () => hojeExtenso(),
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
  valor_final: (c) => valorFinal(c),
  desconto: (c) => c.desconto,
  entrada: (c) => c.valorEntrada,
  valor_entrada: (c) => c.valorEntrada,
  "entrada.total": (c) => c.valorEntrada,
  saldo: (c) => saldoAPagar(c),
  parcela: (c) => c.financParcelaValor,
  "financ.parcela": (c) => c.financParcelaValor,
  "financ.valor": (c) => c.financValor,
  financiado: (c) => c.financValor,
  "cartao.parcela": (c) => c.cartaoParcelaValor,
  "transferencia.valor": (c) => c.valorTransferencia
};

/** Token conhecido pelo indexador (com ou sem `.extenso`)? */
export function isTokenConhecido(rawToken: string): boolean {
  const key = normalizeKey(rawToken);
  if (key.endsWith(".extenso")) return Boolean(VALOR_EXTENSO[key.slice(0, -".extenso".length)]);
  return Boolean(RESOLVERS[key]);
}

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
