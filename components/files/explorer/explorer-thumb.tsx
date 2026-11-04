"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import styles from "@/components/files/explorer/explorer.module.css";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { useSignedUrl } from "@/components/files/explorer/signed-url-store";
import { FileKindIcon, FolderIcon, getFolderIconKind } from "@/components/files/icons";
import type { ExplorerFile, ExplorerFolder } from "@/lib/files/explorer-types";
import { getFilePreviewKind } from "@/lib/files/shared";

// Um observer para a lista inteira (centenas de itens, um callback cada).
const visibilityCallbacks = new WeakMap<Element, () => void>();
let sharedObserver: IntersectionObserver | null = null;

function observeOnce(element: Element, onVisible: () => void) {
  if (typeof IntersectionObserver === "undefined") {
    onVisible();
    return () => undefined;
  }
  sharedObserver ??= new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        visibilityCallbacks.get(record.target)?.();
        visibilityCallbacks.delete(record.target);
        sharedObserver?.unobserve(record.target);
      }
    },
    { rootMargin: "300px 0px" }
  );
  visibilityCallbacks.set(element, onVisible);
  sharedObserver.observe(element);
  return () => {
    visibilityCallbacks.delete(element);
    sharedObserver?.unobserve(element);
  };
}

export type ThumbSize = "sm" | "md" | "lg";

const ICON_SIZE: Record<ThumbSize, number> = { sm: 18, md: 40, lg: 56 };

export function FileThumb({ file, size, isCover = false }: { file: ExplorerFile; size: ThumbSize; isCover?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const kind = getFilePreviewKind(file.mimeType, file.name);
  const wantsImage = kind === "image" && size !== "sm";

  useEffect(() => {
    if (!wantsImage || !ref.current) return;
    return observeOnce(ref.current, () => setVisible(true));
  }, [wantsImage]);

  const signed = useSignedUrl(wantsImage ? file.id : null, "thumb", visible);
  const url = wantsImage && !failed ? signed?.url ?? null : null;
  const missing = Boolean(signed?.missing);

  return (
    <div ref={ref} className={`${styles.thumb} ${styles[`thumb_${size}`]}`} data-kind={kind}>
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          unoptimized
          draggable={false}
          sizes={size === "lg" ? "220px" : "120px"}
          className={styles.thumbImg}
          onError={() => setFailed(true)}
        />
      ) : (
        <FileKindIcon kind={kind} missing={missing} size={ICON_SIZE[size]} className={styles.thumbIcon} />
      )}
      {isCover ? (
        <span className={styles.coverBadge} title="Foto de capa">
          <Icon name="star" size={size === "sm" ? 10 : 12} />
        </span>
      ) : null}
    </div>
  );
}

export function FolderThumb({ folder, size }: { folder: ExplorerFolder; size: ThumbSize }) {
  return (
    <div className={`${styles.thumb} ${styles[`thumb_${size}`]} ${styles.thumbFolder}`}>
      <FolderIcon kind={getFolderIconKind(folder)} size={ICON_SIZE[size]} className={styles.folderGlyph} />
    </div>
  );
}
