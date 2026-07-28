import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/domain/password-policy";

const forte = "senhaforte1";

describe("validateNewPassword", () => {
  it("aceita senha valida no fluxo de recuperacao (sem senha atual)", () => {
    expect(validateNewPassword({ novaSenha: forte, confirmacao: forte })).toBeNull();
  });

  it("aceita senha valida na troca pelo perfil", () => {
    expect(
      validateNewPassword({ senhaAtual: "antiga123", novaSenha: forte, confirmacao: forte })
    ).toBeNull();
  });

  it("recusa senha menor que o minimo", () => {
    const curta = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword({ novaSenha: curta, confirmacao: curta })).toMatch(
      String(MIN_PASSWORD_LENGTH)
    );
  });

  it("recusa confirmacao divergente", () => {
    expect(validateNewPassword({ novaSenha: forte, confirmacao: `${forte}x` })).toBe(
      "As senhas nao conferem."
    );
  });

  // Só cobra a senha atual quando o fluxo a envia: a recuperação por email não
  // tem como saber a senha antiga.
  it("cobra a senha atual apenas quando o fluxo a exige", () => {
    expect(validateNewPassword({ senhaAtual: "", novaSenha: forte, confirmacao: forte })).toBe(
      "Informe a senha atual."
    );
    expect(validateNewPassword({ novaSenha: forte, confirmacao: forte })).toBeNull();
  });

  it("recusa nova senha igual a atual", () => {
    expect(validateNewPassword({ senhaAtual: forte, novaSenha: forte, confirmacao: forte })).toBe(
      "A nova senha precisa ser diferente da atual."
    );
  });
});
