import { describe, expect, it } from "vitest";

import { databaseRuleMessage } from "@/lib/api/errors";

describe("databaseRuleMessage", () => {
  it("repassa só a mensagem de regra levantada pelo trigger", () => {
    expect(databaseRuleMessage({ code: "P0001", message: "REGRA: O CRLV só fica VIRADO com o titular." })).toBe(
      "O CRLV só fica VIRADO com o titular."
    );
  });

  it("erro comum do banco não vaza", () => {
    expect(databaseRuleMessage({ code: "P0001", message: "outra coisa" })).toBeNull();
    expect(databaseRuleMessage({ code: "23505", message: "REGRA: duplicado" })).toBeNull();
    expect(databaseRuleMessage(null)).toBeNull();
  });
});
