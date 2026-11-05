"use client";

import { useCallback, useState } from "react";

import { updateVeiculoIdentificacao } from "@/components/files/api";
import { CrlvConfirmDialog, type CrlvConfirmData } from "@/components/files/crlv-confirm-dialog";
import { extractCrlvFields } from "@/components/files/crlv-extract";
import { DocumentClassifyDialog } from "@/components/files/document-classify-dialog";
import { isCrlvSlot, matchDocumentType, renameFileForSlot, type DocumentSlot } from "@/components/files/document-slots";
import { activeTemplateFor, useOcrApply, type OcrConflict } from "@/components/files/ocr/use-ocr";
import type { OcrAnchorResult, OcrFieldResult, OcrTemplateSummary } from "@/lib/domain/ocr/types";
import { getFolderFiles, type ExplorerModel } from "@/components/files/explorer/model";
import type { UploadOutcome } from "@/components/files/explorer/use-upload-queue";
import type { Notify } from "@/components/files/explorer/use-explorer-actions";
import type { RequestAuth } from "@/components/ui-grid/types";
import { placasIguais } from "@/lib/domain/veiculo/identificacao";

type ClassifyRequest = { files: File[]; folderId: string; placa: string; existingNames: string[] };

/**
 * Porta única de upload. Qualquer origem (botão, arrastar, colar) chama
 * `requestUpload`; em pasta de documentos de veículo o arquivo passa pelo
 * formulário de classificação (renomeia com o token que a automação do banco
 * reconhece). Se o tipo escolhido tem TEMPLATE de OCR ativo, ele lê o arquivo,
 * aplica a trava (ex.: placa da pasta) e grava os dados; sem template, o CRLV
 * segue o parser legado.
 */
export function useUploadRouter(params: {
  auth: RequestAuth;
  model: ExplorerModel | null;
  enqueue: (files: File[], folderId: string) => Promise<UploadOutcome[]>;
  notify: Notify;
  /** OCR (templates/gravação) é só do ADMINISTRADOR. */
  ocrEnabled?: boolean;
}) {
  const { auth, model, enqueue, notify } = params;
  const [classify, setClassify] = useState<ClassifyRequest | null>(null);
  const [crlvConfirm, setCrlvConfirm] = useState<(CrlvConfirmData & { carroId: string }) | null>(null);
  const [crlvSaving, setCrlvSaving] = useState(false);
  const ocr = useOcrApply({ auth, notify, enabled: params.ocrEnabled ?? false });

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
      void enqueue(files, folderId);
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

      if (accepted.length > 0) void enqueue(accepted, folderId);
      if (refusals.length > 0) notify("error", `Recusado(s) — ${refusals.join("; ")}.`);

      const carroId = model?.foldersById.get(folderId)?.managedCarroId;
      if (accepted.length > 0 && extracted && carroId) setCrlvConfirm({ placa, carroId, ...extracted });
      else if (accepted.length > 0) notify("info", "CRLV validado ✓ (placa confere).");
    },
    [enqueue, model, notify]
  );

  const runTemplateGate = useCallback(
    async (items: Array<{ file: File; template: OcrTemplateSummary }>, folderId: string, placa: string) => {
      const vehicle = { carroId: model?.foldersById.get(folderId)?.managedCarroId ?? null, placa };
      notify("info", `Lendo ${items.length === 1 ? "o documento" : `${items.length} documentos`}…`);
      const accepted: File[] = [];
      const refusals: string[] = [];
      let toPresent: {
        template: OcrTemplateSummary;
        results: OcrFieldResult[];
        name: string;
        anchors: OcrAnchorResult[];
        conflicts: OcrConflict[];
      } | null = null;

      for (const item of items) {
        try {
          const { results, check, anchors, conflicts } = await ocr.extract(item.file, item.template, vehicle);
          if (!check.ok) {
            // Âncora/trava falhou: o arquivo NÃO sobe e nada é gravado.
            refusals.push(`${item.file.name}: ${check.reason}`);
            continue;
          }
          accepted.push(item.file);
          toPresent ??= { template: item.template, results, name: item.file.name, anchors, conflicts };
        } catch {
          refusals.push(`${item.file.name}: não foi possível ler o documento`);
        }
      }

      if (refusals.length > 0) notify("error", `Upload cancelado — ${refusals.join("; ")}.`);
      if (accepted.length === 0) return;
      // Grava DEPOIS do upload: notas/perícias são o registro ligado ao arquivo.
      const outcomes = await enqueue(accepted, folderId);
      if (!toPresent) return;
      const fileId = outcomes.find((outcome) => outcome.name === toPresent?.name)?.fileId ?? null;
      if (!fileId) {
        notify("error", `${toPresent.name}: o envio falhou; os dados não foram gravados.`);
        return;
      }
      await ocr.present(toPresent.template, toPresent.results, vehicle, toPresent.name, toPresent.anchors, toPresent.conflicts, fileId);
    },
    [enqueue, model, notify, ocr]
  );

  const handleClassifyConfirm = useCallback(
    async (slots: (DocumentSlot | null)[]) => {
      if (!classify) return;
      const { files, folderId, placa, existingNames } = classify;
      setClassify(null);
      // Nomes curtos (= token) e únicos na pasta, inclusive entre os do mesmo envio.
      const taken = new Set(existingNames.map((name) => name.toLowerCase()));
      // Versão ATUAL dos templates (o console pode ter mudado âncoras/campos depois que a tela abriu).
      const templates = (await ocr.refresh()) ?? ocr.templates;
      const crlv: File[] = [];
      const others: File[] = [];
      const withTemplate: Array<{ file: File; template: OcrTemplateSummary }> = [];
      files.forEach((file, position) => {
        const slot = slots[position];
        const renamed = slot ? renameFileForSlot(file, slot, placa, taken) : file;
        const template = slot ? activeTemplateFor(templates, matchDocumentType(renamed.name, placa)?.key) : null;
        if (template) withTemplate.push({ file: renamed, template });
        else (slot && isCrlvSlot(slot) ? crlv : others).push(renamed);
      });
      if (others.length > 0) void enqueue(others, folderId);
      if (crlv.length > 0) void runCrlvGate(crlv, folderId, placa);
      if (withTemplate.length > 0) void runTemplateGate(withTemplate, folderId, placa);
    },
    [classify, enqueue, ocr, runCrlvGate, runTemplateGate]
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
          onConfirm={(slots) => void handleClassifyConfirm(slots)}
          onCancel={() => setClassify(null)}
        />
      ) : null}
      {ocr.dialog}
      {crlvConfirm ? (
        <CrlvConfirmDialog data={crlvConfirm} saving={crlvSaving} onConfirm={(fields) => void saveCrlv(fields)} onSkip={() => setCrlvConfirm(null)} />
      ) : null}
    </>
  );

  return { requestUpload, dialogs, ocr };
}
