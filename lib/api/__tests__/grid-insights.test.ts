import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { listMissingAnuncioGridRows } from "@/lib/api/grid-insights";
import type { Database } from "@/lib/supabase/database.types";

function createSupabaseMock(rows: Array<Record<string, unknown>>) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: null });
  const from = vi.fn().mockReturnValue({ select });

  return {
    supabase: { from } as unknown as SupabaseClient<Database>,
    from,
    select,
  };
}

describe("listMissingAnuncioGridRows", () => {
  it("propagates the view insight code and keeps the generic fallback for older rows", async () => {
    const { supabase, from, select } = createSupabaseMock([
      {
        grid_row_id: "missing:car-1",
        carro_id: "car-1",
        preco_carro_atual: 12345,
        insight_code: "AUSENTE_EXTRA",
        insight_message: "Veiculo repetido sem anuncio proprio, em grupo ja anunciado, com preco diferente.",
        criterio_referencia: "REPETIDO_AUSENTE_EXTRA",
        grupo_id: "group-1",
        origem_repetido: true,
      },
      {
        grid_row_id: "missing:car-2",
        carro_id: "car-2",
        preco_carro_atual: 20000,
        insight_message: "Veiculo de referencia sem anuncio cadastrado: Sem nome",
        criterio_referencia: "CARRO_UNICO",
        grupo_id: null,
        origem_repetido: false,
      },
    ]);

    const rows = await listMissingAnuncioGridRows(supabase);

    expect(from).toHaveBeenCalledWith("anuncios_missing_reference");
    expect(select).toHaveBeenCalledWith(
      "grid_row_id, carro_id, preco_carro_atual, insight_code, insight_message, criterio_referencia, grupo_id, origem_repetido"
    );
    expect(rows[0]).toMatchObject({
      id: "missing:car-1",
      estado_anuncio: "AUSENTE_EXTRA",
      __insight_code: "AUSENTE_EXTRA",
      __insight_message: "Veiculo repetido sem anuncio proprio, em grupo ja anunciado, com preco diferente.",
      __reference_kind: "REPETIDO_AUSENTE_EXTRA",
      __reference_from_repeated: true,
    });
    expect(rows[1]).toMatchObject({
      id: "missing:car-2",
      estado_anuncio: "AUSENTE",
      __insight_code: "ANUNCIO_SEM_REFERENCIA",
      __reference_kind: "CARRO_UNICO",
      __reference_from_repeated: false,
    });
  });
});
