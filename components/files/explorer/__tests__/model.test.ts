import { describe, expect, it } from "vitest";
import type { ExplorerFile, ExplorerFolder, ExplorerIndex } from "@/lib/files/explorer-types";
import {
  buildExplorerModel,
  collectSubtreeFolderIds,
  fileTypeLabel,
  findHighlightRange,
  getFolderPathLabel,
  isSameOrDescendant,
  listFolderEntries,
  moveIndexFiles,
  removeIndexFolderTree,
  reorderFileIds,
  searchExplorer,
  sortEntries,
  uniqueChildFolderName
} from "@/components/files/explorer/model";

const T = "2026-01-01T00:00:00.000Z";

function folder(id: string, parentId: string | null, name: string, displayName = name): ExplorerFolder {
  return {
    id,
    parentId,
    name,
    displayName,
    description: null,
    automationKey: null,
    automationRepositoryKey: null,
    managedCarroId: null,
    isAutomationPaused: false,
    vehicle: null,
    createdAt: T,
    updatedAt: T
  };
}

function file(id: string, folderId: string, name: string, sortOrder: number, extra: Partial<ExplorerFile> = {}): ExplorerFile {
  return {
    id,
    folderId,
    name,
    mimeType: "image/webp",
    sizeBytes: 1000 + sortOrder,
    sortOrder,
    createdAt: T,
    updatedAt: T,
    ...extra
  };
}

const index: ExplorerIndex = {
  generatedAt: T,
  folders: [
    folder("fotos", null, "Fotos dos Veiculos"),
    folder("docs", null, "Documentos"),
    folder("car-1", "fotos", "uuid-car-1", "ABC-1D23"),
    folder("car-2", "fotos", "uuid-car-2", "XYZ9K88"),
    folder("car-1-docs", "docs", "uuid-car-1", "ABC-1D23"),
    folder("orphan", "missing-parent", "Órfã")
  ],
  files: [
    file("p2", "car-1", "frente.webp", 1),
    file("p1", "car-1", "lateral.webp", 0),
    file("p3", "car-1", "traseira.webp", 2),
    file("d1", "car-1-docs", "crlv_abc-1d23__documento.pdf", 0, { mimeType: "application/pdf" })
  ]
};

const model = buildExplorerModel(index);

describe("buildExplorerModel", () => {
  it("ordena filhas pelo nome exibido e trata órfãs como raiz", () => {
    expect(model.childFolderIds.get(null)).toEqual(["docs", "fotos", "orphan"]);
    expect(model.childFolderIds.get("fotos")).toEqual(["car-1", "car-2"]);
  });

  it("ordena arquivos pela ordem manual", () => {
    expect(model.fileIdsByFolder.get("car-1")).toEqual(["p1", "p2", "p3"]);
  });

  it("lista pastas antes dos arquivos e conta itens", () => {
    const entries = listFolderEntries(model, "fotos");
    expect(entries.map((entry) => entry.key)).toEqual(["d:car-1", "d:car-2"]);
    expect(entries[0].kind === "folder" && entries[0].itemCount).toBe(3);
  });
});

describe("caminhos", () => {
  it("monta o rótulo do caminho com nomes exibidos", () => {
    expect(getFolderPathLabel(model, "car-1")).toBe("Fotos dos Veiculos / ABC-1D23");
  });

  it("detecta descendência e subárvore", () => {
    expect(isSameOrDescendant(model, "fotos", "car-1")).toBe(true);
    expect(isSameOrDescendant(model, "docs", "car-1")).toBe(false);
    expect(collectSubtreeFolderIds(model, "fotos").sort()).toEqual(["car-1", "car-2", "fotos"]);
  });
});

describe("searchExplorer", () => {
  it("acha pasta pela placa sem hífen e ranqueia o nome acima do caminho", () => {
    const { hits } = searchExplorer(model, "abc1d23");
    expect(hits[0].entry.kind).toBe("folder");
    expect(hits.slice(0, 2).map((hit) => hit.entry.id).sort()).toEqual(["car-1", "car-1-docs"]);
    // arquivos dentro da pasta casam pelo caminho, mas vêm depois
    expect(hits.some((hit) => hit.entry.id === "p1")).toBe(true);
  });

  it("combina tokens de caminho e nome (AND)", () => {
    const { hits } = searchExplorer(model, "fotos frente");
    expect(hits.map((hit) => hit.entry.id)).toEqual(["p2"]);
    expect(hits[0].location).toBe("Fotos dos Veiculos / ABC-1D23");
  });

  it("ignora acento e caixa e respeita o escopo", () => {
    expect(searchExplorer(model, "ORFA").hits.map((hit) => hit.entry.id)).toEqual(["orphan"]);
    const scoped = searchExplorer(model, "abc", { scopeFolderId: "docs" });
    expect(scoped.hits.map((hit) => hit.entry.id).sort()).toEqual(["car-1-docs", "d1"]);
  });

  it("aplica limite mas devolve o total", () => {
    const result = searchExplorer(model, "webp", { limit: 2 });
    expect(result.hits).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it("destaca a ocorrência no nome", () => {
    expect(findHighlightRange("Fotos dos Veiculos", "veic")).toEqual([10, 14]);
  });
});

describe("sortEntries", () => {
  it("mantém pastas primeiro em qualquer ordenação", () => {
    const entries = [...listFolderEntries(model, "car-1"), ...listFolderEntries(model, "fotos")];
    const sorted = sortEntries(entries, "size", "desc");
    expect(sorted[0].kind).toBe("folder");
    expect(sorted.filter((entry) => entry.kind === "file").map((entry) => entry.id)).toEqual(["p3", "p2", "p1"]);
  });
});

describe("mutações do índice", () => {
  it("move arquivos para o fim da pasta destino", () => {
    const next = moveIndexFiles(index, ["p1"], "car-2");
    const moved = next.files.find((entry) => entry.id === "p1");
    expect(moved).toMatchObject({ folderId: "car-2", sortOrder: 0 });
  });

  it("remove a subárvore com os arquivos", () => {
    const next = removeIndexFolderTree(index, "fotos");
    expect(next.folders.map((entry) => entry.id).sort()).toEqual(["car-1-docs", "docs", "orphan"]);
    expect(next.files.map((entry) => entry.id)).toEqual(["d1"]);
  });

  it("reordena antes do alvo ou no fim", () => {
    expect(reorderFileIds(["a", "b", "c", "d"], ["d"], "b")).toEqual(["a", "d", "b", "c"]);
    expect(reorderFileIds(["a", "b", "c"], ["a", "b"], null)).toEqual(["c", "a", "b"]);
    expect(reorderFileIds(["a", "b"], ["a"], "a")).toEqual(["a", "b"]);
  });

  it("gera nome de pasta único", () => {
    const withNew = buildExplorerModel({ ...index, folders: [...index.folders, folder("n", "docs", "Nova pasta")] });
    expect(uniqueChildFolderName(withNew, "docs")).toBe("Nova pasta (2)");
    expect(uniqueChildFolderName(withNew, "fotos")).toBe("Nova pasta");
  });
});

describe("fileTypeLabel", () => {
  it("descreve o tipo como no Explorer", () => {
    expect(fileTypeLabel("a.webp", "image/webp")).toBe("Imagem WEBP");
    expect(fileTypeLabel("a.pdf", "application/pdf")).toBe("Documento PDF");
    expect(fileTypeLabel("a.docx", "application/octet-stream")).toBe("Arquivo DOCX");
  });
});
