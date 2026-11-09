/** Situação do acesso → grupo visual (cor) e filtro. Os códigos vêm de lookup_user_statuses. */
export type UserStatusGroup = "aprovado" | "pendente" | "bloqueado";

function norm(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

export function statusGroup(status: string | null | undefined): UserStatusGroup {
  const code = norm(status);
  if (code.includes("APROV") || code.includes("ATIVO") || code.includes("APPROVED") || code.includes("ACTIVE")) return "aprovado";
  if (code.includes("BAN") || code.includes("BLOQ") || code.includes("BLOCK") || code.includes("RECUS")) return "bloqueado";
  return "pendente";
}

export function findStatusCode(options: Array<{ code: string }>, group: UserStatusGroup, prefer?: string) {
  if (prefer) {
    const exact = options.find((option) => norm(option.code) === norm(prefer));
    if (exact) return exact.code;
  }
  return options.find((option) => statusGroup(option.code) === group)?.code ?? null;
}

export function matchesUserSearch(values: Array<string | null | undefined>, query: string) {
  const needle = norm(query);
  if (!needle) return true;
  return values.some((value) => norm(value).includes(needle));
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Hoje, 13:48" · "Ontem, 09:10" · "há 5 dias" · "12/10/2026" · "Nunca". */
export function relativeMoment(iso: string | null | undefined, now = new Date()) {
  if (!iso) return "Nunca";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return `Hoje, ${timeFormat.format(date)}`;
  if (days === 1) return `Ontem, ${timeFormat.format(date)}`;
  if (days < 7) return `há ${days} dias`;
  return dateFormat.format(date);
}

export function fullMoment(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : `${dateFormat.format(date)} ${timeFormat.format(date)}`;
}
