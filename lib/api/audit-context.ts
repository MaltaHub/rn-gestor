import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto de auditoria da requisição (só servidor).
 *
 * A auditoria é gravada pelo BANCO (trigger `fn_auditoria_registrar` em cada tabela auditada), então
 * ela vê tudo — inclusive o que as automações do banco fazem. O app só informa QUEM pediu e POR QUÊ:
 * cada chamada do cliente admin ao Supabase leva os cabeçalhos `x-rn-*` (ver `auditRequestHeaders`),
 * que a trigger lê de `request.headers`.
 *
 *  - quem: o usuário logado (`x-rn-ator-id`/`x-rn-ator-nome`); sem usuário = SISTEMA;
 *  - por quê: `describeAudit("…")` antes de gravar (vira `detalhes`);
 *  - grupo: o id da requisição (`lote_id`) junta o que o usuário fez com o que a automação fez em seguida.
 */

type AuditRequestContext = {
  requestId: string;
  actorId: string | null;
  actorName: string | null;
  detail: string | null;
  batch: boolean;
};

const storage = new AsyncLocalStorage<AuditRequestContext>();

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DETAIL_LENGTH = 500;

function toBase64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

/** Abre o contexto de auditoria da requisição (feito pelo `executeApi`). */
export function runWithAuditContext<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  const context: AuditRequestContext = {
    requestId: SAFE_REQUEST_ID.test(requestId) ? requestId : crypto.randomUUID(),
    actorId: null,
    actorName: null,
    detail: null,
    batch: false
  };
  return storage.run(context, fn);
}

/** Registra o autor da requisição (feito pelo `executeAuthenticatedApi` depois de resolver a sessão). */
export function setAuditActor(actor: { userId: string | null; userName: string | null }) {
  const context = storage.getStore();
  if (!context) return;
  context.actorId = actor.userId && UUID.test(actor.userId) ? actor.userId : null;
  context.actorName = actor.userName?.trim() || null;
}

/**
 * Diz POR QUE as próximas gravações desta requisição acontecem (aparece em "Detalhes" na auditoria).
 * Chame ANTES de gravar. `batch` marca operação em massa (importação, mover/apagar vários).
 */
export function describeAudit(detail: string, options: { batch?: boolean } = {}) {
  const context = storage.getStore();
  if (!context) return;
  const text = detail.trim();
  context.detail = text ? text.slice(0, MAX_DETAIL_LENGTH) : null;
  if (options.batch !== undefined) context.batch = options.batch;
}

/** Cabeçalhos que a trigger de auditoria lê. Vazio fora de uma requisição. */
export function auditRequestHeaders(): Record<string, string> | null {
  const context = storage.getStore();
  if (!context) return null;
  const headers: Record<string, string> = { "x-rn-requisicao": context.requestId };
  if (context.actorId) headers["x-rn-ator-id"] = context.actorId;
  if (context.actorName) headers["x-rn-ator-nome"] = toBase64(context.actorName);
  if (context.detail) headers["x-rn-detalhe"] = toBase64(context.detail);
  if (context.batch) headers["x-rn-lote"] = "1";
  return headers;
}

/** `fetch` do cliente admin: anexa os cabeçalhos de auditoria da requisição corrente. */
export const auditAwareFetch: typeof fetch = (input, init) => {
  const extra = auditRequestHeaders();
  if (!extra) return fetch(input, init);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return fetch(input, { ...init, headers });
};
