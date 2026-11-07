export class ApiHttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Regra de negócio barrada por trigger do banco: `raise exception 'REGRA: ...'`.
 * O texto depois de "REGRA: " é para o usuário (o resto do erro do banco não).
 */
export function databaseRuleMessage(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "P0001" && message.startsWith("REGRA: ") ? message.slice("REGRA: ".length) : null;
}

export function createGridContractError(
  code:
    | "GRID_CONTRACT_INVALID_QUERY"
    | "GRID_CONTRACT_INVALID_BODY"
    | "GRID_CONTRACT_INVALID_SORT"
    | "GRID_CONTRACT_INVALID_FILTER"
    | "GRID_CONTRACT_INVALID_EDIT_COLUMN"
    | "GRID_CONTRACT_INVALID_MATCH_MODE",
  message: string,
  details?: unknown
) {
  return new ApiHttpError(400, code, message, details);
}
