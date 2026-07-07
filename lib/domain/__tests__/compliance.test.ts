import { describe, expect, it } from "vitest";
import {
  getMissingImportantFields,
  hasComplianceFields,
  isImportantValueMissing,
  parseCarroInfoConfirmada,
  rowHasMissingImportant,
  rowHasPendencia,
} from "@/lib/domain/compliance";

describe("compliance", () => {
  it("trata null/undefined/'' como faltando; numeros (incl. 0) e booleanos como preenchidos", () => {
    expect(isImportantValueMissing(null)).toBe(true);
    expect(isImportantValueMissing(undefined)).toBe(true);
    expect(isImportantValueMissing("")).toBe(true);
    expect(isImportantValueMissing("  ")).toBe(true);
    expect(isImportantValueMissing(0)).toBe(false);
    expect(isImportantValueMissing(false)).toBe(false);
    expect(isImportantValueMissing("x")).toBe(false);
  });

  it("CARROS: campos importantes = ano_mod/chassi/renavam/hodometro/modelo_id (preco NAO conta)", () => {
    // preco_original preenchido ou nao NAO afeta: preco saiu do criterio.
    const full = { ano_mod: 2020, chassi: "9BW", renavam: "123", hodometro: 0, modelo_id: "m1" };
    expect(rowHasMissingImportant("carros", full)).toBe(false);
    expect(rowHasMissingImportant("carros", { ...full, preco_original: null })).toBe(false);
    const missing = { ano_mod: 2020, chassi: "", renavam: null, hodometro: 10, modelo_id: null };
    expect(getMissingImportantFields("carros", missing).sort()).toEqual(["chassi", "modelo_id", "renavam"]);
  });

  it("CARROS: pendencia (fonte amarela) = qualquer posicao da tupla em false", () => {
    const completo = { ano_mod: 2020, chassi: "9BW", renavam: "1", hodometro: 0, modelo_id: "m1" };
    // So sai do amarelo com AS DUAS confirmacoes.
    expect(rowHasPendencia("carros", { ...completo, info_confirmada: { campos: true, chave_manual: true } })).toBe(false);
    expect(rowHasPendencia("carros", { ...completo, info_confirmada: { campos: true, chave_manual: false } })).toBe(true);
    expect(rowHasPendencia("carros", { ...completo, info_confirmada: { campos: false, chave_manual: true } })).toBe(true);
    expect(rowHasPendencia("carros", { ...completo, info_confirmada: { campos: false, chave_manual: false } })).toBe(true);
    // Outras tabelas seguem a regra de campo faltando.
    expect(rowHasPendencia("documentos", {})).toBe(true);
  });

  it("parseCarroInfoConfirmada normaliza tupla, legado boolean e lixo", () => {
    expect(parseCarroInfoConfirmada({ campos: true, chave_manual: true })).toEqual({ campos: true, chave_manual: true });
    expect(parseCarroInfoConfirmada({ campos: true })).toEqual({ campos: true, chave_manual: false });
    // Boolean legado (pre-tupla) vale so para campos; chave_manual nasce pendente.
    expect(parseCarroInfoConfirmada(true)).toEqual({ campos: true, chave_manual: false });
    expect(parseCarroInfoConfirmada(false)).toEqual({ campos: false, chave_manual: false });
    expect(parseCarroInfoConfirmada(null)).toEqual({ campos: false, chave_manual: false });
    expect(parseCarroInfoConfirmada(undefined)).toEqual({ campos: false, chave_manual: false });
    expect(parseCarroInfoConfirmada("true")).toEqual({ campos: false, chave_manual: false });
    expect(parseCarroInfoConfirmada([true, true])).toEqual({ campos: false, chave_manual: false });
  });

  it("DOCUMENTOS e VENDAS: usam os campos certos", () => {
    expect(getMissingImportantFields("documentos", {})).toEqual([
      "origem",
      "valor_compra",
      "remetente_id",
      "pericia",
      "responsavel_virado",
    ]);
    expect(getMissingImportantFields("vendas", { data_venda: "2026-01-01", valor_total: 1000 }).sort()).toEqual([
      "data_entrega",
      "forma_pagamento",
    ]);
  });

  it("tabelas sem compliance retornam vazio", () => {
    expect(hasComplianceFields("modelos")).toBe(false);
    expect(rowHasMissingImportant("modelos", {})).toBe(false);
  });
});
