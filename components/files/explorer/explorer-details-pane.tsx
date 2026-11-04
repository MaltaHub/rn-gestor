"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

import styles from "@/components/files/explorer/explorer.module.css";
import { formatExplorerDate } from "@/components/files/explorer/explorer-content";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { FileThumb, FolderThumb } from "@/components/files/explorer/explorer-thumb";
import { folderRoleLabel } from "@/components/files/explorer/folder-rules";
import {
  entryTypeLabel,
  folderLabel,
  getChildFolders,
  getFolderFiles,
  getFolderPathLabel,
  type ExplorerEntry,
  type ExplorerModel
} from "@/components/files/explorer/model";
import { useSignedUrl } from "@/components/files/explorer/signed-url-store";
import type { ExplorerFile, ExplorerFolder } from "@/lib/files/explorer-types";
import { formatBytes, getFilePreviewKind } from "@/lib/files/shared";

type DetailsPaneProps = {
  model: ExplorerModel;
  currentFolder: ExplorerFolder | null;
  selection: ExplorerEntry[];
  canManage: boolean;
  coverFileId: string | null;
  onClose: () => void;
  onOpen: (entry: ExplorerEntry) => void;
  onDownload: (entries: ExplorerEntry[]) => void;
  onRename: (entry: ExplorerEntry) => void;
  onMove: (entries: ExplorerEntry[]) => void;
  onDelete: (entries: ExplorerEntry[]) => void;
  onSetCover: (file: ExplorerFile | null) => void;
  onToggleAutomation: (folder: ExplorerFolder) => void;
  onSaveDescription: (folder: ExplorerFolder, description: string | null) => void;
  onNavigate: (folderId: string) => void;
};

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setText(null);
    fetch(url)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error("preview"))))
      .then((value) => active && setText(value.slice(0, 12_000)))
      .catch(() => active && setText("Não foi possível carregar o texto."));
    return () => {
      active = false;
    };
  }, [url]);
  return <pre className={styles.previewText}>{text ?? "Carregando…"}</pre>;
}

export function FilePreview({ file, variant }: { file: ExplorerFile; variant: "pane" | "viewer" }) {
  const kind = getFilePreviewKind(file.mimeType, file.name);
  const previewable = kind !== "none";
  const original = useSignedUrl(previewable ? file.id : null, "original", previewable);
  const thumb = useSignedUrl(kind === "image" ? file.id : null, "thumb", kind === "image");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => setLoaded(false), [file.id]);

  if (!previewable) {
    return (
      <div className={styles.previewEmpty}>
        <FileThumb file={file} size="lg" />
        <span>Sem pré-visualização para este tipo.</span>
      </div>
    );
  }
  if (original?.missing) {
    return <div className={styles.previewEmpty}>Arquivo ausente no armazenamento.</div>;
  }

  const url = original?.url ?? null;
  const box = variant === "viewer" ? styles.viewerMedia : styles.previewMedia;

  switch (kind) {
    case "image":
      return (
        <div className={box}>
          {thumb?.url && !loaded ? (
            <Image src={thumb.url} alt="" fill unoptimized className={styles.previewImg} sizes="100vw" />
          ) : null}
          {url ? (
            <Image
              src={url}
              alt={file.name}
              fill
              unoptimized
              className={styles.previewImg}
              sizes="100vw"
              onLoad={() => setLoaded(true)}
            />
          ) : null}
        </div>
      );
    case "pdf":
      return url ? <iframe className={box} title={file.name} src={url} /> : <div className={styles.previewEmpty}>Carregando…</div>;
    case "video":
      return url ? <video className={box} src={url} controls preload="metadata" /> : null;
    case "audio":
      return url ? <audio className={styles.previewAudio} src={url} controls preload="metadata" /> : null;
    case "text":
      return url ? <TextPreview url={url} /> : null;
    default:
      return null;
  }
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.prop}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function FolderProperties({ props, folder }: { props: DetailsPaneProps; folder: ExplorerFolder }) {
  const { model, canManage } = props;
  const childFolders = getChildFolders(model, folder.id);
  const files = getFolderFiles(model, folder.id);
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const role = folderRoleLabel(folder);
  const [description, setDescription] = useState(folder.description ?? "");
  useEffect(() => setDescription(folder.description ?? ""), [folder.description, folder.id]);

  // Atalho Fotos <-> Documentos do mesmo veículo.
  const sibling = folder.managedCarroId
    ? Array.from(model.foldersById.values()).find(
        (entry) => entry.managedCarroId === folder.managedCarroId && entry.id !== folder.id && entry.automationKey !== null
      )
    : undefined;

  return (
    <>
      <div className={styles.paneHero}>
        <FolderThumb folder={folder} size="lg" />
        <div>
          <strong className={styles.paneTitle}>{folderLabel(folder)}</strong>
          {role ? <span className={styles.paneRole}>{role}</span> : null}
        </div>
      </div>
      {folder.vehicle ? (
        <div className={styles.vehicleCard}>
          <Icon name="car" size={16} />
          <span>{folder.vehicle.label}</span>
        </div>
      ) : null}
      <dl className={styles.props}>
        <Prop label="Conteúdo">
          {childFolders.length} pasta(s), {files.length} arquivo(s)
        </Prop>
        {files.length > 0 ? <Prop label="Tamanho">{formatBytes(totalBytes)}</Prop> : null}
        <Prop label="Local">{getFolderPathLabel(model, folder.parentId) || "Arquivos"}</Prop>
        <Prop label="Modificada">{formatExplorerDate(folder.updatedAt)}</Prop>
        <Prop label="Criada">{formatExplorerDate(folder.createdAt)}</Prop>
      </dl>

      {sibling ? (
        <button type="button" className={styles.paneLink} onClick={() => props.onNavigate(sibling.id)}>
          <Icon name="open" size={14} />
          {sibling.automationKey === "vehicle_photos" ? "Abrir fotos deste veículo" : "Abrir documentos deste veículo"}
        </button>
      ) : null}

      {folder.automationKey === "vehicle_documents" ? (
        <div className={styles.paneSection}>
          <span className={styles.paneKicker}>Automação de documentos</span>
          <p className={styles.paneHint}>
            {folder.isAutomationPaused
              ? "Pausada: os campos da ficha de documentos ficam manuais."
              : "Ligada: os nomes dos arquivos alimentam a ficha de documentos."}
          </p>
          {canManage ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => props.onToggleAutomation(folder)}
              data-testid="files-folder-automation-toggle"
            >
              <Icon name={folder.isAutomationPaused ? "play" : "pause"} size={14} />
              {folder.isAutomationPaused ? "Reativar automação" : "Pausar automação"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.paneSection}>
        <span className={styles.paneKicker}>Descrição</span>
        {canManage ? (
          <textarea
            className={styles.textarea}
            value={description}
            rows={3}
            placeholder="Adicionar descrição…"
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => {
              const next = description.trim() || null;
              if (next !== (folder.description ?? null)) props.onSaveDescription(folder, next);
            }}
          />
        ) : (
          <p className={styles.paneHint}>{folder.description || "Sem descrição."}</p>
        )}
      </div>
    </>
  );
}

export function ExplorerDetailsPane(props: DetailsPaneProps) {
  const { selection, currentFolder, canManage, model } = props;
  const single = selection.length === 1 ? selection[0] : null;

  let body: ReactNode;
  if (selection.length > 1) {
    const files = selection.filter((entry) => entry.kind === "file");
    const bytes = files.reduce((sum, entry) => sum + (entry.kind === "file" ? entry.sizeBytes : 0), 0);
    body = (
      <>
        <div className={styles.paneHero}>
          <div className={styles.paneStack}>
            <Icon name="viewTiles" size={30} />
          </div>
          <div>
            <strong className={styles.paneTitle}>{selection.length} itens selecionados</strong>
            <span className={styles.paneRole}>
              {selection.length - files.length} pasta(s), {files.length} arquivo(s)
              {files.length > 0 ? ` · ${formatBytes(bytes)}` : ""}
            </span>
          </div>
        </div>
        <div className={styles.paneActions}>
          {files.length > 0 ? (
            <button type="button" className={styles.secondaryBtn} onClick={() => props.onDownload(selection)}>
              <Icon name="download" size={14} /> Baixar
            </button>
          ) : null}
          {canManage ? (
            <>
              <button type="button" className={styles.secondaryBtn} onClick={() => props.onMove(selection)}>
                <Icon name="move" size={14} /> Mover para…
              </button>
              <button type="button" className={`${styles.secondaryBtn} ${styles.dangerText}`} onClick={() => props.onDelete(selection)}>
                <Icon name="trash" size={14} /> Excluir
              </button>
            </>
          ) : null}
        </div>
      </>
    );
  } else if (single?.kind === "file") {
    const file = single.file;
    const folder = model.foldersById.get(file.folderId);
    const isPhotoFolder = folder?.automationKey === "vehicle_photos";
    const isCover = props.coverFileId === file.id;
    body = (
      <>
        <button type="button" className={styles.previewFrame} onClick={() => props.onOpen(single)} title="Abrir (Enter)">
          <FilePreview file={file} variant="pane" />
        </button>
        <strong className={styles.paneTitle} title={file.name}>
          {file.name}
        </strong>
        <div className={styles.paneActions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => props.onOpen(single)}>
            <Icon name="open" size={14} /> Abrir
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={() => props.onDownload([single])}>
            <Icon name="download" size={14} /> Baixar
          </button>
          {canManage && isPhotoFolder && file.mimeType.startsWith("image/") ? (
            <button
              type="button"
              className={`${styles.secondaryBtn} ${isCover ? styles.secondaryActive : ""}`}
              onClick={() => props.onSetCover(isCover ? null : file)}
              title={isCover ? "Esta é a capa do veículo — clique para remover" : "Usar como foto de capa"}
            >
              <Icon name="star" size={14} /> {isCover ? "Capa" : "Definir capa"}
            </button>
          ) : null}
        </div>
        <dl className={styles.props}>
          <Prop label="Tipo">{entryTypeLabel(single)}</Prop>
          <Prop label="Tamanho">{formatBytes(file.sizeBytes)}</Prop>
          <Prop label="Local">{getFolderPathLabel(model, file.folderId)}</Prop>
          <Prop label="Modificado">{formatExplorerDate(file.updatedAt)}</Prop>
          <Prop label="Enviado">{formatExplorerDate(file.createdAt)}</Prop>
        </dl>
        {canManage ? (
          <div className={styles.paneActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => props.onRename(single)}>
              <Icon name="rename" size={14} /> Renomear
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => props.onMove([single])}>
              <Icon name="move" size={14} /> Mover para…
            </button>
            <button type="button" className={`${styles.secondaryBtn} ${styles.dangerText}`} onClick={() => props.onDelete([single])}>
              <Icon name="trash" size={14} /> Excluir
            </button>
          </div>
        ) : null}
      </>
    );
  } else if (single?.kind === "folder") {
    body = <FolderProperties props={props} folder={single.folder} />;
  } else if (currentFolder) {
    body = <FolderProperties props={props} folder={currentFolder} />;
  } else {
    body = (
      <div className={styles.previewEmpty}>
        <Icon name="home" size={32} />
        <span>
          {model.foldersById.size} pastas · {model.filesById.size} arquivos
        </span>
      </div>
    );
  }

  return (
    <aside className={styles.detailsPane} aria-label="Detalhes" data-testid="explorer-details-pane">
      <div className={styles.paneHeader}>
        <span>Detalhes</span>
        <button type="button" className={styles.iconBtn} onClick={props.onClose} aria-label="Fechar detalhes">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className={styles.paneBody}>{body}</div>
    </aside>
  );
}
