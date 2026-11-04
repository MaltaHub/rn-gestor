"use client";

import { useMemo, useRef, useState } from "react";

import styles from "@/components/files/explorer/explorer.module.css";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { Dialog } from "@/components/files/explorer/explorer-overlays";
import { getFolderPathLabel, normalizeSearchText, type ExplorerModel } from "@/components/files/explorer/model";
import { FileKindIcon } from "@/components/files/icons";
import type { ExplorerFile } from "@/lib/files/explorer-types";
import { getFilePreviewKind } from "@/lib/files/shared";

const READABLE = /^(image\/(jpeg|png|webp|gif|bmp)|application\/pdf)$/i;

/** Escolhe um documento do explorer (busca no índice em memória) ou do computador. */
export function OcrFilePicker({
  model,
  title,
  onPickExplorer,
  onPickLocal,
  onClose
}: {
  model: ExplorerModel;
  title: string;
  onPickExplorer: (file: ExplorerFile) => void;
  onPickLocal: (file: File) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const options = useMemo(() => {
    const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
    const rows: Array<{ file: ExplorerFile; path: string }> = [];
    for (const file of model.filesById.values()) {
      if (!READABLE.test(file.mimeType)) continue;
      const path = getFolderPathLabel(model, file.folderId);
      const haystack = normalizeSearchText(`${path} ${file.name}`);
      if (tokens.every((token) => haystack.includes(token))) rows.push({ file, path });
      if (rows.length >= 150) break;
    }
    // Documentos (PDF) primeiro: são o alvo usual do OCR.
    return rows.sort((left, right) => Number(right.file.mimeType === "application/pdf") - Number(left.file.mimeType === "application/pdf"));
  }, [model, query]);

  return (
    <Dialog
      title={title}
      onClose={onClose}
      wide
      testId="ocr-file-picker"
      footer={
        <>
          <button type="button" className={styles.secondaryBtn} onClick={() => inputRef.current?.click()}>
            <Icon name="upload" size={14} /> Do computador…
          </button>
          <span className={styles.flexSpacer} />
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>
            Cancelar
          </button>
        </>
      }
    >
      <label className={styles.search}>
        <Icon name="search" size={15} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por placa, pasta ou nome do arquivo" />
      </label>
      <div className={styles.pickList} role="listbox">
        {options.map(({ file, path }) => (
          <button
            key={file.id}
            type="button"
            role="option"
            aria-selected={false}
            className={styles.pickItem}
            onClick={() => {
              onClose();
              onPickExplorer(file);
            }}
          >
            <FileKindIcon kind={getFilePreviewKind(file.mimeType, file.name)} size={15} />
            <span className={styles.pickPath}>
              <strong>{file.name}</strong> <small>· {path}</small>
            </span>
          </button>
        ))}
        {options.length === 0 ? <p className={styles.paneHint}>Nenhum PDF ou imagem encontrado.</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          onClose();
          onPickLocal(file);
        }}
      />
    </Dialog>
  );
}
