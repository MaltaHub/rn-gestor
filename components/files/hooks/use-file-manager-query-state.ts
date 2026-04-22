import { useEffect, useState } from "react";

export type ColumnFilterKey =
  | "createdAt"
  | "author"
  | "table"
  | "action"
  | "field"
  | "before"
  | "after";
export type PreviewMode = "open" | "expanded" | "hidden";

export const FILES_PREVIEW_MODE_STORAGE_KEY = "rn-gestor.files.preview-mode";

export function useFileManagerQueryState() {
  const [fileQuery, setFileQuery] = useState("");
  const [fileDateFrom, setFileDateFrom] = useState("");
  const [fileDateTo, setFileDateTo] = useState("");
  const [openColumnFilter, setOpenColumnFilter] =
    useState<ColumnFilterKey | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("open");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedPreviewMode = window.localStorage.getItem(
      FILES_PREVIEW_MODE_STORAGE_KEY,
    );
    if (
      storedPreviewMode === "open" ||
      storedPreviewMode === "expanded" ||
      storedPreviewMode === "hidden"
    ) {
      setPreviewMode(storedPreviewMode);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FILES_PREVIEW_MODE_STORAGE_KEY, previewMode);
  }, [previewMode]);

  const clearFileFilters = () => {
    setFileQuery("");
    setFileDateFrom("");
    setFileDateTo("");
    setOpenColumnFilter(null);
  };

  return {
    clearFileFilters,
    fileDateFrom,
    fileDateTo,
    fileQuery,
    openColumnFilter,
    previewMode,
    setFileDateFrom,
    setFileDateTo,
    setFileQuery,
    setOpenColumnFilter,
    setPreviewMode,
  };
}
