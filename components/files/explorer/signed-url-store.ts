import { useEffect, useSyncExternalStore } from "react";

import { signFileUrls } from "@/components/files/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { SignedUrlVariant } from "@/lib/files/explorer-types";

/**
 * Cache de URLs assinadas, compartilhado pela sessão.
 *
 * - Pedidos de vários componentes no mesmo "tick" viram UM POST /files/sign.
 * - A mesma URL é reusada até perto de expirar → o navegador acerta o cache
 *   HTTP e uma pasta revisitada não baixa as miniaturas de novo.
 * - Persistido em sessionStorage: recarregar a página reaproveita as URLs.
 */

export type SignedEntry = { url: string | null; missing: boolean; expiresAt: number };

const BATCH_WINDOW_MS = 25;
const MAX_IDS_PER_REQUEST = 300;
/** Renova antes do vencimento para não entregar URL prestes a expirar. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const STORAGE_KEY = "rn-gestor.files.signed-urls.v1";

function cacheKey(variant: SignedUrlVariant, fileId: string) {
  return `${variant}:${fileId}`;
}

class SignedUrlStore {
  private entries = new Map<string, SignedEntry>();
  private queued: Record<SignedUrlVariant, Set<string>> = { original: new Set(), thumb: new Set() };
  private waiters = new Map<string, Array<() => void>>();
  private timers: Partial<Record<SignedUrlVariant, number>> = {};
  private listeners = new Set<() => void>();
  private auth: RequestAuth | null = null;
  private persistTimer: number | null = null;
  private loaded = false;

  configure(auth: RequestAuth) {
    this.auth = auth;
    this.load();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(fileId: string, variant: SignedUrlVariant): SignedEntry | undefined {
    const entry = this.entries.get(cacheKey(variant, fileId));
    if (!entry) return undefined;
    if (entry.url && entry.expiresAt - Date.now() < EXPIRY_MARGIN_MS) return undefined;
    return entry;
  }

  /** Garante URLs para os ids (resolve quando todas chegarem ou falharem). */
  ensure(fileIds: string[], variant: SignedUrlVariant): Promise<void> {
    const pending = fileIds.filter((id) => !this.get(id, variant));
    if (pending.length === 0) return Promise.resolve();

    const promises = pending.map(
      (id) =>
        new Promise<void>((resolve) => {
          const key = cacheKey(variant, id);
          this.waiters.set(key, [...(this.waiters.get(key) ?? []), resolve]);
        })
    );
    for (const id of pending) this.queued[variant].add(id);
    if (!this.timers[variant]) {
      this.timers[variant] = window.setTimeout(() => void this.flush(variant), BATCH_WINDOW_MS);
    }
    return Promise.all(promises).then(() => undefined);
  }

  async resolve(fileId: string, variant: SignedUrlVariant): Promise<SignedEntry | undefined> {
    await this.ensure([fileId], variant);
    return this.entries.get(cacheKey(variant, fileId));
  }

  /** Esquece um arquivo (excluído/substituído). */
  forget(fileIds: string[]) {
    for (const id of fileIds) {
      this.entries.delete(cacheKey("original", id));
      this.entries.delete(cacheKey("thumb", id));
    }
    this.emit();
  }

  private async flush(variant: SignedUrlVariant) {
    delete this.timers[variant];
    const ids = Array.from(this.queued[variant]);
    this.queued[variant].clear();
    if (ids.length === 0) return;
    if (!this.auth) {
      // Filhos montam antes do pai configurar a auth: tenta de novo em seguida.
      ids.forEach((id) => this.queued[variant].add(id));
      this.timers[variant] = window.setTimeout(() => void this.flush(variant), 100);
      return;
    }

    for (let start = 0; start < ids.length; start += MAX_IDS_PER_REQUEST) {
      const part = ids.slice(start, start + MAX_IDS_PER_REQUEST);
      try {
        const response = await signFileUrls(this.auth, part, variant);
        const expiresAt = Date.parse(response.expiresAt) || Date.now() + 30 * 60 * 1000;
        for (const id of part) {
          const signed = response.urls[id];
          this.entries.set(cacheKey(variant, id), {
            url: signed?.url ?? null,
            missing: signed?.missing ?? true,
            expiresAt
          });
        }
      } catch {
        // Falha transitória: não grava nada (próximo pedido tenta de novo).
      }
      part.forEach((id) => this.settle(variant, id));
    }
    this.emit();
    this.schedulePersist();
  }

  private settle(variant: SignedUrlVariant, fileId: string) {
    const key = cacheKey(variant, fileId);
    const resolvers = this.waiters.get(key) ?? [];
    this.waiters.delete(key);
    resolvers.forEach((resolve) => resolve());
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private load() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, SignedEntry>;
      const now = Date.now();
      for (const [key, entry] of Object.entries(parsed)) {
        if (entry && typeof entry.expiresAt === "number" && entry.expiresAt - now > EXPIRY_MARGIN_MS) {
          this.entries.set(key, entry);
        }
      }
    } catch {
      // sessionStorage indisponível/corrompido: segue só em memória.
    }
  }

  private schedulePersist() {
    if (this.persistTimer || typeof window === "undefined") return;
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      try {
        const now = Date.now();
        const live = Object.fromEntries(
          Array.from(this.entries.entries()).filter(([, entry]) => entry.url && entry.expiresAt - now > EXPIRY_MARGIN_MS)
        );
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(live));
      } catch {
        // cota cheia/privado: ignora.
      }
    }, 800);
  }
}

export const signedUrlStore = new SignedUrlStore();

/** URL assinada de um arquivo; pede ao servidor quando `enabled`. */
export function useSignedUrl(fileId: string | null, variant: SignedUrlVariant, enabled = true) {
  const entry = useSyncExternalStore(
    signedUrlStore.subscribe,
    () => (fileId ? signedUrlStore.get(fileId, variant) : undefined),
    () => undefined
  );

  useEffect(() => {
    if (!fileId || !enabled || entry) return;
    void signedUrlStore.ensure([fileId], variant);
  }, [enabled, entry, fileId, variant]);

  return entry;
}

/** Link de download: o parâmetro fica fora do token da URL assinada. */
export function withDownloadParam(url: string, fileName: string) {
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;
}
