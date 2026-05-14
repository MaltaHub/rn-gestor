import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export type MobileFilesSection = "browser" | "preview" | "manage";
export type DesktopSidebar = "left" | "right" | null;

type UseFileManagerNavigationStateParams = {
  activeFolderId: string | null;
  activeFolderTreePathIds: string[];
  setActiveFolderId: Dispatch<SetStateAction<string | null>>;
  setSelectedFolderId: Dispatch<SetStateAction<string | null>>;
};

export function useFileManagerNavigationState({
  activeFolderId,
  activeFolderTreePathIds,
  setActiveFolderId,
  setSelectedFolderId,
}: UseFileManagerNavigationStateParams) {
  const [mobileSection, setMobileSection] =
    useState<MobileFilesSection>("browser");
  const [desktopSidebar, setDesktopSidebar] = useState<DesktopSidebar>("left");
  const [mobileExplorerCollapsed, setMobileExplorerCollapsed] = useState(true);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleDesktopSidebar = useCallback((side: "left" | "right") => {
    setDesktopSidebar((current) => (current === side ? null : side));
  }, []);

  useEffect(() => {
    if (activeFolderTreePathIds.length === 0) return;

    setExpandedFolderIds((current) => {
      let changed = false;
      const next = new Set(current);

      for (const folderId of activeFolderTreePathIds) {
        if (next.has(folderId)) continue;
        next.add(folderId);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [activeFolderTreePathIds]);

  useEffect(() => {
    setMobileSection("browser");
  }, [activeFolderId]);

  const navigateToFolder = useCallback(
    (folderId: string) => {
      setActiveFolderId(folderId);
      setSelectedFolderId(null);
      setMobileSection("browser");
      setMobileExplorerCollapsed(true);
    },
    [setActiveFolderId, setSelectedFolderId],
  );

  const toggleFolderExpanded = useCallback((folderId: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);

      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  }, []);

  return {
    desktopSidebar,
    expandedFolderIds,
    mobileExplorerCollapsed,
    mobileSection,
    navigateToFolder,
    setDesktopSidebar,
    setMobileExplorerCollapsed,
    setMobileSection,
    toggleDesktopSidebar,
    toggleFolderExpanded,
  };
}
