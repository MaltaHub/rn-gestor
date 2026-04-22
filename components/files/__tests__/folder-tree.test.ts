import { describe, expect, it } from "vitest";

import { buildFolderTree, flattenFolderOptions } from "../folder-tree";
import type { FileFolderSummary } from "../types";

const folder = (
  id: string,
  name: string,
  parentFolderId: string | null = null,
): FileFolderSummary => ({
  id,
  name,
  slug: id,
  description: null,
  parentFolderId,
  fileCount: 0,
  childFolderCount: 0,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
});

describe("folder-tree domain", () => {
  it("builds and sorts tree recursively", () => {
    const tree = buildFolderTree([
      folder("3", "Zulu"),
      folder("1", "Alpha"),
      folder("1-2", "Filha B", "1"),
      folder("1-1", "Filha A", "1"),
    ]);

    expect(tree.map((node) => node.id)).toEqual(["1", "3"]);
    expect(tree[0]?.children.map((node) => node.id)).toEqual(["1-1", "1-2"]);
  });

  it("flattens options with indentation", () => {
    const options = flattenFolderOptions(
      buildFolderTree([folder("1", "Raiz"), folder("1-1", "Filha", "1")]),
    );

    expect(options).toEqual([
      { id: "1", label: "Raiz" },
      { id: "1-1", label: "  Filha" },
    ]);
  });
});
