import { describe, expect, it } from "vitest";
import {
  flowRunHeartbeatSchema,
  flowRunPatchSchema,
  flowRunStartSchema
} from "@/lib/domain/editor-flow-runs/schemas";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("flowRunStartSchema", () => {
  it("aceita flow_id uuid", () => {
    expect(flowRunStartSchema.safeParse({ flow_id: VALID_UUID }).success).toBe(true);
  });

  it("rejeita string nao-uuid", () => {
    expect(flowRunStartSchema.safeParse({ flow_id: "abc" }).success).toBe(false);
  });

  it("rejeita campos extras (strict)", () => {
    expect(
      flowRunStartSchema.safeParse({ flow_id: VALID_UUID, junk: 1 }).success
    ).toBe(false);
  });
});

describe("flowRunPatchSchema", () => {
  it("exige lock_token + pelo menos 1 mutacao", () => {
    expect(flowRunPatchSchema.safeParse({ lock_token: VALID_UUID }).success).toBe(false);
    expect(
      flowRunPatchSchema.safeParse({ lock_token: VALID_UUID, status: "completed" }).success
    ).toBe(true);
  });

  it("aceita context jsonb e status validos", () => {
    expect(
      flowRunPatchSchema.safeParse({
        lock_token: VALID_UUID,
        status: "failed",
        context: { logs: [] },
        error: "boom"
      }).success
    ).toBe(true);
  });

  it("rejeita status invalido", () => {
    expect(
      flowRunPatchSchema.safeParse({ lock_token: VALID_UUID, status: "foo" }).success
    ).toBe(false);
  });
});

describe("flowRunHeartbeatSchema", () => {
  it("exige lock_token uuid", () => {
    expect(flowRunHeartbeatSchema.safeParse({ lock_token: VALID_UUID }).success).toBe(true);
    expect(flowRunHeartbeatSchema.safeParse({}).success).toBe(false);
    expect(flowRunHeartbeatSchema.safeParse({ lock_token: "abc" }).success).toBe(false);
  });
});
