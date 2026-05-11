import { useEffect, useState } from "react";

import type { FileFolderDetail } from "@/components/files/types";

export type CreatePanelState = null | {
  parentFolderId: string | null;
};

type UseFileManagerFolderFormStateParams = {
  activeFolder: FileFolderDetail | null;
};

export function useFileManagerFolderFormState({
  activeFolder,
}: UseFileManagerFolderFormStateParams) {
  const [createPanel, setCreatePanel] = useState<CreatePanelState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createParentFolderId, setCreateParentFolderId] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editParentFolderId, setEditParentFolderId] = useState("");

  useEffect(() => {
    if (!activeFolder) {
      setEditName("");
      setEditDescription("");
      setEditParentFolderId("");
      setSettingsOpen(false);
      return;
    }

    setEditName(activeFolder.folder.name);
    setEditDescription(activeFolder.folder.description ?? "");
    setEditParentFolderId(activeFolder.folder.parentFolderId ?? "");
    setSettingsOpen(false);
  }, [activeFolder]);

  function openCreatePanel(parentFolderId: string | null) {
    setCreatePanel({ parentFolderId });
    setCreateName("");
    setCreateDescription("");
    setCreateParentFolderId(parentFolderId ?? "");
  }

  function closeCreatePanel() {
    setCreatePanel(null);
    setCreateName("");
    setCreateDescription("");
    setCreateParentFolderId("");
  }

  return {
    closeCreatePanel,
    createDescription,
    createName,
    createPanel,
    createParentFolderId,
    editDescription,
    editName,
    editParentFolderId,
    openCreatePanel,
    setCreateDescription,
    setCreateName,
    setCreateParentFolderId,
    setEditDescription,
    setEditName,
    setEditParentFolderId,
    setSettingsOpen,
    settingsOpen,
  };
}
