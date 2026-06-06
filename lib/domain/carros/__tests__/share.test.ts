import { beforeAll, describe, expect, it } from "vitest";
import { createCarroShareToken, resolveCarroShareToken } from "@/lib/domain/carros/share";

beforeAll(() => {
  process.env.SUPABASE_SECRET_KEY = "test-share-secret";
});

describe("share token (fixo por veiculo)", () => {
  it("e deterministico: mesmo carro => mesmo token", () => {
    expect(createCarroShareToken("carro-123")).toBe(createCarroShareToken("carro-123"));
    expect(createCarroShareToken("carro-123")).not.toBe(createCarroShareToken("carro-999"));
  });

  it("faz round-trip do carroId com assinatura valida", () => {
    const token = createCarroShareToken("carro-123");
    expect(resolveCarroShareToken(token)).toEqual({ carroId: "carro-123" });
  });

  it("rejeita token adulterado ou malformado", () => {
    const token = createCarroShareToken("carro-123");
    expect(resolveCarroShareToken(`${token.slice(0, -2)}xy`)).toBeNull();
    expect(resolveCarroShareToken("sem-ponto")).toBeNull();
    expect(resolveCarroShareToken("")).toBeNull();
  });
});
