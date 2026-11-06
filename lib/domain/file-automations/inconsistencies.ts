import { isSoldByRules, type FileAutomationRules } from "@/lib/domain/file-automations/rules";

/**
 * Inconsistências entre veículos e pastas, SEGUNDO AS REGRAS configuradas
 * (o que é "fora do lugar" depende delas). Puro: o serviço junta os dados.
 */

export const INCONSISTENCY_KINDS = [
  "missing_documents_folder",
  "missing_photos_folder",
  "automation_paused",
  "misplaced_folder",
  "stock_without_photos",
  "sold_empty_photos",
  "stock_without_entry_invoice",
  "sale_without_exit_invoice",
  "sold_without_date",
  "unlinked_folder"
] as const;

export type InconsistencyKind = (typeof INCONSISTENCY_KINDS)[number];

export const INCONSISTENCY_LABELS: Record<InconsistencyKind, string> = {
  missing_documents_folder: "Sem pasta de documentos",
  missing_photos_folder: "Sem pasta de fotos",
  automation_paused: "Automação pausada",
  misplaced_folder: "Pasta fora do lugar",
  stock_without_photos: "Em estoque sem fotos",
  sold_empty_photos: "Vendido com pasta de fotos vazia",
  stock_without_entry_invoice: "Em estoque sem nota de entrada",
  sale_without_exit_invoice: "Venda sem nota de saída",
  sold_without_date: "Vendido sem data de venda",
  unlinked_folder: "Pasta desvinculada"
};

/** Resolve sozinho com "Corrigir" (reconciliar o veículo). */
export const RECONCILABLE_KINDS: ReadonlySet<InconsistencyKind> = new Set([
  "missing_documents_folder",
  "missing_photos_folder",
  "misplaced_folder",
  "sold_empty_photos"
]);

export type Inconsistency = {
  kind: InconsistencyKind;
  carroId: string | null;
  placa: string | null;
  folderId: string | null;
  detail: string;
};

type Repositories = {
  vehicle_photos_active: string;
  vehicle_photos_sold: string;
  vehicle_documents_active: string;
  vehicle_documents_archive: string;
};

export type InconsistencyInput = {
  rules: FileAutomationRules;
  repositories: Repositories;
  cars: Array<{ id: string; placa: string | null; estado_venda: string | null; data_venda?: string | null }>;
  mappings: Array<{
    folderId: string;
    carroId: string | null;
    automationKey: "vehicle_photos" | "vehicle_documents";
    paused: boolean;
  }>;
  folderParentById: Map<string, string | null>;
  fileCountByFolderId: Map<string, number>;
  /** Notas fiscais existentes (tipo ENTRADA | SAIDA). Ausente = não confere notas. */
  invoices?: Array<{ carroId: string; tipo: string }>;
  /** Envelope por veículo: venda com envelope FECHADO já encerrou o processo. */
  envelopeByCar?: Map<string, string | null>;
};

export function detectInconsistencies(input: InconsistencyInput): Inconsistency[] {
  const { rules, repositories } = input;
  const issues: Inconsistency[] = [];
  const carById = new Map(input.cars.map((car) => [car.id, car]));
  const docsByCar = new Map<string, InconsistencyInput["mappings"][number]>();
  const invoiceKinds = new Map<string, Set<string>>();
  for (const invoice of input.invoices ?? []) {
    const kinds = invoiceKinds.get(invoice.carroId) ?? new Set<string>();
    kinds.add(invoice.tipo);
    invoiceKinds.set(invoice.carroId, kinds);
  }
  const photosByCar = new Map<string, InconsistencyInput["mappings"][number]>();

  for (const mapping of input.mappings) {
    if (!input.folderParentById.has(mapping.folderId)) continue; // pasta já não existe
    if (!mapping.carroId || !carById.has(mapping.carroId)) {
      issues.push({
        kind: "unlinked_folder",
        carroId: null,
        placa: null,
        folderId: mapping.folderId,
        detail: mapping.automationKey === "vehicle_documents" ? "Documentos de veículo excluído (arquivo)." : "Fotos de veículo excluído."
      });
      continue;
    }
    (mapping.automationKey === "vehicle_documents" ? docsByCar : photosByCar).set(mapping.carroId, mapping);
  }

  for (const car of input.cars) {
    const sold = isSoldByRules(rules, car.estado_venda);
    const base = { carroId: car.id, placa: car.placa };
    const docs = docsByCar.get(car.id);
    const photos = photosByCar.get(car.id);

    if (!docs && (rules.documents.createForStock || sold)) {
      issues.push({ ...base, kind: "missing_documents_folder", folderId: null, detail: `Estado: ${car.estado_venda ?? "—"}.` });
    }
    if (docs) {
      if (docs.paused) {
        issues.push({ ...base, kind: "automation_paused", folderId: docs.folderId, detail: "A ficha de documentos não é preenchida pelos nomes dos arquivos." });
      }
      const expected = sold && rules.documents.onSold === "move" ? repositories.vehicle_documents_archive : repositories.vehicle_documents_active;
      if (input.folderParentById.get(docs.folderId) !== expected) {
        issues.push({
          ...base,
          kind: "misplaced_folder",
          folderId: docs.folderId,
          detail: `Documentos deveriam estar em ${sold && rules.documents.onSold === "move" ? "Documentos vendidos" : "Documentos"}.`
        });
      }
    }

    // Sem data de venda o veículo nunca é finalizado (90 dias contam dela).
    if (String(car.estado_venda ?? "").toUpperCase() === "VENDIDO" && car.data_venda === null) {
      issues.push({ ...base, kind: "sold_without_date", folderId: docs?.folderId ?? null, detail: "Preencha a data da venda (a finalização em 90 dias conta dela)." });
    }

    if (input.invoices) {
      const kinds = invoiceKinds.get(car.id);
      if (!sold && !kinds?.has("ENTRADA")) {
        issues.push({ ...base, kind: "stock_without_entry_invoice", folderId: docs?.folderId ?? null, detail: "Envie a nota de entrada na pasta de documentos." });
      }
      // Venda encerrada (envelope FECHADO) fica fora: só processos em andamento.
      const envelope = String(input.envelopeByCar?.get(car.id) ?? "").toUpperCase();
      if (sold && envelope !== "FECHADO" && !kinds?.has("SAIDA")) {
        issues.push({ ...base, kind: "sale_without_exit_invoice", folderId: docs?.folderId ?? null, detail: "Envie a nota de saída na pasta de documentos." });
      }
    }

    if (!sold && !photos && rules.photos.createForStock) {
      issues.push({ ...base, kind: "missing_photos_folder", folderId: null, detail: "Veículo em estoque sem pasta de fotos." });
    }
    if (photos) {
      const count = input.fileCountByFolderId.get(photos.folderId) ?? 0;
      if (!sold && count === 0) {
        issues.push({ ...base, kind: "stock_without_photos", folderId: photos.folderId, detail: "Pasta de fotos vazia." });
      }
      if (sold && count === 0 && rules.photos.deleteEmptyOnSold) {
        issues.push({ ...base, kind: "sold_empty_photos", folderId: photos.folderId, detail: "Deveria ter sido removida ao vender." });
      } else {
        const expected = sold && rules.photos.onSold === "move" ? repositories.vehicle_photos_sold : repositories.vehicle_photos_active;
        if (input.folderParentById.get(photos.folderId) !== expected) {
          issues.push({
            ...base,
            kind: "misplaced_folder",
            folderId: photos.folderId,
            detail: `Fotos deveriam estar em ${sold && rules.photos.onSold === "move" ? "Fotos de vendidos" : "Fotos dos veículos"}.`
          });
        }
      }
    }
  }

  return issues;
}
