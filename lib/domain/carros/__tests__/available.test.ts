import { describe, expect, it } from "vitest";
import { isEstadoVendaDisponivel } from "@/lib/domain/carros/service";

describe("isEstadoVendaDisponivel", () => {
  it("aceita disponivel/novo independente de acento e caixa", () => {
    expect(isEstadoVendaDisponivel("DISPONIVEL")).toBe(true);
    expect(isEstadoVendaDisponivel("Disponível")).toBe(true);
    expect(isEstadoVendaDisponivel("disponivel")).toBe(true);
    expect(isEstadoVendaDisponivel("NOVO")).toBe(true);
    expect(isEstadoVendaDisponivel("Novo")).toBe(true);
  });

  it("rejeita demais estados", () => {
    expect(isEstadoVendaDisponivel("VENDIDO")).toBe(false);
    expect(isEstadoVendaDisponivel("RESERVADO")).toBe(false);
    expect(isEstadoVendaDisponivel("")).toBe(false);
    expect(isEstadoVendaDisponivel(null)).toBe(false);
    expect(isEstadoVendaDisponivel(undefined)).toBe(false);
  });
});
