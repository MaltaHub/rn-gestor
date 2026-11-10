import { describe, expect, it } from "vitest";
import { buildVendaPayload, novaEntrada, novoDraft, pessoaFisica, validarEtapa, type VendaDraft } from "@/components/vendedor/vender/use-venda-draft";
import type { CarroPainel } from "@/lib/domain/vendedor/types";

const CARRO: CarroPainel = {
  id: "c-1",
  placa: "ABC1D23",
  modelo: "ONIX",
  anoFab: 2020,
  anoMod: 2021,
  cor: "PRATA",
  hodometro: 1000,
  preco: 65000,
  chassi: null,
  renavam: null,
  estadoVenda: "DISPONÍVEL",
  proposito: "VENDA",
  anoIpvaPago: null,
  temChaveReserva: null,
  temManual: null,
  local: "Loja 1",
  coverUrl: null
};

function comprador(draft: VendaDraft): VendaDraft {
  return {
    ...draft,
    compradorNome: "Maria",
    compradorDocumento: "529.982.247-25",
    compradorRg: "12.345.678-9",
    compradorTelefone: "(13) 99999-0000",
    compradorCep: "11700-000",
    compradorEndereco: "Rua A, 1",
    compradorCidadeEstado: "Santos - SP"
  };
}

describe("comprador obrigatório (tudo menos e-mail; RG só pessoa física)", () => {
  const base = novoDraft(CARRO, "u-1");

  it("cobra cada campo na ordem do formulário", () => {
    expect(validarEtapa(base, "comprador", null)?.field).toBe("compradorNome");
    const completo = comprador(base);
    expect(validarEtapa(completo, "comprador", null)).toBeNull();
    for (const campo of ["compradorDocumento", "compradorRg", "compradorTelefone", "compradorCep", "compradorEndereco", "compradorCidadeEstado"] as const) {
      expect(validarEtapa({ ...completo, [campo]: "" }, "comprador", null)?.field).toBe(campo);
    }
    expect(validarEtapa({ ...completo, compradorEmail: "" }, "comprador", null)).toBeNull();
  });

  it("CNPJ dispensa o RG", () => {
    const empresa = { ...comprador(base), compradorDocumento: "11.222.333/0001-81", compradorRg: "" };
    expect(pessoaFisica(empresa.compradorDocumento)).toBe(false);
    expect(validarEtapa(empresa, "comprador", null)).toBeNull();
  });

  it("CPF inválido não passa", () => {
    expect(validarEtapa({ ...comprador(base), compradorDocumento: "111.111.111-11" }, "comprador", null)?.message).toBe("CPF/CNPJ inválido.");
  });
});

describe("troca no rascunho", () => {
  it("exige placa, modelo, local e propósito e manda o cadastro completo", () => {
    const entrada = { ...novaEntrada("carro_troca"), valor: "20000,00" };
    let draft: VendaDraft = { ...comprador(novoDraft(CARRO, "u-1")), entradas: [entrada] };
    const pendencias: string[] = [];
    const preencher: Array<Partial<typeof entrada.troca>> = [{ placa: "XYZ9A87" }, { modelo: "GOL 1.0" }, { local: "Galpão" }, { proposito: "REPASSE" }];
    for (const passo of preencher) {
      pendencias.push(validarEtapa(draft, "negociacao", null)?.field ?? "ok");
      draft = { ...draft, entradas: [{ ...draft.entradas[0], troca: { ...draft.entradas[0].troca, ...passo } }] };
    }
    expect(pendencias).toEqual(["entrada-0-trocaPlaca", "entrada-0-trocaModelo", "entrada-0-trocaLocal", "entrada-0-trocaProposito"]);
    expect(validarEtapa(draft, "negociacao", null)).toBeNull();

    const result = buildVendaPayload(draft, "c-1", null);
    if ("error" in result) throw new Error(result.error.message);
    expect(result.payload.entradas?.[0]).toMatchObject({
      tipo: "carro_troca",
      valor: 20000,
      carro_troca: { placa: "XYZ9A87", modelo: "GOL 1.0", local: "Galpão", proposito: "REPASSE" }
    });
  });
});
