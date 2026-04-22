import { createGridContractError } from "@/lib/api/errors";
import type { GridTableConfig } from "@/lib/api/grid-config";
import type { GridRowPayload } from "@/lib/api/grid/types";

export type GridWritePolicy = {
  editableColumns: Set<string>;
  allowedWriteColumns: Set<string>;
};

export function resolveGridWritePolicy(config: GridTableConfig): GridWritePolicy {
  return {
    editableColumns: new Set(config.editableColumns),
    allowedWriteColumns: new Set([config.primaryKey, "__row_id", ...config.editableColumns])
  };
}

export function sanitizeForUpdate(row: GridRowPayload, editableColumns: Iterable<string>) {
  const editable = new Set(editableColumns);
  const out: GridRowPayload = {};

  for (const [key, value] of Object.entries(row)) {
    if (!editable.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }

  return out;
}

export function assertAllowedWritePayload(row: GridRowPayload, policy: GridWritePolicy, config: GridTableConfig) {
  for (const column of Object.keys(row)) {
    if (!policy.allowedWriteColumns.has(column)) {
      throw createGridContractError("GRID_CONTRACT_INVALID_EDIT_COLUMN", "Coluna nao permitida para escrita.", {
        column,
        editableColumns: config.editableColumns
      });
    }
  }
}
