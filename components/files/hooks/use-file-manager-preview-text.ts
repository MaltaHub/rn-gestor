import { useEffect, useState } from "react";

import type { FileItem } from "@/components/files/types";
import type { FilePreviewKind } from "@/lib/files/shared";

type UseFileManagerPreviewTextParams = {
  selectedFile: Pick<FileItem, "previewUrl"> | null;
  selectedPreviewKind: FilePreviewKind;
};

export function useFileManagerPreviewText({
  selectedFile,
  selectedPreviewKind,
}: UseFileManagerPreviewTextParams) {
  const [previewText, setPreviewText] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (
      !selectedFile ||
      selectedPreviewKind !== "text" ||
      !selectedFile.previewUrl
    ) {
      setPreviewText("");
      setPreviewLoading(false);
      return;
    }

    let active = true;

    setPreviewLoading(true);

    fetch(selectedFile.previewUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Falha ao carregar preview de texto.");
        }

        return response.text();
      })
      .then((text) => {
        if (!active) return;

        setPreviewText(text.slice(0, 12000));
      })
      .catch(() => {
        if (!active) return;

        setPreviewText("Nao foi possivel gerar preview textual deste arquivo.");
      })
      .finally(() => {
        if (!active) return;

        setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedFile, selectedPreviewKind]);

  return {
    previewLoading,
    previewText,
  };
}
