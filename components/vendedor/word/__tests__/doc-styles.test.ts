import { describe, expect, it } from "vitest";
import { docTypographyCss } from "@/components/vendedor/word/doc-styles";

describe("doc-styles — tipografia unica editor/preview/print", () => {
  it("os tres escopos geram exatamente as mesmas regras (so muda o seletor)", () => {
    const editor = docTypographyCss(".word-paper .word-editor-content");
    const preview = docTypographyCss(".word-preview .word-print");
    const print = docTypographyCss(".word-print");

    const normalize = (css: string, scope: string) => css.split(scope).join("@SCOPE@");

    const editorNorm = normalize(editor, ".word-paper .word-editor-content");
    const previewNorm = normalize(preview, ".word-preview .word-print");
    const printNorm = normalize(print, ".word-print");

    expect(editorNorm).toBe(printNorm);
    expect(previewNorm).toBe(printNorm);
  });

  it("mantem as metricas base do documento (12pt / 1.5 / 8pt)", () => {
    const css = docTypographyCss(".word-print");
    expect(css).toContain("font-size: 12pt");
    expect(css).toContain("line-height: 1.5");
    expect(css).toMatch(/p \{ margin: 0 0 8pt/);
    // quebras automaticas no print devem cair na linha exata (como o editor mostra)
    expect(css).toContain("orphans: 1");
    expect(css).toContain("widows: 1");
  });
});
