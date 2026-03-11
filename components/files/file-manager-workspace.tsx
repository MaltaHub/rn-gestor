"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  createFileFolder,
  deleteFileFolder,
  deleteFileImage,
  fetchFileFolderDetail,
  fetchFileFolders,
  reorderFileImages,
  updateFileFolder,
  uploadFileImages
} from "@/components/files/api";
import type { FileFolderDetail, FileFolderSummary, FileImageItem } from "@/components/files/types";
import type { CurrentActor, Role } from "@/components/ui-grid/types";
import { formatBytes } from "@/lib/files/shared";

type FileManagerWorkspaceProps = {
  actor: CurrentActor;
  accessToken: string | null;
  devRole?: Role | null;
  onSignOut: () => void | Promise<void>;
};

type PendingUploadItem = {
  id: string;
  folderId: string;
  fileName: string;
  sizeBytes: number;
  previewUrl: string;
  createdAt: string;
  status: "queued" | "uploading";
};

type PendingUploadBatch = {
  id: string;
  folderId: string;
  files: File[];
  pendingIds: string[];
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function reorderImages(images: FileImageItem[], draggedId: string, targetId: string) {
  const sourceIndex = images.findIndex((image) => image.id === draggedId);
  const targetIndex = images.findIndex((image) => image.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return images;
  }

  const next = [...images];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next.map((image, index) => ({
    ...image,
    sortOrder: index
  }));
}

async function downloadBlobFromUrl(url: string, filename: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Falha ao baixar imagem.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function FileManagerWorkspace({ actor, accessToken, devRole, onSignOut }: FileManagerWorkspaceProps) {
  const canManage = actor.role === "ADMINISTRADOR";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeFolderIdRef = useRef<string | null>(null);
  const uploadQueueRef = useRef<PendingUploadBatch[]>([]);
  const pendingUploadsRef = useRef<PendingUploadItem[]>([]);
  const uploadProcessingRef = useRef(false);

  const [folders, setFolders] = useState<FileFolderSummary[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<FileFolderDetail | null>(null);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [folderLoading, setFolderLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloadAllPending, setDownloadAllPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);
  const [uploadDropActive, setUploadDropActive] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUploadItem[]>([]);
  const [queuedUploadsCount, setQueuedUploadsCount] = useState(0);

  const missingImagesCount = activeFolder?.images.filter((image) => image.isMissing).length ?? 0;
  const activePendingUploads = pendingUploads.filter((item) => item.folderId === activeFolderId);
  const uploadBusy = pendingUploads.length > 0 || queuedUploadsCount > 0;

  useEffect(() => {
    activeFolderIdRef.current = activeFolderId;
  }, [activeFolderId]);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      for (const item of pendingUploadsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeFolder) {
      setEditName("");
      setEditDescription("");
      return;
    }

    setEditName(activeFolder.folder.name);
    setEditDescription(activeFolder.folder.description ?? "");
  }, [activeFolder]);

  const loadFolders = useCallback(async (preferredFolderId?: string | null) => {
    setFoldersLoading(true);
    setError(null);

    try {
      const response = await fetchFileFolders({ accessToken, devRole });
      const nextFolders = response.folders;

      setFolders(nextFolders);
      setActiveFolderId((current) => {
        const preferred = preferredFolderId ?? current;
        if (preferred && nextFolders.some((folder) => folder.id === preferred)) {
          return preferred;
        }

        return nextFolders[0]?.id ?? null;
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao carregar pastas.");
    } finally {
      setFoldersLoading(false);
    }
  }, [accessToken, devRole]);

  const loadActiveFolder = useCallback(async (folderId: string) => {
    setFolderLoading(true);
    setError(null);

    try {
      const detail = await fetchFileFolderDetail(folderId, { accessToken, devRole });
      setActiveFolder(detail);
    } catch (nextError) {
      setActiveFolder(null);
      setError(nextError instanceof Error ? nextError.message : "Falha ao carregar a pasta selecionada.");
    } finally {
      setFolderLoading(false);
    }
  }, [accessToken, devRole]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (!activeFolderId) {
      setActiveFolder(null);
      return;
    }

    void loadActiveFolder(activeFolderId);
  }, [activeFolderId, loadActiveFolder]);

  const removePendingUploads = useCallback((pendingIds: string[]) => {
    const pendingIdSet = new Set(pendingIds);

    setPendingUploads((current) => {
      const next: PendingUploadItem[] = [];

      for (const item of current) {
        if (pendingIdSet.has(item.id)) {
          URL.revokeObjectURL(item.previewUrl);
          continue;
        }

        next.push(item);
      }

      return next;
    });
  }, []);

  const updatePendingUploadStatus = useCallback((pendingIds: string[], status: PendingUploadItem["status"]) => {
    const pendingIdSet = new Set(pendingIds);
    setPendingUploads((current) =>
      current.map((item) => (pendingIdSet.has(item.id) ? { ...item, status } : item))
    );
  }, []);

  const processUploadQueue = useCallback(async () => {
    if (uploadProcessingRef.current) return;

    uploadProcessingRef.current = true;

    while (uploadQueueRef.current.length > 0) {
      const batch = uploadQueueRef.current[0];
      if (!batch) break;

      setQueuedUploadsCount(uploadQueueRef.current.length);
      updatePendingUploadStatus(batch.pendingIds, "uploading");
      setError(null);

      try {
        await uploadFileImages(batch.folderId, batch.files, { accessToken, devRole });
        await loadFolders(batch.folderId);

        if (activeFolderIdRef.current === batch.folderId) {
          await loadActiveFolder(batch.folderId);
        }

        setInfo(`${batch.files.length} imagem(ns) enviada(s) com sucesso.`);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Falha ao enviar imagens.");
      } finally {
        uploadQueueRef.current.shift();
        setQueuedUploadsCount(uploadQueueRef.current.length);
        removePendingUploads(batch.pendingIds);
      }
    }

    uploadProcessingRef.current = false;
  }, [accessToken, devRole, loadActiveFolder, loadFolders, removePendingUploads, updatePendingUploadStatus]);

  async function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || submitting) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const response = await createFileFolder(
        {
          name: createName,
          description: createDescription || null
        },
        { accessToken, devRole }
      );

      setCreateName("");
      setCreateDescription("");
      setInfo("Pasta criada com sucesso.");
      await loadFolders(response.folder.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao criar pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !activeFolder || submitting) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const detail = await updateFileFolder(
        activeFolder.folder.id,
        {
          name: editName,
          description: editDescription || null
        },
        { accessToken, devRole }
      );

      setActiveFolder(detail);
      setInfo("Pasta atualizada.");
      await loadFolders(detail.folder.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao atualizar pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteFolder() {
    if (!canManage || !activeFolder || submitting || uploadBusy) return;

    const confirmed = window.confirm(
      `Excluir a pasta "${activeFolder.folder.name}" e todas as ${activeFolder.images.length} imagem(ns)?`
    );

    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const deletedFolderId = activeFolder.folder.id;
      await deleteFileFolder(deletedFolderId, { accessToken, devRole });
      setActiveFolder(null);
      setActiveFolderId(null);
      setInfo("Pasta removida.");
      await loadFolders(deletedFolderId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao excluir pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(filesLike: FileList | File[], folderId: string) {
    if (!canManage) return;

    const files = Array.from(filesLike).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      setError("Selecione apenas arquivos de imagem.");
      return;
    }

    setError(null);
    setInfo(null);
    setUploadDropActive(false);
    setFolderDropTargetId(null);
    setActiveFolderId(folderId);

    const createdAt = new Date().toISOString();
    const pendingItems: PendingUploadItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      folderId,
      fileName: file.name,
      sizeBytes: file.size,
      previewUrl: URL.createObjectURL(file),
      createdAt,
      status: "queued"
    }));

    setPendingUploads((current) => [...pendingItems, ...current]);
    uploadQueueRef.current.push({
      id: crypto.randomUUID(),
      folderId,
      files,
      pendingIds: pendingItems.map((item) => item.id)
    });
    setQueuedUploadsCount(uploadQueueRef.current.length);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    void processUploadQueue();
  }

  async function handleDeleteImage(imageId: string) {
    if (!canManage || !activeFolder || submitting) return;

    const image = activeFolder.images.find((entry) => entry.id === imageId);
    if (!image) return;

    const confirmed = window.confirm(`Excluir a imagem "${image.fileName}"?`);
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      await deleteFileImage(imageId, { accessToken, devRole });
      await loadActiveFolder(activeFolder.folder.id);
      await loadFolders(activeFolder.folder.id);
      setInfo("Imagem removida.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao excluir imagem.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadImage(image: FileImageItem) {
    setError(null);

    if (!image.downloadUrl) {
      setError("Esta imagem esta com o arquivo ausente no bucket. Remova o registro quebrado ou reenviе o arquivo.");
      return;
    }

    try {
      await downloadBlobFromUrl(image.downloadUrl, image.fileName);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao baixar imagem.");
    }
  }

  async function handleDownloadAll() {
    if (!activeFolder || activeFolder.images.length === 0 || downloadAllPending) return;

    setDownloadAllPending(true);
    setError(null);
    setInfo(null);

    try {
      for (const image of activeFolder.images) {
        if (!image.downloadUrl) continue;
        await downloadBlobFromUrl(image.downloadUrl, image.fileName);
        await new Promise((resolve) => window.setTimeout(resolve, 140));
      }

      setInfo(
        missingImagesCount > 0
          ? "Downloads iniciados. Algumas imagens foram ignoradas porque o arquivo nao existe mais no bucket."
          : "Downloads iniciados. Alguns dispositivos podem bloquear parte dos arquivos."
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao baixar a pasta.");
    } finally {
      setDownloadAllPending(false);
    }
  }

  async function handleDropReorder(targetImageId: string) {
    if (!canManage || !activeFolder || !draggedImageId || draggedImageId === targetImageId) {
      return;
    }

    const nextImages = reorderImages(activeFolder.images, draggedImageId, targetImageId);
    setDraggedImageId(null);
    setActiveFolder({
      ...activeFolder,
      images: nextImages
    });

    try {
      const detail = await reorderFileImages(
        activeFolder.folder.id,
        nextImages.map((image) => image.id),
        { accessToken, devRole }
      );

      setActiveFolder(detail);
      setInfo("Ordem das imagens atualizada.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Falha ao reordenar imagens.");
      await loadActiveFolder(activeFolder.folder.id);
    }
  }

  function handleUploadInputChange(event: ChangeEvent<HTMLInputElement>) {
    const folderId = activeFolder?.folder.id;
    const files = event.target.files;

    if (!folderId || !files?.length) return;
    void handleUpload(files, folderId);
  }

  function handleFolderFileDrop(folderId: string, event: DragEvent<HTMLButtonElement>) {
    if (!canManage) return;

    event.preventDefault();
    setFolderDropTargetId(null);

    if (event.dataTransfer.files.length > 0) {
      setActiveFolderId(folderId);
      void handleUpload(event.dataTransfer.files, folderId);
    }
  }

  function handleUploadZoneDrop(event: DragEvent<HTMLDivElement>) {
    if (!canManage || !activeFolder) return;

    event.preventDefault();
    setUploadDropActive(false);

    if (event.dataTransfer.files.length > 0) {
      void handleUpload(event.dataTransfer.files, activeFolder.folder.id);
    }
  }

  return (
    <main className="files-shell">
      <div className="files-layout">
        <aside className="files-sidebar">
          <div className="files-sidebar-head">
            <span className="sheet-badge">Bucket Supabase</span>
            <h1>Gerenciador de Arquivos</h1>
            <p>Biblioteca central de imagens com leitura para todos os perfis e administracao exclusiva do administrador.</p>
          </div>

          <div className="files-nav-row">
            <Link href="/" className="files-nav-link">
              Operacional
            </Link>
            <Link href="/arquivos" className="files-nav-link is-active">
              Arquivos
            </Link>
          </div>

          <section className="files-user-card">
            <strong>{actor.userName}</strong>
            <span>{actor.role}</span>
            <small>{actor.userEmail ?? "Sem email vinculado"}</small>
          </section>

          {canManage ? (
            <form className="files-side-form" onSubmit={handleCreateFolder}>
              <strong>Nova pasta</strong>
              <input
                className="input"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Nome da pasta"
              />
              <textarea
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="Descricao opcional"
                rows={3}
              />
              <button type="submit" className="btn" disabled={submitting}>
                {submitting ? "Salvando..." : "Criar pasta"}
              </button>
            </form>
          ) : (
            <section className="files-side-note">
              <strong>Leitura liberada</strong>
              <p>Download individual e total disponiveis. CRUD, upload e reordenacao ficam restritos ao administrador.</p>
            </section>
          )}

          <section className="files-folders-panel">
            <div className="files-panel-head">
              <strong>Pastas</strong>
              <button type="button" className="files-ghost-btn" onClick={() => void loadFolders(activeFolderId)} disabled={foldersLoading}>
                Atualizar
              </button>
            </div>

            <div className="files-folder-list">
              {foldersLoading ? <p className="files-inline-note">Carregando pastas...</p> : null}
              {!foldersLoading && folders.length === 0 ? (
                <p className="files-inline-note">Nenhuma pasta cadastrada ainda.</p>
              ) : null}
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={`files-folder-card ${folder.id === activeFolderId ? "is-active" : ""} ${
                    folderDropTargetId === folder.id ? "is-upload-target" : ""
                  }`}
                  onClick={() => setActiveFolderId(folder.id)}
                  onDragOver={(event) => {
                    if (!canManage || !Array.from(event.dataTransfer.types).includes("Files")) return;
                    event.preventDefault();
                    setFolderDropTargetId(folder.id);
                  }}
                  onDragLeave={() => {
                    if (folderDropTargetId === folder.id) {
                      setFolderDropTargetId(null);
                    }
                  }}
                  onDrop={(event) => handleFolderFileDrop(folder.id, event)}
                >
                  <span className="files-folder-card-head">
                    <strong>{folder.name}</strong>
                    <span>{folder.imageCount} img</span>
                  </span>
                  <small>{folder.description || "Sem descricao"}</small>
                  <small>Atualizada em {formatDateTime(folder.updatedAt)}</small>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="files-main">
          <header className="files-topbar">
            <div>
              <span className="sheet-badge">Arquivos</span>
              <h2>{activeFolder?.folder.name ?? "Selecione uma pasta"}</h2>
              <p>As imagens ficam no bucket privado e saem por URLs assinadas de curta duracao.</p>
            </div>

            <div className="files-topbar-actions">
              <button
                type="button"
                className="files-ghost-btn"
                onClick={() => void (activeFolderId ? loadActiveFolder(activeFolderId) : loadFolders(activeFolderId))}
                disabled={folderLoading || foldersLoading}
              >
                {folderLoading ? "Atualizando..." : "Recarregar"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void handleDownloadAll()}
                disabled={!activeFolder || activeFolder.images.length === 0 || downloadAllPending}
              >
                {downloadAllPending ? "Baixando..." : "Baixar pasta"}
              </button>
              <button type="button" className="btn sheet-signout-btn" onClick={() => void onSignOut()}>
                Sair
              </button>
            </div>
          </header>

          {error ? <p className="files-feedback is-error">Erro: {error}</p> : null}
          {info ? <p className="files-feedback is-info">{info}</p> : null}
          {missingImagesCount > 0 ? (
            <p className="files-feedback is-warning">
              {missingImagesCount} imagem(ns) desta pasta estao com o arquivo ausente no bucket. O registro continua visivel
              para nao quebrar a tela; exclua o item quebrado ou reenvie a imagem.
            </p>
          ) : null}

          {!activeFolder && !folderLoading ? (
            <section className="files-empty-state">
              <strong>Nenhuma pasta selecionada.</strong>
              <p>Escolha uma pasta na lateral para visualizar as imagens e iniciar os downloads.</p>
            </section>
          ) : null}

          {activeFolder ? (
            <>
              <section className="files-folder-detail-card">
                <div className="files-folder-detail-head">
                  <div>
                    <h3>{activeFolder.folder.name}</h3>
                    <p>{activeFolder.folder.description || "Sem descricao cadastrada."}</p>
                  </div>
                  <div className="files-folder-metrics">
                    <span>
                      {activeFolder.images.length} imagem(ns)
                      {activePendingUploads.length > 0 ? ` + ${activePendingUploads.length} em processamento` : ""}
                    </span>
                    <span>Criada em {formatDateTime(activeFolder.folder.createdAt)}</span>
                    <span>Atualizada em {formatDateTime(activeFolder.folder.updatedAt)}</span>
                  </div>
                </div>

                {canManage ? (
                  <form className="files-folder-edit-form" onSubmit={handleUpdateFolder}>
                    <input
                      className="input"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      placeholder="Nome da pasta"
                    />
                    <textarea
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      placeholder="Descricao da pasta"
                      rows={3}
                    />
                    <div className="files-inline-actions">
                      <button type="submit" className="btn" disabled={submitting}>
                        Salvar pasta
                      </button>
                      <button
                        type="button"
                        className="files-danger-btn"
                        onClick={() => void handleDeleteFolder()}
                        disabled={submitting || uploadBusy}
                      >
                        Excluir pasta
                      </button>
                    </div>
                  </form>
                ) : null}
              </section>

              {canManage ? (
                <section
                  className={`files-upload-zone ${uploadDropActive ? "is-active" : ""}`}
                  onDragOver={(event) => {
                    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
                    event.preventDefault();
                    setUploadDropActive(true);
                  }}
                  onDragLeave={() => setUploadDropActive(false)}
                  onDrop={handleUploadZoneDrop}
                >
                  <div>
                    <strong>Upload por drag and drop ou em massa</strong>
                    <p>Solte as imagens aqui ou selecione varios arquivos para enviar diretamente para a pasta ativa.</p>
                  </div>
                  <div className="files-inline-actions">
                    <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
                      Selecionar imagens
                    </button>
                    <small>
                      {uploadBusy
                        ? `${pendingUploads.length} arquivo(s) aguardando ou enviando.`
                        : "Somente imagens. Ordem manual via arrastar e soltar nas miniaturas."}
                    </small>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleUploadInputChange} />
                </section>
              ) : null}

              <section className="files-gallery-panel">
                <div className="files-panel-head">
                  <strong>Imagens da pasta</strong>
                  <span className="files-inline-note">
                    {canManage ? "Arraste os cards para reordenar as imagens." : "Downloads individuais liberados para todos os perfis."}
                  </span>
                </div>

                {folderLoading ? <p className="files-inline-note">Carregando imagens...</p> : null}
                {!folderLoading && activeFolder.images.length === 0 && activePendingUploads.length === 0 ? (
                  <p className="files-inline-note">Esta pasta ainda nao possui imagens.</p>
                ) : null}

                <div className="files-gallery-grid">
                  {activePendingUploads.map((image) => (
                    <article key={image.id} className="files-image-card is-pending">
                      <div className="files-image-frame">
                        <Image
                          src={image.previewUrl}
                          alt={image.fileName}
                          fill
                          unoptimized
                          sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 25vw"
                        />
                        <div className="files-pending-overlay">
                          <strong>{image.status === "queued" ? "Na fila" : "Enviando..."}</strong>
                          <span>A imagem ja apareceu na galeria para feedback imediato.</span>
                        </div>
                      </div>
                      <div className="files-image-meta">
                        <strong title={image.fileName}>{image.fileName}</strong>
                        <span>{formatBytes(image.sizeBytes)}</span>
                        <span>{image.status === "queued" ? "Aguardando processamento" : "Upload em andamento"}</span>
                        <span>Drop em {formatDateTime(image.createdAt)}</span>
                      </div>
                    </article>
                  ))}

                  {activeFolder.images.map((image) => (
                    <article
                      key={image.id}
                      className={`files-image-card ${draggedImageId === image.id ? "is-dragging" : ""}`}
                      draggable={canManage}
                      onDragStart={() => setDraggedImageId(image.id)}
                      onDragEnd={() => setDraggedImageId(null)}
                      onDragOver={(event) => {
                        if (!canManage) return;
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleDropReorder(image.id);
                      }}
                    >
                      <div className="files-image-frame">
                        {image.previewUrl ? (
                          <Image
                            src={image.previewUrl}
                            alt={image.fileName}
                            fill
                            unoptimized
                            sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 25vw"
                          />
                        ) : (
                          <div className="files-missing-frame">
                            <strong>Arquivo ausente</strong>
                            <span>O objeto foi removido do bucket.</span>
                          </div>
                        )}
                      </div>
                      <div className="files-image-meta">
                        <strong title={image.fileName}>{image.fileName}</strong>
                        <span>{formatBytes(image.sizeBytes)}</span>
                        <span>Posicao {image.sortOrder + 1}</span>
                        <span>Upload em {formatDateTime(image.createdAt)}</span>
                        {image.isMissing ? <span>Registro quebrado no bucket</span> : null}
                      </div>
                      <div className="files-image-actions">
                        <button
                          type="button"
                          className="files-ghost-btn"
                          onClick={() => void handleDownloadImage(image)}
                          disabled={!image.downloadUrl}
                        >
                          Download
                        </button>
                        {canManage ? (
                          <button type="button" className="files-danger-btn" onClick={() => void handleDeleteImage(image.id)}>
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
