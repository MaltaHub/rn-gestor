import type { TrocaCarroNovoInput } from "@/lib/domain/vendas/schemas";

/**
 * Linha de `carros` do veículo da troca — tudo que o cadastro exige
 * (placa, modelo, local, estado_venda) mais o propósito declarado. Entra como
 * DISPONÍVEL em PREPARAÇÃO, como qualquer carro novo do grid; REPASSE sai da
 * vitrine pelo filtro e dos cálculos pelo trigger do banco.
 */
export function linhaCarroTroca(troca: TrocaCarroNovoInput, modeloId: string) {
  return {
    placa: troca.placa.trim().toUpperCase(),
    modelo_id: modeloId,
    local: troca.local.trim(),
    estado_venda: "DISPONÍVEL",
    estado_veiculo: "PREPARAÇÃO",
    proposito: troca.proposito,
    cor: troca.cor ?? null,
    ano_fab: troca.ano_fab ?? null,
    ano_mod: troca.ano_mod ?? null,
    hodometro: troca.hodometro ?? null,
    chassi: troca.chassi ? troca.chassi.trim().toUpperCase() : null,
    renavam: troca.renavam ?? null
  };
}
