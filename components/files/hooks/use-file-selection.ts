import { useEffect, useMemo, useState } from "react";

import type { FileItem } from "@/components/files/types";

const FILES_SELECTED_FILE_STORAGE_KEY = "rn-gestor.files.selected-file-id";

type UseFileSelectionParams = {
  filteredFiles: FileItem[];
};

export function useFileSelection({ filteredFiles }: UseFileSelectionParams) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedSelectedFileId = window.localStorage.getItem(
      FILES_SELECTED_FILE_STORAGE_KEY,
    );
    if (storedSelectedFileId) {
      setSelectedFileId(storedSelectedFileId);
    }
  }, []);

  useEffect(() => {
    if (
      !selectedFileId ||
      !filteredFiles.some((file) => file.id === selectedFileId)
    ) {
      setSelectedFileId(filteredFiles[0]?.id ?? null);
    }
  }, [filteredFiles, selectedFileId]);

  useEffect(() => {
    const visibleFileIds = new Set(filteredFiles.map((file) => file.id));
    setSelectedFileIds((current) => {
      const next = current.filter((fileId) => visibleFileIds.has(fileId));
      return next.length === current.length ? current : next;
    });
  }, [filteredFiles]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (selectedFileId) {
      window.localStorage.setItem(
        FILES_SELECTED_FILE_STORAGE_KEY,
        selectedFileId,
      );
      return;
    }

    window.localStorage.removeItem(FILES_SELECTED_FILE_STORAGE_KEY);
  }, [selectedFileId]);

  const selectedFileIdSet = useMemo(
    () => new Set(selectedFileIds),
    [selectedFileIds],
  );

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((current) =>
      current.includes(fileId)
        ? current.filter((currentFileId) => currentFileId !== fileId)
        : [...current, fileId],
    );
  };

  const toggleSelectAllVisibleFiles = () => {
    setSelectedFileIds((current) => {
      const visibleIds = filteredFiles.map((file) => file.id);
      const allVisibleSelected =
        visibleIds.length > 0 &&
        visibleIds.every((fileId) => current.includes(fileId));
      if (allVisibleSelected) {
        return current.filter((fileId) => !visibleIds.includes(fileId));
      }

      const next = new Set(current);
      for (const fileId of visibleIds) {
        next.add(fileId);
      }

      return Array.from(next);
    });
  };

  return {
    selectedFileId,
    selectedFileIds,
    selectedFileIdSet,
    setSelectedFileId,
    setSelectedFileIds,
    toggleFileSelection,
    toggleSelectAllVisibleFiles,
  };
}
