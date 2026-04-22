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
