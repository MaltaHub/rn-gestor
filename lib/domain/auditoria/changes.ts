/**
 * O que uma linha da auditoria mudou — puro (servidor e tela).
 *
 * Formato gravado pela trigger do banco (`fn_auditoria_registrar`):
 *  - UPDATE: só os campos alterados em `dados_anteriores`/`dados_novos`;
 *  - INSERT: a linha em `dados_novos`; DELETE: a linha em `dados_anteriores`;
 *  - coluna grande alterada = `{ "__omitido": true }`; o veículo vai em `__veiculo`.
 * Logs antigos (gravados pelo app até 2026-11-09) têm a linha inteira dos dois lados: o diff
 * abaixo também serve para eles.
 */

export type AuditAction = "INSERT" | "UPDATE" | "DELETE";

export type AuditChange = {
  field: string;
  before: unknown;
  after: unknown;
  /** Coluna grande (conteúdo de documento, exemplo de OCR…): só se sabe que mudou. */
  omitted: boolean;
};

export type AuditVehicle = { carroId: string | null; placa: string | null };

/** Carimbos que não contam como alteração (a trigger já ignora; logs antigos não). */
const NOISE = new Set(["updated_at", "ultima_alteracao", "updated_by", "updated_by_user_id", "created_at"]);

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOmitted(value: unknown) {
  return isRecord(value) && value.__omitido === true;
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function visibleKeys(record: Json) {
  return Object.keys(record).filter((key) => !key.startsWith("__") && !NOISE.has(key));
}

export function buildAuditChanges(action: string, before: unknown, after: unknown): AuditChange[] {
  const old = isRecord(before) ? before : null;
  const next = isRecord(after) ? after : null;

  if (old && next) {
    const keys = Array.from(new Set([...visibleKeys(old), ...visibleKeys(next)]));
    return keys
      .filter((key) => !same(old[key], next[key]) || isOmitted(next[key]))
      .map((key) => ({ field: key, before: old[key], after: next[key], omitted: isOmitted(next[key]) }));
  }

  // INSERT (só depois) ou DELETE (só antes): os campos preenchidos.
  const snapshot = next ?? old;
  if (!snapshot) return [];
  const insert = action !== "DELETE" && next !== null;
  return visibleKeys(snapshot)
    .filter((key) => snapshot[key] !== null && snapshot[key] !== "" && !(Array.isArray(snapshot[key]) && (snapshot[key] as unknown[]).length === 0))
    .map((key) => ({
      field: key,
      before: insert ? undefined : snapshot[key],
      after: insert ? snapshot[key] : undefined,
      omitted: isOmitted(snapshot[key])
    }));
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Veículo da linha: `__veiculo` (trigger) ou, em logs antigos, a própria linha. */
export function auditVehicle(table: string, pk: string | null, before: unknown, after: unknown): AuditVehicle {
  for (const side of [after, before]) {
    if (isRecord(side) && isRecord(side.__veiculo)) {
      return { carroId: text(side.__veiculo.carro_id), placa: text(side.__veiculo.placa) };
    }
  }
  const row = isRecord(after) ? after : isRecord(before) ? before : null;
  if (table === "carros") return { carroId: pk, placa: row ? text(row.placa) : null };
  if (table === "finalizados") return { carroId: null, placa: row ? text(row.placa) : null };
  return { carroId: row ? text(row.carro_id) : null, placa: null };
}

// ------------------------------------------------------------------ exibição

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Valor legível (data ISO real, número, sim/não). Nunca formata texto qualquer como data. */
export function formatAuditValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (isOmitted(value)) return "conteúdo alterado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("pt-BR") : String(value);
  if (typeof value === "string") {
    const date = ISO_DATE.exec(value);
    if (date) return `${date[3]}/${date[2]}/${date[1]}`;
    if (ISO_DATETIME.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map((item) => formatAuditValue(item)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
