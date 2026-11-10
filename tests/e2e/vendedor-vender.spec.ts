import { expect, test, type Page, type Route } from "@playwright/test";
import { buildDevActor, DEV_ACTOR_IDS, signInAsDevRole } from "./helpers/auth";

// /vendedor/vender com a API mockada: escolhe o veículo, inicia a venda, passa
// pelas 4 etapas (comprador completo é obrigatório), confere a frase de
// pagamento montada pela venda e conclui. A 2ª venda tem veículo na troca: o
// cadastro dele (placa consultada, modelo, local, propósito) vai no POST.

const carroBase = {
  id: "c-1",
  placa: "ABC1D23",
  modelo: "ONIX 1.0 LT",
  anoFab: 2020,
  anoMod: 2021,
  cor: "PRATA",
  hodometro: 45210,
  preco: 65000,
  chassi: "9BGKS48U0LG123456",
  renavam: "01234567890",
  estadoVenda: "DISPONÍVEL",
  proposito: "VENDA",
  anoIpvaPago: null,
  temChaveReserva: true,
  temManual: true,
  local: "LOJA",
  coverUrl: null
};

const item = {
  carroId: "c-1",
  placa: "ABC1D23",
  modelo: "ONIX 1.0 LT",
  anoFab: 2020,
  anoMod: 2021,
  cor: "PRATA",
  hodometro: 45210,
  preco: 65000,
  estadoVenda: "DISPONÍVEL",
  proposito: "VENDA",
  coverUrl: null,
  situacao: "disponivel",
  venda: null,
  documentos: 0
};

type Estado = { vendaBody: Record<string, unknown> | null };

async function mockApis(page: Page, estado: Estado) {
  await page.route("https://viacep.com.br/**", (route) =>
    route.fulfill({ json: { logradouro: "Rua das Flores, 100", bairro: "Centro", localidade: "Santos", uf: "SP" } })
  );
  await page.route("**/api/v1/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (data: unknown) => route.fulfill({ json: { data, meta: { request_id: "e2e" } } });

    if (url.pathname === "/api/v1/me") return json(buildDevActor("VENDEDOR"));
    if (url.pathname === "/api/v1/lookups") {
      return json({
        usuarios: [{ code: DEV_ACTOR_IDS.VENDEDOR, name: "Modo local VENDEDOR" }],
        canais_cliente: [],
        sale_statuses: [],
        announcement_statuses: [],
        locations: [
          { code: "Loja 1", name: "Loja 1" },
          { code: "Galpão", name: "Galpão" }
        ],
        vehicle_states: [],
        estados_transferencia: [],
        user_roles: [],
        user_statuses: []
      });
    }
    if (url.pathname === "/api/v1/vendedor/veiculos") {
      return json({ itens: [item], total: 1, contagens: { disponivel: 1, reservado: 0, vendido: 0, entregue: 0, finalizado: 0 } });
    }
    if (url.pathname === "/api/v1/vendedor/veiculos/c-1") {
      if (!estado.vendaBody) return json({ carro: carroBase, situacao: "disponivel", venda: null, documentos: [], arquivos: [] });
      return json({
        carro: { ...carroBase, estadoVenda: "VENDIDO" },
        situacao: "vendido",
        venda: { ...estado.vendaBody, id: "v-1", carro_id: "c-1", estado_venda: "concluida", estagio: "aberto", venda_entradas: [] },
        documentos: [],
        arquivos: []
      });
    }
    if (url.pathname === "/api/v1/vendedor/placa") {
      return json({
        placa: "XYZ9A87",
        modeloSugerido: "GOL 1.0",
        modeloCatalogo: { id: "m-gol", modelo: "GOL 1.0" },
        cor: "BRANCO",
        anoFab: 2014,
        anoMod: 2015,
        chassi: "9BWAA05U0FP000001",
        jaCadastrado: null,
        aviso: null
      });
    }
    if (url.pathname === "/api/v1/modelos") return json([{ id: "m-gol", modelo: "GOL 1.0" }]);
    if (url.pathname === "/api/v1/vendas" && method === "POST") {
      estado.vendaBody = route.request().postDataJSON() as Record<string, unknown>;
      return json({ id: "v-1", carro_id: "c-1", estado_venda: estado.vendaBody.estado_venda });
    }
    if (url.pathname.startsWith("/api/v1/documento-templates")) return json([]);
    return json({});
  });
}

async function abrirFluxo(page: Page, estado: Estado) {
  await mockApis(page, estado);
  await signInAsDevRole(page, "VENDEDOR", { next: "/vendedor/vender" });
  await expect(page.getByTestId("vender-workspace")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("vender-veiculo-c-1").click();
  await expect(page.getByTestId("vender-painel")).toBeVisible();
  await page.getByTestId("vender-iniciar").click();
  await expect(page.getByTestId("vender-wizard")).toBeVisible();
}

async function preencherComprador(page: Page) {
  await page.getByTestId("vender-comprador-nome").fill("Maria da Silva");
  await page.getByTestId("vender-comprador-documento").fill("529.982.247-25");
  await page.getByTestId("vender-comprador-rg").fill("12.345.678-9");
  await page.getByTestId("vender-comprador-telefone").fill("(13) 99999-0000");
  await page.getByTestId("vender-comprador-cep").fill("11700-000");
  // ViaCEP (mockado) completa endereço e cidade.
  await expect(page.getByTestId("vender-comprador-cidade")).toHaveValue("Santos - SP");
  await expect(page.getByTestId("vender-comprador-endereco")).toHaveValue("Rua das Flores, 100, Centro");
}

test("vende pelo /vender: comprador obrigatório, frase de pagamento montada e POST com tudo", async ({ page }) => {
  test.setTimeout(150_000);
  const estado: Estado = { vendaBody: null };
  await abrirFluxo(page, estado);
  await expect(page.getByTestId("vender-linha")).toContainText("Disponível");

  // Pendências no campo: primeiro o nome, depois o CPF/CNPJ.
  await page.getByTestId("vender-avancar").click();
  await expect(page.getByTestId("vender-field-error-compradorNome")).toHaveText("Informe o nome do comprador.");
  await page.getByTestId("vender-comprador-nome").fill("Maria da Silva");
  await page.getByTestId("vender-avancar").click();
  await expect(page.getByTestId("vender-field-error-compradorDocumento")).toHaveText("Informe o CPF ou CNPJ do comprador.");
  await preencherComprador(page);
  await page.getByTestId("vender-avancar").click();

  // Negociação: valor sugerido pelo anúncio, entrada no PIX e financiamento.
  await expect(page.getByTestId("vender-valor-total")).toHaveValue("65000,00");
  await page.getByTestId("vender-entrada-add-pix").click();
  await page.getByTestId("vender-entrada-valor-0").fill("10000,00");
  await page.getByTestId("vender-forma-pagamento").getByText("Financiamento", { exact: true }).click();
  await page.getByTestId("vender-financ-parcelas").fill("48");
  await page.getByTestId("vender-financ-parcela-valor").fill("1500,00");
  await expect(page.getByTestId("vender-resumo")).toContainText("Financiado");
  await page.getByTestId("vender-avancar").click();

  // Condições: o IPVA parte do cadastro (sem registro do ano).
  await expect(page.getByTestId("vender-ipva-cadastro")).toContainText("não registra");
  await page.getByTestId("vender-avancar").click();

  // Revisão: a frase de pagamento sai da venda (sem template por caso).
  const clausulas = page.getByTestId("vender-clausulas");
  await expect(clausulas).toContainText("(DEZ MIL REAIS) VIA PIX");
  await expect(clausulas).toContainText("(CINQUENTA E CINCO MIL REAIS) FINANCIADO EM 48 PARCELAS");
  await expect(clausulas).toContainText("TRANSFERÊNCIA DE PROPRIEDADE REALIZADA PELA LOJA");

  await page.getByTestId("vender-concluir").click();
  await expect.poll(() => estado.vendaBody?.estado_venda).toBe("concluida");
  expect(estado.vendaBody).toMatchObject({
    carro_id: "c-1",
    comprador_nome: "Maria da Silva",
    comprador_documento: "529.982.247-25",
    comprador_rg: "12.345.678-9",
    comprador_telefone: "(13) 99999-0000",
    comprador_cep: "11700-000",
    comprador_endereco: "Rua das Flores, 100, Centro",
    comprador_cidade_estado: "Santos - SP",
    forma_pagamento: "financiamento",
    financ_valor: 55000,
    financ_parcelas_qtde: 48,
    financ_parcela_valor: 1500,
    valor_total: 65000,
    tipo_transferencia: "loja",
    vendedor_auth_user_id: DEV_ACTOR_IDS.VENDEDOR
  });
  expect(estado.vendaBody?.entradas).toEqual([{ tipo: "pix", valor: 10000 }]);

  await expect(page.getByTestId("vender-aviso")).toContainText("Venda concluída");
  await expect(page.getByTestId("vender-linha")).toContainText("Vendido");
  await expect(page.getByTestId("vender-doc-recibo_venda")).toContainText("Obrigatório");
});

test("venda com troca: cadastro completo do veículo da troca com propósito declarado", async ({ page }) => {
  test.setTimeout(150_000);
  const estado: Estado = { vendaBody: null };
  await abrirFluxo(page, estado);
  await preencherComprador(page);
  await page.getByTestId("vender-avancar").click();

  await page.getByTestId("vender-entrada-add-carro_troca").click();
  await page.getByTestId("vender-entrada-valor-0").fill("20000,00");
  await page.getByTestId("vender-troca-placa").fill("xyz9a87");

  // Sem modelo/local/propósito, a etapa não avança.
  await page.getByTestId("vender-avancar").click();
  await expect(page.getByTestId("vender-field-error-entrada-0-trocaModelo")).toHaveText("Informe o modelo do veículo da troca.");

  // A consulta da placa preenche modelo, cor, anos e chassi.
  await page.getByTestId("vender-troca-consultar").click();
  await expect(page.getByTestId("vender-troca-aviso")).toContainText("GOL 1.0");
  await expect(page.getByTestId("vender-troca-modelo")).toHaveValue("GOL 1.0");

  await page.getByTestId("vender-avancar").click();
  await expect(page.getByTestId("vender-field-error-entrada-0-trocaLocal")).toBeVisible();
  await page.getByTestId("vender-troca-local").selectOption("Galpão");
  await page.getByTestId("vender-avancar").click();
  await expect(page.getByTestId("vender-field-error-entrada-0-trocaProposito")).toHaveText("Declare se o veículo da troca é para venda ou repasse.");
  await page.getByTestId("vender-troca-proposito").getByText("Repasse", { exact: true }).click();

  await page.getByTestId("vender-avancar").click();
  await page.getByTestId("vender-avancar").click();
  await expect(page.getByTestId("vender-clausulas")).toContainText("EM VEÍCULO RECEBIDO NA TROCA (GOL 1.0, PLACA XYZ9A87, ANO 2014/2015, COR BRANCO)");

  await page.getByTestId("vender-concluir").click();
  await expect.poll(() => estado.vendaBody?.estado_venda).toBe("concluida");
  expect(estado.vendaBody?.entradas).toEqual([
    {
      tipo: "carro_troca",
      valor: 20000,
      carro_troca: {
        placa: "XYZ9A87",
        modelo: "GOL 1.0",
        local: "Galpão",
        proposito: "REPASSE",
        cor: "BRANCO",
        ano_fab: 2014,
        ano_mod: 2015,
        hodometro: null,
        chassi: "9BWAA05U0FP000001",
        renavam: null
      }
    }
  ]);
});
