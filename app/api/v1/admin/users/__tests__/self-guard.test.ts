import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/api/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { deleteUser: vi.fn() } } })
}));

afterEach(() => fromMock.mockReset());

const SELF = "83701bcd-00fa-4af8-81a5-b8ec1f4e8646";
const OTHER = "96f49bf2-58ca-47c8-82ad-64aa69a79e05";

function request(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/v1/admin/users/x", {
    method,
    headers: { "x-user-role": "ADMINISTRADOR", "x-user-id": SELF, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function code(res: Response) {
  return { status: res.status, code: ((await res.json()) as { error?: { code?: string } }).error?.code };
}

/** select(...).eq(...).maybeSingle() devolvendo a linha atual. */
function currentRow(row: Record<string, unknown>) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.update = () => builder;
  builder.single = async () => ({ data: row, error: null });
  builder.maybeSingle = async () => ({ data: row, error: null });
  return builder;
}

describe("a própria conta não se tranca para fora", () => {
  it("banir a si mesmo: 400, sem tocar no banco", async () => {
    const { POST } = await import("@/app/api/v1/admin/users/[id]/ban/route");
    expect(await code(await POST(request("POST"), { params: Promise.resolve({ id: SELF }) }))).toEqual({ status: 400, code: "SELF_ACCOUNT_ACTION" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("excluir a si mesmo: 400, sem tocar no banco", async () => {
    const { DELETE } = await import("@/app/api/v1/admin/users/[id]/delete/route");
    expect(await code(await DELETE(request("DELETE"), { params: Promise.resolve({ id: SELF }) }))).toEqual({ status: 400, code: "SELF_ACCOUNT_ACTION" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("mudar o próprio cargo: 400; mudar o de outra pessoa passa da trava", async () => {
    fromMock.mockImplementation(() => currentRow({ id: SELF, nome: "Kaic", cargo: "ADMINISTRADOR", status: "APROVADO" }));
    const { PATCH } = await import("@/app/api/v1/admin/users/[id]/route");
    expect(await code(await PATCH(request("PATCH", { cargo: "VENDEDOR" }), { params: Promise.resolve({ id: SELF }) }))).toEqual({
      status: 400,
      code: "SELF_ACCOUNT_ACTION"
    });

    const other = await PATCH(request("PATCH", { cargo: "VENDEDOR" }), { params: Promise.resolve({ id: OTHER }) });
    expect((await code(other)).code).not.toBe("SELF_ACCOUNT_ACTION");
  });
});
