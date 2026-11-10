// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { buildExtensions, resolveDoc } from "@/components/vendedor/word/tiptap-config";
import { renderDocumentHTML } from "@/components/vendedor/word/print-document";
import { modeloDaCategoria, modelosDaCategoria } from "@/lib/domain/venda-documentos/modelos";
import { amostrasVenda } from "@/lib/domain/venda-documentos/amostras";
import { camposVazios } from "@/lib/domain/venda-documentos/preflight";

const COM_SECAO: JSONContent = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Recibo" }] },
    {
      type: "conditionalBlock",
      attrs: { condicao: "tem_entrada" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "Com entrada de " }, { type: "variable", attrs: { token: "entrada" } }] }]
    },
    { type: "paragraph", content: [{ type: "variable", attrs: { token: "pagamento" } }] }
  ]
};

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("seção condicional no documento", () => {
  it("some quando a venda não casa e desembrulha quando casa", () => {
    const semEntrada = renderDocumentHTML(COM_SECAO, { valorTotal: 65000, formaPagamento: "a_vista_pix" });
    expect(semEntrada).not.toContain("Com entrada");
    expect(semEntrada).not.toContain("data-conditional");

    const comEntrada = renderDocumentHTML(COM_SECAO, { valorTotal: 65000, valorEntrada: 10000, formaPagamento: "financiamento", entradas: [{ tipo: "pix", valor: 10000 }] });
    expect(comEntrada).toContain("Com entrada de");
    expect(comEntrada).toContain("10.000,00");
    expect(comEntrada).not.toContain("data-conditional");
  });

  it("modo 'todas' mostra tudo (miniatura de template sem venda)", () => {
    const html = renderDocumentHTML(COM_SECAO, {}, { condicoes: "todas" });
    expect(html).toContain("Com entrada");
  });

  it("a cláusula de pagamento sai em CAIXA ALTA no lugar da variável", () => {
    const html = renderDocumentHTML(COM_SECAO, { valorTotal: 65000, formaPagamento: "a_vista_pix" });
    expect(html.replace(/\u00a0|&nbsp;/g, " ")).toContain("PAGAMENTO À VISTA, VIA PIX, NO VALOR DE R$ 65.000,00 (SESSENTA E CINCO MIL REAIS).");
  });

  it("valor com quebra de linha vira <br> com as mesmas marcas", () => {
    const resolved = resolveDoc(
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "variable", attrs: { token: "observacao" }, marks: [{ type: "bold" }] }] }] },
      { observacao: "linha 1\nlinha 2" }
    );
    const paragraph = resolved?.content?.[0];
    expect(paragraph?.content?.map((node) => node.type)).toEqual(["text", "hardBreak", "text"]);
    expect(paragraph?.content?.[2]?.marks).toEqual([{ type: "bold" }]);
  });

  it("o comando embrulha o parágrafo atual e o remove de volta", () => {
    editor = new Editor({ element: document.createElement("div"), extensions: buildExtensions(), content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Clausula" }] }] } });
    editor.commands.setTextSelection(3);
    expect(editor.commands.insertConditionalBlock("financiamento")).toBe(true);
    const json = editor.getJSON();
    expect(json.content?.[0]).toMatchObject({ type: "conditionalBlock", attrs: { condicao: "financiamento" } });
    expect(editor.getText()).toContain("Clausula");

    editor.commands.setTextSelection(4);
    expect(editor.commands.removeConditionalBlock()).toBe(true);
    expect(editor.getJSON().content?.[0]?.type).toBe("paragraph");
    expect(editor.getText()).toContain("Clausula");
  });
});

describe("modelos embutidos no editor real", () => {
  it("todo modelo carrega no schema do editor e renderiza para cada venda de exemplo", () => {
    for (const categoria of ["recibo_sinal", "recibo_venda", "contrato_venda", "termo_troca", "procuracao_transferencia", "termo_entrega", "termo_garantia", "outro"] as const) {
      for (const modelo of modelosDaCategoria(categoria)) {
        editor = new Editor({ element: document.createElement("div"), extensions: buildExtensions(), content: modelo.conteudo as JSONContent });
        expect(editor.isEmpty).toBe(false);
        editor.destroy();
        editor = null;
        for (const amostra of amostrasVenda(new Date(2026, 5, 9))) {
          expect(() => renderDocumentHTML(modelo.conteudo as JSONContent, amostra.contexto)).not.toThrow();
        }
      }
    }
  });

  it("o recibo dinâmico muda a forma de pagamento sem trocar de template", () => {
    const recibo = modeloDaCategoria("recibo_venda").conteudo as JSONContent;
    const [aVista, financiado, troca] = amostrasVenda(new Date(2026, 5, 9));
    const n = (html: string) => html.replace(/\u00a0|&nbsp;/g, " ");
    expect(n(renderDocumentHTML(recibo, aVista.contexto))).toContain("PAGAMENTO À VISTA, VIA PIX");
    expect(n(renderDocumentHTML(recibo, financiado.contexto))).toContain("ENTRADA DE R$ 10.000,00 (DEZ MIL REAIS) VIA PIX; SALDO DE R$ 55.000,00");
    const comTroca = n(renderDocumentHTML(recibo, troca.contexto));
    expect(comTroca).toContain("EM VEÍCULO RECEBIDO NA TROCA");
    expect(comTroca).toContain("DÉBITOS:");
    expect(comTroca).not.toContain("IPVA 2026 PAGO");
  });
});

describe("conferência antes de imprimir", () => {
  it("aponta as variáveis vazias só nos trechos que aparecem", () => {
    const vazios = camposVazios(COM_SECAO, { formaPagamento: "a_vista_pix" }).map((campo) => campo.token);
    expect(vazios).toContain("pagamento");
    expect(vazios).not.toContain("entrada");
    expect(camposVazios(COM_SECAO, { valorTotal: 1000, formaPagamento: "a_vista_pix" })).toEqual([]);
  });
});
