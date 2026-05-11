import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchFileFolderDetail,
  fetchFileFolders,
} from "@/components/files/api";
import type {
  FileFolderDetail,
  FileFolderSummary,
} from "@/components/files/types";
import type { Role } from "@/components/ui-grid/types";

type UseFileManagerFolderDataParams = {
  accessToken: string | null;
  devRole?: Role | null;
  setError: (message: string | null) => void;
};

export function useFileManagerFolderData({
  accessToken,
  devRole,
  setError,
}: UseFileManagerFolderDataParams) {
  const activeFolderIdRef = useRef<string | null>(null);
  const restoredFolderIdRef = useRef<string | null>(null);

  const [folders, setFolders] = useState<FileFolderSummary[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<FileFolderDetail | null>(
    null,
  );
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [folderLoading, setFolderLoading] = useState(false);

  useEffect(() => {
    activeFolderIdRef.current = activeFolderId;
  }, [activeFolderId]);

  const loadFolders = useCallback(
    async (preferredFolderId?: string | null) => {
      setFoldersLoading(true);
      setError(null);

      try {
        const response = await fetchFileFolders({ accessToken, devRole });
        const nextFolders = response.folders;

        setFolders(nextFolders);
        setActiveFolderId((current) => {
          const preferred =
            preferredFolderId ?? current ?? restoredFolderIdRef.current;

          if (
            preferred &&
            nextFolders.some((folder) => folder.id === preferred)
          ) {
            return preferred;
          }

          return nextFolders[0]?.id ?? null;
        });
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Falha ao carregar pastas.",
        );
      } finally {
        setFoldersLoading(false);
      }
    },
    [accessToken, devRole, setError],
  );

  const loadActiveFolder = useCallback(
    async (folderId: string) => {
      setFolderLoading(true);
      setError(null);

      try {
        const detail = await fetchFileFolderDetail(folderId, {
          accessToken,
          devRole,
        });

        setActiveFolder(detail);
      } catch (nextError) {
        setActiveFolder(null);
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Falha ao carregar a pasta selecionada.",
        );
      } finally {
        setFolderLoading(false);
      }
    },
    [accessToken, devRole, setError],
  );

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (!activeFolderId) {
      setActiveFolder(null);
      return;
    }

    void loadActiveFolder(activeFolderId);
  }, [activeFolderId, loadActiveFolder]);

  const getActiveFolderId = useCallback(() => activeFolderIdRef.current, []);

  return {
    activeFolder,
    activeFolderId,
    folderLoading,
    folders,
    foldersLoading,
    getActiveFolderId,
    loadActiveFolder,
    loadFolders,
    setActiveFolder,
    setActiveFolderId,
  };
}
