/**
 * Fixtures de rows mock pras sheets do editor — usadas pelo MOCK_DATA_SOURCE
 * no dry-run do editor de fluxos.
 *
 * Sem isso, AllRowsSource/SelectedRowsSource ejetariam arrays vazios e o
 * usuario nao veria efeito nenhum em dry-run de fluxos com source de carros,
 * vendas, etc. Os valores sao realistas o suficiente pra testar logica
 * (filtros, picks, interpolacao no LogNode) sem precisar de banco real.
 *
 * Fonte da verdade: o schema tipado em `lib/api/grid-config.ts:columnTypes`.
 * Adicione novas sheets aqui quando enriquecer columnTypes pra elas.
 */

import type { FlowRow } from "@/lib/domain/editor-flows/runtime/types";

export const MOCK_ROWS_BY_SHEET: Record<string, FlowRow[]> = {
  carros: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      placa: "ABC1A23",
      chassi: "9BFZB47P3CB123456",
      renavam: "01234567890",
      nome: "Onix LT - Loja 1",
      modelo_id: "11111111-1111-4111-8111-111111111101",
      local: "Loja 1",
      estado_venda: "DISPONIVEL",
      estado_anuncio: "ANUNCIADO",
      estado_veiculo: "PRONTO",
      em_estoque: true,
      tem_fotos: true,
      tem_chave_r: true,
      tem_manual: false,
      cor: "Branco",
      ano_fab: 2022,
      ano_mod: 2023,
      hodometro: 42000,
      preco_original: 75990,
      ano_ipva_pago: 2025,
      created_at: "2026-01-15T12:00:00.000Z",
      updated_at: "2026-01-15T12:00:00.000Z"
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      placa: "DEF2B45",
      chassi: "9BFZB47P4CB654321",
      renavam: "98765432101",
      nome: "HB20 Comfort - Loja 2",
      modelo_id: "11111111-1111-4111-8111-111111111102",
      local: "Loja 2",
      estado_venda: "DISPONIVEL",
      estado_anuncio: "ANUNCIADO",
      estado_veiculo: "PREPARACAO",
      em_estoque: true,
      tem_fotos: true,
      tem_chave_r: false,
      tem_manual: true,
      cor: "Prata",
      ano_fab: 2021,
      ano_mod: 2022,
      hodometro: 58000,
      preco_original: 65990,
      ano_ipva_pago: 2024,
      created_at: "2026-01-10T12:00:00.000Z",
      updated_at: "2026-01-15T12:00:00.000Z"
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      placa: "GHI3C67",
      chassi: "3VW8B47A4DM987654",
      renavam: "55544433322",
      nome: "T-Cross Highline - Galpao",
      modelo_id: "11111111-1111-4111-8111-111111111103",
      local: "Galpao",
      estado_venda: "RESERVADO",
      estado_anuncio: "PAUSADO",
      estado_veiculo: "PRONTO",
      em_estoque: true,
      tem_fotos: false,
      tem_chave_r: true,
      tem_manual: true,
      cor: "Preto",
      ano_fab: 2024,
      ano_mod: 2025,
      hodometro: 12000,
      preco_original: 124990,
      ano_ipva_pago: 2025,
      created_at: "2026-02-01T12:00:00.000Z",
      updated_at: "2026-02-01T12:00:00.000Z"
    }
  ],
  vendas: [
    {
      id: "11111111-1111-4111-8111-000000000001",
      data_venda: "2026-03-15T00:00:00.000Z",
      data_entrega: "2026-03-20T00:00:00.000Z",
      carro_id: "00000000-0000-4000-8000-000000000001",
      vendedor_auth_user_id: "11111111-1111-4111-8111-111111111111",
      canal_cliente: "indicacao",
      comprador_nome: "Maria Silva",
      forma_pagamento: "FINANCIAMENTO",
      valor_total: 75990,
      estado_venda: "concluida",
      observacao: "Cliente fidelizado",
      created_at: "2026-03-15T12:00:00.000Z"
    },
    {
      id: "11111111-1111-4111-8111-000000000002",
      data_venda: "2026-03-22T00:00:00.000Z",
      data_entrega: "2026-03-25T00:00:00.000Z",
      carro_id: "00000000-0000-4000-8000-000000000002",
      vendedor_auth_user_id: "33333333-3333-4333-8333-333333333333",
      canal_cliente: "instagram",
      comprador_nome: "Joao Souza",
      forma_pagamento: "AVISTA",
      valor_total: 65990,
      estado_venda: "concluida",
      observacao: null,
      created_at: "2026-03-22T12:00:00.000Z"
    }
  ],
  modelos: [
    {
      id: "11111111-1111-4111-8111-111111111101",
      modelo: "Chevrolet Onix",
      created_at: "2025-01-01T12:00:00.000Z",
      updated_at: "2025-01-01T12:00:00.000Z"
    },
    {
      id: "11111111-1111-4111-8111-111111111102",
      modelo: "Hyundai HB20",
      created_at: "2025-01-01T12:00:00.000Z",
      updated_at: "2025-01-01T12:00:00.000Z"
    },
    {
      id: "11111111-1111-4111-8111-111111111103",
      modelo: "Volkswagen T-Cross",
      created_at: "2025-01-01T12:00:00.000Z",
      updated_at: "2025-01-01T12:00:00.000Z"
    }
  ],
  finalizados: [
    {
      id: "22222222-2222-4222-8222-000000000001",
      placa: "JKL4D89",
      modelo: "Toyota Corolla",
      cor: "Branco Perola",
      ano_fab: 2020,
      ano_mod: 2021,
      hodometro: 95000,
      data_venda: "2026-02-10T00:00:00.000Z",
      valor_venda: 89990,
      vendedor: "Carlos Pereira",
      finalizado_em: "2026-02-12T12:00:00.000Z",
      created_at: "2026-02-12T12:00:00.000Z",
      updated_at: "2026-02-12T12:00:00.000Z"
    },
    {
      id: "22222222-2222-4222-8222-000000000002",
      placa: "MNO5E12",
      modelo: "Honda Civic",
      cor: "Preto",
      ano_fab: 2019,
      ano_mod: 2020,
      hodometro: 120000,
      data_venda: "2026-02-20T00:00:00.000Z",
      valor_venda: 75500,
      vendedor: "Ana Costa",
      finalizado_em: "2026-02-22T12:00:00.000Z",
      created_at: "2026-02-22T12:00:00.000Z",
      updated_at: "2026-02-22T12:00:00.000Z"
    }
  ]
};

/** Retorna fixtures pra sheet ou [] se nao tem mock declarado. */
export function getMockRowsForSheet(sheetKey: string): FlowRow[] {
  return MOCK_ROWS_BY_SHEET[sheetKey] ?? [];
}
