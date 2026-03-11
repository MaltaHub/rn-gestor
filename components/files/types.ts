export type FileFolderSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FileImageItem = {
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
  images: FileImageItem[];
};
