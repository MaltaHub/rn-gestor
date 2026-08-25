/**
 * Reordenacao de listas de valores escolhidos pelo usuario (colunas de
 * impressao, colunas do alimentador do playground, secoes...).
 *
 * Vive aqui porque existiam DUAS copias identicas destas funcoes — uma no
 * dialogo de impressao, outra no playground — e so uma foi corrigida quando o
 * bug de PROCH apareceu. Copia divergente = bug que volta.
 */

/** Move um valor uma posicao para cima/baixo preservando o resto da ordem. */
export function moveOrderedValue(values: string[], value: string, direction: "up" | "down") {
  const index = values.indexOf(value);
  if (index === -1) return values;
  if (direction === "up" && index === 0) return values;
  if (direction === "down" && index === values.length - 1) return values;

  const next = [...values];
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  return next;
}

/**
 * Liga/desliga um valor mantendo a ordem de `referenceOrder`.
 *
 * INVARIANTE: mexe SO no `value` pedido. O que ja estava em `values` continua
 * la, inclusive o que nao aparece em `referenceOrder`.
 *
 * A versao antiga filtrava `values` por `referenceOrder` antes de inserir, o que
 * apagava valores legitimos que simplesmente nao pertencem a lista de
 * referencia. No playground isso derrubava as colunas de PROCH (ids sinteticos
 * `__proch__:...`, que nunca estao entre as colunas reais da tabela): ligar
 * qualquer coluna as varria de `feedColumns` e o save gravava o alimentador com
 * `prochColumns: []` — o "salvei o feed e o PROCH resetou".
 */
export function toggleOrderedValue(
  values: string[],
  value: string,
  enabled: boolean,
  referenceOrder = values
) {
  if (!enabled) {
    return values.filter((entry) => entry !== value);
  }

  if (values.includes(value)) return values;
  if (!referenceOrder.includes(value)) return [...values, value];

  // Insere antes do primeiro valor CONHECIDO que venha depois na ordem de
  // referencia; os desconhecidos (ex.: PROCH) ficam onde estao.
  const insertIndex = values.findIndex(
    (entry) => referenceOrder.includes(entry) && referenceOrder.indexOf(entry) > referenceOrder.indexOf(value)
  );

  if (insertIndex === -1) {
    return [...values, value];
  }

  return [...values.slice(0, insertIndex), value, ...values.slice(insertIndex)];
}
