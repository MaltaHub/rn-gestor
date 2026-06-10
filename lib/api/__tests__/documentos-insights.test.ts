import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  enrichDocumentoGridRows,
  listMissingDocumentoGridRows,
} from "@/lib/api/documentos-insights";
import type { Database } from "@/lib/supabase/database.types";

type TableRows = Record<string, Array<Record<string, unknown>>>;

/** Mock minimo: from(table).select(...[, opts]) e .in() resolvem com os rows da tabela. */
function createSupabaseMock(rowsByTable: TableRows) {
  const from = vi.fn((table: string) => {
    const data = rowsByTable[table] ?? [];
    const result = { data, error: null, count: data.length };
    const chain = {
      select: vi.fn().mockReturnValue({
        ...result,
        in: vi.fn().mockResolvedValue(result),
        eq: vi.fn().mockResolvedValue(result),
        then: (resolve: (value: typeof result) => unknown) => resolve(result)
      })
    };
    return chain;
  });

  return { supabase: { from } as unknown as SupabaseClient<Database>, from };
}

describe("enrichDocumentoGridRows", () => {
  it("marca __finalizar_documento para vendido com envelope nao FECHADO e junta a placa", async () => {
    const { supabase } = createSupabaseMock({
      carros: [
        { id: "car-1", placa: "ABC1D23", estado_venda: "VENDIDO" },
        { id: "car-2", placa: "XYZ9Z99", estado_venda: "DISPONIVEL" },
        { id: "car-3", placa: "QWE2R45", estado_venda: "VENDIDO" }
      ]
    });

    const rows = await enrichDocumentoGridRows(supabase, [
      { carro_id: "car-1", envelope: "FECHANDO" },
      { carro_id: "car-2", envelope: "PRONTO" },
      { carro_id: "car-3", envelope: "FECHADO" }
    ]);

    expect(rows[0]).toMatchObject({
      placa: "ABC1D23",
      __finalizar_documento: true,
      __insight_code: "FINALIZAR_DOCUMENTO"
    });
    expect(rows[1]).toMatchObject({ placa: "XYZ9Z99", __finalizar_documento: false, __insight_code: null });
    // Vendido mas envelope FECHADO: ciclo concluido, sem insight.
    expect(rows[2]).toMatchObject({ placa: "QWE2R45", __finalizar_documento: false });
  });
});

describe("listMissingDocumentoGridRows", () => {
  it("gera linha virtual apenas para carros sem registro em documentos", async () => {
    const { supabase } = createSupabaseMock({
      carros: [
        { id: "car-1", placa: "ABC1D23", estado_venda: "DISPONIVEL" },
        { id: "car-2", placa: "XYZ9Z99", estado_venda: "DISPONIVEL" }
      ],
      documentos: [{ carro_id: "car-1" }]
    });

    const rows = await listMissingDocumentoGridRows(supabase);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      carro_id: "car-2",
      placa: "XYZ9Z99",
      __missing_data: true,
      __insight_code: "DOCUMENTO_SEM_LINHA"
    });
  });
});
