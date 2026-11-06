import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/api/audit", () => ({ writeAuditLog: vi.fn(async () => undefined) }));

import { bulkUpsertGridRows } from "@/lib/api/grid/bulk";
import type { ActorContext } from "@/lib/api/auth";

const actor = { role: "ADMINISTRADOR", userId: "u1", authUserId: "a1", email: "x@y" } as unknown as ActorContext;

function request(body: unknown) {
  return { json: async () => body } as unknown as NextRequest;
}

/** Supabase mínimo: carros com ids existentes; registra updates/inserts. */
function supabaseMock(existingIds: string[]) {
  const updates: Array<{ patch: Record<string, unknown>; column: string; value: unknown }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    from: () => ({
      select: () => ({
        in: async (_column: string, values: string[]) => ({ data: values.filter((value) => existingIds.includes(value)).map((id) => ({ id })), error: null })
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (column: string, value: unknown) => {
          updates.push({ patch, column, value });
          return { error: null };
        }
      }),
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row);
        return { error: null };
      }
    })
  };
  return { client, updates, inserts };
}

describe("bulk com chave de correspondência NÃO editável (colunas estrangeiras)", () => {
  it("casa pelo id, grava só a coluna editável e nunca insere", async () => {
    const { client, updates, inserts } = supabaseMock(["c1"]);
    const outcome = await bulkUpsertGridRows({
      req: request({
        matchColumn: "id",
        apply: true,
        rows: [
          { id: "c1", crv: "012345678901", created_at: "hack" },
          { id: "c-novo", crv: "999999999999" }
        ]
      }),
      table: "carros",
      actor,
      supabase: client as never
    });

    expect(outcome.results.map((result) => result.op)).toEqual(["update", "error"]);
    expect(updates).toEqual([{ patch: { crv: "012345678901" }, column: "id", value: "c1" }]);
    expect(inserts).toEqual([]);
  });

  it("chave editável segue inserindo quando não existe (comportamento antigo)", async () => {
    const { client, inserts } = supabaseMock([]);
    const outcome = await bulkUpsertGridRows({
      req: request({ matchColumn: "placa", apply: false, rows: [{ placa: "ABC1D23", cor: "PRATA" }] }),
      table: "carros",
      actor,
      supabase: client as never
    });
    expect(outcome.results.map((result) => result.op)).toEqual(["insert"]);
    expect(inserts).toEqual([]); // dry-run
  });
});
