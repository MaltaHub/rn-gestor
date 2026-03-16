import type { PrintHighlightRule } from "@/components/ui-grid/print-highlights";
import {
  PRINT_HIGHLIGHT_OPERATOR_OPTIONS,
  mixHexColorWithWhite,
  normalizePrintHighlightOpacityPercent,
  operatorNeedsValues,
  sanitizeColorHex
} from "@/components/ui-grid/print-highlights";

type PrintHighlightPreviewItem = {
  rule: PrintHighlightRule;
  matchCount: number;
};

type PrintHighlightEditorProps = {
  allColumns: string[];
  getPrintColumnLabel: (column: string) => string;
  opacityPercent: number;
  previews: PrintHighlightPreviewItem[];
  rules: PrintHighlightRule[];
  onAdd: () => void;
  onOpacityChange: (value: number) => void;
  onRemove: (ruleId: string) => void;
  onUpdate: (ruleId: string, patch: Partial<PrintHighlightRule>) => void;
};

export function PrintHighlightEditor({
  allColumns,
  getPrintColumnLabel,
  opacityPercent,
  previews,
  rules,
  onAdd,
  onOpacityChange,
  onRemove,
  onUpdate
}: PrintHighlightEditorProps) {
  return (
    <section className="sheet-dialog-section">
      <div className="sheet-dialog-section-head">
        <div>
          <strong>Indices de destaque</strong>
          <span>Os valores podem ser informados em uma lista, com um item por linha.</span>
        </div>
        <div className="sheet-dialog-section-actions">
          <button
            type="button"
            className="sheet-filter-clear-btn"
            onClick={onAdd}
            data-testid="print-highlight-add"
          >
            Adicionar indice
          </button>
        </div>
      </div>
      <div className="sheet-print-highlight-toolbar">
        <label className="sheet-form-field sheet-print-highlight-opacity-field">
          <span>Opacidade dos indices</span>
          <div className="sheet-print-highlight-opacity-input">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={opacityPercent}
              onChange={(event) => onOpacityChange(normalizePrintHighlightOpacityPercent(Number(event.target.value)))}
              data-testid="print-highlight-opacity"
            />
            <strong>{opacityPercent}%</strong>
          </div>
        </label>
      </div>
      {rules.length === 0 ? (
        <p>Nenhum indice configurado. Adicione um para destacar linhas na impressao.</p>
      ) : (
        <div className="sheet-order-list sheet-print-highlight-list" data-testid="print-highlight-list">
          {rules.map((rule, index) => {
            const preview = previews[index];
            const previewRule = preview?.rule ?? rule;
            const matchCount = preview?.matchCount ?? 0;
            const previewColor = mixHexColorWithWhite(previewRule.color, opacityPercent / 100);

            return (
              <div key={rule.id} className="sheet-order-item sheet-print-highlight-item">
                <div className="sheet-print-highlight-main">
                  <div className="sheet-print-highlight-grid">
                    <label className="sheet-form-field">
                      <span>Coluna</span>
                      <select
                        value={rule.column}
                        onChange={(event) =>
                          onUpdate(rule.id, {
                            column: event.target.value,
                            columnLabel: event.target.value ? getPrintColumnLabel(event.target.value) : ""
                          })
                        }
                        data-testid={`print-highlight-column-${index}`}
                      >
                        <option value="">Selecione</option>
                        {allColumns.map((column) => (
                          <option key={`print-highlight-column-option-${column}`} value={column}>
                            {getPrintColumnLabel(column)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="sheet-form-field">
                      <span>Operacao</span>
                      <select
                        value={rule.operator}
                        onChange={(event) =>
                          onUpdate(rule.id, {
                            operator: event.target.value as PrintHighlightRule["operator"]
                          })
                        }
                        data-testid={`print-highlight-operator-${index}`}
                      >
                        {PRINT_HIGHLIGHT_OPERATOR_OPTIONS.map((option) => (
                          <option key={`print-highlight-operator-option-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="sheet-form-field">
                      <span>Nome do indice</span>
                      <input
                        type="text"
                        value={rule.label}
                        onChange={(event) =>
                          onUpdate(rule.id, {
                            label: event.target.value
                          })
                        }
                        placeholder="Ex.: Premium"
                        data-testid={`print-highlight-label-${index}`}
                      />
                    </label>
                    <label className="sheet-form-field sheet-print-highlight-values-field">
                      <span>Valor(es)</span>
                      <textarea
                        rows={3}
                        value={rule.valuesInput}
                        onChange={(event) =>
                          onUpdate(rule.id, {
                            valuesInput: event.target.value
                          })
                        }
                        placeholder="Um valor por linha"
                        data-testid={`print-highlight-values-${index}`}
                        disabled={!operatorNeedsValues(rule.operator)}
                      />
                    </label>
                    <label className="sheet-form-field sheet-print-highlight-color-field">
                      <span>Cor</span>
                      <div className="sheet-print-highlight-color-input">
                        <input
                          type="color"
                          value={previewRule.color}
                          onChange={(event) =>
                            onUpdate(rule.id, {
                              color: sanitizeColorHex(event.target.value, previewRule.color)
                            })
                          }
                          data-testid={`print-highlight-color-${index}`}
                        />
                        <div className="sheet-print-highlight-preview">
                          <span
                            className="sheet-print-highlight-swatch"
                            style={{ background: previewColor }}
                            aria-hidden="true"
                          />
                          <strong>{rule.label.trim() || "Indice sem nome"}</strong>
                        </div>
                      </div>
                    </label>
                  </div>
                  <div className="sheet-print-highlight-meta">
                    <span>{matchCount} linha(s) contemplada(s)</span>
                  </div>
                </div>
                <div className="sheet-order-actions">
                  <button
                    type="button"
                    className="sheet-filter-clear-btn"
                    onClick={() => onRemove(rule.id)}
                    data-testid={`print-highlight-remove-${index}`}
                  >
                    Remover
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
