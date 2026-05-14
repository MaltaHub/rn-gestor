import type { FileFolderSummary } from "@/components/files/types";
import {
  getFilePreviewKind,
  type FilePreviewKind,
} from "@/lib/files/shared";

export type FolderIconKind = "generic" | "photos" | "documents";

export function getFolderIconKind(
  folder: Pick<FileFolderSummary, "automationKey" | "automationRepositoryKey">,
): FolderIconKind {
  if (
    folder.automationKey === "vehicle_photos" ||
    folder.automationRepositoryKey === "vehicle_photos_active" ||
    folder.automationRepositoryKey === "vehicle_photos_sold"
  ) {
    return "photos";
  }
  if (
    folder.automationKey === "vehicle_documents" ||
    folder.automationRepositoryKey === "vehicle_documents_active" ||
    folder.automationRepositoryKey === "vehicle_documents_archive"
  ) {
    return "documents";
  }
  return "generic";
}

type IconProps = {
  size?: number;
  className?: string;
};

const ICON_DEFAULTS = { size: 16 };

export function FolderIcon({
  kind = "generic",
  size = ICON_DEFAULTS.size,
  className,
}: IconProps & { kind?: FolderIconKind }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
    "data-folder-icon": kind,
  };

  if (kind === "photos") {
    return (
      <svg {...props}>
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.5 2h9A1.5 1.5 0 0 1 20.5 9.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" />
        <circle cx="12" cy="14" r="2.6" />
      </svg>
    );
  }

  if (kind === "documents") {
    return (
      <svg {...props}>
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.5 2h9A1.5 1.5 0 0 1 20.5 9.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="16" x2="14" y2="16" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l1.5 2h9A1.5 1.5 0 0 1 20.5 9.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z" />
    </svg>
  );
}

export function FileKindIcon({
  kind,
  size = ICON_DEFAULTS.size,
  className,
  missing,
}: IconProps & { kind: FilePreviewKind; missing?: boolean }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
    "data-file-icon": missing ? "missing" : kind,
  };

  if (missing) {
    return (
      <svg {...props}>
        <path d="M6 3h7l5 5v13H6z" />
        <path d="M13 3v5h5" />
        <line x1="9" y1="13" x2="15" y2="19" />
        <line x1="15" y1="13" x2="9" y2="19" />
      </svg>
    );
  }

  if (kind === "image") {
    return (
      <svg {...props}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4 18 5-5 4 4 3-3 4 4" />
      </svg>
    );
  }

  if (kind === "pdf") {
    return (
      <svg {...props}>
        <path d="M6 3h7l5 5v13H6z" />
        <path d="M13 3v5h5" />
        <text
          x="12"
          y="17"
          fontSize="5"
          fontFamily="system-ui, sans-serif"
          fontWeight="700"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
        >
          PDF
        </text>
      </svg>
    );
  }

  if (kind === "video") {
    return (
      <svg {...props}>
        <rect x="3" y="5" width="14" height="14" rx="2" />
        <path d="M17 10.5 21 8v8l-4-2.5z" />
      </svg>
    );
  }

  if (kind === "audio") {
    return (
      <svg {...props}>
        <path d="M9 18V6l10-2v12" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="16" r="2" />
      </svg>
    );
  }

  if (kind === "text") {
    return (
      <svg {...props}>
        <path d="M6 3h7l5 5v13H6z" />
        <path d="M13 3v5h5" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="16" x2="15" y2="16" />
        <line x1="9" y1="19" x2="13" y2="19" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <path d="M6 3h7l5 5v13H6z" />
      <path d="M13 3v5h5" />
    </svg>
  );
}

export function getFileKindLabel(kind: FilePreviewKind, missing?: boolean) {
  if (missing) return "Indisponivel";
  switch (kind) {
    case "image":
      return "Imagem";
    case "pdf":
      return "PDF";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "text":
      return "Texto";
    default:
      return "Arquivo";
  }
}

export { getFilePreviewKind };
