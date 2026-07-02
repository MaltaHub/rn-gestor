import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  enrichDocumentoGridRows,
  listMissingDocumentoGridRows,
  summarizeDocumentoInsights,
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
  it("gera linha virtual apenas para carros DISPONIVEIS sem registro em documentos", async () => {
    const { supabase } = createSupabaseMock({
      carros: [
        { id: "car-1", placa: "ABC1D23", estado_venda: "DISPONIVEL" },
        { id: "car-2", placa: "XYZ9Z99", estado_venda: "Disponível" },
        // Vendido/reservado sem linha NAO entram no calculo (so disponiveis).
        { id: "car-3", placa: "JJJ1J11", estado_venda: "VENDIDO" },
        { id: "car-4", placa: "KKK2K22", estado_venda: "RESERVADO" }
      ],
      documentos: [{ carro_id: "car-1", envelope: "AUSENTE" }]
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

describe("summarizeDocumentoInsights", () => {
  it("conta finalizar (vendidos com envelope != FECHADO) e faltas so de disponiveis", async () => {
    const { supabase } = createSupabaseMock({
      carros: [
        // disponivel COM linha: nao falta
        { id: "car-1", placa: "AAA1A11", estado_venda: "DISPONIVEL" },
        // disponivel SEM linha: falta
        { id: "car-2", placa: "BBB2B22", estado_venda: "NOVO" },
        // vendido sem linha: NAO conta como falta
        { id: "car-3", placa: "CCC3C33", estado_venda: "VENDIDO" },
        // vendidos com linha: contam em finalizar conforme o envelope
        { id: "car-4", placa: "DDD4D44", estado_venda: "VENDIDO" },
        { id: "car-5", placa: "EEE5E55", estado_venda: "VENDIDO" }
      ],
      documentos: [
        { carro_id: "car-1", envelope: "AUSENTE" },
        { carro_id: "car-4", envelope: "FECHANDO" },
        // envelope FECHADO: ciclo concluido, fora do finalizar
        { carro_id: "car-5", envelope: "FECHADO" }
      ]
    });

    const summary = await summarizeDocumentoInsights(supabase);

    expect(summary).toEqual({ finalizarCount: 1, missingCount: 1, responsavelPendenteCount: 0 });
  });

  it("conta PRONTO sem responsavel do virado (vazio ou 'Nao chegou')", async () => {
    const { supabase } = createSupabaseMock({
      carros: [
        { id: "car-1", placa: "AAA1A11", estado_venda: "DISPONIVEL", estado_veiculo: "PRONTO" },
        { id: "car-2", placa: "BBB2B22", estado_venda: "DISPONIVEL", estado_veiculo: "PRONTO" },
        // PRONTO com responsavel preenchido: NAO conta
        { id: "car-3", placa: "CCC3C33", estado_venda: "DISPONIVEL", estado_veiculo: "PRONTO" },
        // nao PRONTO: fora do calculo mesmo sem responsavel
        { id: "car-4", placa: "DDD4D44", estado_venda: "NOVO", estado_veiculo: "NOVO" }
      ],
      documentos: [
        { carro_id: "car-1", envelope: "AUSENTE", responsavel_virado: null },
        { carro_id: "car-2", envelope: "AUSENTE", responsavel_virado: "Não chegou" },
        { carro_id: "car-3", envelope: "AUSENTE", responsavel_virado: "Maria" },
        { carro_id: "car-4", envelope: "AUSENTE", responsavel_virado: null }
      ]
    });

    const summary = await summarizeDocumentoInsights(supabase);

    expect(summary.responsavelPendenteCount).toBe(2);
  });
});
