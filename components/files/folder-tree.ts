import type { FileFolderSummary } from "@/components/files/types";

export type FolderTreeNode = FileFolderSummary & {
  children: FolderTreeNode[];
};

export function buildFolderTree(folders: FileFolderSummary[]) {
  const nodeById = new Map<string, FolderTreeNode>();

  for (const folder of folders) {
    nodeById.set(folder.id, { ...folder, children: [] });
  }

  const roots: FolderTreeNode[] = [];

  for (const folder of folders) {
    const node = nodeById.get(folder.id);
    if (!node) continue;

    if (folder.parentFolderId && nodeById.has(folder.parentFolderId)) {
      nodeById.get(folder.parentFolderId)?.children.push(node);
      continue;
    }

    roots.push(node);
  }

  function sortNodes(nodes: FolderTreeNode[]) {
    nodes.sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    for (const node of nodes) sortNodes(node.children);
  }

  sortNodes(roots);
  return roots;
}

export function flattenFolderOptions(
  nodes: FolderTreeNode[],
  level = 0,
): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      label: `${"  ".repeat(level)}${node.name}`,
    },
    ...flattenFolderOptions(node.children, level + 1),
  ]);
}

export function findFolderTreePath(
  nodes: FolderTreeNode[],
  folderId: string,
): FolderTreeNode[] {
  for (const node of nodes) {
    if (node.id === folderId) return [node];

    const childPath = findFolderTreePath(node.children, folderId);
    if (childPath.length > 0) {
      return [node, ...childPath];
    }
  }

  return [];
}

export function collectFolderTreePathIds(
  nodes: FolderTreeNode[],
  folderId: string | null | undefined,
) {
  if (!folderId) return [];
  return findFolderTreePath(nodes, folderId).map((node) => node.id);
}
