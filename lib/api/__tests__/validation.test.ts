import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonBody, parseSearchParams, parseWithSchema } from "@/lib/api/validation";
import { ApiHttpError } from "@/lib/api/errors";

function makeRequest(body: unknown, brokenJson = false) {
  return {
    async json() {
      if (brokenJson) throw new Error("invalid JSON");
      return body;
    }
  } as unknown as Parameters<typeof parseJsonBody>[0];
}

describe("parseWithSchema", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns parsed data on success", () => {
    const data = parseWithSchema(schema, { name: "ok" });
    expect(data).toEqual({ name: "ok" });
  });

  it("throws ApiHttpError(400, BAD_REQUEST) with issues on failure", () => {
    try {
      parseWithSchema(schema, { name: 123 });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiHttpError);
      const apiError = error as ApiHttpError;
      expect(apiError.status).toBe(400);
      expect(apiError.code).toBe("BAD_REQUEST");
      const details = apiError.details as { issues: Array<{ path: PropertyKey[]; message: string }> };
      expect(details.issues.length).toBeGreaterThan(0);
      expect(details.issues[0].path).toEqual(["name"]);
    }
  });

  it("honors custom code/message arguments", () => {
    try {
      parseWithSchema(schema, {}, "FOO_BAD", "Foo invalid.");
      throw new Error("expected throw");
    } catch (error) {
      const apiError = error as ApiHttpError;
      expect(apiError.code).toBe("FOO_BAD");
      expect(apiError.message).toBe("Foo invalid.");
    }
  });

  it("strips extra keys by default", () => {
    const data = parseWithSchema(schema, { name: "ok", extra: "ignored" });
    expect(data).toEqual({ name: "ok" });
    expect((data as Record<string, unknown>).extra).toBeUndefined();
  });

  it("rejects extras when schema opts into strict", () => {
    const strict = z.object({ name: z.string() }).strict();
    try {
      parseWithSchema(strict, { name: "ok", extra: "rejected" });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiHttpError);
      expect((error as ApiHttpError).status).toBe(400);
    }
  });
});

describe("parseJsonBody", () => {
  const schema = z.object({ name: z.string() });

  it("parses valid JSON body", async () => {
    const result = await parseJsonBody(makeRequest({ name: "ok" }), schema);
    expect(result).toEqual({ name: "ok" });
  });

  it("returns BAD_BODY when JSON is not parseable", async () => {
    try {
      await parseJsonBody(makeRequest(undefined, true), schema);
      throw new Error("expected throw");
    } catch (error) {
      const apiError = error as ApiHttpError;
      expect(apiError.status).toBe(400);
      expect(apiError.code).toBe("BAD_BODY");
    }
  });

  it("returns BAD_REQUEST when schema rejects", async () => {
    try {
      await parseJsonBody(makeRequest({ wrong: 1 }), schema);
      throw new Error("expected throw");
    } catch (error) {
      const apiError = error as ApiHttpError;
      expect(apiError.code).toBe("BAD_REQUEST");
    }
  });
});

describe("parseSearchParams", () => {
  it("flattens URLSearchParams into a single-value object", () => {
    const schema = z.object({ a: z.string(), b: z.string() });
    const params = new URLSearchParams("a=1&b=2");
    expect(parseSearchParams(params, schema)).toEqual({ a: "1", b: "2" });
  });

  it("keeps only the first value when keys repeat", () => {
    const schema = z.object({ a: z.string() });
    const params = new URLSearchParams("a=first&a=second");
    expect(parseSearchParams(params, schema)).toEqual({ a: "first" });
  });

  it("rejects on missing required keys", () => {
    const schema = z.object({ a: z.string() });
    const params = new URLSearchParams("b=1");
    expect(() => parseSearchParams(params, schema)).toThrow(ApiHttpError);
  });
});
