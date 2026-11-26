import { describe, expect, it } from "vitest";
import { checkBackupLink, interpretBackupPing, normalizeBackupLink } from "@/lib/domain/backup/link";

const EXEC = "https://script.google.com/macros/s/AKfycbx_1234567890abcdefghij/exec";

describe("normalizeBackupLink", () => {
  it("aceita o /exec, tirando espaços e parâmetros", () => {
    expect(normalizeBackupLink(`  ${EXEC}?page=grid&k=x  `)).toBe(EXEC);
  });

  it("recusa outros endereços", () => {
    for (const url of [
      EXEC.replace("/exec", "/dev"),
      EXEC.replace("https", "http"),
      "https://script.google.com.evil.com/macros/s/AKfycbx_1234567890abcdefghij/exec",
      "https://exemplo.com/exec",
      ""
    ]) {
      expect(normalizeBackupLink(url), url).toBeNull();
    }
  });
});

describe("interpretBackupPing", () => {
  it("o script do backup recusa sem token: é o esperado", () => {
    expect(interpretBackupPing(200, '{"ok":false,"error":"BACKUP_UNAUTHORIZED"}').ok).toBe(true);
  });

  it("explica os problemas comuns", () => {
    expect(interpretBackupPing(200, '{"ok":false,"error":"BACKUP_TOKEN_NOT_CONFIGURED"}').message).toContain("WEBHOOK_TOKEN");
    expect(interpretBackupPing(200, "<html>https://accounts.google.com/ServiceLogin</html>").message).toContain("Qualquer pessoa");
    expect(interpretBackupPing(404, "<html>Not Found</html>").message).toContain("não existe");
    expect(interpretBackupPing(200, "<html>outra coisa</html>").ok).toBe(false);
  });
});

describe("checkBackupLink", () => {
  it("faz POST sem token e lê a resposta", async () => {
    let sent: RequestInit | undefined;
    const fetcher = (async (_url: string, init?: RequestInit) => {
      sent = init;
      return new Response('{"ok":false,"error":"BACKUP_UNAUTHORIZED"}', { status: 200 });
    }) as typeof fetch;

    expect((await checkBackupLink(EXEC, fetcher)).ok).toBe(true);
    expect(sent?.method).toBe("POST");
    expect(JSON.parse(String(sent?.body))).toEqual({ ops: [] });
  });

  it("falha de rede vira mensagem, não exceção", async () => {
    const fetcher = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await checkBackupLink(EXEC, fetcher)).toEqual({ ok: false, message: "Não foi possível falar com o Apps Script." });
  });
});
