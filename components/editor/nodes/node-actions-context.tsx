"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DynamicOutputSocket } from "@/components/editor/types";

/**
 * Actions disponibilizadas pros nodes via Context — evita prop-drilling profundo
 * pelo React Flow nodeTypes que so recebe `data`/`id`/`type`/`selected`.
 */
export type EditorNodeActions = {
  addDynamicOutput: (nodeId: string, socket: DynamicOutputSocket) => void;
  removeDynamicOutput: (nodeId: string, socketId: string) => void;
  updateConfigField: (nodeId: string, fieldKey: string, value: unknown) => void;
};

const NodeActionsContext = createContext<EditorNodeActions | null>(null);

export function NodeActionsProvider({
  value,
  children
}: {
  value: EditorNodeActions;
  children: ReactNode;
}) {
  return <NodeActionsContext.Provider value={value}>{children}</NodeActionsContext.Provider>;
}

export function useEditorNodeActions(): EditorNodeActions | null {
  return useContext(NodeActionsContext);
}
