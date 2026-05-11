import { describe, expect, it } from "vitest";
import {
  fileAutomationConfigPatchSchema,
  fileReorderSchema,
  fileUpdateSchema,
  finalizeUploadsSchema,
  folderCreateSchema,
  folderUpdateSchema,
  prepareUploadsSchema
} from "@/lib/domain/files/schemas";

describe("fileAutomationConfigPatchSchema", () => {
  it("accepts a valid payload", () => {
    const result = fileAutomationConfigPatchSchema.safeParse({
      displayField: "placa",
      repositories: { vehicle_photos_active: "abc" }
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown displayField", () => {
    const result = fileAutomationConfigPatchSchema.safeParse({ displayField: "foo" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing displayField", () => {
    const result = fileAutomationConfigPatchSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("strips unknown repository keys", () => {
    const result = fileAutomationConfigPatchSchema.safeParse({
      displayField: "id",
      repositories: { unknown_key: "x" }
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repositories?.unknown_key).toBeUndefined();
    }
  });
});

describe("folderCreateSchema", () => {
  it("accepts a minimal payload", () => {
    const result = folderCreateSchema.safeParse({ name: "Documentos" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Documentos");
    }
  });

  it("trims the name", () => {
    const result = folderCreateSchema.safeParse({ name: "  com espacos  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("com espacos");
    }
  });

  it("rejects empty name", () => {
    const result = folderCreateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 120 chars", () => {
    const result = folderCreateSchema.safeParse({ name: "a".repeat(121) });
    expect(result.success).toBe(false);
  });

  it("normalizes empty description to null", () => {
    const result = folderCreateSchema.safeParse({ name: "ok", description: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeNull();
    }
  });

  it("rejects wrong type for parentFolderId", () => {
    const result = folderCreateSchema.safeParse({ name: "ok", parentFolderId: 42 });
    expect(result.success).toBe(false);
  });
});

describe("folderUpdateSchema", () => {
  it("accepts partial update with only name", () => {
    const result = folderUpdateSchema.safeParse({ name: "Renomeada" });
    expect(result.success).toBe(true);
  });

  it("rejects empty payload (refine: at least one field)", () => {
    const result = folderUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty string name", () => {
    const result = folderUpdateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("fileReorderSchema", () => {
  it("accepts a list of file IDs", () => {
    const result = fileReorderSchema.safeParse({ fileIds: ["a", "b"] });
    expect(result.success).toBe(true);
  });

  it("rejects empty list", () => {
    const result = fileReorderSchema.safeParse({ fileIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects when fileIds is not an array", () => {
    const result = fileReorderSchema.safeParse({ fileIds: "not-an-array" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fileIds", () => {
    const result = fileReorderSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("fileUpdateSchema", () => {
  it("accepts fileName only", () => {
    const result = fileUpdateSchema.safeParse({ fileName: "foto.jpg" });
    expect(result.success).toBe(true);
  });

  it("accepts folderId only", () => {
    const result = fileUpdateSchema.safeParse({ folderId: "abc" });
    expect(result.success).toBe(true);
  });

  it("accepts folderId null", () => {
    const result = fileUpdateSchema.safeParse({ folderId: null });
    expect(result.success).toBe(true);
  });

  it("rejects empty payload", () => {
    const result = fileUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects fileName > 240 chars", () => {
    const result = fileUpdateSchema.safeParse({ fileName: "a".repeat(241) });
    expect(result.success).toBe(false);
  });
});

describe("prepareUploadsSchema", () => {
  const validFile = { fileName: "foto.jpg", mimeType: "image/jpeg", sizeBytes: 1024 };

  it("accepts a valid payload", () => {
    const result = prepareUploadsSchema.safeParse({
      folderId: "f1",
      files: [validFile]
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty files list", () => {
    const result = prepareUploadsSchema.safeParse({ folderId: "f1", files: [] });
    expect(result.success).toBe(false);
  });

  it("rejects missing folderId", () => {
    const result = prepareUploadsSchema.safeParse({ files: [validFile] });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive size", () => {
    const result = prepareUploadsSchema.safeParse({
      folderId: "f1",
      files: [{ ...validFile, sizeBytes: 0 }]
    });
    expect(result.success).toBe(false);
  });

  it("accepts null mimeType", () => {
    const result = prepareUploadsSchema.safeParse({
      folderId: "f1",
      files: [{ ...validFile, mimeType: null }]
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-integer size", () => {
    const result = prepareUploadsSchema.safeParse({
      folderId: "f1",
      files: [{ ...validFile, sizeBytes: 1.5 }]
    });
    expect(result.success).toBe(false);
  });
});

describe("finalizeUploadsSchema", () => {
  const validEntry = {
    fileId: "id-1",
    fileName: "foto.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    storagePath: "f1/id-1-foto.jpg"
  };

  it("accepts valid payload", () => {
    const result = finalizeUploadsSchema.safeParse({ folderId: "f1", entries: [validEntry] });
    expect(result.success).toBe(true);
  });

  it("rejects missing entries", () => {
    const result = finalizeUploadsSchema.safeParse({ folderId: "f1" });
    expect(result.success).toBe(false);
  });

  it("rejects entry missing storagePath", () => {
    const { storagePath: _omitted, ...rest } = validEntry;
    void _omitted;
    const result = finalizeUploadsSchema.safeParse({ folderId: "f1", entries: [rest] });
    expect(result.success).toBe(false);
  });

  it("rejects empty folderId", () => {
    const result = finalizeUploadsSchema.safeParse({ folderId: "", entries: [validEntry] });
    expect(result.success).toBe(false);
  });
});
