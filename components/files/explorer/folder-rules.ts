import type { ExplorerFolder, FileAutomationRepositoryKey } from "@/lib/files/explorer-types";

/**
 * Regras de UI que protegem as automações de veículos. As pastas gerenciadas
 * são recolocadas/renomeadas pela automação a cada sincronização, então
 * mover/renomear à mão só geraria confusão; repositórios são referenciados
 * por id na configuração.
 */

export const REPOSITORY_LABELS: Record<FileAutomationRepositoryKey, string> = {
  vehicle_photos_active: "Repositório: fotos dos veículos",
  vehicle_photos_sold: "Repositório: fotos de vendidos",
  vehicle_documents_active: "Repositório: documentos",
  vehicle_documents_archive: "Repositório: documentos arquivados"
};

export type FolderKind = "photos" | "documents" | "generic";

export function folderKind(folder: ExplorerFolder | null | undefined): FolderKind {
  if (!folder) return "generic";
  if (folder.automationKey === "vehicle_photos") return "photos";
  if (folder.automationKey === "vehicle_documents") return "documents";
  return "generic";
}

export function isManagedFolder(folder: ExplorerFolder) {
  return folder.automationKey !== null;
}

export function isRepositoryFolder(folder: ExplorerFolder) {
  return folder.automationRepositoryKey !== null;
}

/** Não pode ser movida (nem por arrastar nem por "Mover para"). */
export function isFolderLocked(folder: ExplorerFolder) {
  return isManagedFolder(folder) || isRepositoryFolder(folder);
}

export function canRenameFolder(folder: ExplorerFolder) {
  return !isManagedFolder(folder);
}

export function canDeleteFolder(folder: ExplorerFolder) {
  return !isRepositoryFolder(folder);
}

export function folderRoleLabel(folder: ExplorerFolder) {
  if (folder.automationRepositoryKey) return REPOSITORY_LABELS[folder.automationRepositoryKey];
  if (folder.automationKey === "vehicle_photos") return "Fotos do veículo";
  if (folder.automationKey === "vehicle_documents") return "Documentos do veículo";
  return null;
}
