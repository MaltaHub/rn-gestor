/**
 * Contexto de um processo de venda para os documentos Word: tudo o que as
 * variáveis `${...}`, as cláusulas prontas e as seções condicionais podem ler.
 * Montado no servidor (`buildVendaDocContext`) a partir de venda + carro +
 * entradas (com o carro da troca) + vendedor.
 */

export type VendaDocTroca = {
  placa?: string | null;
  modelo?: string | null;
  cor?: string | null;
  anoFab?: number | null;
  anoMod?: number | null;
  hodometro?: number | null;
  chassi?: string | null;
  renavam?: string | null;
};

export type VendaDocEntrada = {
  tipo?: string | null;
  valor?: number | null;
  descricao?: string | null;
  cartaoParcelasQtde?: number | null;
  cartaoParcelaValor?: number | null;
  /** Carro recebido na troca (entrada tipo carro_troca). */
  troca?: VendaDocTroca | null;
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
  temChaveReserva?: boolean | null;
  temManual?: boolean | null;
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
