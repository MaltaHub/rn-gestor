"use client";

import { useMemo } from "react";
import type { FlowNode } from "@/components/editor/types";
import { useSchemaEnv } from "@/components/editor/schema/schema-context";
import { getSheetSchema, type ColumnType } from "@/components/editor/schema/sheet-schema";
import type { SheetKey } from "@/components/ui-grid/types";

export type InNodeColumnDropdownProps = {
  node: FlowNode;
  /** Origem das opcoes: ou da config (sheet_key) ou do schema do input socket. */
  sheetFrom: "node-config" | { inputSocket: string };
  /** Valor corrente. */
  value: string;
  /** Permite valor customizado nao listado. */
  allowCustom?: boolean;
  /** Label exibido como rotulo do chip. */
  label: string;
  /** Placeholder pra modo customizado. */
  placeholder?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  testIdPrefix?: string;
};

const CUSTOM_SENTINEL = "__custom__";

export function InNodeColumnDropdown({
  node,
  sheetFrom,
  value,
  allowCustom,
  label,
  placeholder,
  disabled,
  onChange,
  testIdPrefix = "in-node-dropdown"
}: InNodeColumnDropdownProps) {
  const env = useSchemaEnv();

  const options = useMemo<Array<{ name: string; type: ColumnType }>>(() => {
    if (sheetFrom === "node-config") {
      const sheet = node.config?.sheet_key as SheetKey | undefined;
      if (!sheet) return [];
      const schema = getSheetSchema(sheet);
      return schema?.columns.map((c) => ({ name: c.name, type: c.type })) ?? [];
    }
    const inSchema = env.byInput.get(`${node.id}:${sheetFrom.inputSocket}`);
    if (!inSchema) return [];
    return inSchema.fields.map((f) => ({ name: f.name, type: f.type }));
  }, [env, node.id, node.config, sheetFrom]);

  const hasMatch = options.some((opt) => opt.name === value);
  const isCustom = Boolean(value) && !hasMatch;

  function handleChange(next: string) {
    if (next === CUSTOM_SENTINEL) {
      onChange("");
      return;
    }
    onChange(next);
  }

  return (
    <div className="editor-node-inline-field" data-testid={`${testIdPrefix}-${node.id}`}>
      <label className="editor-node-inline-label">{label}</label>
      <div className="editor-node-inline-controls">
        {!isCustom ? (
          <select
            className="editor-node-inline-select"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            disabled={disabled}
            data-testid={`${testIdPrefix}-select-${node.id}`}
          >
            <option value="">—</option>
            {options.length === 0 ? (
              <option value="" disabled>
                {sheetFrom === "node-config"
                  ? "(selecione a aba primeiro)"
                  : "(conecte um input pra ver colunas)"}
              </option>
            ) : null}
            {options.map((opt) => (
              <option key={opt.name} value={opt.name}>
                {opt.name} {opt.type !== "unknown" ? `(${opt.type})` : ""}
              </option>
            ))}
            {allowCustom ? <option value={CUSTOM_SENTINEL}>✏ Valor customizado...</option> : null}
          </select>
        ) : (
          <>
            <input
              className="editor-node-inline-input"
              type="text"
              value={value}
              placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              data-testid={`${testIdPrefix}-input-${node.id}`}
            />
            <button
              type="button"
              className="editor-node-inline-back"
              onClick={() => onChange("")}
              title="Voltar pra dropdown"
              disabled={disabled}
            >
              ↩
            </button>
          </>
        )}
      </div>
    </div>
  );
}
