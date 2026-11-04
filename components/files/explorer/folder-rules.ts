import type { ExplorerFolder, FileAutomationRepositoryKey } from "@/lib/files/explorer-types";

/**
 * Pastas do SISTEMA = repositórios configurados nas automações + pastas de
 * veículo que a automação mantém. O sistema trabalha em cima delas, então são
 * travadas (cadeado): não renomeia, não move, não exclui. O servidor aplica a
 * mesma trava (lib/files/explorer-service.ts → assertFolderNotSystem).
 * O conteúdo (arquivos) continua livre.
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

/** Pasta do sistema: cadeado — não renomeia, não move, não exclui. */
export function isFolderLocked(folder: ExplorerFolder) {
  return isManagedFolder(folder) || isRepositoryFolder(folder);
}

export function canRenameFolder(folder: ExplorerFolder) {
  return !isFolderLocked(folder);
}

export function canDeleteFolder(folder: ExplorerFolder) {
  return !isFolderLocked(folder);
}

export const LOCKED_FOLDER_HINT = "Pasta do sistema (automação de veículos): não pode ser renomeada, movida nem excluída.";

export function folderRoleLabel(folder: ExplorerFolder) {
  if (folder.automationRepositoryKey) return REPOSITORY_LABELS[folder.automationRepositoryKey];
  if (folder.automationKey === "vehicle_photos") return "Fotos do veículo";
  if (folder.automationKey === "vehicle_documents") return "Documentos do veículo";
  return null;
}
