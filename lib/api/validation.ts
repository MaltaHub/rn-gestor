import { z } from "zod";
import type { NextRequest } from "next/server";
import { ApiHttpError } from "@/lib/api/errors";

export type ValidationIssue = {
  path: ReadonlyArray<PropertyKey>;
  message: string;
  code: string;
};

type RawIssue = {
  path?: ReadonlyArray<PropertyKey>;
  message?: string;
  code?: string;
};

function toIssues(issues: ReadonlyArray<RawIssue>): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path ?? [],
    message: issue.message ?? "",
    code: issue.code ?? "unknown"
  }));
}

/**
 * Validates an already-parsed value against a Zod schema. Throws
 * `ApiHttpError(400, "BAD_REQUEST")` with a normalized `issues` list when the
 * payload is rejected — same shape across every route so the UI can display
 * field-level errors uniformly. Extras are stripped by default (Zod's
 * `.strip()`); schemas wanting to reject unknown keys must opt in with
 * `.strict()`.
 */
export function parseWithSchema<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  code: string = "BAD_REQUEST",
  message: string = "Payload invalido."
): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiHttpError(400, code, message, {
      issues: toIssues(result.error.issues as ReadonlyArray<RawIssue>)
    });
  }
  return result.data as z.output<TSchema>;
}

/**
 * Reads the JSON body of a request and validates it against a Zod schema.
 * - Returns `400 BAD_BODY` if the body is not valid JSON.
 * - Returns `400 BAD_REQUEST` (or `code` argument) if it fails the schema.
 */
export async function parseJsonBody<TSchema extends z.ZodType>(
  req: NextRequest,
  schema: TSchema,
  code: string = "BAD_REQUEST",
  message: string = "Payload invalido."
): Promise<z.output<TSchema>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiHttpError(400, "BAD_BODY", "Body JSON invalido.");
  }
  return parseWithSchema(schema, raw, code, message);
}

/**
 * Validates URL search params against a Zod schema. Receives the raw
 * `URLSearchParams` and converts it to a flat object (only first value per
 * key) before parsing — schemas that need lists should pre-process.
 */
export function parseSearchParams<TSchema extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: TSchema,
  code: string = "BAD_REQUEST",
  message: string = "Parametros invalidos."
): z.output<TSchema> {
  const obj: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!(key in obj)) obj[key] = value;
  }
  return parseWithSchema(schema, obj, code, message);
}
