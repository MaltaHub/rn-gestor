import { describe, expect, it } from "vitest";

import {
  buildFolderTree,
  collectFolderTreePathIds,
  findFolderTreePath,
  flattenFolderOptions,
} from "../folder-tree";
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
  physicalName: name,
  displayName: name,
  automationKey: null,
  automationRepositoryKey: null,
  managedCarroId: null,
  isAutomationRepository: false,
  isManagedFolder: false,
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

  it("returns the tree path for a nested folder", () => {
    const tree = buildFolderTree([
      folder("1", "Raiz"),
      folder("1-1", "Filha", "1"),
      folder("1-1-1", "Neta", "1-1"),
    ]);

    expect(findFolderTreePath(tree, "1-1-1").map((node) => node.id)).toEqual([
      "1",
      "1-1",
      "1-1-1",
    ]);
    expect(collectFolderTreePathIds(tree, "1-1")).toEqual(["1", "1-1"]);
    expect(collectFolderTreePathIds(tree, "missing")).toEqual([]);
  });

  it("sorts and flattens managed folders by display name", () => {
    const managed = {
      ...folder("1", "vehicle-id"),
      displayName: "ABC1D23",
      isManagedFolder: true,
    };
    const tree = buildFolderTree([folder("2", "Zulu"), managed]);

    expect(tree.map((node) => node.id)).toEqual(["1", "2"]);
    expect(flattenFolderOptions(tree)[0]).toEqual({
      id: "1",
      label: "ABC1D23",
    });
  });
});
