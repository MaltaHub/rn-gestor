import type { CurrentActor } from "@/components/ui-grid/types";
import type { PlaygroundWorkbook } from "@/components/playground/types";
import { createWorkbook } from "@/components/playground/grid-utils";
import { migratePlaygroundWorkbook } from "@/components/playground/infra/playground-migrations";

const STORAGE_PREFIX = "rn-gestor.playground.v1";

function actorStorageId(actor: CurrentActor) {
  return actor.authUserId ?? actor.userId ?? actor.userEmail ?? `dev-${actor.role}`;
}

export function getPlaygroundStorageKey(actor: CurrentActor) {
  return `${STORAGE_PREFIX}.${actorStorageId(actor)}`;
}

export function loadPlaygroundWorkbook(actor: CurrentActor): PlaygroundWorkbook {
  if (typeof window === "undefined") return createWorkbook();

  const raw = window.localStorage.getItem(getPlaygroundStorageKey(actor));
  if (!raw) return createWorkbook();

  try {
    return migratePlaygroundWorkbook(JSON.parse(raw));
  } catch {
    return createWorkbook();
  }
}

export function savePlaygroundWorkbook(actor: CurrentActor, workbook: PlaygroundWorkbook) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getPlaygroundStorageKey(actor), JSON.stringify(migratePlaygroundWorkbook(workbook)));
}

