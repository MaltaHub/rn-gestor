import { expect, test, type Page, type Route } from "@playwright/test";
import { buildDevActor, DEV_ACTOR_IDS, signInAsDevRole } from "./helpers/auth";

// /vendedor/vender com a API mockada: escolhe o veículo, inicia a venda, passa
// pelas 4 etapas (com a pendência no campo), confere a frase de pagamento
// montada pela venda e conclui — o POST leva o que o vendedor preencheu.

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
  coverUrl: null,
  situacao: "disponivel",
  venda: null,
  documentos: 0
};

type Estado = { vendaBody: Record<string, unknown> | null };

async function mockApis(page: Page, estado: Estado) {
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
        locations: [],
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
    if (url.pathname === "/api/v1/vendas" && method === "POST") {
      estado.vendaBody = route.request().postDataJSON() as Record<string, unknown>;
      return json({ id: "v-1", carro_id: "c-1", estado_venda: estado.vendaBody.estado_venda });
    }
    if (url.pathname.startsWith("/api/v1/documento-templates")) return json([]);
    return json({});
  });
}

test("vende pelo /vender: pendência no campo, frase de pagamento montada e POST com tudo", async ({ page }) => {
  test.setTimeout(150_000);
  const estado: Estado = { vendaBody: null };
  await mockApis(page, estado);
  await signInAsDevRole(page, "VENDEDOR", { next: "/vendedor/vender" });

  await expect(page.getByTestId("vender-workspace")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("vender-veiculo-c-1").click();
  await expect(page.getByTestId("vender-painel")).toBeVisible();
  await expect(page.getByTestId("vender-linha")).toContainText("Disponível");
  await page.getByTestId("vender-iniciar").click();
  await expect(page.getByTestId("vender-wizard")).toBeVisible();

  // Sem nome: a pendência aparece embaixo do campo.
  await page.getByTestId("vender-avancar").click();
  await expect(page.getByTestId("vender-field-error-compradorNome")).toHaveText("Informe o nome do comprador.");
  await page.getByTestId("vender-comprador-nome").fill("Maria da Silva");
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
  await expect(clausulas).toContainText("ENTRADA DE R$");
  await expect(clausulas).toContainText("(DEZ MIL REAIS) VIA PIX");
  await expect(clausulas).toContainText("(CINQUENTA E CINCO MIL REAIS) FINANCIADO EM 48 PARCELAS");
  await expect(clausulas).toContainText("TRANSFERÊNCIA DE PROPRIEDADE REALIZADA PELA LOJA");

  await page.getByTestId("vender-concluir").click();
  await expect.poll(() => estado.vendaBody?.estado_venda).toBe("concluida");
  expect(estado.vendaBody).toMatchObject({
    carro_id: "c-1",
    comprador_nome: "Maria da Silva",
    forma_pagamento: "financiamento",
    financ_valor: 55000,
    financ_parcelas_qtde: 48,
    financ_parcela_valor: 1500,
    valor_total: 65000,
    tipo_transferencia: "loja",
    vendedor_auth_user_id: DEV_ACTOR_IDS.VENDEDOR
  });
  expect(estado.vendaBody?.entradas).toEqual([{ tipo: "pix", valor: 10000 }]);

  // Depois de salvar: vendido, com o recibo pendente no checklist.
  await expect(page.getByTestId("vender-aviso")).toContainText("Venda concluída");
  await expect(page.getByTestId("vender-linha")).toContainText("Vendido");
  await expect(page.getByTestId("vender-doc-recibo_venda")).toContainText("Obrigatório");
});
