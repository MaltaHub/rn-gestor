import { useCallback, useEffect, useState } from "react";

import { fetchFileAutomationSettings } from "@/components/files/api";
import type {
  FileAutomationRepositoryKey,
  FileAutomationSettings,
  VehicleFolderDisplayField,
} from "@/components/files/types";
import type { Role } from "@/components/ui-grid/types";

const EMPTY_AUTOMATION_REPOSITORIES: Record<FileAutomationRepositoryKey, string> = {
  vehicle_photos_active: "",
  vehicle_photos_sold: "",
  vehicle_documents_active: "",
  vehicle_documents_archive: "",
};

type UseFileManagerAutomationSettingsParams = {
  accessToken: string | null;
  canManage: boolean;
  devRole?: Role | null;
  setError: (message: string | null) => void;
};

export function useFileManagerAutomationSettings({
  accessToken,
  canManage,
  devRole,
  setError,
}: UseFileManagerAutomationSettingsParams) {
  const [automationPanelOpen, setAutomationPanelOpen] = useState(false);
  const [automationSettings, setAutomationSettings] =
    useState<FileAutomationSettings | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationDisplayField, setAutomationDisplayField] =
    useState<VehicleFolderDisplayField>("placa");
  const [automationRepositories, setAutomationRepositories] =
    useState<Record<FileAutomationRepositoryKey, string>>(
      EMPTY_AUTOMATION_REPOSITORIES,
    );

  const applyAutomationSettings = useCallback(
    (settings: FileAutomationSettings) => {
      setAutomationSettings(settings);
      setAutomationDisplayField(settings.displayField);
      setAutomationRepositories(settings.repositories);
    },
    [],
  );

  const loadAutomationSettings = useCallback(async () => {
    if (!canManage) return;

    setAutomationLoading(true);

    try {
      const settings = await fetchFileAutomationSettings({
        accessToken,
        devRole,
      });

      applyAutomationSettings(settings);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Falha ao carregar automacoes.",
      );
    } finally {
      setAutomationLoading(false);
    }
  }, [accessToken, applyAutomationSettings, canManage, devRole, setError]);

  useEffect(() => {
    void loadAutomationSettings();
  }, [loadAutomationSettings]);

  return {
    applyAutomationSettings,
    automationDisplayField,
    automationLoading,
    automationPanelOpen,
    automationRepositories,
    automationSettings,
    setAutomationDisplayField,
    setAutomationPanelOpen,
    setAutomationRepositories,
  };
}
