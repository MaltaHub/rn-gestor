import { buildAuthHeaders, buildRequestHeaders } from "@/components/ui-grid/api";
import type { RequestAuth } from "@/components/ui-grid/types";
import { apiFetch, parseEnvelope } from "@/lib/api/http-client";

const PROFILE_API_TIMEOUT_MS = 20_000;

export type MyProfile = {
  id: string;
  nome: string;
  email: string | null;
  foto: string | null;
  bio: string | null;
  telefone: string | null;
};

function parseApi<T>(response: Response): Promise<T> {
  return parseEnvelope<T>(response, { fallbackErrorMessage: "Falha na API de perfil." });
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  return apiFetch(input, init, {
    timeoutMs: PROFILE_API_TIMEOUT_MS,
    timeoutMessage: "Tempo limite excedido ao comunicar com a API de perfil."
  });
}

export async function fetchMyProfile(requestAuth: RequestAuth) {
  const response = await fetchWithTimeout("/api/v1/me/perfil", {
    cache: "no-store",
    headers: buildRequestHeaders(requestAuth)
  });
  return parseApi<MyProfile>(response);
}

export async function updateMyProfile(params: {
  requestAuth: RequestAuth;
  updates: { bio?: string | null; telefone?: string | null; foto?: string | null };
}) {
  const response = await fetchWithTimeout("/api/v1/me/perfil", {
    method: "PATCH",
    headers: buildRequestHeaders(params.requestAuth),
    body: JSON.stringify(params.updates)
  });
  return parseApi<MyProfile>(response);
}

export async function uploadMyAvatar(params: { requestAuth: RequestAuth; file: File }) {
  const form = new FormData();
  form.append("file", params.file);
  // Multipart: só headers de auth — NÃO forçar Content-Type (o boundary do
  // FormData é definido automaticamente pelo fetch).
  const response = await fetchWithTimeout("/api/v1/me/avatar", {
    method: "POST",
    headers: buildAuthHeaders(params.requestAuth),
    body: form
  });
  return parseApi<MyProfile>(response);
}
