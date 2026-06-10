// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";

// Evita rede no auto-save.
vi.mock("@/components/vendedor/word/api", () => ({
  updateDocumento: vi.fn().mockResolvedValue({})
}));

import { WordEditor } from "@/components/vendedor/word/word-editor";

const BASE: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Contrato de venda" }] }]
};

function renderEditor() {
  return render(
    <WordEditor
      auth={{ accessToken: "t", devRole: undefined }}
      documentoId="doc-1"
      initialTitulo="Teste"
      initialConteudo={BASE}
      contexto={{ placa: "ABC1D23", valorTotal: 45000 }}
    />
  );
}

afterEach(() => cleanup());

describe("WordEditor (React) — inserir nao apaga o conteudo", () => {
  it("clicar no chip de variavel preserva o texto", async () => {
    const { container } = renderEditor();

    const content = await waitFor(() => {
      const el = container.querySelector(".word-editor-content");
      if (!el || !el.textContent?.includes("Contrato de venda")) throw new Error("editor nao pronto");
      return el as HTMLElement;
    });

    const chip = screen.getByRole("button", { name: "Placa" });
    fireEvent.click(chip);

    expect(content.textContent).toContain("Contrato de venda");
    expect(content.textContent).toContain("${placa}");
  });
});
