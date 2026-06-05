import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  clampShareMinutes,
  createCarroShareToken,
  resolveCarroShareToken
} from "@/lib/domain/carros/share";

beforeAll(() => {
  process.env.SUPABASE_SECRET_KEY = "test-share-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clampShareMinutes", () => {
  it("limita ao intervalo permitido e cai em fallback p/ valores invalidos", () => {
    expect(clampShareMinutes(1)).toBe(5); // min
    expect(clampShareMinutes(60)).toBe(60);
    expect(clampShareMinutes(99999999)).toBe(60 * 24 * 30); // max
    expect(clampShareMinutes("abc")).toBe(60); // fallback
  });
});

describe("share token", () => {
  it("faz round-trip do carroId com assinatura valida", () => {
    const { token } = createCarroShareToken("carro-123", 60);
    expect(resolveCarroShareToken(token)).toEqual({ carroId: "carro-123" });
  });

  it("rejeita token adulterado", () => {
    const { token } = createCarroShareToken("carro-123", 60);
    const tampered = `${token.slice(0, -2)}xy`;
    expect(resolveCarroShareToken(tampered)).toBeNull();
    expect(resolveCarroShareToken("sem-ponto")).toBeNull();
  });

  it("rejeita token expirado", () => {
    const realNow = Date.now();
    const { token } = createCarroShareToken("carro-123", 5);
    vi.spyOn(Date, "now").mockReturnValue(realNow + 6 * 60_000);
    expect(resolveCarroShareToken(token)).toBeNull();
  });
});
