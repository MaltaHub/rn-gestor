import {
  DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT,
  mixHexColorWithWhite,
  normalizePrintHighlightOpacityPercent,
  normalizePrintHighlightRule,
  operatorNeedsValues,
  sanitizeColorHex,
  type PrintHighlightRule,
  type ResolvedPrintHighlight
} from "@/components/ui-grid/print-highlights";
import {
  comparePrintableValues,
  escapeHtml,
  normalizeBulkToken,
  toDisplay,
  toEditable
} from "@/components/ui-grid/value-format";

type PrintRow = Record<string, unknown>;

export type ExecutePrintJobParams = {
  title: string;
  rows: PrintRow[];
  columns: Array<{ key: string; label: string }>;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  sortLabel?: string;
  sectionColumn?: string;
  sectionValues?: string[];
  includeOthers?: boolean;
  itemLabelPlural?: string;
  highlightRules?: PrintHighlightRule[];
  highlightOpacityPercent?: number;
  resolveValue: (row: PrintRow, column: string) => unknown;
};

export type ExecutePreparedPrintJobParams = ExecutePrintJobParams & {
  filters?: Record<string, string[]>;
};

type PrintSection = {
  title: string;
  rows: PrintRow[];
  columns: Array<{ key: string; label: string }>;
};

function matchesSelectedLiterals(value: unknown, selectedValues: string[]) {
  if (selectedValues.length === 0) return true;
  if (value == null || value === "") return false;
  return selectedValues.includes(toEditable(value));
}

export function filterRowsByPrintFilters(rows: PrintRow[], filters: Record<string, string[]>) {
  return rows.filter((row) =>
    Object.entries(filters).every(([column, selectedValues]) => matchesSelectedLiterals(row[column], selectedValues))
  );
}

export function resolvePrintFilterLiteralsFromLabels(params: {
  rows: PrintRow[];
  column: string;
  labels: string[];
  resolveValue: (row: PrintRow, column: string) => unknown;
}) {
  const wantedLabels = params.labels.map((label) => normalizeBulkToken(label)).filter(Boolean);
  const bucket = new Set<string>();

  for (const row of params.rows) {
    const rawValue = row[params.column];
    if (rawValue == null || rawValue === "") continue;

    const visibleLabel = normalizeBulkToken(toDisplay(params.resolveValue(row, params.column), params.column));
    if (!visibleLabel || !wantedLabels.includes(visibleLabel)) continue;
    bucket.add(toEditable(rawValue));
  }

  return Array.from(bucket);
}

function hexColorToRgb(value: string) {
  const sanitized = sanitizeColorHex(value, "#94a3b8");
  const hex = sanitized.slice(1);

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function getPrintHighlightTextColor(color: string) {
  const { r, g, b } = hexColorToRgb(color);
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance >= 150 ? "#111827" : "#ffffff";
}

function toComparablePrintValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalizedNumber = trimmed.replace(/\./g, "").replace(",", ".");
  if (/^-?\d+(\.\d+)?$/.test(normalizedNumber)) {
    return { kind: "number" as const, value: Number(normalizedNumber) };
  }

  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp) && /[-/:T]/.test(trimmed)) {
    return { kind: "date" as const, value: timestamp };
  }

  return { kind: "text" as const, value: normalizeBulkToken(trimmed) };
}

function compareComparablePrintValues(left: string, right: string) {
  const leftComparable = toComparablePrintValue(left);
  const rightComparable = toComparablePrintValue(right);

  if (!leftComparable || !rightComparable) return null;
  if (leftComparable.kind !== rightComparable.kind) return null;

  if (typeof leftComparable.value === "number" && typeof rightComparable.value === "number") {
    if (leftComparable.value === rightComparable.value) return 0;
    return leftComparable.value > rightComparable.value ? 1 : -1;
  }

  if (typeof leftComparable.value === "string" && typeof rightComparable.value === "string") {
    return leftComparable.value.localeCompare(rightComparable.value, "pt-BR", { numeric: true, sensitivity: "base" });
  }

  return null;
}

export function matchesPrintHighlightRule(
  row: PrintRow,
  rule: PrintHighlightRule,
  resolveValue: (row: PrintRow, column: string) => unknown
) {
  if (!rule.column) return false;

  const rawValue = row[rule.column];
  const visibleValue = resolveValue(row, rule.column);
  const rawText = toEditable(rawValue).trim();
  const visibleText = toDisplay(visibleValue, rule.column).trim();
  const textCandidates = Array.from(new Set([rawText, visibleText].filter(Boolean)));
  const normalizedCandidates = textCandidates.map((value) => normalizeBulkToken(value)).filter(Boolean);
  const values = rule.values ?? [];
  const normalizedValues = values.map((value) => normalizeBulkToken(value)).filter(Boolean);

  switch (rule.operator) {
    case "empty":
      return textCandidates.every((value) => !value);
    case "not_empty":
      return textCandidates.some(Boolean);
    case "eq":
      return normalizedValues.length > 0 && normalizedValues.some((value) => normalizedCandidates.includes(value));
    case "neq":
      return (
        normalizedValues.length > 0 &&
        textCandidates.some(Boolean) &&
        normalizedValues.every((value) => !normalizedCandidates.includes(value))
      );
    case "contains":
      return (
        normalizedValues.length > 0 &&
        normalizedValues.some((value) => normalizedCandidates.some((candidate) => candidate.includes(value)))
      );
    case "not_contains":
      return (
        normalizedValues.length > 0 &&
        textCandidates.some(Boolean) &&
        normalizedValues.every((value) => normalizedCandidates.every((candidate) => !candidate.includes(value)))
      );
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return (
        values.length > 0 &&
        textCandidates.some((candidate) =>
          values.some((value) => {
            const comparison = compareComparablePrintValues(candidate, value);
            if (comparison == null) return false;
            if (rule.operator === "gt") return comparison > 0;
            if (rule.operator === "gte") return comparison >= 0;
            if (rule.operator === "lt") return comparison < 0;
            return comparison <= 0;
          })
        )
      );
    default:
      return false;
  }
}

function resolvePrintHighlightMatches(
  row: PrintRow,
  rules: PrintHighlightRule[],
  resolveValue: (row: PrintRow, column: string) => unknown
): ResolvedPrintHighlight[] {
  return rules
    .filter((rule) => matchesPrintHighlightRule(row, rule, resolveValue))
    .map((rule) => ({ ...rule, values: rule.values ?? [] }));
}

function buildPrintHighlightBackground(colors: string[], opacityPercent = DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT) {
  if (colors.length === 0) {
    return {
      backgroundColor: "",
      backgroundImage: "",
      textColor: ""
    };
  }

  const colorStrength = normalizePrintHighlightOpacityPercent(opacityPercent) / 100;
  const fillColors = colors.map((color) =>
    mixHexColorWithWhite(sanitizeColorHex(color, "#94a3b8"), colorStrength)
  );
  const leadColor = fillColors[0] ?? "#94a3b8";
  const step = 100 / fillColors.length;

  if (fillColors.length === 1) {
    return {
      backgroundColor: leadColor,
      backgroundImage: "",
      textColor: getPrintHighlightTextColor(leadColor)
    };
  }

  const stops = fillColors
    .flatMap((color, index) => {
      const start = Number((step * index).toFixed(3));
      const end = Number((step * (index + 1)).toFixed(3));
      return [`${color} ${start}%`, `${color} ${end}%`];
    })
    .join(", ");

  return {
    backgroundColor: leadColor,
    backgroundImage: `linear-gradient(180deg, ${stops})`,
    textColor: getPrintHighlightTextColor(leadColor)
  };
}

export async function executePrintJob(params: ExecutePrintJobParams) {
  if (params.columns.length === 0) {
    throw new Error("Selecione ao menos uma coluna para imprimir.");
  }
  if (params.rows.length === 0) {
    throw new Error("Nao ha linhas disponiveis para gerar a tabela.");
  }

  const sections: PrintSection[] = [];
  const baseTitle = params.title.trim();
  const printedAtDate = new Date();
  const printedAt = `${printedAtDate.toLocaleDateString("pt-BR")} - ${printedAtDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })}`;
  const sortedRows = [...params.rows];
  const sectionColumn = params.sectionColumn ?? "";
  const sectionValues = params.sectionValues ?? [];
  const includeOthers = params.includeOthers ?? false;
  const sortColumn = params.sortColumn ?? "";
  const sortDirection = params.sortDirection ?? "asc";
  const sortLabel = params.sortLabel ?? sortColumn;
  const itemLabelPlural = params.itemLabelPlural?.trim() || "registros";
  const highlightOpacityPercent = normalizePrintHighlightOpacityPercent(
    params.highlightOpacityPercent ?? DEFAULT_PRINT_HIGHLIGHT_OPACITY_PERCENT
  );
  const totalLabel = (count: number) => `Total de ${itemLabelPlural}: ${count}`;
  const highlightRules = (params.highlightRules ?? [])
    .map((rule, index) => normalizePrintHighlightRule(rule, index))
    .filter((rule) => rule.column && rule.label && (!operatorNeedsValues(rule.operator) || (rule.values?.length ?? 0) > 0));
  const rowHighlightMatches = new WeakMap<PrintRow, ResolvedPrintHighlight[]>();
  const localColumn = params.columns.find((column) => column.key === "local") ?? { key: "local", label: "Local" };
  const resolveSectionColumns = (rows: PrintRow[], includeLocal: boolean) => {
    if (!includeLocal) return params.columns;
    if (params.columns.some((column) => column.key === "local")) return params.columns;
    if (!rows.some((row) => row.local != null && row.local !== "")) return params.columns;
    return [...params.columns, localColumn];
  };

  if (sortColumn) {
    sortedRows.sort((left, right) => {
      const order = comparePrintableValues(
        params.resolveValue(left, sortColumn),
        params.resolveValue(right, sortColumn),
        sortColumn
      );
      return sortDirection === "desc" ? order * -1 : order;
    });
  }

  for (const row of sortedRows) {
    const matches = resolvePrintHighlightMatches(row, highlightRules, params.resolveValue);
    rowHighlightMatches.set(row, matches);
  }

  if (!sectionColumn) {
    sections.push({ title: baseTitle, rows: sortedRows, columns: params.columns });
  } else {
    const grouped = new Map<string, { label: string; rows: PrintRow[] }>();
    for (const row of sortedRows) {
      const rawValue = row[sectionColumn];
      const literal = rawValue == null || rawValue === "" ? "__empty__" : String(rawValue);
      const label =
        rawValue == null || rawValue === "" ? "(vazio)" : toDisplay(params.resolveValue(row, sectionColumn), sectionColumn);
      const bucket = grouped.get(literal) ?? { label, rows: [] };
      bucket.rows.push(row);
      grouped.set(literal, bucket);
    }

    for (const literal of sectionValues) {
      const bucket = grouped.get(literal);
      if (!bucket || bucket.rows.length === 0) continue;
      sections.push({
        title: `${baseTitle} - ${bucket.label}`,
        rows: bucket.rows,
        columns: params.columns
      });
    }

    if (includeOthers) {
      const handled = new Set(sectionValues);
      const otherRows = sortedRows.filter((row) => {
        const rawValue = row[sectionColumn];
        const literal = rawValue == null || rawValue === "" ? "__empty__" : String(rawValue);
        return !handled.has(literal);
      });

      if (otherRows.length > 0) {
        sections.push({
          title: `${baseTitle} - Outros`,
          rows: otherRows,
          columns: resolveSectionColumns(otherRows, true)
        });
      }
    }
  }

  const htmlSections = sections
    .filter((section) => section.rows.length > 0)
    .map((section) => {
      const head = section.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
      const sectionTotal = sectionColumn ? `<div class="print-section-total">${escapeHtml(totalLabel(section.rows.length))}</div>` : "";
      const body = section.rows
        .map((row) => {
          const highlightMatches = rowHighlightMatches.get(row) ?? [];
          const highlightBackground = buildPrintHighlightBackground(
            highlightMatches.map((match) => match.color),
            highlightOpacityPercent
          );
          const cells = section.columns
            .map((column) => {
              const visibleValue = params.resolveValue(row, column.key);
              const cellValue = escapeHtml(toDisplay(visibleValue, column.key));

              if (highlightMatches.length > 0) {
                const tdStyles = [
                  `color: ${highlightBackground.textColor} !important`,
                  `background-color: ${highlightBackground.backgroundColor} !important`,
                  highlightBackground.backgroundImage ? `background-image: ${highlightBackground.backgroundImage} !important` : "",
                  "background-repeat: no-repeat !important",
                  "background-size: 100% 100% !important",
                  "-webkit-print-color-adjust: exact !important",
                  "print-color-adjust: exact !important",
                  "color-adjust: exact !important",
                  "forced-color-adjust: none !important"
                ]
                  .filter(Boolean)
                  .join("; ");
                return `<td class="is-highlighted-cell" bgcolor="${highlightBackground.backgroundColor}" style="${tdStyles}"><div class="print-highlight-cell-shell"><span class="print-highlight-cell-text">${cellValue}</span></div></td>`;
              }

              return `<td>${cellValue}</td>`;
            })
            .join("");
          return `<tr${highlightMatches.length > 0 ? ` class="is-highlighted"` : ""}>${cells}</tr>`;
        })
        .join("");

      return `
        <section class="print-section">
          <div class="print-section-head">
            <div class="print-section-title">${escapeHtml(section.title)}</div>
            ${sectionTotal}
          </div>
          <div class="print-table-shell">
            <table>
              <thead><tr>${head}</tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </section>
      `;
    })
    .join("");

  const highlightLegend =
    highlightRules.length > 0
      ? `
          <div class="print-highlight-legend">
            ${highlightRules
              .map((rule) => {
                const swatchColor = mixHexColorWithWhite(rule.color, highlightOpacityPercent / 100);
                return `
                  <div class="print-highlight-legend-item">
                    <span class="print-highlight-swatch" style="--swatch-color: ${swatchColor}; background: ${swatchColor} !important; border-color: ${swatchColor} !important;" aria-hidden="true"></span>
                    <span class="print-highlight-legend-label">${escapeHtml(rule.label)}</span>
                  </div>
                `;
              })
              .join("")}
          </div>
        `
      : "";

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Nao foi possivel abrir a janela de impressao.");
  }

  try {
    printWindow.opener = null;
  } catch {
    // Ignore browsers that expose opener as read-only.
  }

  const printableHtml = `<!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(baseTitle)}</title>
        <style>
          @page { margin: 8mm; }
          * { box-sizing: border-box; }
          html, body {
            width: 100%;
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #183126;
            font-size: 12px;
            font-family: "Segoe UI", Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            padding: 56px 12px 12px;
          }
          .print-actions {
            position: fixed;
            top: 12px;
            right: 12px;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .print-action-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 40px;
            height: 34px;
            padding: 0 12px;
            border: 1px solid #c9d6cf;
            background: #ffffff;
            color: #173527;
            font-size: 13px;
            font-weight: 700;
            line-height: 1;
            cursor: pointer;
          }
          .print-action-button:hover {
            background: #f3f7f4;
          }
          .print-action-button.is-close {
            min-width: 34px;
            padding: 0;
            font-size: 16px;
          }
          .print-shell {
            display: grid;
            gap: 4px;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-meta {
            display: grid;
            gap: 1px;
            margin: 0;
            padding: 0;
          }
          .print-meta-head {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 12px;
          }
          .print-meta h1 {
            margin: 0;
            padding: 0 0 2px;
            font-size: 22px;
            line-height: 1.1;
            color: #173527;
          }
          .print-meta-badges {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 6px;
          }
          .print-meta-badge {
            padding: 4px 8px;
            border: 1px solid #d8e2dc;
            background: #f7faf8;
            color: #436354;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.02em;
            white-space: nowrap;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-highlight-legend {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 2px;
          }
          .print-highlight-legend-item {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border: 1px solid #d8e2dc;
            background: #f7faf8;
            color: #436354;
            font-size: 10px;
            font-weight: 700;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-highlight-swatch {
            --swatch-color: #94a3b8;
            width: 10px;
            height: 10px;
            flex: none;
            display: inline-block;
            border-radius: 999px;
            background: var(--swatch-color) !important;
            box-shadow: inset 0 0 0 100vmax var(--swatch-color) !important;
            border: 1px solid var(--swatch-color);
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            forced-color-adjust: none !important;
          }
          .print-highlight-legend-label {
            color: #173527;
          }
          .print-section {
            margin: 0;
            break-inside: avoid-page;
            page-break-inside: avoid;
          }
          .print-section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 6px;
            border-radius: 0;
            background: #1f5a43;
            color: #ffffff;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-section-title {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.02em;
          }
          .print-section-total {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.02em;
            white-space: nowrap;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-table-shell {
            border: 1px solid #d8e2dc;
            border-top: 0;
            border-radius: 0;
            overflow: hidden;
            break-inside: avoid-page;
            page-break-inside: avoid;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          table { width: 100%; border-collapse: collapse; table-layout: auto; }
          thead { display: table-header-group; }
          tbody tr:nth-child(odd):not(.is-highlighted) { background: #ffffff; }
          tbody tr:nth-child(even):not(.is-highlighted) {
            background: #edf0ee;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          th, td {
            padding: 6px 0 0 6px;
            border: 0;
            text-align: left;
            vertical-align: top;
            font-size: 12px;
            line-height: 1.2;
            white-space: nowrap;
            font-weight: 600;
          }
          thead th {
            padding-top: 6px;
            padding-bottom: 6px;
            color: #436354;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            background: #f7faf8;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          td.is-highlighted-cell {
            padding: 0;
            position: relative;
            overflow: hidden;
          }
          .print-highlight-cell-shell {
            position: relative;
            display: block;
            width: 100%;
            min-height: 100%;
            padding: 6px 0 0 6px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            forced-color-adjust: none !important;
          }
          .print-highlight-cell-text {
            position: relative;
            display: block;
          }
          tr.is-highlighted td {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            forced-color-adjust: none !important;
          }
          tr { break-inside: avoid; page-break-inside: avoid; }
          @media print {
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
              forced-color-adjust: none !important;
            }
            html, body {
              width: 100%;
              margin: 0;
              padding: 0;
            }
            .print-actions {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="print-actions" aria-hidden="false">
          <button type="button" class="print-action-button" onclick="window.focus(); window.print();">Imprimir</button>
          <button type="button" class="print-action-button is-close" onclick="window.close();" aria-label="Fechar">x</button>
        </div>
        <main class="print-shell">
          <header class="print-meta">
            <div class="print-meta-head">
              <h1>${escapeHtml(baseTitle)}</h1>
              <div class="print-meta-badges">
                <span class="print-meta-badge">${escapeHtml(printedAt)}</span>
                <span class="print-meta-badge">${escapeHtml(totalLabel(sortedRows.length))}</span>
                ${sortColumn ? `<span class="print-meta-badge">${escapeHtml(`Ordenado por ${sortLabel} (${sortDirection === "asc" ? "crescente" : "decrescente"})`)}</span>` : ""}
              </div>
            </div>
            ${highlightLegend}
          </header>
          ${htmlSections}
        </main>
      </body>
    </html>`;

  let printTriggered = false;
  const triggerPrint = () => {
    if (printTriggered) return;
    printTriggered = true;

    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 80);
  };

  if (typeof printWindow.addEventListener === "function") {
    printWindow.addEventListener("load", triggerPrint, { once: true });
  }

  printWindow.document.open();
  printWindow.document.write(printableHtml);
  printWindow.document.close();
  window.setTimeout(triggerPrint, 250);
}

export async function executePreparedPrintJob(params: ExecutePreparedPrintJobParams) {
  const filteredRows = filterRowsByPrintFilters(params.rows, params.filters ?? {});

  await executePrintJob({
    title: params.title,
    rows: filteredRows,
    columns: params.columns,
    sortColumn: params.sortColumn,
    sortDirection: params.sortDirection,
    sortLabel: params.sortLabel,
    sectionColumn: params.sectionColumn,
    sectionValues: params.sectionValues,
    includeOthers: params.includeOthers,
    itemLabelPlural: params.itemLabelPlural,
    highlightRules: params.highlightRules,
    highlightOpacityPercent: params.highlightOpacityPercent,
    resolveValue: params.resolveValue
  });
}
