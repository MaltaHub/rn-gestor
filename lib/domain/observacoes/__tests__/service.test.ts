import { describe, expect, it } from "vitest";
import {
  atualizarObservacaoSchema,
  comparePostits,
  resolverObservacaoSchema
} from "@/lib/domain/observacoes/service";

const base = { tipo: "observacao", prazo: null as string | null, created_at: "2026-05-01T00:00:00Z" };

function sortKeys(rows: Array<Partial<typeof base> & { id: string }>) {
  return [...rows]
    .map((r) => ({ ...base, ...r }))
    .sort(comparePostits)
    .map((r) => (r as { id: string }).id);
}

describe("comparePostits", () => {
  it("fixo sempre vem primeiro", () => {
    const order = sortKeys([
      { id: "obs", tipo: "observacao", created_at: "2026-05-10T00:00:00Z" },
      { id: "fixo", tipo: "fixo", created_at: "2026-01-01T00:00:00Z" },
      { id: "urg", tipo: "urgente", created_at: "2026-05-20T00:00:00Z" }
    ]);
    expect(order[0]).toBe("fixo");
  });

  it("entre nao-fixos, prazo mais proximo sobe", () => {
    const order = sortKeys([
      { id: "longe", prazo: "2026-12-01" },
      { id: "perto", prazo: "2026-06-01" },
      { id: "meio", prazo: "2026-08-01" }
    ]);
    expect(order).toEqual(["perto", "meio", "longe"]);
  });

  it("sem prazo fica depois dos com prazo", () => {
    const order = sortKeys([
      { id: "sem", prazo: null },
      { id: "com", prazo: "2026-07-01" }
    ]);
    expect(order).toEqual(["com", "sem"]);
  });

  it("atrasado (passado) sobe acima do futuro", () => {
    const order = sortKeys([
      { id: "futuro", prazo: "2026-09-01" },
      { id: "atrasado", prazo: "2026-02-01" }
    ]);
    expect(order[0]).toBe("atrasado");
  });

  it("mesmo prazo: mais recente primeiro", () => {
    const order = sortKeys([
      { id: "velho", prazo: "2026-07-01", created_at: "2026-05-01T00:00:00Z" },
      { id: "novo", prazo: "2026-07-01", created_at: "2026-05-20T00:00:00Z" }
    ]);
    expect(order).toEqual(["novo", "velho"]);
  });
});

describe("atualizarObservacaoSchema", () => {
  it("aceita patch parcial", () => {
    expect(atualizarObservacaoSchema.safeParse({ texto: "novo texto" }).success).toBe(true);
    expect(atualizarObservacaoSchema.safeParse({ tipo: "urgente" }).success).toBe(true);
    expect(atualizarObservacaoSchema.safeParse({ feedback_solucao: "feedback" }).success).toBe(true);
  });

  it("aceita titulo / prazo / feedback nulos", () => {
    expect(atualizarObservacaoSchema.safeParse({ titulo: null }).success).toBe(true);
    expect(atualizarObservacaoSchema.safeParse({ prazo: null }).success).toBe(true);
    expect(atualizarObservacaoSchema.safeParse({ feedback_solucao: null }).success).toBe(true);
  });

  it("rejeita patch vazio", () => {
    expect(atualizarObservacaoSchema.safeParse({}).success).toBe(false);
  });

  it("rejeita texto vazio", () => {
    expect(atualizarObservacaoSchema.safeParse({ texto: "   " }).success).toBe(false);
  });

  it("rejeita tipo fora do enum", () => {
    expect(atualizarObservacaoSchema.safeParse({ tipo: "outro" }).success).toBe(false);
  });

  it("rejeita prazo fora do formato YYYY-MM-DD", () => {
    expect(atualizarObservacaoSchema.safeParse({ prazo: "30/05/2026" }).success).toBe(false);
  });
});

describe("resolverObservacaoSchema", () => {
  it("aceita objeto vazio (resolver sem feedback)", () => {
    expect(resolverObservacaoSchema.safeParse({}).success).toBe(true);
  });

  it("aceita feedback string ou null", () => {
    expect(resolverObservacaoSchema.safeParse({ feedback_solucao: "ok" }).success).toBe(true);
    expect(resolverObservacaoSchema.safeParse({ feedback_solucao: null }).success).toBe(true);
  });

  it("rejeita feedback maior que 2000 chars", () => {
    expect(resolverObservacaoSchema.safeParse({ feedback_solucao: "x".repeat(2001) }).success).toBe(false);
  });
});
