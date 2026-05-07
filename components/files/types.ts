export type FileFolderSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentFolderId: string | null;
  fileCount: number;
  childFolderCount: number;
  physicalName: string;
  displayName: string;
  automationKey: "vehicle_photos" | "vehicle_documents" | null;
  automationRepositoryKey:
    | "vehicle_photos_active"
    | "vehicle_photos_sold"
    | "vehicle_documents_active"
    | "vehicle_documents_archive"
    | null;
  managedCarroId: string | null;
  isAutomationRepository: boolean;
  isManagedFolder: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FileItem = {
  id: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  previewUrl: string | null;
  downloadUrl: string | null;
  isMissing: boolean;
};

export type FileFolderDetail = {
  folder: FileFolderSummary;
  breadcrumb: FileFolderSummary[];
  childFolders: FileFolderSummary[];
  files: FileItem[];
};

export type FileAutomationRepositoryKey =
  | "vehicle_photos_active"
  | "vehicle_photos_sold"
  | "vehicle_documents_active"
  | "vehicle_documents_archive";

export type VehicleFolderDisplayField = "placa" | "nome" | "chassi" | "modelo" | "id";

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
};
