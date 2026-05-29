"use client";

import { useMemo, useRef } from "react";
import type { FlowNode } from "@/components/editor/types";
import { useSchemaEnv } from "@/components/editor/schema/schema-context";
import type { ColumnType } from "@/components/editor/schema/sheet-schema";

/**
 * Campo de texto + chips clicaveis com placeholders disponiveis no NIVEL do node.
 *
 * O componente consulta o `SchemaContext` pra resolver o schema do socket de
 * entrada (`inputSocket`) e oferece, abaixo do input:
 *   - 1 chip por field do schema (ex.: `placa`, `id`, `cor`) → insere `${field}`
 *   - chip "${value}" se o input parece carregar valor escalar (RowList de
 *     coluna ejetada, Value generico)
 *   - chip "${count}" e "${first.<col>}" se input parece RowList full
 *
 * Click no chip insere o placeholder na posicao do cursor (ou ao final se
 * input nao esta focado).
 */
export type TemplateFieldProps = {
  node: FlowNode;
  inputSocket: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  testIdPrefix?: string;
};

type PlaceholderChip = {
  label: string;
  insert: string;
  type?: ColumnType | "any";
  hint?: string;
};

export function TemplateField({
  node,
  inputSocket,
  value,
  placeholder,
  disabled,
  onChange,
  testIdPrefix = "template-field"
}: TemplateFieldProps) {
  const env = useSchemaEnv();
  const inputRef = useRef<HTMLInputElement>(null);

  const chips = useMemo<PlaceholderChip[]>(() => {
    const out: PlaceholderChip[] = [];
    const seen = new Set<string>();

    function pushField(name: string, type: ColumnType, hint?: string) {
      if (seen.has(name)) return;
      seen.add(name);
      out.push({ label: name, insert: `\${${name}}`, type, hint });
    }

    // 1. Campos do schema do INPUT do node (Row direto, ou 1 field de column-eject).
    const inputSchema = env.byInput.get(`${node.id}:${inputSocket}`);
    for (const f of inputSchema?.fields ?? []) {
      pushField(f.name, f.type, f.origin === "intrinsic" ? "intrinseco" : undefined);
    }

    // 2. Campos da row iterada pelo ForEach ANCESTRAL — mesmo se o input direto
    // do node e Value/escalar, todos os campos da iteracao corrente sao
    // resolviveis via frameContext do runtime.
    const frameSchema = env.frameSchemaByNode.get(node.id);
    for (const f of frameSchema?.fields ?? []) {
      pushField(f.name, f.type, "iteracao");
    }

    // 3. Convenience: ${value} pra Value/primitivos, ${count} pra RowList.
    if (!seen.has("value")) {
      out.push({ label: "value", insert: "${value}", type: "any", hint: "valor bruto" });
    }
    if (!seen.has("count")) {
      out.push({ label: "count", insert: "${count}", type: "number", hint: "tamanho da lista" });
    }
    return out;
  }, [env, node.id, inputSocket]);

  function insertAtCursor(text: string) {
    const el = inputRef.current;
    if (!el) {
      onChange(value + text);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  return (
    <div className="editor-template-field" data-testid={`${testIdPrefix}-${node.id}`}>
      <input
        ref={inputRef}
        type="text"
        className="editor-template-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`${testIdPrefix}-input-${node.id}`}
      />
      {chips.length > 0 ? (
        <div className="editor-template-chips" data-testid={`${testIdPrefix}-chips-${node.id}`}>
          <span className="editor-template-chips-label">Disponiveis:</span>
          {chips.map((chip) => (
            <button
              key={chip.insert}
              type="button"
              className="editor-template-chip"
              title={chip.hint ? `${chip.insert} — ${chip.hint}` : chip.insert}
              disabled={disabled}
              onClick={(e) => {
                e.preventDefault();
                insertAtCursor(chip.insert);
              }}
              data-testid={`${testIdPrefix}-chip-${node.id}-${chip.label}`}
            >
              <code>${"{"}{chip.label}{"}"}</code>
              {chip.type && chip.type !== "any" ? (
                <span className="editor-template-chip-type">{chip.type}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
