import { z } from "zod";

/**
 * Regras CUSTOMIZÁVEIS das pastas de veículo (fotos/documentos).
 *
 * Puro e testável: recebe o estado do veículo e das pastas e devolve um PLANO.
 * Quem executa o plano é `file-automations/service.ts`. Os valores padrão
 * reproduzem exatamente o comportamento histórico (ver testes de regressão).
 */

export const PHOTOS_ON_SOLD = ["move", "keep"] as const;
export const DOCUMENTS_ON_SOLD = ["move", "keep"] as const;
export const PHOTOS_ON_DELETE = ["delete_if_empty", "move_to_sold"] as const;
export const DOCUMENTS_ON_DELETE = ["archive", "keep"] as const;

export const DISPLAY_TEMPLATE_TOKENS = ["placa", "modelo", "nome", "chassi", "ano", "cor", "id"] as const;
export type DisplayTemplateToken = (typeof DISPLAY_TEMPLATE_TOKENS)[number];

export const fileAutomationRulesSchema = z.object({
  /** Estados de venda (carros.estado_venda) que contam como "vendido". Comparação sem acento/caixa. */
  soldStates: z.array(z.string().trim().min(1).max(60)).max(30).default(["VENDIDO"]),
  /** Nome exibido das pastas, ex.: "{placa} · {modelo} {ano}". Vazio = usa o campo de exibição. */
  displayTemplate: z.string().trim().max(120).nullable().default(null),
  photos: z
    .object({
      /** Cria a pasta de fotos para veículos em estoque. */
      createForStock: z.boolean().default(true),
      /** Ao vender: move para "Fotos de vendidos" ou mantém onde está. */
      onSold: z.enum(PHOTOS_ON_SOLD).default("move"),
      /** Ao vender, apaga a pasta de fotos se estiver vazia. */
      deleteEmptyOnSold: z.boolean().default(true),
      /** Ao excluir o veículo: apaga se vazia (mantém se tiver fotos) ou move para vendidos. */
      onVehicleDelete: z.enum(PHOTOS_ON_DELETE).default("delete_if_empty"),
      /** Sem capa válida, a primeira foto (ordem manual) vira a capa. */
      autoCover: z.boolean().default(true)
    })
    .default({ createForStock: true, onSold: "move", deleteEmptyOnSold: true, onVehicleDelete: "delete_if_empty", autoCover: true }),
  documents: z
    .object({
      createForStock: z.boolean().default(true),
      /** Ao vender: move para "Documentos vendidos" ou mantém. */
      onSold: z.enum(DOCUMENTS_ON_SOLD).default("move"),
      /** Ao excluir o veículo: arquiva (vazia é apagada) ou mantém no lugar desvinculada. */
      onVehicleDelete: z.enum(DOCUMENTS_ON_DELETE).default("archive")
    })
    .default({ createForStock: true, onSold: "move", onVehicleDelete: "archive" })
});

export type FileAutomationRules = z.infer<typeof fileAutomationRulesSchema>;

export const DEFAULT_FILE_AUTOMATION_RULES: FileAutomationRules = fileAutomationRulesSchema.parse({});

/** Tolerante: JSON inválido/parcial vira o padrão campo a campo (nunca quebra a automação). */
export function parseFileAutomationRules(value: unknown): FileAutomationRules {
  const parsed = fileAutomationRulesSchema.safeParse(value && typeof value === "object" ? value : {});
  return parsed.success ? parsed.data : DEFAULT_FILE_AUTOMATION_RULES;
}

export function normalizeStateToken(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function isSoldByRules(rules: FileAutomationRules, estadoVenda: string | null | undefined) {
  const token = normalizeStateToken(estadoVenda);
  return token.length > 0 && rules.soldStates.some((state) => normalizeStateToken(state) === token);
}

// ------------------------------------------------------------------ nome

export type DisplayTemplateVehicle = {
  id: string;
  placa?: string | null;
  nome?: string | null;
  chassi?: string | null;
  modelo?: string | null;
  ano?: string | number | null;
  cor?: string | null;
};

/** `{placa} · {modelo}` → "ABC1D23 · Onix". Separadores órfãos de campos vazios somem. */
export function renderDisplayTemplate(template: string, vehicle: DisplayTemplateVehicle) {
  const values: Record<DisplayTemplateToken, string> = {
    placa: String(vehicle.placa ?? "").trim().toUpperCase(),
    modelo: String(vehicle.modelo ?? "").trim(),
    nome: String(vehicle.nome ?? "").trim(),
    chassi: String(vehicle.chassi ?? "").trim(),
    ano: String(vehicle.ano ?? "").trim(),
    cor: String(vehicle.cor ?? "").trim(),
    id: vehicle.id
  };
  return template
    .replace(/\{(\w+)\}/g, (match, token: string) =>
      (DISPLAY_TEMPLATE_TOKENS as readonly string[]).includes(token) ? values[token as DisplayTemplateToken] : match
    )
    .replace(/\s*([·\-—|/])\s*(?=([·\-—|/]|$))/g, "")
    .replace(/^\s*[·\-—|/]\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ------------------------------------------------------------------ planos

export type ManagedFolderState = { exists: boolean; fileCount: number };

export type FolderPlan =
  | { action: "none" }
  | { action: "ensure"; repository: "active" | "sold"; createIfMissing: boolean }
  | { action: "delete" };

/**
 * O que fazer com as pastas de um veículo quando ele é criado/atualizado.
 * `repository` "sold" = Fotos de vendidos / Documentos vendidos.
 */
export function planVehicleFolders(
  rules: FileAutomationRules,
  input: { sold: boolean; photos: ManagedFolderState }
): { documents: FolderPlan; photos: FolderPlan } {
  const documents: FolderPlan = {
    action: "ensure",
    repository: input.sold && rules.documents.onSold === "move" ? "sold" : "active",
    createIfMissing: rules.documents.createForStock || input.sold
  };

  let photos: FolderPlan;
  if (!input.sold) {
    photos = { action: "ensure", repository: "active", createIfMissing: rules.photos.createForStock };
  } else if (!input.photos.exists) {
    photos = { action: "none" };
  } else if (input.photos.fileCount === 0 && rules.photos.deleteEmptyOnSold) {
    photos = { action: "delete" };
  } else {
    photos = {
      action: "ensure",
      repository: rules.photos.onSold === "move" ? "sold" : "active",
      createIfMissing: false
    };
  }

  return { documents, photos };
}

export type DeletePlan = {
  documents: "none" | "delete" | "archive" | "detach";
  photos: "none" | "delete" | "keep" | "move_to_sold";
};

/** O que fazer com as pastas quando o veículo é EXCLUÍDO (antes do delete). */
export function planVehicleDelete(
  rules: FileAutomationRules,
  input: { documents: ManagedFolderState; photos: ManagedFolderState }
): DeletePlan {
  let documents: DeletePlan["documents"] = "none";
  if (input.documents.exists) {
    if (input.documents.fileCount === 0) documents = "delete";
    else documents = rules.documents.onVehicleDelete === "archive" ? "archive" : "detach";
  }

  let photos: DeletePlan["photos"] = "none";
  if (input.photos.exists) {
    if (input.photos.fileCount === 0) photos = "delete";
    else photos = rules.photos.onVehicleDelete === "move_to_sold" ? "move_to_sold" : "keep";
  }

  return { documents, photos };
}

/** Frases curtas do que as regras fazem — usadas no diálogo de configuração. */
export function describeRules(rules: FileAutomationRules): string[] {
  const sold = rules.soldStates.join(", ") || "(nenhum estado)";
  return [
    `Veículo é considerado vendido quando o estado de venda é: ${sold}.`,
    rules.photos.createForStock ? "Veículo em estoque ganha pasta de fotos." : "Pasta de fotos não é criada automaticamente.",
    rules.documents.createForStock ? "Todo veículo ganha pasta de documentos." : "Pasta de documentos só é criada ao vender.",
    `Ao vender: fotos ${rules.photos.onSold === "move" ? "vão para Fotos de vendidos" : "ficam onde estão"}${
      rules.photos.deleteEmptyOnSold ? " (pasta vazia é apagada)" : ""
    }; documentos ${rules.documents.onSold === "move" ? "vão para Documentos vendidos" : "ficam onde estão"}.`,
    `Ao excluir o veículo: documentos ${rules.documents.onVehicleDelete === "archive" ? "são arquivados" : "ficam no lugar, desvinculados"}; fotos ${
      rules.photos.onVehicleDelete === "move_to_sold" ? "vão para Fotos de vendidos" : "ficam (pasta vazia é apagada)"
    }.`,
    rules.photos.autoCover ? "Sem capa definida, a primeira foto vira a capa." : "A capa só muda manualmente."
  ];
}
