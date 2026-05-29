import { describe, expect, it } from "vitest";
import {
  editorFlowCreateSchema,
  editorFlowUpdateSchema
} from "@/lib/domain/editor-flows/schemas";

describe("editorFlowCreateSchema", () => {
  it("accepts a minimal payload", () => {
    const result = editorFlowCreateSchema.safeParse({
      title: "Limpar Loja 1",
      graph: { nodes: [], edges: [] }
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    expect(editorFlowCreateSchema.safeParse({ title: "  ", graph: {} }).success).toBe(false);
  });

  it("rejects missing graph", () => {
    expect(editorFlowCreateSchema.safeParse({ title: "X" }).success).toBe(false);
  });

  it("accepts sheet_key explicitly null (multi-aba)", () => {
    expect(
      editorFlowCreateSchema.safeParse({
        title: "Multi",
        sheet_key: null,
        graph: { nodes: [], edges: [] }
      }).success
    ).toBe(true);
  });

  it("strips unknown top-level fields via strict", () => {
    expect(
      editorFlowCreateSchema.safeParse({
        title: "X",
        graph: {},
        junk: 1
      }).success
    ).toBe(false);
  });
});

describe("editorFlowUpdateSchema", () => {
  it("requires at least one field", () => {
    expect(editorFlowUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("accepts partial updates", () => {
    expect(editorFlowUpdateSchema.safeParse({ title: "Novo" }).success).toBe(true);
    expect(editorFlowUpdateSchema.safeParse({ graph: { nodes: [] } }).success).toBe(true);
    expect(editorFlowUpdateSchema.safeParse({ sheet_key: null }).success).toBe(true);
    expect(editorFlowUpdateSchema.safeParse({ description: null }).success).toBe(true);
  });

  it("rejects blank title in update", () => {
    expect(editorFlowUpdateSchema.safeParse({ title: " " }).success).toBe(false);
  });
});
