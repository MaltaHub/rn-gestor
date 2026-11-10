// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { renderDocumentHTML } from "@/components/vendedor/word/print-document";
import { escolhaAutomatica, opcoesDaCategoria } from "@/components/vendedor/word/opcoes-modelo";
import { amostrasVenda } from "@/lib/domain/venda-documentos/amostras";
import { modelosDaCategoria } from "@/lib/domain/venda-documentos/modelos";
import type { DocumentoTemplateRow } from "@/lib/domain/db";

const n = (html: string) => html.replace(/ |&nbsp;/g, " ");
const [aVista, , comTroca] = amostrasVenda(new Date(2026, 5, 9));

describe("Recibo de Venda com Troca", () => {
  const modelo = modelosDaCategoria("recibo_venda").find((item) => item.paraTroca);

  it("existe como modelo do sistema da categoria Recibo de Venda", () => {
    expect(modelo?.id).toBe("modelo:recibo_venda_troca");
    expect(modelo?.titulo).toBe("Recibo de Venda com Troca");
  });

  it("mostra o veículo recebido em bloco próprio, com o valor e a declaração", () => {
    const html = n(renderDocumentHTML(modelo!.conteudo as JSONContent, comTroca.contexto));
    expect(html).toContain("VEÍCULO RECEBIDO NA TROCA");
    expect(html).toContain("GOL 1.0");
    expect(html).toContain("XYZ9A87");
    expect(html).toContain("2014/2015");
    expect(html).toContain("9BWAA05U0FP000001");
    expect(html).toContain("R$ 20.000,00 (VINTE MIL REAIS)");
    expect(html).toContain("livre de ônus");
  });
});

const tpl = (id: string, titulo: string, conteudo: unknown = { type: "doc", content: [] }): DocumentoTemplateRow =>
  ({ id, titulo, categoria: "recibo_venda", is_active: true, descricao: null, conteudo } as unknown as DocumentoTemplateRow);

describe("escolha do modelo pela venda", () => {
  it("sem template da loja, escolhe sozinho: com troca → Recibo com Troca; sem troca → Recibo", () => {
    expect(escolhaAutomatica(opcoesDaCategoria("recibo_venda", [], true))?.key).toBe("modelo:recibo_venda_troca");
    expect(escolhaAutomatica(opcoesDaCategoria("recibo_venda", [], false))?.key).toBe("modelo:recibo_venda");
    expect(aVista.contexto.entradas).toEqual([]);
  });

  it("com template da loja, pergunta — e o recomendado vem primeiro", () => {
    const opcoes = opcoesDaCategoria("recibo_venda", [tpl("t-1", "Recibo de Venda (Financiado Com Entrada e IPVA Pago)")], true);
    expect(escolhaAutomatica(opcoes)).toBeNull();
    expect(opcoes[0]).toMatchObject({ key: "modelo:recibo_venda_troca", recomendado: true });
  });

  it("cópia personalizada do modelo com troca substitui o do sistema e herda a recomendação", () => {
    const copia = tpl("t-2", "Meu recibo", { type: "doc", attrs: { modeloBase: "modelo:recibo_venda_troca" }, content: [] });
    const opcoes = opcoesDaCategoria("recibo_venda", [copia], true);
    expect(opcoes.map((opcao) => opcao.key)).toEqual(["t-2", "modelo:recibo_venda"]);
    expect(opcoes[0].recomendado).toBe(true);
  });
});

describe("débitos com valor (venda e troca)", () => {
  const [, , trocaFinanciado] = amostrasVenda(new Date(2026, 5, 9));
  const modelo = modelosDaCategoria("recibo_venda").find((item) => item.paraTroca);

  it("o recibo com troca mostra os débitos do veículo da troca com o valor por extenso", () => {
    const html = n(renderDocumentHTML(modelo!.conteudo as JSONContent, trocaFinanciado.contexto));
    expect(html).toContain("DÉBITOS DO VEÍCULO DA TROCA");
    expect(html).toContain("2 MULTAS DE TRÂNSITO — R$ 390,50");
    expect(html).toMatch(/DÉBITOS: .*IPVA 2026 EM ABERTO.* — R\$ 1\.850,00/);
  });

  it("sem débito na troca, o bloco some", () => {
    const semDebito = {
      ...trocaFinanciado.contexto,
      entradas: (trocaFinanciado.contexto.entradas ?? []).map((entrada) => ({ ...entrada, debitos: null, debitosValor: null }))
    };
    expect(n(renderDocumentHTML(modelo!.conteudo as JSONContent, semDebito))).not.toContain("DÉBITOS DO VEÍCULO DA TROCA");
  });
});
