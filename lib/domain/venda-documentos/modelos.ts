/**
 * Modelos EMBUTIDOS dos documentos da venda — um por categoria, com as
 * cláusulas prontas e as seções condicionais. Servem quando a loja ainda não
 * tem template próprio da categoria (e de base para "Personalizar", que copia
 * o modelo para um template editável).
 *
 * São um ponto de partida curado (ver docs/processo-documental.md, "Documentos
 * da venda"): revise o texto com o jurídico/contador da loja ao personalizar.
 * O cabeçalho reaproveita o do recibo da loja (logo + telefones).
 */
import type { CategoriaDocumento } from "@/lib/domain/venda-documentos/categorias";

/** Nó do documento (mesmo formato JSON do Tiptap, sem depender do editor). */
export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

export type ModeloDocumento = {
  /** "modelo:<chave>" — distingue dos templates do banco (uuid). */
  id: string;
  categoria: CategoriaDocumento;
  titulo: string;
  descricao: string;
  /** Modelo feito para venda COM veículo na troca (escolhido sozinho nesse caso). */
  paraTroca: boolean;
  conteudo: DocNode;
};

export const LOJA_NOME = "ROBERTO AUTOMÓVEIS";
const LOJA_TELEFONES = "Telefone: (13) 3474-4560 / Loja 1 - (13) 3591-8798 / Loja 2 - (13) 97412-7848";

const ARIAL = { type: "textStyle", attrs: { fontFamily: "Arial" } };
const BOLD = { type: "bold" };

const t = (text: string): DocNode => ({ type: "text", text, marks: [ARIAL] });
const b = (text: string): DocNode => ({ type: "text", text, marks: [ARIAL, BOLD] });
const v = (token: string, bold = false): DocNode => ({
  type: "variable",
  attrs: { token },
  marks: bold ? [ARIAL, BOLD] : [ARIAL]
});

type Align = "left" | "center" | "right" | "justify";
const p = (align: Align, ...content: DocNode[]): DocNode => ({ type: "paragraph", attrs: { textAlign: align }, content });
const vazio = (): DocNode => ({ type: "paragraph" });
const secao = (text: string): DocNode => p("center", b(text));
/** "RÓTULO: ${token}" lado a lado, separados por " | ". */
const campos = (...pares: Array<[string, string]>): DocNode =>
  p(
    "left",
    ...pares.flatMap(([label, token], index) => [...(index > 0 ? [t(" | ")] : []), b(`${label}: `), v(token)])
  );
const condicional = (condicao: string, ...content: DocNode[]): DocNode => ({
  type: "conditionalBlock",
  attrs: { condicao },
  content
});

function titulo(text: string): DocNode {
  return {
    type: "heading",
    attrs: { level: 1, textAlign: "center" },
    content: [{ type: "text", text, marks: [{ type: "textStyle", attrs: { fontFamily: "Arial", fontSize: "18pt" } }, { type: "underline" }] }]
  };
}

function cabecalho(): DocNode[] {
  return [
    vazio(),
    { type: "image", attrs: { src: "/logo.png", width: "740.812px", floating: true, locked: true, left: 0, top: -38.3 } },
    vazio(),
    vazio(),
    vazio(),
    {
      type: "paragraph",
      attrs: { textAlign: "center" },
      content: [{ type: "text", text: LOJA_TELEFONES, marks: [{ type: "textStyle", attrs: { fontFamily: "Arial", fontSize: "14pt" } }, BOLD] }]
    }
  ];
}

function assinatura(...rotulo: DocNode[]): DocNode {
  return { type: "signatureLine", attrs: { floating: false, locked: false, left: 0, top: 0 }, content: rotulo };
}

function assinaturas(esquerda: DocNode[], direita: DocNode[]): DocNode {
  return {
    type: "columnBlock",
    content: [
      { type: "column", content: [vazio(), assinatura(...esquerda), vazio()] },
      { type: "column", content: [vazio(), assinatura(...direita), vazio()] }
    ]
  };
}

const LOJA_E_COMPRADOR = () => assinaturas([t(LOJA_NOME)], [v("comprador.nome")]);
const dataDoDocumento = () => p("right", v("hoje"));
const doc = (...content: DocNode[]): DocNode => ({ type: "doc", attrs: { pageMargin: "normal" }, content });

function reciboSinal(): DocNode {
  return doc(
    ...cabecalho(),
    titulo("RECIBO DE SINAL"),
    p(
      "justify",
      t("Recebemos de "),
      v("comprador.qualificacao", true),
      t(" a importância de "),
      v("entrada", true),
      t(" "),
      v("entrada.extenso"),
      t(", a título de sinal e princípio de pagamento, para a reserva do veículo abaixo.")
    ),
    p("left", b("VEÍCULO: "), v("veiculo.descricao")),
    p("left", b("VALOR NEGOCIADO: "), v("valor_final"), t(" "), v("valor_final.extenso")),
    secao("CONDIÇÕES DE PAGAMENTO"),
    p("justify", v("pagamento")),
    p(
      "justify",
      t(
        "O sinal será abatido do valor total na conclusão da compra. Se o comprador desistir do negócio, o sinal fica retido pela loja; se a desistência for da loja, o sinal será devolvido em dobro (Código Civil, arts. 417 a 420)."
      )
    ),
    dataDoDocumento(),
    LOJA_E_COMPRADOR()
  );
}

function reciboVenda(): DocNode {
  return doc(
    ...cabecalho(),
    titulo("RECIBO DE VENDA"),
    campos(["NOME", "comprador.nome"]),
    campos(["CPF", "comprador.cpf"], ["RG", "comprador.rg"]),
    campos(["ENDEREÇO", "comprador.endereço"], ["TELEFONE", "comprador.telefone"]),
    campos(["CIDADE", "comprador.cidade_estado"], ["CEP", "comprador.cep"]),
    secao("VEÍCULO ADQUIRIDO"),
    campos(["MODELO", "modelo"], ["RENAVAM", "renavam"]),
    campos(["ANO/MOD", "ano"], ["COR", "cor"]),
    campos(["PLACA", "placa"], ["CHASSI", "chassi"]),
    p("left", b("VALOR: "), v("valor_final"), t(" "), v("valor_final.extenso")),
    secao("FORMA DE PAGAMENTO"),
    p("justify", v("pagamento")),
    condicional("tem_troca", p("justify", v("troca"))),
    p("justify", v("transferencia.clausula")),
    condicional("ipva_pago", p("left", v("ipva", true))),
    condicional("tem_debitos", p("left", b("DÉBITOS: "), v("debitos"))),
    dataDoDocumento(),
    LOJA_E_COMPRADOR()
  );
}

/** Recibo para venda com veículo na troca: o carro recebido em bloco próprio, com a declaração do dono. */
function reciboVendaComTroca(): DocNode {
  return doc(
    ...cabecalho(),
    titulo("RECIBO DE VENDA COM TROCA"),
    campos(["NOME", "comprador.nome"]),
    campos(["CPF", "comprador.cpf"], ["RG", "comprador.rg"]),
    campos(["ENDEREÇO", "comprador.endereço"], ["TELEFONE", "comprador.telefone"]),
    campos(["CIDADE", "comprador.cidade_estado"], ["CEP", "comprador.cep"]),
    secao("VEÍCULO ADQUIRIDO"),
    campos(["MODELO", "modelo"], ["RENAVAM", "renavam"]),
    campos(["ANO/MOD", "ano"], ["COR", "cor"]),
    campos(["PLACA", "placa"], ["CHASSI", "chassi"]),
    p("left", b("VALOR: "), v("valor_final"), t(" "), v("valor_final.extenso")),
    secao("VEÍCULO RECEBIDO NA TROCA"),
    campos(["MODELO", "troca.modelo"], ["RENAVAM", "troca.renavam"]),
    campos(["ANO/MOD", "troca.ano"], ["COR", "troca.cor"]),
    campos(["PLACA", "troca.placa"], ["CHASSI", "troca.chassi"]),
    campos(["KM", "troca.km"]),
    p("left", b("VALOR DA TROCA: "), v("troca.valor"), t(" "), v("troca.valor.extenso")),
    p(
      "justify",
      t(
        "O(A) COMPRADOR(A) declara que o veículo dado na troca é de sua propriedade, está livre de ônus, alienação fiduciária e restrições, e responde por multas, tributos e débitos com fato gerador até a data da entrega dele à loja."
      )
    ),
    secao("FORMA DE PAGAMENTO"),
    p("justify", v("pagamento")),
    p("justify", v("transferencia.clausula")),
    condicional("ipva_pago", p("left", v("ipva", true))),
    condicional("tem_debitos", p("left", b("DÉBITOS: "), v("debitos"))),
    dataDoDocumento(),
    LOJA_E_COMPRADOR()
  );
}

function contratoVenda(): DocNode {
  return doc(
    ...cabecalho(),
    titulo("CONTRATO DE COMPRA E VENDA DE VEÍCULO"),
    p("justify", b("VENDEDORA: "), t(`${LOJA_NOME}.`)),
    p("justify", b("COMPRADOR(A): "), v("comprador.qualificacao"), t(".")),
    p("justify", t("As partes acima ajustam a compra e venda do veículo usado descrito abaixo, nas seguintes cláusulas:")),
    p("justify", b("1. OBJETO: "), v("veiculo.descricao"), t(".")),
    p("justify", b("2. PREÇO E PAGAMENTO: "), t("preço total de "), v("valor_final"), t(" "), v("valor_final.extenso"), t(". "), v("pagamento")),
    condicional(
      "tem_troca",
      p(
        "justify",
        b("2.1. TROCA: "),
        v("troca"),
        t(
          " O(A) COMPRADOR(A) declara que o veículo dado na troca é de sua propriedade, está livre de ônus e alienação, e responde por multas, tributos e débitos com fato gerador até a data da entrega dele à loja."
        )
      )
    ),
    p(
      "justify",
      b("3. ESTADO DO VEÍCULO: "),
      t("o(a) COMPRADOR(A) declara ter examinado o veículo e recebê-lo no estado em que se encontra, ressalvados os vícios ocultos.")
    ),
    p("justify", b("4. GARANTIA: "), v("garantia")),
    p("justify", b("5. TRANSFERÊNCIA: "), v("transferencia.clausula")),
    p(
      "justify",
      b("6. TRIBUTOS, MULTAS E DÉBITOS: "),
      t(
        "os débitos do veículo (IPVA, licenciamento e multas) com fato gerador anterior à entrega são de responsabilidade da VENDEDORA, ressalvado o que constar abaixo; os posteriores à entrega, do(a) COMPRADOR(A)."
      )
    ),
    condicional("ipva_pago", p("justify", v("ipva"), t("."))),
    condicional("tem_debitos", p("justify", b("Débitos informados: "), v("debitos"))),
    p(
      "justify",
      b("7. ENTREGA: "),
      t(
        "a posse e a responsabilidade civil, criminal e administrativa sobre o veículo passam ao(à) COMPRADOR(A) a partir da data e hora da entrega, registradas no Termo de Entrega."
      )
    ),
    p("justify", b("8. FORO: "), t("fica eleito o foro do domicílio do(a) COMPRADOR(A), nos termos do Código de Defesa do Consumidor.")),
    dataDoDocumento(),
    LOJA_E_COMPRADOR()
  );
}

function termoTroca(): DocNode {
  return doc(
    ...cabecalho(),
    titulo("TERMO DE RECEBIMENTO DE VEÍCULO NA TROCA"),
    p(
      "justify",
      v("comprador.qualificacao", true),
      t(`, doravante PROPRIETÁRIO(A), entrega à ${LOJA_NOME}, como parte do pagamento do veículo `),
      v("veiculo.descricao"),
      t(", o seguinte:")
    ),
    p("justify", v("troca", true)),
    p(
      "justify",
      t(
        "O(A) PROPRIETÁRIO(A) declara que o veículo entregue é de sua propriedade, está livre e desembaraçado de ônus, alienação fiduciária e restrições judiciais ou administrativas, e que responde por multas, tributos e débitos com fato gerador até a data desta entrega, bem como pela procedência do veículo."
      )
    ),
    p(
      "justify",
      t(
        "Compromete-se a assinar a autorização de transferência (ATPV-e) em favor da loja ou de quem ela indicar e a entregar o documento (CRLV), as chaves e o manual do veículo."
      )
    ),
    dataDoDocumento(),
    assinaturas([v("comprador.nome")], [t(LOJA_NOME)])
  );
}

function procuracaoTransferencia(): DocNode {
  return doc(
    titulo("PROCURAÇÃO"),
    p("justify", b("OUTORGANTE: "), v("comprador.qualificacao"), t(".")),
    p("justify", b("OUTORGADA: "), t(`${LOJA_NOME}, por seus representantes e pelos despachantes que indicar.`)),
    p(
      "justify",
      b("PODERES: "),
      t(
        "representar o(a) OUTORGANTE perante o DETRAN e os demais órgãos de trânsito na transferência de propriedade e no registro, em nome do(a) OUTORGANTE, do veículo "
      ),
      v("veiculo.descricao"),
      t(
        ", podendo requerer, assinar requerimentos e declarações, pagar taxas e emolumentos, retirar o CRLV e praticar os demais atos necessários a este fim."
      )
    ),
    dataDoDocumento(),
    vazio(),
    assinatura(v("comprador.nome")),
    p("center", t("(firma reconhecida em cartório quando o órgão exigir)"))
  );
}

function termoEntrega(): DocNode {
  return doc(
    ...cabecalho(),
    titulo("TERMO DE ENTREGA DE VEÍCULO"),
    p(
      "justify",
      t(`A ${LOJA_NOME} entrega a `),
      v("comprador.qualificacao", true),
      t(", que declara receber, o veículo "),
      v("veiculo.descricao"),
      t(".")
    ),
    p("left", b("DATA DA ENTREGA: "), v("data_entrega"), t(" | "), b("HORA: "), t("____:____")),
    p("left", b("QUILOMETRAGEM NA ENTREGA: "), v("km"), t(" km")),
    p("left", b("CHAVE RESERVA: "), v("veiculo.chave_reserva"), t(" | "), b("MANUAL: "), v("veiculo.manual")),
    p(
      "justify",
      t("O(A) COMPRADOR(A) declara ter vistoriado o veículo e recebê-lo em funcionamento e no estado de conservação negociado.")
    ),
    p(
      "justify",
      t(
        "A partir da data e hora desta entrega, o(a) COMPRADOR(A) assume a responsabilidade civil, criminal e administrativa pelo veículo, inclusive por multas e infrações de trânsito, tributos e demais despesas."
      )
    ),
    condicional(
      "transferencia_cliente",
      p(
        "justify",
        t("O(A) COMPRADOR(A) se compromete a transferir o veículo para o seu nome em até 30 (trinta) dias (Código de Trânsito Brasileiro, art. 123).")
      )
    ),
    p("justify", v("garantia")),
    dataDoDocumento(),
    LOJA_E_COMPRADOR()
  );
}

function termoGarantia(): DocNode {
  return doc(
    ...cabecalho(),
    titulo("TERMO DE GARANTIA"),
    p("left", b("VEÍCULO: "), v("veiculo.descricao")),
    p("left", b("COMPRADOR(A): "), v("comprador.qualificacao")),
    p("left", b("ENTREGA: "), v("data_entrega"), t(" | "), b("GARANTIA ATÉ: "), v("garantia.fim")),
    p(
      "justify",
      t(`1. A ${LOJA_NOME} garante o veículo pelo prazo legal de 90 (noventa) dias, contados da entrega (Código de Defesa do Consumidor, art. 26, II).`)
    ),
    p(
      "justify",
      t(
        "2. Constatado defeito dentro do prazo, o(a) COMPRADOR(A) deve comunicar a loja por escrito e apresentar o veículo para avaliação antes de qualquer reparo por terceiros."
      )
    ),
    p(
      "justify",
      t(
        "3. Não caracterizam defeito o desgaste natural de itens de consumo (pneus, freios, embreagem, palhetas, lâmpadas, bateria, óleo e filtros) nem danos causados por mau uso, acidente, falta de manutenção ou alterações feitas por terceiros."
      )
    ),
    p(
      "justify",
      t("4. A loja não responde por reparos feitos por terceiros sem a sua avaliação prévia, salvo recusa ou demora injustificada no atendimento.")
    ),
    dataDoDocumento(),
    LOJA_E_COMPRADOR()
  );
}

function outro(): DocNode {
  return doc(...cabecalho(), titulo("DECLARAÇÃO"), vazio(), dataDoDocumento(), LOJA_E_COMPRADOR());
}

type Fabrica = { chave: string; titulo: string; descricao: string; paraTroca?: boolean; criar: () => DocNode };

// Uma categoria pode ter mais de um modelo do sistema: o Recibo de Venda tem a
// versão COM TROCA, escolhida sozinha quando a venda tem veículo na troca.
const FABRICAS: Record<CategoriaDocumento, Fabrica[]> = {
  recibo_sinal: [{ chave: "recibo_sinal", titulo: "Recibo de Sinal", descricao: "Sinal da reserva, abatido na compra.", criar: reciboSinal }],
  recibo_venda: [
    {
      chave: "recibo_venda",
      titulo: "Recibo de Venda",
      descricao: "Comprador, veículo, valor e a forma de pagamento montada pela venda.",
      criar: reciboVenda
    },
    {
      chave: "recibo_venda_troca",
      titulo: "Recibo de Venda com Troca",
      descricao: "Recibo com o veículo recebido na troca em bloco próprio e a declaração do dono.",
      paraTroca: true,
      criar: reciboVendaComTroca
    }
  ],
  contrato_venda: [
    {
      chave: "contrato_venda",
      titulo: "Contrato de Compra e Venda",
      descricao: "Objeto, preço, troca, estado, garantia, transferência, débitos e entrega.",
      criar: contratoVenda
    }
  ],
  termo_troca: [{ chave: "termo_troca", titulo: "Termo da Troca", descricao: "Veículo recebido como parte do pagamento.", criar: termoTroca }],
  procuracao_transferencia: [
    {
      chave: "procuracao_transferencia",
      titulo: "Procuração para Transferência",
      descricao: "Poderes para a loja transferir o veículo ao comprador.",
      criar: procuracaoTransferencia
    }
  ],
  termo_entrega: [
    { chave: "termo_entrega", titulo: "Termo de Entrega", descricao: "Data, KM e itens da entrega; responsabilidade a partir dela.", criar: termoEntrega }
  ],
  termo_garantia: [{ chave: "termo_garantia", titulo: "Termo de Garantia", descricao: "Garantia legal de 90 dias e como acioná-la.", criar: termoGarantia }],
  outro: [{ chave: "outro", titulo: "Declaração", descricao: "Documento avulso com o cabeçalho da loja.", criar: outro }]
};

function montar(categoria: CategoriaDocumento, fabrica: Fabrica): ModeloDocumento {
  return {
    id: `modelo:${fabrica.chave}`,
    categoria,
    titulo: fabrica.titulo,
    descricao: fabrica.descricao,
    paraTroca: fabrica.paraTroca ?? false,
    conteudo: fabrica.criar()
  };
}

/** Todos os modelos do sistema da categoria (conteúdo novo a cada chamada — pode ser editado). */
export function modelosDaCategoria(categoria: CategoriaDocumento): ModeloDocumento[] {
  return FABRICAS[categoria].map((fabrica) => montar(categoria, fabrica));
}

/** O modelo principal da categoria. */
export function modeloDaCategoria(categoria: CategoriaDocumento): ModeloDocumento {
  return montar(categoria, FABRICAS[categoria][0]);
}

export function isModeloId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("modelo:");
}
