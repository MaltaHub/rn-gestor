/**
 * Vendas de EXEMPLO para "Simular venda" no editor de templates: o autor vê o
 * mesmo template se ajustar à vista, financiado com entrada, troca, cartão e
 * consórcio — sem precisar de uma venda real. Dados fictícios.
 */
import type { VendaDocContext } from "@/lib/domain/venda-documentos/contexto";
import { hojeIso } from "@/lib/domain/vendas/situacao";

export type AmostraVenda = { key: string; label: string; contexto: VendaDocContext };

function base(now: Date): VendaDocContext {
  const hoje = hojeIso(now);
  return {
    placa: "ABC1D23",
    modelo: "ONIX 1.0 LT",
    cor: "PRATA",
    anoFab: 2020,
    anoMod: 2021,
    hodometro: 45210,
    anoIpvaPago: now.getFullYear(),
    chassi: "9BGKS48U0LG123456",
    renavam: "01234567890",
    temChaveReserva: true,
    temManual: true,
    valorTotal: 65000,
    desconto: null,
    dataVenda: hoje,
    dataEntrega: hoje,
    compradorNome: "Maria da Silva",
    compradorDocumento: "123.456.789-09",
    compradorRg: "12.345.678-9",
    compradorTelefone: "(13) 99999-0000",
    compradorEmail: "maria@email.com",
    compradorEndereco: "Rua das Flores, 100, Centro",
    compradorCep: "11700-000",
    compradorCidadeEstado: "Praia Grande - SP",
    tipoTransferencia: "loja",
    valorTransferencia: 990,
    entradas: [],
    vendedor: "Vendedor da loja"
  };
}

export function amostrasVenda(now: Date = new Date()): AmostraVenda[] {
  const b = base(now);
  return [
    { key: "a_vista", label: "À vista no PIX", contexto: { ...b, formaPagamento: "a_vista_pix" } },
    {
      key: "financiado_entrada",
      label: "Financiado com entrada",
      contexto: {
        ...b,
        formaPagamento: "financiamento",
        valorEntrada: 10000,
        entradas: [{ tipo: "pix", valor: 10000 }],
        financBanco: "Santander",
        financValor: 55000,
        financParcelasQtde: 48,
        financParcelaValor: 1650
      }
    },
    {
      key: "troca_financiado",
      label: "Troca + financiamento (IPVA em aberto)",
      contexto: {
        ...b,
        formaPagamento: "financiamento",
        valorEntrada: 30000,
        anoIpvaPago: null,
        debitos: `IPVA ${now.getFullYear()} em aberto, por conta do comprador`,
        debitosValor: 1850,
        tipoTransferencia: "financiamento",
        valorTransferencia: null,
        entradas: [
          {
            tipo: "carro_troca",
            valor: 20000,
            troca: { modelo: "GOL 1.0", placa: "XYZ9A87", anoFab: 2014, anoMod: 2015, cor: "BRANCO", chassi: "9BWAA05U0FP000001", renavam: "00998877665" },
            debitos: "2 multas de trânsito",
            debitosValor: 390.5
          },
          { tipo: "pix", valor: 10000 }
        ],
        financBanco: "Itaú",
        financValor: 35000,
        financParcelasQtde: 48,
        financParcelaValor: 1050
      }
    },
    {
      key: "cartao",
      label: "Cartão de crédito",
      contexto: { ...b, formaPagamento: "cartao_credito", cartaoParcelasQtde: 12, cartaoParcelaValor: 5800, tipoTransferencia: "cliente" }
    },
    {
      key: "consorcio",
      label: "Consórcio com entrada",
      contexto: {
        ...b,
        formaPagamento: "consorcio",
        valorEntrada: 5000,
        desconto: 1000,
        entradas: [{ tipo: "pix", valor: 5000 }],
        financBanco: "Porto Seguro Consórcios"
      }
    }
  ];
}
