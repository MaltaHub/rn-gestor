"use client";

import { useCallback, useState } from "react";

import { updateVeiculoIdentificacao } from "@/components/files/api";
import { CrlvConfirmDialog, type CrlvConfirmData } from "@/components/files/crlv-confirm-dialog";
import { extractCrlvFields } from "@/components/files/crlv-extract";
import { DocumentClassifyDialog } from "@/components/files/document-classify-dialog";
import { isCrlvSlot, renameFileForSlot, type DocumentSlot } from "@/components/files/document-slots";
import { getFolderFiles, type ExplorerModel } from "@/components/files/explorer/model";
import type { Notify } from "@/components/files/explorer/use-explorer-actions";
import type { RequestAuth } from "@/components/ui-grid/types";
import { placasIguais } from "@/lib/domain/veiculo/identificacao";

type ClassifyRequest = { files: File[]; folderId: string; placa: string; existingNames: string[] };

/**
 * Porta única de upload. Qualquer origem (botão, arrastar, colar) chama
 * `requestUpload`; em pasta de documentos de veículo o arquivo passa pelo
 * formulário de classificação (renomeia com o token que a automação do banco
 * reconhece) e o CRLV passa pela trava de placa.
 */
export function useUploadRouter(params: {
  auth: RequestAuth;
  model: ExplorerModel | null;
  enqueue: (files: File[], folderId: string) => void;
  notify: Notify;
}) {
  const { auth, model, enqueue, notify } = params;
  const [classify, setClassify] = useState<ClassifyRequest | null>(null);
  const [crlvConfirm, setCrlvConfirm] = useState<(CrlvConfirmData & { carroId: string }) | null>(null);
  const [crlvSaving, setCrlvSaving] = useState(false);

  const requestUpload = useCallback(
    (files: File[], folderId: string) => {
      if (files.length === 0 || !model) return;
      const folder = model.foldersById.get(folderId);
      const placa = folder?.vehicle?.placa?.trim();
      if (folder?.automationKey === "vehicle_documents" && placa) {
        setClassify({
          files,
          folderId,
          placa,
          existingNames: getFolderFiles(model, folderId).map((file) => file.name)
        });
        return;
      }
      enqueue(files, folderId);
    },
    [enqueue, model]
  );

  const runCrlvGate = useCallback(
    async (crlvFiles: File[], folderId: string, placa: string) => {
      notify("info", `Validando ${crlvFiles.length === 1 ? "o CRLV" : `${crlvFiles.length} CRLVs`} pela placa…`);
      const accepted: File[] = [];
      const refusals: string[] = [];
      let extracted: { chassi: string | null; renavam: string | null } | null = null;

      for (const file of crlvFiles) {
        try {
          const fields = await extractCrlvFields(file);
          if (!fields.placa) {
            refusals.push(`${file.name}: não consegui ler a placa`);
            continue;
          }
          if (!placasIguais(fields.placa, placa)) {
            refusals.push(`${file.name}: placa ${fields.placa} ≠ pasta ${placa.toUpperCase()}`);
            continue;
          }
          accepted.push(file);
          if (!extracted && (fields.chassi || fields.renavam)) extracted = { chassi: fields.chassi, renavam: fields.renavam };
        } catch {
          refusals.push(`${file.name}: não foi possível ler o documento`);
        }
      }

      if (accepted.length > 0) enqueue(accepted, folderId);
      if (refusals.length > 0) notify("error", `Recusado(s) — ${refusals.join("; ")}.`);

      const carroId = model?.foldersById.get(folderId)?.managedCarroId;
      if (accepted.length > 0 && extracted && carroId) setCrlvConfirm({ placa, carroId, ...extracted });
      else if (accepted.length > 0) notify("info", "CRLV validado ✓ (placa confere).");
    },
    [enqueue, model, notify]
  );

  const handleClassifyConfirm = useCallback(
    (slots: (DocumentSlot | null)[]) => {
      if (!classify) return;
      const { files, folderId, placa } = classify;
      setClassify(null);
      const crlv: File[] = [];
      const others: File[] = [];
      files.forEach((file, position) => {
        const slot = slots[position];
        const renamed = slot ? renameFileForSlot(file, slot, placa) : file;
        (slot && isCrlvSlot(slot) ? crlv : others).push(renamed);
      });
      if (others.length > 0) enqueue(others, folderId);
      if (crlv.length > 0) void runCrlvGate(crlv, folderId, placa);
    },
    [classify, enqueue, runCrlvGate]
  );

  const saveCrlv = useCallback(
    async (fields: { chassi: string | null; renavam: string | null }) => {
      if (!crlvConfirm) return;
      setCrlvSaving(true);
      try {
        const saved = await updateVeiculoIdentificacao(auth, { carroId: crlvConfirm.carroId, ...fields });
        const parts = [saved.chassi ? `chassi ${saved.chassi}` : null, saved.renavam ? `renavam ${saved.renavam}` : null].filter(Boolean);
        notify("info", `Veículo atualizado ✓${parts.length ? ` — ${parts.join(", ")}` : ""} · marcado como PRONTO.`);
        setCrlvConfirm(null);
      } catch (error) {
        notify("error", error instanceof Error ? error.message : "Falha ao gravar chassi/renavam.");
      } finally {
        setCrlvSaving(false);
      }
    },
    [auth, crlvConfirm, notify]
  );

  const dialogs = (
    <>
      {classify ? (
        <DocumentClassifyDialog
          files={classify.files}
          placa={classify.placa}
          existingFileNames={classify.existingNames}
          onConfirm={handleClassifyConfirm}
          onCancel={() => setClassify(null)}
        />
      ) : null}
      {crlvConfirm ? (
        <CrlvConfirmDialog data={crlvConfirm} saving={crlvSaving} onConfirm={(fields) => void saveCrlv(fields)} onSkip={() => setCrlvConfirm(null)} />
      ) : null}
    </>
  );

  return { requestUpload, dialogs };
}
