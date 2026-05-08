import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError } from "@/lib/api/response";

type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id: string;
};

const REQUEST_ID = "req-test-123";
const SUPABASE_LIKE_DETAILS = {
  code: "23505",
  message: "duplicate key value violates unique constraint",
  details: 'Key (id)=(1) already exists.',
  hint: "psql hint",
  schema: "public",
  table: "carros"
};

async function readBody(response: Response): Promise<ApiErrorBody> {
  return (await response.json()) as ApiErrorBody;
}

describe("apiError", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("in development", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    it("includes details in the response body", async () => {
      const response = apiError(
        REQUEST_ID,
        500,
        "TEST_CODE",
        "Mensagem de teste.",
        SUPABASE_LIKE_DETAILS
      );

      expect(response.status).toBe(500);
      const body = await readBody(response);
      expect(body.error.code).toBe("TEST_CODE");
      expect(body.error.message).toBe("Mensagem de teste.");
      expect(body.error.details).toEqual(SUPABASE_LIKE_DETAILS);
      expect(body.request_id).toBe(REQUEST_ID);
    });

    it("omits details when none is passed", async () => {
      const response = apiError(REQUEST_ID, 400, "VALIDATION", "Invalid input.");
      const body = await readBody(response);
      expect(body.error).toEqual({ code: "VALIDATION", message: "Invalid input." });
      expect(body.error.details).toBeUndefined();
    });
  });

  describe("in production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    it("strips details from the response body", async () => {
      const response = apiError(
        REQUEST_ID,
        500,
        "TEST_CODE",
        "Mensagem de teste.",
        SUPABASE_LIKE_DETAILS
      );

      expect(response.status).toBe(500);
      const body = await readBody(response);
      expect(body.error.code).toBe("TEST_CODE");
      expect(body.error.message).toBe("Mensagem de teste.");
      expect(body.error.details).toBeUndefined();
      expect(body.request_id).toBe(REQUEST_ID);
    });

    it("does not leak Supabase-shaped objects via JSON serialization", async () => {
      const response = apiError(
        REQUEST_ID,
        400,
        "PG_ERROR",
        "Erro de banco.",
        SUPABASE_LIKE_DETAILS
      );

      const raw = await response.text();
      expect(raw).not.toContain("23505");
      expect(raw).not.toContain("duplicate key value");
      expect(raw).not.toContain("public");
      expect(raw).toContain("PG_ERROR");
      expect(raw).toContain(REQUEST_ID);
    });
  });
});
