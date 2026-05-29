import { describe, expect, it } from "vitest";
import {
  atualizarEnvelopeSchema,
  registrarDevolucaoSchema,
  registrarRetiradaSchema
} from "@/lib/domain/controle-envelopes/service";

const carroId = "11111111-1111-4111-8111-111111111111";
const userAuthId = "22222222-2222-4222-8222-222222222222";

describe("registrarRetiradaSchema", () => {
  it("aceita payload minimo (sem overrides)", () => {
    const parsed = registrarRetiradaSchema.safeParse({ carro_id: carroId, item: "envelope" });
    expect(parsed.success).toBe(true);
  });

  it("aceita overrides ADM (usuario e data retroativa)", () => {
    const parsed = registrarRetiradaSchema.safeParse({
      carro_id: carroId,
      item: "chave_reserva",
      usuario_auth_user_id: userAuthId,
      retirado_em: "2026-05-01T10:30:00Z",
      observacao: "  spaces  "
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.observacao).toBe("spaces");
  });

  it("rejeita item invalido", () => {
    const parsed = registrarRetiradaSchema.safeParse({ carro_id: carroId, item: "boleto" });
    expect(parsed.success).toBe(false);
  });

  it("rejeita data invalida", () => {
    const parsed = registrarRetiradaSchema.safeParse({
      carro_id: carroId,
      item: "envelope",
      retirado_em: "ontem"
    });
    expect(parsed.success).toBe(false);
  });

  it("rejeita usuario_auth_user_id que nao e uuid", () => {
    const parsed = registrarRetiradaSchema.safeParse({
      carro_id: carroId,
      item: "envelope",
      usuario_auth_user_id: "kaic"
    });
    expect(parsed.success).toBe(false);
  });
});

describe("registrarDevolucaoSchema", () => {
  it("aceita objeto vazio (devolucao normal pelo usuario logado)", () => {
    expect(registrarDevolucaoSchema.safeParse({}).success).toBe(true);
  });

  it("aceita overrides ADM", () => {
    const parsed = registrarDevolucaoSchema.safeParse({
      usuario_auth_user_id: userAuthId,
      devolvido_em: "2026-05-15T14:00:00Z"
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita data invalida no override", () => {
    expect(
      registrarDevolucaoSchema.safeParse({ devolvido_em: "hoje" }).success
    ).toBe(false);
  });
});

describe("atualizarEnvelopeSchema", () => {
  it("aceita patch parcial", () => {
    const parsed = atualizarEnvelopeSchema.safeParse({ status: "devolvido", devolvido_em: "2026-05-20T10:00:00Z" });
    expect(parsed.success).toBe(true);
  });

  it("aceita usuario nulo (ADM removendo o autor)", () => {
    const parsed = atualizarEnvelopeSchema.safeParse({ usuario_auth_user_id: null });
    expect(parsed.success).toBe(true);
  });

  it("rejeita patch vazio", () => {
    const parsed = atualizarEnvelopeSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("rejeita status fora do enum", () => {
    expect(atualizarEnvelopeSchema.safeParse({ status: "perdido" }).success).toBe(false);
  });
});
