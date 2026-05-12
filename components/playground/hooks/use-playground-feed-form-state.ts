import { useState } from "react";
import { DEFAULT_PLAYGROUND_FEED_QUERY } from "@/components/playground/domain/feed-query";
import type { SheetKey } from "@/components/ui-grid/types";

export function usePlaygroundFeedFormState() {
  const [feedDialogOpen, setFeedDialogOpen] = useState(false);
  const [feedHubSelectedId, setFeedHubSelectedId] = useState<string | null>(null);
  const [feedHubFragmentId, setFeedHubFragmentId] = useState<string | null>(null);
  const [feedTitle, setFeedTitle] = useState("");
  const [feedTable, setFeedTable] = useState<SheetKey | "">("");
  const [feedColumns, setFeedColumns] = useState<string[]>([]);
  const [feedColumnLabels, setFeedColumnLabels] = useState<Record<string, string>>({});
  const [feedPageSize, setFeedPageSize] = useState(String(DEFAULT_PLAYGROUND_FEED_QUERY.pageSize));
  const [feedShowPaginationInHeader, setFeedShowPaginationInHeader] = useState(false);
  const [feedAnchorFilterColumns, setFeedAnchorFilterColumns] = useState<string[]>([]);
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);

  return {
    feedDialogOpen,
    setFeedDialogOpen,
    feedHubSelectedId,
    setFeedHubSelectedId,
    feedHubFragmentId,
    setFeedHubFragmentId,
    feedTitle,
    setFeedTitle,
    feedTable,
    setFeedTable,
    feedColumns,
    setFeedColumns,
    feedColumnLabels,
    setFeedColumnLabels,
    feedPageSize,
    setFeedPageSize,
    feedShowPaginationInHeader,
    setFeedShowPaginationInHeader,
    feedAnchorFilterColumns,
    setFeedAnchorFilterColumns,
    editingFeedId,
    setEditingFeedId
  };
}
