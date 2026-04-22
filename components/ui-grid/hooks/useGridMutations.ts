import { useState } from "react";

export type EditingCell = {
  rowId: string;
  rowIndex: number;
  column: string;
  value: string;
};

export function useGridMutations() {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [massUpdateDialogOpen, setMassUpdateDialogOpen] = useState(false);
  const [massUpdateColumn, setMassUpdateColumn] = useState("");
  const [massUpdateValue, setMassUpdateValue] = useState("");
  const [massUpdateClearValue, setMassUpdateClearValue] = useState(false);
  const [massUpdateSubmitting, setMassUpdateSubmitting] = useState(false);
  const [massUpdateError, setMassUpdateError] = useState<string | null>(null);

  return {
    editingCell,
    setEditingCell,
    massUpdateDialogOpen,
    setMassUpdateDialogOpen,
    massUpdateColumn,
    setMassUpdateColumn,
    massUpdateValue,
    setMassUpdateValue,
    massUpdateClearValue,
    setMassUpdateClearValue,
    massUpdateSubmitting,
    setMassUpdateSubmitting,
    massUpdateError,
    setMassUpdateError
  };
}
