import { ApiClientError, buildRequestHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import type { ApiEnvelope } from "@/lib/core/types";

const ADMIN_API_TIMEOUT_MS = 15_000;

export type AdminAccessUser = {
  id: string;
  auth_user_id: string | null;
  nome: string;
  email: string | null;
  cargo: string;
  status: string;
  foto: string | null;
  obs: string | null;
  ultimo_login: string | null;
  aprovado_em: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminAccessLookupOption = {
  code: string;
  name: string;
};

export type AdminUsersPayload = {
  users: AdminAccessUser[];
  lookups: {
    roles: AdminAccessLookupOption[];
    statuses: AdminAccessLookupOption[];
  };
};

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ADMIN_API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError("Tempo limite excedido ao comunicar com a API de administracao.", {
        status: 408,
        code: "REQUEST_TIMEOUT"
      });
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function parseApi<T>(response: Response): Promise<T> {
  const json = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || json.error) {
    throw new ApiClientError(json.error?.message ?? "Falha na API administrativa.", {
      status: response.status,
      code: json.error?.code,
      details: json.error?.details
    });
  }

  return json.data;
}

export async function fetchAdminUsers(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/admin/users", {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  });

  return parseApi<AdminUsersPayload>(response);
}

export async function updateAdminUser(params: {
  id: string;
  requestAuth: RequestAuth;
  updates: {
    nome?: string;
    obs?: string | null;
    cargo?: string;
    status?: string;
  };
}) {
  const response = await fetchWithTimeout(`/api/v1/admin/users/${params.id}`, {
    method: "PATCH",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify(params.updates)
  });

  return parseApi<{ user: AdminAccessUser }>(response);
}

export async function sendPasswordRecoveryLink(params: { id: string; requestAuth: RequestAuth }) {
  const response = await fetchWithTimeout(`/api/v1/admin/users/${params.id}/send-recovery`, {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth)
  });
  return parseApi<{ recoveryLink: string | null }>(response);
}

export async function banAdminUser(params: { id: string; requestAuth: RequestAuth }) {
  const response = await fetchWithTimeout(`/api/v1/admin/users/${params.id}/ban`, {
    method: "POST",
    headers: buildRequestHeaders(params.requestAuth)
  });
  return parseApi<{ banned: boolean; id: string }>(response);
}

export async function deleteAdminUser(params: { id: string; requestAuth: RequestAuth }) {
  const response = await fetchWithTimeout(`/api/v1/admin/users/${params.id}/delete`, {
    method: "DELETE",
    headers: buildRequestHeaders(params.requestAuth)
  });
  return parseApi<{ deleted: boolean; id: string }>(response);
}
