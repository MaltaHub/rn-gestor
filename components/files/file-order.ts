import type { FileItem } from "@/components/files/types";

export function reorderFiles(
  files: FileItem[],
  draggedId: string,
  targetId: string,
) {
  const sourceIndex = files.findIndex((file) => file.id === draggedId);
  const targetIndex = files.findIndex((file) => file.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return files;
  }

  const next = [...files];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);

  return next.map((file, index) => ({
    ...file,
    sortOrder: index,
  }));
}
