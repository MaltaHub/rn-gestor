import { describe, expect, it } from "vitest";
import { adminUserUpdateSchema } from "@/lib/domain/admin/schemas";

describe("adminUserUpdateSchema", () => {
  it("accepts a payload with one field", () => {
    const result = adminUserUpdateSchema.safeParse({ nome: "Joao" });
    expect(result.success).toBe(true);
  });

  it("accepts obs set to null (clearing the field)", () => {
    const result = adminUserUpdateSchema.safeParse({ obs: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.obs).toBeNull();
    }
  });

  it("rejects empty payload (refine: at least one field)", () => {
    const result = adminUserUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects nome with wrong type", () => {
    const result = adminUserUpdateSchema.safeParse({ nome: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects obs with wrong type", () => {
    const result = adminUserUpdateSchema.safeParse({ obs: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict mode)", () => {
    const result = adminUserUpdateSchema.safeParse({ nome: "Joao", admin: true });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string nome", () => {
    const result = adminUserUpdateSchema.safeParse({ nome: "" });
    expect(result.success).toBe(false);
  });

  it("accepts multiple simultaneous fields", () => {
    const result = adminUserUpdateSchema.safeParse({
      nome: "Joao",
      cargo: "GERENTE",
      status: "ATIVO",
      obs: "Promovido"
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nome).toBe("Joao");
      expect(result.data.cargo).toBe("GERENTE");
    }
  });
});
