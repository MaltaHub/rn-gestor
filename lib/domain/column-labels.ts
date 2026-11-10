/**
 * Nome legível de uma coluna do banco para forms, OCR e listas. Um mapa só para
 * o app inteiro: o form e o OCR mostram o mesmo nome para o mesmo campo.
 */
const COLUMN_LABELS: Record<string, string> = {
  placa: "Placa",
  chassi: "Chassi",
  renavam: "Renavam",
  ano_fab: "Ano de fabricação",
  ano_mod: "Ano do modelo",
  ano_ipva_pago: "Ano do IPVA pago",
  hodometro: "Hodômetro (km)",
  cor: "Cor",
  nome: "Nome",
  local: "Local",
  estado_venda: "Estado de venda",
  estado_veiculo: "Estado do veículo",
  estado_anuncio: "Estado do anúncio",
  crv: "CRV (número)",
  crv_codigo_seguranca: "Código de segurança do CRV",
  codigo_nota_fiscal: "Código da nota fiscal",
  estado_transferencia: "Situação do CRLV",
  responsavel_virado_id: "Titular do CRLV virado",
  cpf_cnpj: "CPF/CNPJ",
  contato: "Contato",
  valor_compra: "Valor de compra",
  preco_original: "Preço original",
  valor_anuncio: "Valor do anúncio",
  data_entrada: "Data de entrada",
  data_venda: "Data da venda",
  observacao: "Observação",
  numero: "Número",
  serie: "Série",
  chave_acesso: "Chave de acesso (44 dígitos)",
  data_emissao: "Data de emissão",
  valor: "Valor",
  autorizada: "Autorizada",
  data_pericia: "Data da perícia",
  status: "Status",
  modelo_id: "Modelo",
  modelo: "Modelo",
  carro_id: "Veículo",
  remetente_id: "Fornecedor",
  em_estoque: "Em estoque",
  participa_calculos: "Participa dos cálculos",
  proposito: "Propósito (venda/repasse)",
  tem_fotos: "Fotos",
  tem_chave_r: "Chave reserva",
  tem_manual: "Manual",
  descricao: "Descrição",
  created_at: "Criado em",
  updated_at: "Atualizado em"
};

const WORD_ACCENTS: Record<string, string> = {
  descricao: "descrição",
  observacao: "observação",
  numero: "número",
  codigo: "código",
  preco: "preço",
  veiculo: "veículo",
  anuncio: "anúncio",
  situacao: "situação",
  endereco: "endereço",
  responsavel: "responsável",
  pericia: "perícia",
  emissao: "emissão",
  calculos: "cálculos",
  caracteristica: "característica",
  caracteristicas: "características",
  tecnica: "técnica",
  tecnicas: "técnicas",
  usuario: "usuário",
  hodometro: "hodômetro"
};

export function humanizeColumn(column: string) {
  const known = COLUMN_LABELS[column];
  if (known) return known;
  // FK: "marca_id" vira "Marca".
  const base = column.endsWith("_id") && column.length > 3 ? column.slice(0, -3) : column;
  const text = base
    .split("_")
    .filter(Boolean)
    .map((word) => WORD_ACCENTS[word] ?? word)
    .join(" ")
    .trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : column;
}
