/**
 * Contrato do explorer de arquivos (servidor <-> cliente). Só tipos: seguro
 * para importar no bundle do browser.
 *
 * O cliente recebe o ÍNDICE inteiro (árvore de pastas + metadados de todos os
 * arquivos, sem URLs) numa chamada só; navegação e busca rodam em memória.
 * URLs assinadas são pedidas sob demanda, em lote (`/files/sign`).
 */

import type { FileAutomationRules } from "@/lib/domain/file-automations/rules";

export type { FileAutomationRules };

export type FileAutomationFolderKey = "vehicle_photos" | "vehicle_documents";

export type FileAutomationRepositoryKey =
  | "vehicle_photos_active"
  | "vehicle_photos_sold"
  | "vehicle_documents_active"
  | "vehicle_documents_archive";

export type VehicleFolderDisplayField = "placa" | "chassi" | "modelo" | "id";

export type ExplorerVehicle = {
  id: string;
  placa: string | null;
  /** "PLACA — Modelo 2020 45.000 KM — Prata" */
  label: string;
  /** carros.foto_capa_id (só faz sentido na pasta de fotos). */
  coverFileId: string | null;
};

export type ExplorerFolder = {
  id: string;
  parentId: string | null;
  /** Nome físico (pastas de veículo usam o UUID do carro). */
  name: string;
  /** Nome exibido (placa/modelo para pastas gerenciadas). */
  displayName: string;
  description: string | null;
  automationKey: FileAutomationFolderKey | null;
  automationRepositoryKey: FileAutomationRepositoryKey | null;
  managedCarroId: string | null;
  isAutomationPaused: boolean;
  vehicle: ExplorerVehicle | null;
  createdAt: string;
  updatedAt: string;
};

export type ExplorerFile = {
  id: string;
  folderId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ExplorerIndex = {
  folders: ExplorerFolder[];
  files: ExplorerFile[];
  generatedAt: string;
};

export type SignedUrlVariant = "original" | "thumb";

export type SignedUrlEntry = {
  url: string | null;
  missing: boolean;
};

export type SignUrlsResponse = {
  variant: SignedUrlVariant;
  expiresAt: string;
  urls: Record<string, SignedUrlEntry>;
};

export type FileAutomationSettings = {
  displayField: VehicleFolderDisplayField;
  repositories: Record<FileAutomationRepositoryKey, string>;
  configs: Array<{
    automationKey: FileAutomationRepositoryKey;
    repositoryFolderId: string;
    displayField: VehicleFolderDisplayField;
    enabled: boolean;
    updatedAt: string;
  }>;
  rules: FileAutomationRules;
  knownSaleStates: string[];
};
