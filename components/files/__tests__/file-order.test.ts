import { describe, expect, it } from "vitest";

import { reorderFiles } from "../file-order";
import type { FileItem } from "../types";

const file = (id: string, sortOrder: number): FileItem => ({
  id,
  folderId: "folder",
  fileName: `${id}.txt`,
  mimeType: "text/plain",
  sizeBytes: 1,
  sortOrder,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  previewUrl: null,
  downloadUrl: null,
  isMissing: false,
});

describe("file-order domain", () => {
  it("moves source before target and reindexes sortOrder", () => {
    const result = reorderFiles(
      [file("a", 0), file("b", 1), file("c", 2)],
      "c",
      "a",
    );

    expect(result.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
    expect(result.map((entry) => entry.sortOrder)).toEqual([0, 1, 2]);
  });

  it("returns same reference for invalid reorder", () => {
    const files = [file("a", 0), file("b", 1)];
    const result = reorderFiles(files, "x", "b");

    expect(result).toBe(files);
  });
});
