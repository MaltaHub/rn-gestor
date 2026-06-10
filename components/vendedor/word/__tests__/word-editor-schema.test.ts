// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { buildExtensions, normalizeDoc } from "@/components/vendedor/word/tiptap-config";

type Doc = ReturnType<Editor["getJSON"]>;

const BASE: Doc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Contrato de venda" }] }]
};

let editor: Editor | null = null;

function makeEditor(content: Doc): Editor {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: buildExtensions(),
    content
  });
  // Cursor no fim (reproduz o uso real: digitar e entao inserir).
  editor.commands.focus("end");
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("editor Word — inserir NAO pode apagar o conteudo", () => {
  it("insertVariable preserva o texto e cria o no variable", () => {
    const e = makeEditor(BASE);
    e.commands.insertVariable("placa");
    expect(e.getText()).toContain("Contrato de venda");
    expect(JSON.stringify(e.getJSON())).toContain('"variable"');
  });

  it("insertSignatureLine preserva o texto e cria o no signatureLine", () => {
    const e = makeEditor(BASE);
    e.commands.insertSignatureLine("Vendedor");
    expect(e.getText()).toContain("Contrato de venda");
    expect(JSON.stringify(e.getJSON())).toContain("signatureLine");
  });

  it("setImage preserva o texto", () => {
    const e = makeEditor(BASE);
    e.commands.setImage({ src: "/logo.png" });
    expect(e.getText()).toContain("Contrato de venda");
  });

  it("REGRESSAO: inserir variavel com TUDO selecionado nao apaga o texto", () => {
    const e = makeEditor(BASE);
    e.commands.selectAll();
    e.commands.insertVariable("placa");
    // insertContent normal apagaria a selecao; insertContentAt(selection.to) nao.
    expect(e.getText()).toContain("Contrato de venda");
    expect(JSON.stringify(e.getJSON())).toContain('"variable"');
  });

  it("REGRESSAO: inserir assinatura com TUDO selecionado nao apaga o texto", () => {
    const e = makeEditor(BASE);
    e.commands.selectAll();
    e.commands.insertSignatureLine("Vendedor");
    expect(e.getText()).toContain("Contrato de venda");
    expect(JSON.stringify(e.getJSON())).toContain("signatureLine");
  });

  it("posicao livre: atributos floating/left/top fazem round-trip no JSON", () => {
    const e = makeEditor(BASE);
    e.commands.insertContent({ type: "image", attrs: { src: "/logo.png", floating: true, left: 30, top: 25 } });
    const json = JSON.stringify(e.getJSON());
    expect(json).toContain('"floating":true');
    expect(json).toContain('"left":30');
    expect(json).toContain('"top":25');
  });

  it("assinatura: rotulo vira TEXTO EDITAVEL sob a linha", () => {
    const e = makeEditor(BASE);
    e.commands.insertSignatureLine("Comprador");
    expect(e.getText()).toContain("Comprador");
    const json = JSON.stringify(e.getJSON());
    expect(json).toContain("signatureLine");
  });

  it("compat: doc legado com label em attrs ganha o texto sob a linha (normalizeDoc)", () => {
    const legado: Doc = {
      type: "doc",
      content: [
        ...(BASE.content ?? []),
        { type: "signatureLine", attrs: { label: "Vendedor" } }
      ]
    };
    const e = makeEditor(normalizeDoc(legado));
    expect(e.getText()).toContain("Vendedor");
  });

  it("quebra de pagina: insere sem apagar o texto e faz round-trip", () => {
    const e = makeEditor(BASE);
    e.commands.insertPageBreak();
    expect(e.getText()).toContain("Contrato de venda");
    const json = e.getJSON();
    expect(JSON.stringify(json)).toContain('"pageBreak"');
    e.commands.setContent(json);
    expect(JSON.stringify(e.getJSON())).toContain('"pageBreak"');
  });

  it("doc com variable e signature faz round-trip via getJSON/setContent", () => {
    const e = makeEditor(BASE);
    e.commands.insertVariable("preço.extenso");
    e.commands.insertSignatureLine("Comprador");
    const json = e.getJSON();
    e.commands.setContent(json);
    expect(e.getText()).toContain("Contrato de venda");
    expect(JSON.stringify(e.getJSON())).toContain('"variable"');
  });
});
