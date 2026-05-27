"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DynamicOutputSocket, FlowNode, FlowSocketType } from "@/components/editor/types";
import type { NodeRegistryEntry } from "@/components/editor/node-registry";
import { useSchemaEnv } from "@/components/editor/schema/schema-context";
import { getSheetSchema, type ColumnType } from "@/components/editor/schema/sheet-schema";
import type { SheetKey } from "@/components/ui-grid/types";

type AvailableItem =
  | {
      kind: "intrinsic";
      key: string;
      label: string;
      type: FlowSocketType;
      description?: string;
      alreadyAdded: boolean;
    }
  | {
      kind: "column";
      name: string;
      label: string;
      type: FlowSocketType;
      columnType: ColumnType;
      alreadyAdded: boolean;
    };

function columnTypeToSocket(type: ColumnType): FlowSocketType {
  switch (type) {
    case "number":
      return { kind: "Number" };
    case "boolean":
      return { kind: "Boolean" };
    case "string":
    case "date":
      return { kind: "String" };
    default:
      return { kind: "Value" };
  }
}

function outputTypeToSocket(
  type: "string" | "number" | "boolean" | "value"
): FlowSocketType {
  if (type === "number") return { kind: "Number" };
  if (type === "boolean") return { kind: "Boolean" };
  if (type === "string") return { kind: "String" };
  return { kind: "Value" };
}

export type SocketAddPopoverProps = {
  node: FlowNode;
  entry: NodeRegistryEntry;
  /** Elemento ancora (botao "+") usado pra posicionar o popover via getBoundingClientRect. */
  anchorElement: HTMLElement | null;
  onAdd: (socket: DynamicOutputSocket) => void;
  onClose: () => void;
};

const POPOVER_WIDTH = 260;
const POPOVER_MAX_HEIGHT = 360;
const POPOVER_GAP = 6;

export function SocketAddPopover({ node, entry, anchorElement, onAdd, onClose }: SocketAddPopoverProps) {
  const env = useSchemaEnv();
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Form pro modo custom (Masterizador): nome, tipo, expression.
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<"string" | "number" | "boolean" | "value">("string");
  const [customExpression, setCustomExpression] = useState("");

  // Calcula posicao do popover relativa ao ancora. Re-calc em scroll/resize
  // pra acompanhar pan/zoom do canvas. Posiciona logo abaixo do botao, alinhado
  // a direita; clamp pra ficar dentro do viewport.
  useLayoutEffect(() => {
    function recalc() {
      if (!anchorElement) return;
      const rect = anchorElement.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Posicao desejada: alinhada a borda direita do botao, abaixo dele.
      let left = rect.right - POPOVER_WIDTH;
      let top = rect.bottom + POPOVER_GAP;
      // Clamp horizontal: 8px de margem.
      if (left < 8) left = 8;
      if (left + POPOVER_WIDTH > vw - 8) left = vw - POPOVER_WIDTH - 8;
      // Se nao cabe abaixo, abre acima do botao.
      if (top + POPOVER_MAX_HEIGHT > vh - 8) {
        const above = rect.top - POPOVER_MAX_HEIGHT - POPOVER_GAP;
        if (above >= 8) top = above;
        else top = Math.max(8, vh - POPOVER_MAX_HEIGHT - 8);
      }
      setPosition({ top, left });
    }
    recalc();
    window.addEventListener("scroll", recalc, true);
    window.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("scroll", recalc, true);
      window.removeEventListener("resize", recalc);
    };
  }, [anchorElement]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fecha ao clicar fora (do popover E do anchor) ou Escape.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (anchorElement?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorElement]);

  const alreadyIds = useMemo(() => {
    const set = new Set<string>();
    for (const dyno of node.dynamicOutputs ?? []) {
      if (dyno.kind === "intrinsic" && dyno.intrinsicKey) set.add(`intrinsic:${dyno.intrinsicKey}`);
      if (dyno.kind === "column" && dyno.fieldName) set.add(`column:${dyno.fieldName}`);
    }
    return set;
  }, [node.dynamicOutputs]);

  const intrinsics: AvailableItem[] = useMemo(() => {
    return (entry.intrinsicOutputs ?? []).map<AvailableItem>((iout) => ({
      kind: "intrinsic",
      key: iout.key,
      label: iout.label,
      type: iout.type,
      description: iout.description,
      alreadyAdded: alreadyIds.has(`intrinsic:${iout.key}`)
    }));
  }, [entry.intrinsicOutputs, alreadyIds]);

  const columns: AvailableItem[] = useMemo(() => {
    // 1) Pra Sources: schema vem da config (sheet_key).
    if (entry.supportsColumnEject) {
      const sheet = node.config?.sheet_key as SheetKey | undefined;
      if (!sheet) return [];
      const schema = getSheetSchema(sheet);
      if (!schema) return [];
      return schema.columns.map<AvailableItem>((col) => ({
        kind: "column",
        name: col.name,
        label: col.name,
        type: columnTypeToSocket(col.type),
        columnType: col.type,
        alreadyAdded: alreadyIds.has(`column:${col.name}`)
      }));
    }
    // 2) Pra ForEach (e nodes logicos no futuro): schema vem do input "rows".
    if (entry.supportsDynamicOutputs) {
      // Primeiro input do registry — convencao ForEach: "rows".
      const inputKey = entry.inputs[0]?.key ?? "rows";
      const inputSchema = env.byInput.get(`${node.id}:${inputKey}`);
      if (!inputSchema) return [];
      return inputSchema.fields
        .filter((f) => f.origin === "sheet")
        .map<AvailableItem>((f) => ({
          kind: "column",
          name: f.name,
          label: f.name,
          type: columnTypeToSocket(f.type),
          columnType: f.type,
          alreadyAdded: alreadyIds.has(`column:${f.name}`)
        }));
    }
    return [];
  }, [entry, node.id, node.config, env, alreadyIds]);

  const q = query.trim().toLowerCase();
  const filteredIntrinsics = q
    ? intrinsics.filter((it) => it.label.toLowerCase().includes(q) || it.kind === "intrinsic" && it.key.toLowerCase().includes(q))
    : intrinsics;
  const filteredColumns = q
    ? columns.filter((it) => it.label.toLowerCase().includes(q))
    : columns;

  function handleAdd(item: AvailableItem) {
    if (item.alreadyAdded) return;
    if (item.kind === "intrinsic") {
      onAdd({
        id: `intrinsic_${item.key}`,
        label: item.label,
        kind: "intrinsic",
        intrinsicKey: item.key,
        type: item.type
      });
    } else {
      onAdd({
        id: `col_${item.name}`,
        label: item.name,
        kind: "column",
        fieldName: item.name,
        type: item.type
      });
    }
    onClose();
  }

  function handleAddCustom() {
    const trimmedName = customName.trim();
    if (!trimmedName) return;
    // Sanitiza ID: caracteres alfanumericos + underscore.
    const safeId = `mapper_${trimmedName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    // Dedup contra ja existentes.
    if ((node.dynamicOutputs ?? []).some((d) => d.id === safeId)) return;
    onAdd({
      id: safeId,
      label: trimmedName,
      kind: "mapper",
      expression: customExpression,
      outputType: customType,
      type: outputTypeToSocket(customType)
    });
    setCustomName("");
    setCustomExpression("");
    setCustomType("string");
    onClose();
  }

  // Aguarda primeiro layout pra ter coords (anchorElement pode estar mid-render).
  if (typeof document === "undefined" || !position) return null;

  const content = (
    <div
      className="editor-socket-add-popover"
      ref={containerRef}
      data-testid={`socket-add-popover-${node.id}`}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT
      }}
    >
      {!entry.supportsCustomOutputs ? (
        <input
          ref={inputRef}
          type="text"
          className="editor-socket-add-search"
          placeholder="Buscar saida..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="socket-add-search"
        />
      ) : null}
      {entry.supportsCustomOutputs ? (
        <div className="editor-socket-add-custom" data-testid="socket-add-custom-form">
          <span className="editor-socket-add-group-label">Nova saida custom</span>
          <input
            ref={inputRef}
            type="text"
            className="editor-socket-add-custom-input"
            placeholder="Nome (ex.: placa_upper)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            data-testid="socket-add-custom-name"
          />
          <select
            className="editor-socket-add-custom-input"
            value={customType}
            onChange={(e) => setCustomType(e.target.value as typeof customType)}
            data-testid="socket-add-custom-type"
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="value">value (any)</option>
          </select>
          <input
            type="text"
            className="editor-socket-add-custom-input"
            placeholder="Expression — ex.: ${input.placa}"
            value={customExpression}
            onChange={(e) => setCustomExpression(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            data-testid="socket-add-custom-expression"
          />
          <button
            type="button"
            className="editor-socket-add-custom-submit"
            disabled={!customName.trim()}
            onClick={handleAddCustom}
            data-testid="socket-add-custom-submit"
          >
            + Adicionar saida
          </button>
        </div>
      ) : null}
      {filteredIntrinsics.length > 0 ? (
        <div className="editor-socket-add-group">
          <span className="editor-socket-add-group-label">Intrinsecos do node</span>
          {filteredIntrinsics.map((item) => (
            <button
              key={`intrinsic-${item.kind === "intrinsic" ? item.key : ""}`}
              type="button"
              className={`editor-socket-add-item${item.alreadyAdded ? " is-added" : ""}`}
              disabled={item.alreadyAdded}
              onClick={() => handleAdd(item)}
              data-testid={`socket-add-intrinsic-${item.kind === "intrinsic" ? item.key : ""}`}
            >
              <strong>{item.label}</strong>
              <span className="editor-socket-add-type">{item.type.kind}</span>
              {item.kind === "intrinsic" && item.description ? (
                <small>{item.description}</small>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {filteredColumns.length > 0 ? (
        <div className="editor-socket-add-group">
          <span className="editor-socket-add-group-label">Colunas do schema</span>
          {filteredColumns.map((item) => (
            <button
              key={`col-${item.kind === "column" ? item.name : ""}`}
              type="button"
              className={`editor-socket-add-item${item.alreadyAdded ? " is-added" : ""}`}
              disabled={item.alreadyAdded}
              onClick={() => handleAdd(item)}
              data-testid={`socket-add-column-${item.kind === "column" ? item.name : ""}`}
            >
              <strong>{item.label}</strong>
              <span className="editor-socket-add-type">{item.kind === "column" ? item.columnType : item.type.kind}</span>
            </button>
          ))}
        </div>
      ) : null}
      {!entry.supportsCustomOutputs &&
      filteredIntrinsics.length === 0 &&
      filteredColumns.length === 0 ? (
        <p className="editor-socket-add-empty">
          {entry.supportsColumnEject
            ? "Configure a aba (sheet_key) pra ver colunas disponiveis."
            : "Conecte um input RowList pra ver colunas. Intrinsecos disponiveis quando o node aceita."}
        </p>
      ) : null}
    </div>
  );

  return createPortal(content, document.body);
}
