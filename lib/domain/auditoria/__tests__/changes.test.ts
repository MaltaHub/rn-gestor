import { describe, expect, it } from "vitest";

import { auditVehicle, buildAuditChanges, formatAuditValue } from "@/lib/domain/auditoria/changes";

describe("auditoria: o que mudou", () => {
  it("UPDATE da trigger: só os campos alterados, sem __veiculo", () => {
    const changes = buildAuditChanges(
      "UPDATE",
      { estado_transferencia: "AGUARDANDO" },
      { estado_transferencia: "VIRADO", __veiculo: { carro_id: "c1", placa: "DRQ5F41" } }
    );
    expect(changes).toEqual([{ field: "estado_transferencia", before: "AGUARDANDO", after: "VIRADO", omitted: false }]);
  });

  it("log antigo com a linha inteira: ignora carimbos (updated_at) e campos iguais", () => {
    const changes = buildAuditChanges(
      "UPDATE",
      { carro_id: "c1", observacao: null, updated_at: "2026-11-07T19:47:13Z", envelope: "ABERTO" },
      { carro_id: "c1", observacao: "SEM OBSERVAÇÕES", updated_at: "2026-11-09T13:48:47Z", envelope: "ABERTO" }
    );
    expect(changes.map((change) => change.field)).toEqual(["observacao"]);
    // Regravar o mesmo valor (só updated_at) não é alteração.
    expect(buildAuditChanges("UPDATE", { a: 1, updated_at: "x" }, { a: 1, updated_at: "y" })).toEqual([]);
  });

  it("INSERT/DELETE: os campos preenchidos; coluna grande vira 'conteúdo alterado'", () => {
    const insert = buildAuditChanges("INSERT", null, { id: "1", nome: "X", obs: null, conteudo: { __omitido: true } });
    expect(insert.map((change) => [change.field, change.after, change.omitted])).toEqual([
      ["id", "1", false],
      ["nome", "X", false],
      ["conteudo", { __omitido: true }, true]
    ]);
    expect(formatAuditValue(insert[2].after)).toBe("conteúdo alterado");

    const removed = buildAuditChanges("DELETE", { id: "1", placa: "ABC1D23" }, null);
    expect(removed.every((change) => change.after === undefined)).toBe(true);
  });

  it("veículo: __veiculo da trigger, ou a própria linha em logs antigos", () => {
    expect(auditVehicle("documentos", "c1", null, { __veiculo: { carro_id: "c1", placa: "TDV2E99" } })).toEqual({ carroId: "c1", placa: "TDV2E99" });
    expect(auditVehicle("carros", "c2", { placa: "ABC1D23" }, null)).toEqual({ carroId: "c2", placa: "ABC1D23" });
    expect(auditVehicle("vendas", "v1", null, { carro_id: "c3" })).toEqual({ carroId: "c3", placa: null });
  });

  it("formata só datas ISO reais", () => {
    expect(formatAuditValue("2026-11-09")).toBe("09/11/2026");
    expect(formatAuditValue("CRETA 1.6")).toBe("CRETA 1.6");
    expect(formatAuditValue(true)).toBe("Sim");
    expect(formatAuditValue(null)).toBe("—");
    expect(formatAuditValue(150000)).toBe((150000).toLocaleString("pt-BR"));
  });
});
