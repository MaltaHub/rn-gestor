export type FileFolderSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentFolderId: string | null;
  fileCount: number;
  childFolderCount: number;
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
