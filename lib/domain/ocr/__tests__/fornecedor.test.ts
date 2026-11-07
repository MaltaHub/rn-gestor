import { describe, expect, it } from "vitest";

import { buildOcrCatalog } from "@/lib/domain/ocr/catalog";
import { resolveOcrDestination } from "@/lib/domain/ocr/destinations";
import { decideFornecedor, type FornecedorRow } from "@/lib/domain/ocr/fornecedor";

const ACME: FornecedorRow = { id: "f-1", nome: "Acme Veículos", cpf_cnpj: "11.222.333/0001-81", contato: null, endereco: "Rua A" };
const SEM_DOC: FornecedorRow = { id: "f-2", nome: "Loja do Zé", cpf_cnpj: null, contato: null, endereco: null };

describe("fornecedor no catálogo do OCR", () => {
  const catalog = buildOcrCatalog([
    {
      table: "remetentes",
      label: "Fornecedores",
      primaryKey: "id",
      readableColumns: ["id", "nome", "cpf_cnpj", "is_active"],
      editableColumns: ["nome", "cpf_cnpj", "is_active"],
      virtualColumns: []
    }
  ]);

  it("entra pelo vínculo do veículo (sem carro_id) e sem is_active", () => {
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({ table: "remetentes", label: "Fornecedor do veículo", link: "fornecedor" });
    expect(catalog[0].columns.map((column) => column.column)).toEqual(["nome", "cpf_cnpj"]);
  });

  it("CPF/CNPJ valida e grava formatado", () => {
    const destination = resolveOcrDestination("remetentes.cpf_cnpj", catalog);
    expect(destination.kind).toBe("write");
    expect(destination.validate("11222333000181")).toBeNull();
    expect(destination.validate("123")).not.toBeNull();
    expect(destination.format("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("decideFornecedor", () => {
  it("acha pelo CPF/CNPJ (com ou sem máscara) e só preenche campos vazios", () => {
    const decision = decideFornecedor([ACME, SEM_DOC], null, { cpf_cnpj: "11222333000181", nome: "ACME LTDA", endereco: "Rua B", contato: "9999" });
    expect(decision).toEqual({ kind: "existing", id: "f-1", fill: { contato: "9999" } });
  });

  it("CPF/CNPJ novo: fornecedor sem documento e de mesmo nome ganha o documento", () => {
    const decision = decideFornecedor([ACME, SEM_DOC], null, { cpf_cnpj: "52998224725", nome: "loja do ze" });
    expect(decision).toEqual({ kind: "existing", id: "f-2", fill: { cpf_cnpj: "52998224725" } });
  });

  it("sem CPF/CNPJ: usa o já ligado ao veículo", () => {
    expect(decideFornecedor([ACME, SEM_DOC], "f-2", { nome: "Outro nome", contato: "1234" })).toEqual({
      kind: "existing",
      id: "f-2",
      fill: { contato: "1234" }
    });
  });

  it("não achou: cadastra (precisa do nome)", () => {
    expect(decideFornecedor([ACME], null, { cpf_cnpj: "52998224725", nome: "Novo" })).toEqual({
      kind: "create",
      row: { cpf_cnpj: "52998224725", nome: "Novo", is_active: true }
    });
    expect(decideFornecedor([ACME], null, { cpf_cnpj: "52998224725" })).toEqual({ kind: "missing-name" });
  });
});
