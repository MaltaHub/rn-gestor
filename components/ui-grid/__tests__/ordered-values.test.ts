import { describe, expect, it } from "vitest";
import { moveOrderedValue, toggleOrderedValue } from "@/components/ui-grid/core/ordered-values";
import { PROCH_COLUMN_ID_PREFIX } from "@/components/playground/types";

const PROCH_ID = `${PROCH_COLUMN_ID_PREFIX}modelo-nome`;

describe("toggleOrderedValue", () => {
  it("insere respeitando a ordem de referencia", () => {
    const reference = ["placa", "nome", "cor", "local"];
    expect(toggleOrderedValue(["placa", "local"], "cor", true, reference)).toEqual(["placa", "cor", "local"]);
  });

  it("acrescenta no fim quando nada da referencia vem depois", () => {
    const reference = ["placa", "nome", "cor"];
    expect(toggleOrderedValue(["placa"], "cor", true, reference)).toEqual(["placa", "cor"]);
  });

  it("desliga removendo apenas o valor pedido", () => {
    expect(toggleOrderedValue(["placa", "cor", "local"], "cor", false)).toEqual(["placa", "local"]);
  });

  it("nao duplica um valor ja presente", () => {
    expect(toggleOrderedValue(["placa", "cor"], "cor", true, ["placa", "cor"])).toEqual(["placa", "cor"]);
  });

  it("acrescenta valores ausentes da ordem de referencia", () => {
    expect(toggleOrderedValue(["placa"], PROCH_ID, true, ["placa", "nome"])).toEqual(["placa", PROCH_ID]);
  });

  // REGRESSAO: ligar uma coluna NAO pode varrer as colunas de PROCH.
  // Os ids de PROCH sao sinteticos e nunca aparecem na lista de colunas reais da
  // tabela (a `referenceOrder`). A versao antiga filtrava `values` por
  // `referenceOrder` antes de inserir, entao qualquer toggle os apagava de
  // `feedColumns` — e o save gravava o alimentador com `prochColumns: []`.
  it("preserva colunas de PROCH ao ligar uma coluna real", () => {
    const reference = ["placa", "nome", "cor", "local"];
    const current = ["placa", PROCH_ID, "local"];

    const next = toggleOrderedValue(current, "cor", true, reference);

    expect(next).toContain(PROCH_ID);
    expect(next).toEqual(["placa", PROCH_ID, "cor", "local"]);
  });

  it("preserva PROCH mesmo quando a coluna ligada vai para o fim", () => {
    const reference = ["placa", "nome", "cor"];
    const current = [PROCH_ID, "placa"];

    const next = toggleOrderedValue(current, "cor", true, reference);

    expect(next).toEqual([PROCH_ID, "placa", "cor"]);
  });

  it("preserva varias colunas de PROCH em sequencia de toggles", () => {
    const reference = ["placa", "nome", "cor"];
    const prochB = `${PROCH_COLUMN_ID_PREFIX}outra`;
    let columns = ["placa", PROCH_ID, prochB];

    columns = toggleOrderedValue(columns, "nome", true, reference);
    columns = toggleOrderedValue(columns, "cor", true, reference);

    expect(columns.filter((column) => column.startsWith(PROCH_COLUMN_ID_PREFIX))).toEqual([PROCH_ID, prochB]);
  });
});

describe("moveOrderedValue", () => {
  it("move para cima e para baixo", () => {
    expect(moveOrderedValue(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveOrderedValue(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("nao mexe nas bordas nem em valor ausente", () => {
    expect(moveOrderedValue(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveOrderedValue(["a", "b"], "b", "down")).toEqual(["a", "b"]);
    expect(moveOrderedValue(["a", "b"], "z", "up")).toEqual(["a", "b"]);
  });
});
