import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O estado do renovador vive no modulo (cooldown, ultimo resultado). Cada teste
 * importa uma instancia limpa para nao herdar a janela do teste anterior.
 */
async function loadHttpClient() {
  vi.resetModules();
  return import("@/lib/api/http-client");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refreshAccessTokenOnce", () => {
  it("devolve null quando nao ha renovador registrado", async () => {
    const { refreshAccessTokenOnce } = await loadHttpClient();
    await expect(refreshAccessTokenOnce()).resolves.toBeNull();
  });

  it("deduplica chamadas concorrentes numa unica renovacao", async () => {
    const { refreshAccessTokenOnce, registerTokenRefresher } = await loadHttpClient();
    const refresher = vi.fn(async () => "token-novo");
    registerTokenRefresher(refresher);

    const results = await Promise.all([
      refreshAccessTokenOnce(),
      refreshAccessTokenOnce(),
      refreshAccessTokenOnce()
    ]);

    expect(results).toEqual(["token-novo", "token-novo", "token-novo"]);
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it("reaproveita o token da janela sem renovar de novo", async () => {
    const { refreshAccessTokenOnce, registerTokenRefresher } = await loadHttpClient();
    const refresher = vi.fn(async () => "token-novo");
    registerTokenRefresher(refresher);

    await refreshAccessTokenOnce();
    vi.setSystemTime(Date.now() + 2_000);
    await expect(refreshAccessTokenOnce()).resolves.toBe("token-novo");

    // Anti-churn: renovar a cada 401 rotacionava o token e derrubava o app.
    expect(refresher).toHaveBeenCalledTimes(1);
  });

  // REGRESSAO: uma falha nao pode calar a janela inteira. O cooldown guardava
  // `null` por 10s e, nesse intervalo, TODA chamada que tomava 401 desistia sem
  // repetir — a rajada de abertura da planilha morria e a tabela vinha vazia ate
  // o "Recarregar" manual.
  it("tenta de novo logo apos uma renovacao que falhou", async () => {
    const { refreshAccessTokenOnce, registerTokenRefresher } = await loadHttpClient();
    const refresher = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("token-recuperado");
    registerTokenRefresher(refresher);

    await expect(refreshAccessTokenOnce()).resolves.toBeNull();

    vi.setSystemTime(Date.now() + 1_500);
    await expect(refreshAccessTokenOnce()).resolves.toBe("token-recuperado");
    expect(refresher).toHaveBeenCalledTimes(2);
  });

  it("segura a repeticao imediata apos falha para nao virar loop apertado", async () => {
    const { refreshAccessTokenOnce, registerTokenRefresher } = await loadHttpClient();
    const refresher = vi.fn(async () => null);
    registerTokenRefresher(refresher);

    await refreshAccessTokenOnce();
    vi.setSystemTime(Date.now() + 50);
    await expect(refreshAccessTokenOnce()).resolves.toBeNull();

    expect(refresher).toHaveBeenCalledTimes(1);
  });

  it("trata excecao do renovador como falha, sem propagar", async () => {
    const { refreshAccessTokenOnce, registerTokenRefresher } = await loadHttpClient();
    registerTokenRefresher(async () => {
      throw new Error("rede caiu");
    });

    await expect(refreshAccessTokenOnce()).resolves.toBeNull();
  });
});
