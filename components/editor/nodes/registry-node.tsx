"use client";

import { useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { getRegistryEntry, type NodeCategory } from "@/components/editor/node-registry";
import type { DynamicOutputSocket, FlowNode, FlowSocketType } from "@/components/editor/types";
import { SocketAddPopover } from "@/components/editor/nodes/socket-add-popover";
import { InNodeColumnDropdown } from "@/components/editor/nodes/in-node-dropdown";
import { useEditorNodeActions } from "@/components/editor/nodes/node-actions-context";

type RegistryNodeData = {
  config?: Record<string, unknown>;
  dynamicOutputs?: DynamicOutputSocket[];
};

type RegistryNodeProps = {
  id: string;
  type?: string;
  data: RegistryNodeData;
  selected?: boolean;
};

const CATEGORY_CLASS: Record<NodeCategory, string> = {
  source: "editor-node-source",
  structural: "editor-node-structural",
  computation: "editor-node-computation",
  tag: "editor-node-tag"
};

function socketTypeLabel(type: FlowSocketType): string {
  if (type.kind === "RowList") return `RowList${type.sheet ? `<${type.sheet}>` : ""}`;
  if (type.kind === "Row") return `Row${type.sheet ? `<${type.sheet}>` : ""}`;
  return type.kind;
}

export function RegistryNode({ id, type, data, selected }: RegistryNodeProps) {
  const entry = type ? getRegistryEntry(type) : null;
  const [showAddPopover, setShowAddPopover] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const actions = useEditorNodeActions();

  if (!entry) {
    return (
      <div className="editor-node editor-node-unknown" data-testid={`node-unknown-${type}`}>
        <header className="editor-node-head">
          <strong>{type ?? "Desconhecido"}</strong>
        </header>
        <div className="editor-node-body">Tipo de no nao registrado.</div>
      </div>
    );
  }

  const config = data?.config ?? {};
  const dynamicOutputs = data?.dynamicOutputs ?? [];
  const supportsPlus = Boolean(
    entry.supportsDynamicOutputs || entry.supportsColumnEject || entry.supportsCustomOutputs
  );

  // FlowNode "leve" pra passar pros children — mantemos id/type/config/dynamicOutputs.
  const nodeLike: FlowNode = {
    id,
    type: type ?? "Unknown",
    position: { x: 0, y: 0 }, // posicao real fica no React Flow, irrelevante aqui
    config,
    dynamicOutputs
  };

  // Renderiza inputs + outputs estaticos em linhas. Outputs dinamicos vao
  // em linhas adicionais abaixo, com handle proprio.
  const staticRowsCount = Math.max(entry.inputs.length, entry.outputs.length);

  return (
    <div
      className={`editor-node ${CATEGORY_CLASS[entry.category]}${selected ? " is-selected" : ""}`}
      data-testid={`node-${entry.type}`}
    >
      <header className="editor-node-head">
        <strong>{entry.label}</strong>
        <span>{entry.category}</span>
        {entry.supportsBody ? (
          <span
            className="editor-node-body-badge"
            title="Double-click para editar o body"
            data-testid={`node-body-badge-${id}`}
          >
            ⤵
          </span>
        ) : null}
        {supportsPlus ? (
          <button
            ref={addButtonRef}
            type="button"
            className="editor-node-add-output"
            title="Adicionar saida"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddPopover((v) => !v);
            }}
            data-testid={`node-add-output-${id}`}
          >
            +
          </button>
        ) : null}
      </header>

      {showAddPopover && actions ? (
        <SocketAddPopover
          node={nodeLike}
          entry={entry}
          anchorElement={addButtonRef.current}
          onAdd={(socket) => actions.addDynamicOutput(id, socket)}
          onClose={() => setShowAddPopover(false)}
        />
      ) : null}

      <div className="editor-node-sockets">
        {Array.from({ length: staticRowsCount }).map((_, idx) => {
          const inp = entry.inputs[idx];
          const out = entry.outputs[idx];
          return (
            <div key={`socket-row-${idx}`} className="editor-node-socket-row">
              <div className="editor-node-socket-side editor-node-socket-side-in">
                {inp ? (
                  <>
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={inp.key}
                      className="editor-node-handle"
                    />
                    <span className="editor-node-socket-label" title={socketTypeLabel(inp.type)}>
                      {inp.label}
                    </span>
                  </>
                ) : null}
              </div>
              <div className="editor-node-socket-side editor-node-socket-side-out">
                {out ? (
                  <>
                    <span className="editor-node-socket-label" title={socketTypeLabel(out.type)}>
                      {out.label}
                    </span>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={out.key}
                      className="editor-node-handle"
                    />
                  </>
                ) : null}
              </div>
            </div>
          );
        })}

        {/* Dynamic outputs — uma linha por socket, lado direito apenas. */}
        {dynamicOutputs.map((dyno) => (
          <div key={`dyn-${dyno.id}`} className="editor-node-socket-row editor-node-socket-row-dynamic">
            <div className="editor-node-socket-side editor-node-socket-side-in" />
            <div className="editor-node-socket-side editor-node-socket-side-out">
              <button
                type="button"
                className="editor-node-dynamic-remove"
                title="Remover saida"
                onClick={(e) => {
                  e.stopPropagation();
                  actions?.removeDynamicOutput(id, dyno.id);
                }}
                data-testid={`node-remove-dyn-${id}-${dyno.id}`}
              >
                ×
              </button>
              <span
                className={`editor-node-socket-label editor-node-socket-label-dynamic editor-node-socket-label-${dyno.kind}`}
                title={`${dyno.kind === "intrinsic" ? "Intrinseco" : "Coluna"}: ${socketTypeLabel(dyno.type)}`}
              >
                {dyno.label}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={dyno.id}
                className="editor-node-handle"
                data-testid={`handle-dyn-${id}-${dyno.id}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* In-node dropdowns pra fields type=column-select. */}
      {entry.configFields
        .filter((f) => f.type === "column-select")
        .map((field) => {
          if (field.type !== "column-select") return null;
          const fieldValue = (config as Record<string, unknown>)[field.key];
          return (
            <InNodeColumnDropdown
              key={`inline-${field.key}`}
              node={nodeLike}
              sheetFrom={field.sheetFrom}
              value={typeof fieldValue === "string" ? fieldValue : ""}
              allowCustom={field.allowCustom}
              label={field.label}
              placeholder={field.placeholder}
              onChange={(next) => actions?.updateConfigField(id, field.key, next)}
              testIdPrefix="editor-node-col"
            />
          );
        })}

      {/* Config preview (chips do que ja foi preenchido nos demais fields). */}
      {Object.keys(config).length > 0 ? (
        <div className="editor-node-config-preview">
          {entry.configFields
            .filter((f) => f.type !== "column-select")
            .slice(0, 3)
            .map((field) => {
              const raw = (config as Record<string, unknown>)[field.key];
              if (raw === undefined || raw === "" || raw === null) return null;
              const text = typeof raw === "string" ? raw : JSON.stringify(raw);
              const trimmed = text.length > 40 ? `${text.slice(0, 40)}...` : text;
              return (
                <span key={field.key} className="editor-node-config-chip">
                  <em>{field.label}:</em> {trimmed}
                </span>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}
