import { columnLabel } from "@/components/playground/grid-utils";
import { getFeedTargetGridSize } from "@/components/playground/domain/feed-placement";
import { gridRectsOverlap } from "@/components/playground/domain/collision";
import { buildGridRect, getGridRectEnd } from "@/components/playground/domain/geometry";
import type { PlaygroundFeedDataRecord, PlaygroundFeedDataTarget } from "@/components/playground/domain/feed-data";
import type { GridRect, PlaygroundCell } from "@/components/playground/types";

export type PlaygroundProblemKind = "covered" | "feed-overlap";

/**
 * Um "problema" do grid: ponto que merece atencao do usuario e que a bolinha
 * de alerta navega em sequencia. Hoje cobrimos dois casos:
 *  - `covered`: uma celula com valor digitado a mao foi encoberta por um
 *    alimentador (o valor sumiu da vista, o feed venceu).
 *  - `feed-overlap`: dois alimentadores ocupam as mesmas celulas (acontece
 *    quando um cresce dinamicamente e invade o de baixo).
 * `row`/`col` apontam a celula-alvo para onde o grid deve rolar e selecionar.
 */
export type PlaygroundProblem = {
  id: string;
  kind: PlaygroundProblemKind;
  row: number;
  col: number;
  message: string;
};

function cellAddress(row: number, col: number) {
  return `${columnLabel(col)}${row + 1}`;
}

function getTargetLabel(target: PlaygroundFeedDataTarget) {
  return target.title ?? target.table;
}

/**
 * Tamanho REAL renderizado do alimentador (linhas carregadas + cabecalho),
 * nao a estimativa estatica de `getFeedTargetGridSize`. E essa diferenca que
 * faz a deteccao de sobreposicao funcionar quando o feed muda de tamanho.
 */
export function getRenderedFeedRect(
  target: PlaygroundFeedDataTarget,
  record?: PlaygroundFeedDataRecord
): GridRect {
  const loadedRows = record?.rows.length ?? 0;
  const hasData = loadedRows > 0 || record?.status === "ready";
  const colSpan = Math.max(1, target.columns.length);

  if (!hasData) {
    return buildGridRect(target.position, getFeedTargetGridSize(target));
  }

  const dataRows = target.hideColumnHeader ? loadedRows : loadedRows + 1;
  return buildGridRect(target.position, {
    rowSpan: Math.max(1, dataRows),
    colSpan
  });
}

export function detectPlaygroundProblems(params: {
  targets: PlaygroundFeedDataTarget[];
  recordsByTargetId: Record<string, PlaygroundFeedDataRecord>;
  /** Indice row:col -> celula que o alimentador renderiza por cima do grid. */
  feedDisplayCells: Record<string, PlaygroundCell>;
  /** Celulas digitadas a mao na pagina (page.cells). */
  manualCells: Record<string, PlaygroundCell>;
}): PlaygroundProblem[] {
  const problems: PlaygroundProblem[] = [];

  // --- Caso 1: valores manuais encobertos por alimentadores.
  for (const key of Object.keys(params.feedDisplayCells)) {
    const manual = params.manualCells[key];
    if (!manual || manual.value.trim().length === 0) continue;
    // feedId no manual marca celula legada de feed v1; nao conta como conflito.
    if (manual.feedId) continue;

    const [rowRaw, colRaw] = key.split(":");
    const row = Number(rowRaw);
    const col = Number(colRaw);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;

    problems.push({
      id: `covered:${key}`,
      kind: "covered",
      row,
      col,
      message: `Valor "${manual.value}" em ${cellAddress(row, col)} esta encoberto por um alimentador.`
    });
  }

  // --- Caso 2: alimentadores sobrepostos (tamanho real renderizado).
  const rects = params.targets.map((target) => ({
    target,
    rect: getRenderedFeedRect(target, params.recordsByTargetId[target.id])
  }));

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const left = rects[i];
      const right = rects[j];
      if (!gridRectsOverlap(left.rect, right.rect)) continue;

      const leftEnd = getGridRectEnd(left.rect);
      const rightEnd = getGridRectEnd(right.rect);
      const row = Math.max(left.rect.row, right.rect.row);
      const col = Math.max(left.rect.col, right.rect.col);
      // Garante que o ponto navegado caia dentro da intersecao real.
      const safeRow = Math.min(row, Math.min(leftEnd.row, rightEnd.row));
      const safeCol = Math.min(col, Math.min(leftEnd.col, rightEnd.col));

      problems.push({
        id: `feed-overlap:${left.target.id}:${right.target.id}`,
        kind: "feed-overlap",
        row: safeRow,
        col: safeCol,
        message: `"${getTargetLabel(left.target)}" e "${getTargetLabel(right.target)}" estao sobrepostos em ${cellAddress(safeRow, safeCol)}.`
      });
    }
  }

  problems.sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    if (a.col !== b.col) return a.col - b.col;
    return a.kind.localeCompare(b.kind);
  });

  return problems;
}
