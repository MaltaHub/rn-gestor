import { describe, expect, it } from "vitest";

import { humanizeColumn } from "@/lib/domain/column-labels";

describe("humanizeColumn", () => {
  it("usa o nome conhecido do campo", () => {
    expect(humanizeColumn("preco_original")).toBe("Preço original");
    expect(humanizeColumn("tem_chave_r")).toBe("Chave reserva");
    expect(humanizeColumn("modelo_id")).toBe("Modelo");
  });

  it("FK desconhecida vira o nome da tabela, sem o _id", () => {
    expect(humanizeColumn("marca_id")).toBe("Marca");
  });

  it("acentua palavras comuns e capitaliza", () => {
    expect(humanizeColumn("codigo_veiculo")).toBe("Código veículo");
    expect(humanizeColumn("descricao")).toBe("Descrição");
  });

  it("não quebra com nomes curtos ou estranhos", () => {
    expect(humanizeColumn("id")).toBe("Id");
    expect(humanizeColumn("_id")).toBe("Id");
  });
});
