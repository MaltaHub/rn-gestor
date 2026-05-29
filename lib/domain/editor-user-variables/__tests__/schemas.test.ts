import { describe, expect, it } from "vitest";
import { batchUpsertSchema, upsertVariableSchema } from "@/lib/domain/editor-user-variables/schemas";

describe("upsertVariableSchema", () => {
  it("aceita payload minimo valido", () => {
    expect(upsertVariableSchema.safeParse({ name: "minha_var", value: "hello" }).success).toBe(true);
  });

  it("aceita value como numero, boolean, null, array e objeto", () => {
    expect(upsertVariableSchema.safeParse({ name: "n", value: 42 }).success).toBe(true);
    expect(upsertVariableSchema.safeParse({ name: "n", value: true }).success).toBe(true);
    expect(upsertVariableSchema.safeParse({ name: "n", value: null }).success).toBe(true);
    expect(upsertVariableSchema.safeParse({ name: "n", value: [1, 2] }).success).toBe(true);
    expect(upsertVariableSchema.safeParse({ name: "n", value: { k: "v" } }).success).toBe(true);
  });

  it("aceita type opcional", () => {
    const r = upsertVariableSchema.safeParse({ name: "n", value: "x", type: "custom" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type).toBe("custom");
  });

  it("type nao fornecido permanece undefined (default no service)", () => {
    const r = upsertVariableSchema.safeParse({ name: "n", value: "x" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.type).toBeUndefined();
  });

  it("rejeita name vazio", () => {
    expect(upsertVariableSchema.safeParse({ name: "", value: "x" }).success).toBe(false);
  });

  it("rejeita name apenas espacos (apos trim)", () => {
    expect(upsertVariableSchema.safeParse({ name: "   ", value: "x" }).success).toBe(false);
  });

  it("rejeita name com prefixo system.", () => {
    expect(upsertVariableSchema.safeParse({ name: "system.user_id", value: "x" }).success).toBe(false);
  });

  it("rejeita name com prefixo SYSTEM. (case-insensitive)", () => {
    expect(upsertVariableSchema.safeParse({ name: "SYSTEM.abc", value: "x" }).success).toBe(false);
  });

  it("rejeita name com mais de 120 caracteres", () => {
    const long = "a".repeat(121);
    expect(upsertVariableSchema.safeParse({ name: long, value: "x" }).success).toBe(false);
  });

  it("aceita name exatamente 120 caracteres", () => {
    const max = "a".repeat(120);
    expect(upsertVariableSchema.safeParse({ name: max, value: "x" }).success).toBe(true);
  });

  it("rejeita campos extras (strict)", () => {
    expect(upsertVariableSchema.safeParse({ name: "n", value: "x", extra: true }).success).toBe(false);
  });
});

describe("batchUpsertSchema", () => {
  const validItem = { name: "var1", value: "hello" };

  it("aceita lista de um item", () => {
    expect(batchUpsertSchema.safeParse({ items: [validItem] }).success).toBe(true);
  });

  it("aceita lista de 200 itens (maximo)", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ name: `var${i}`, value: i }));
    expect(batchUpsertSchema.safeParse({ items }).success).toBe(true);
  });

  it("rejeita lista vazia (min 1)", () => {
    expect(batchUpsertSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it("rejeita lista com 201 itens (maximo excedido)", () => {
    const items = Array.from({ length: 201 }, (_, i) => ({ name: `var${i}`, value: i }));
    expect(batchUpsertSchema.safeParse({ items }).success).toBe(false);
  });

  it("rejeita se qualquer item tem name prefixado com system.", () => {
    const r = batchUpsertSchema.safeParse({
      items: [validItem, { name: "system.clock", value: "x" }]
    });
    expect(r.success).toBe(false);
  });

  it("rejeita campos extras no item (strict)", () => {
    expect(
      batchUpsertSchema.safeParse({ items: [{ name: "n", value: "x", junk: 1 }] }).success
    ).toBe(false);
  });
});
