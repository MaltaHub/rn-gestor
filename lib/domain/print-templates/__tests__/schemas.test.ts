import { describe, expect, it } from "vitest";
import {
  printTemplateCreateSchema,
  printTemplateUpdateSchema
} from "@/lib/domain/print-templates/schemas";

describe("printTemplateCreateSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = printTemplateCreateSchema.safeParse({
      sheet_key: "carros",
      title: "Estoque",
      config: { columns: ["placa"], scope: "table" }
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = printTemplateCreateSchema.safeParse({
      sheet_key: "carros",
      title: "  ",
      config: {}
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty sheet_key", () => {
    const result = printTemplateCreateSchema.safeParse({
      sheet_key: "",
      title: "Estoque",
      config: {}
    });
    expect(result.success).toBe(false);
  });

  it("accepts anchor_filter explicitly null", () => {
    const result = printTemplateCreateSchema.safeParse({
      sheet_key: "carros",
      title: "Estoque",
      config: {},
      anchor_filter: null
    });
    expect(result.success).toBe(true);
  });

  it("strips unknown top-level fields", () => {
    const result = printTemplateCreateSchema.safeParse({
      sheet_key: "carros",
      title: "Estoque",
      config: {},
      junk: 123
    });
    expect(result.success).toBe(false); // .strict() rejects extra keys
  });
});

describe("printTemplateUpdateSchema", () => {
  it("requires at least one field", () => {
    const result = printTemplateUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts partial updates", () => {
    expect(printTemplateUpdateSchema.safeParse({ title: "Novo titulo" }).success).toBe(true);
    expect(printTemplateUpdateSchema.safeParse({ config: { columns: [] } }).success).toBe(true);
    expect(printTemplateUpdateSchema.safeParse({ anchor_filter: null }).success).toBe(true);
  });

  it("rejects blank title in update", () => {
    const result = printTemplateUpdateSchema.safeParse({ title: "  " });
    expect(result.success).toBe(false);
  });
});
