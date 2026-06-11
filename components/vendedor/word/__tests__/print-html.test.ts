// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { renderDocumentHTML } from "@/components/vendedor/word/print-document";

const DOC: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          marks: [{ type: "textStyle", attrs: { color: "#ff0000", fontSize: "24px" } }],
          text: "Texto vermelho grande"
        }
      ]
    },
    { type: "paragraph" },
    { type: "paragraph" },
    { type: "paragraph", content: [{ type: "text", text: "Depois das linhas em branco" }] },
    { type: "image", attrs: { src: "/logo.png", width: "220px" } },
    { type: "image", attrs: { src: "/logo.png", floating: true, left: 140, top: 12, width: "120px" } },
    // signatureLine legada (label em attrs): normalizeDoc converte p/ conteudo.
    { type: "signatureLine", attrs: { label: "Vendedor" } },
    { type: "pageBreak" },
    { type: "signatureLine", content: [{ type: "text", text: "Comprador" }] }
  ]
};

describe("renderDocumentHTML — fidelidade do print/preview", () => {
  const html = renderDocumentHTML(DOC, {});

  it("preserva estilo de texto (cor + tamanho) — antes era descartado pelo zeed-dom", () => {
    expect(html).toMatch(/color:\s*(#ff0000|rgb\(255,\s*0,\s*0\))/i);
    expect(html).toMatch(/font-size:\s*24px/i);
  });

  it("preserva a largura da imagem", () => {
    expect(html).toMatch(/width:\s*220px/);
  });

  it("preserva posicao livre da imagem (absolute + mm)", () => {
    expect(html).toMatch(/position:\s*absolute/);
    expect(html).toMatch(/left:\s*140mm/);
    expect(html).toMatch(/top:\s*12mm/);
  });

  it("mantem as linhas em branco (paragrafos vazios)", () => {
    expect(html.match(/<p><\/p>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("renderiza a assinatura legada (label vira texto sob a linha)", () => {
    expect(html).toContain("word-signature");
    expect(html).toContain("Vendedor");
  });

  it("renderiza a assinatura nova (conteudo editavel sob a linha)", () => {
    expect(html).toContain("Comprador");
    expect(html).toContain("word-signature-label");
  });

  it("renderiza a quebra de pagina (vira folha nova no print)", () => {
    expect(html).toContain("word-page-break");
  });

  it("indexador resolvido sai em CAIXA ALTA mantendo a formatacao do chip", () => {
    const out = renderDocumentHTML(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "variable", attrs: { token: "placa" }, marks: [{ type: "bold" }] }]
          }
        ]
      },
      { placa: "abc1d23" }
    );
    expect(out).toContain("<strong>ABC1D23</strong>");
  });

  it("duas colunas preservam a estrutura no print", () => {
    const out = renderDocumentHTML(
      {
        type: "doc",
        content: [
          {
            type: "columnBlock",
            content: [
              { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "esquerda" }] }] },
              { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "direita" }] }] }
            ]
          }
        ]
      },
      {}
    );
    expect(out).toContain("data-word-columns");
    expect(out.match(/data-word-column=/g)?.length).toBe(2);
    expect(out).toContain("esquerda");
    expect(out).toContain("direita");
  });
});
