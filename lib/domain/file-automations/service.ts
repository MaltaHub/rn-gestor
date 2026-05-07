import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api/errors";
import type { ActorContext } from "@/lib/api/auth";
import { toFolderSlug } from "@/lib/files/shared";
import type { Database, Json } from "@/lib/supabase/database.types";

type FileAutomationSupabase = SupabaseClient<Database>;
type FolderRow = Database["public"]["Tables"]["arquivos_pastas"]["Row"];
type FileAutomationConfigRow = Database["public"]["Tables"]["arquivo_automacao_config"]["Row"];
type FileAutomationFolderRow = Database["public"]["Tables"]["arquivo_automacao_folders"]["Row"];

export const FILE_AUTOMATION_REPOSITORY_KEYS = [
  "vehicle_photos_active",
  "vehicle_photos_sold",
  "vehicle_documents_active",
  "vehicle_documents_archive"
] as const;

export const FILE_AUTOMATION_FOLDER_KEYS = ["vehicle_photos", "vehicle_documents"] as const;

export const VEHICLE_FOLDER_DISPLAY_FIELDS = ["placa", "nome", "chassi", "modelo", "id"] as const;

export type FileAutomationRepositoryKey = (typeof FILE_AUTOMATION_REPOSITORY_KEYS)[number];
export type FileAutomationFolderKey = (typeof FILE_AUTOMATION_FOLDER_KEYS)[number];
export type VehicleFolderDisplayField = (typeof VEHICLE_FOLDER_DISPLAY_FIELDS)[number];

export type FileAutomationSettings = {
  displayField: VehicleFolderDisplayField;
  repositories: Record<FileAutomationRepositoryKey, string>;
  configs: Array<{
    automationKey: FileAutomationRepositoryKey;
    repositoryFolderId: string;
    displayField: VehicleFolderDisplayField;
    enabled: boolean;
    updatedAt: string;
  }>;
};

export type FolderAutomationSummary = {
  physicalName: string;
  displayName: string;
  automationKey: FileAutomationFolderKey | null;
  automationRepositoryKey: FileAutomationRepositoryKey | null;
  managedCarroId: string | null;
  isAutomationRepository: boolean;
  isManagedFolder: boolean;
};

type SummaryLike = {
  id: string;
  name: string;
};

type VehicleAutomationRow = {
  id: string;
  placa: string | null;
  nome: string | null;
  chassi: string | null;
  estado_venda: string | null;
  em_estoque: boolean | null;
  data_venda: string | null;
  tem_fotos?: boolean | null;
  modelos?: { modelo?: string | null } | Array<{ modelo?: string | null }> | null;
};

const DEFAULT_DISPLAY_FIELD: VehicleFolderDisplayField = "placa";

function isRepositoryKey(value: string): value is FileAutomationRepositoryKey {
  return FILE_AUTOMATION_REPOSITORY_KEYS.includes(value as FileAutomationRepositoryKey);
}

function isFolderAutomationKey(value: string): value is FileAutomationFolderKey {
  return FILE_AUTOMATION_FOLDER_KEYS.includes(value as FileAutomationFolderKey);
}

export function isVehicleFolderDisplayField(value: string): value is VehicleFolderDisplayField {
  return VEHICLE_FOLDER_DISPLAY_FIELDS.includes(value as VehicleFolderDisplayField);
}

function normalizeDisplayField(value: string | null | undefined): VehicleFolderDisplayField {
  return value && isVehicleFolderDisplayField(value) ? value : DEFAULT_DISPLAY_FIELD;
}

function normalizeBusinessToken(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveModeloName(row: VehicleAutomationRow) {
  const modelos = row.modelos;
  if (Array.isArray(modelos)) {
    return modelos[0]?.modelo ?? null;
  }

  return modelos?.modelo ?? null;
}

function readSnapshotLabel(snapshot: Json) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const label = snapshot.displayLabel;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

export function resolveVehicleFolderDisplayName(row: VehicleAutomationRow, displayField: VehicleFolderDisplayField) {
  const fieldValue =
    displayField === "modelo"
      ? resolveModeloName(row)
      : displayField === "id"
        ? row.id
        : row[displayField];

  const label = String(fieldValue ?? "").trim();
  if (label) return label;

  return row.placa?.trim() || row.nome?.trim() || row.chassi?.trim() || row.id;
}

function buildVehicleSnapshot(row: VehicleAutomationRow, displayField: VehicleFolderDisplayField): Json {
  return {
    id: row.id,
    placa: row.placa,
    nome: row.nome,
    chassi: row.chassi,
    modelo: resolveModeloName(row),
    displayField,
    displayLabel: resolveVehicleFolderDisplayName(row, displayField)
  } satisfies Record<string, Json>;
}

function isVehicleSold(row: VehicleAutomationRow) {
  const saleStatus = normalizeBusinessToken(row.estado_venda);
  return saleStatus.includes("vend") || saleStatus.includes("finaliz") || Boolean(row.data_venda && row.em_estoque === false);
}

async function listFolderRows(supabase: FileAutomationSupabase) {
  const { data, error } = await supabase.from("arquivos_pastas").select("*");

  if (error) {
    throw new ApiHttpError(500, "FILES_FOLDER_LIST_FAILED", "Falha ao listar pastas.", error);
  }

  return data ?? [];
}

async function getFolderRow(supabase: FileAutomationSupabase, folderId: string) {
  const { data, error } = await supabase.from("arquivos_pastas").select("*").eq("id", folderId).maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FILES_FOLDER_READ_FAILED", "Falha ao carregar pasta.", error);
  }

  return data;
}

async function listFolderSubtreeRows(supabase: FileAutomationSupabase, rootFolderId: string) {
  const folders = await listFolderRows(supabase);
  const childrenByParent = new Map<string, FolderRow[]>();

  for (const folder of folders) {
    if (!folder.parent_folder_id) continue;
    const children = childrenByParent.get(folder.parent_folder_id) ?? [];
    children.push(folder);
    childrenByParent.set(folder.parent_folder_id, children);
  }

  const root = folders.find((folder) => folder.id === rootFolderId);
  if (!root) return [];

  const subtree: FolderRow[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    subtree.push(current);
    stack.push(...(childrenByParent.get(current.id) ?? []));
  }

  return subtree;
}

async function countFilesInFolderSubtree(supabase: FileAutomationSupabase, folderId: string) {
  const folders = await listFolderSubtreeRows(supabase, folderId);
  const folderIds = folders.map((folder) => folder.id);
  if (folderIds.length === 0) return 0;

  const { count, error } = await supabase
    .from("arquivos_arquivos")
    .select("id", { count: "exact", head: true })
    .in("pasta_id", folderIds);

  if (error) {
    throw new ApiHttpError(500, "FILES_COUNT_FAILED", "Falha ao contar arquivos da pasta.", error);
  }

  return count ?? 0;
}

async function loadConfigRows(supabase: FileAutomationSupabase) {
  const { data, error } = await supabase.from("arquivo_automacao_config").select("*").order("automation_key");

  if (error) {
    throw new ApiHttpError(500, "FILE_AUTOMATION_CONFIG_READ_FAILED", "Falha ao carregar configuracao de automacoes.", error);
  }

  return (data ?? []).filter((row): row is FileAutomationConfigRow => isRepositoryKey(row.automation_key));
}

function configMapFromRows(rows: FileAutomationConfigRow[]) {
  const map = new Map<FileAutomationRepositoryKey, FileAutomationConfigRow>();

  for (const row of rows) {
    if (isRepositoryKey(row.automation_key)) {
      map.set(row.automation_key, row);
    }
  }

  return map;
}

async function loadConfigMap(supabase: FileAutomationSupabase) {
  const rows = await loadConfigRows(supabase);
  const map = configMapFromRows(rows);
  const missing = FILE_AUTOMATION_REPOSITORY_KEYS.filter((key) => !map.has(key));

  if (missing.length > 0) {
    throw new ApiHttpError(500, "FILE_AUTOMATION_CONFIG_INCOMPLETE", "Configuracao de automacoes incompleta.", { missing });
  }

  return map;
}

function getConfig(map: Map<FileAutomationRepositoryKey, FileAutomationConfigRow>, key: FileAutomationRepositoryKey) {
  const config = map.get(key);
  if (!config) {
    throw new ApiHttpError(500, "FILE_AUTOMATION_CONFIG_MISSING", "Configuracao de automacao ausente.", { key });
  }

  return config;
}

function getPrimaryDisplayField(configs: FileAutomationConfigRow[]) {
  return normalizeDisplayField(configs.find((config) => config.display_field)?.display_field);
}

export async function getFileAutomationSettings(supabase: FileAutomationSupabase): Promise<FileAutomationSettings> {
  const configs = await loadConfigRows(supabase);
  const map = configMapFromRows(configs);
  const displayField = getPrimaryDisplayField(configs);

  const repositories = FILE_AUTOMATION_REPOSITORY_KEYS.reduce(
    (acc, key) => {
      acc[key] = map.get(key)?.repository_folder_id ?? "";
      return acc;
    },
    {} as Record<FileAutomationRepositoryKey, string>
  );

  return {
    displayField,
    repositories,
    configs: FILE_AUTOMATION_REPOSITORY_KEYS.map((key) => {
      const config = map.get(key);
      return {
        automationKey: key,
        repositoryFolderId: config?.repository_folder_id ?? "",
        displayField: normalizeDisplayField(config?.display_field),
        enabled: config?.enabled ?? true,
        updatedAt: config?.updated_at ?? ""
      };
    })
  };
}

async function assertFolderExistsAndCanBeRepository(supabase: FileAutomationSupabase, folderId: string) {
  const folder = await getFolderRow(supabase, folderId);
  if (!folder) {
    throw new ApiHttpError(404, "FILES_FOLDER_NOT_FOUND", "Pasta de automacao nao encontrada.", { folderId });
  }

  const { data: managedFolder, error } = await supabase
    .from("arquivo_automacao_folders")
    .select("id, automation_key, carro_id")
    .eq("folder_id", folderId)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FILE_AUTOMATION_FOLDER_LOOKUP_FAILED", "Falha ao validar pasta gerenciada.", error);
  }

  if (managedFolder) {
    throw new ApiHttpError(409, "FILE_AUTOMATION_REPOSITORY_MANAGED_FOLDER", "Uma pasta de veiculo nao pode ser repositorio de automacao.", {
      folderId,
      automationKey: managedFolder.automation_key,
      carroId: managedFolder.carro_id
    });
  }

  return folder;
}

export async function updateFileAutomationSettings(input: {
  supabase: FileAutomationSupabase;
  actor: ActorContext;
  displayField: string;
  repositories: Partial<Record<FileAutomationRepositoryKey, string>>;
}) {
  const displayField = normalizeDisplayField(input.displayField);
  const current = await getFileAutomationSettings(input.supabase);

  const nextRepositories = {
    ...current.repositories,
    ...input.repositories
  };

  for (const key of FILE_AUTOMATION_REPOSITORY_KEYS) {
    const folderId = nextRepositories[key]?.trim();
    if (!folderId) {
      throw new ApiHttpError(400, "FILE_AUTOMATION_REPOSITORY_REQUIRED", "Selecione todas as pastas de automacao.", { key });
    }

    await assertFolderExistsAndCanBeRepository(input.supabase, folderId);
  }

  for (const key of FILE_AUTOMATION_REPOSITORY_KEYS) {
    const { error } = await input.supabase
      .from("arquivo_automacao_config")
      .update({
        repository_folder_id: nextRepositories[key],
        display_field: displayField,
        updated_at: new Date().toISOString(),
        updated_by: input.actor.userId
      })
      .eq("automation_key", key);

    if (error) {
      throw new ApiHttpError(400, "FILE_AUTOMATION_CONFIG_UPDATE_FAILED", "Falha ao salvar configuracao de automacoes.", error);
    }
  }

  return getFileAutomationSettings(input.supabase);
}

async function loadAutomationFolderRows(supabase: FileAutomationSupabase) {
  const { data, error } = await supabase.from("arquivo_automacao_folders").select("*");

  if (error) {
    throw new ApiHttpError(500, "FILE_AUTOMATION_FOLDER_READ_FAILED", "Falha ao carregar pastas gerenciadas.", error);
  }

  return (data ?? []).filter((row): row is FileAutomationFolderRow => isFolderAutomationKey(row.automation_key));
}

async function loadVehicleRowsById(supabase: FileAutomationSupabase, carroIds: string[]) {
  if (carroIds.length === 0) return new Map<string, VehicleAutomationRow>();

  const { data, error } = await supabase
    .from("carros")
    .select("id, placa, nome, chassi, estado_venda, em_estoque, data_venda, tem_fotos, modelos(modelo)")
    .in("id", carroIds);

  if (error) {
    throw new ApiHttpError(500, "CARROS_LIST_FAILED", "Falha ao carregar veiculos das pastas.", error);
  }

  return new Map((data ?? []).map((row) => [row.id, row as VehicleAutomationRow]));
}

function displayFieldForManagedFolder(configs: Map<FileAutomationRepositoryKey, FileAutomationConfigRow>, automationKey: FileAutomationFolderKey) {
  const configKey = automationKey === "vehicle_photos" ? "vehicle_photos_active" : "vehicle_documents_active";
  return normalizeDisplayField(configs.get(configKey)?.display_field);
}

export async function enrichFolderSummariesWithAutomation<T extends SummaryLike>(
  supabase: FileAutomationSupabase,
  summaries: T[]
): Promise<Array<T & FolderAutomationSummary>> {
  if (summaries.length === 0) return [];

  const [configs, mappings] = await Promise.all([loadConfigRows(supabase), loadAutomationFolderRows(supabase)]);
  const configMap = configMapFromRows(configs);
  const repositoryByFolderId = new Map<string, FileAutomationRepositoryKey>();

  for (const config of configs) {
    if (isRepositoryKey(config.automation_key)) {
      repositoryByFolderId.set(config.repository_folder_id, config.automation_key);
    }
  }

  const mappingByFolderId = new Map(mappings.map((mapping) => [mapping.folder_id, mapping]));
  const cars = await loadVehicleRowsById(
    supabase,
    mappings.map((mapping) => mapping.carro_id).filter((id): id is string => Boolean(id))
  );

  return summaries.map((summary) => {
    const mapping = mappingByFolderId.get(summary.id) ?? null;
    const repositoryKey = repositoryByFolderId.get(summary.id) ?? null;
    const displayField = mapping && isFolderAutomationKey(mapping.automation_key)
      ? displayFieldForManagedFolder(configMap, mapping.automation_key)
      : DEFAULT_DISPLAY_FIELD;
    const car = mapping?.carro_id ? cars.get(mapping.carro_id) : null;
    const displayName = car
      ? resolveVehicleFolderDisplayName(car, displayField)
      : mapping
        ? readSnapshotLabel(mapping.entity_snapshot) ?? summary.name
        : summary.name;

    return {
      ...summary,
      physicalName: summary.name,
      displayName,
      automationKey: mapping && isFolderAutomationKey(mapping.automation_key) ? mapping.automation_key : null,
      automationRepositoryKey: repositoryKey,
      managedCarroId: mapping?.carro_id ?? null,
      isAutomationRepository: Boolean(repositoryKey),
      isManagedFolder: Boolean(mapping)
    };
  });
}

async function loadVehicleRowOrThrow(supabase: FileAutomationSupabase, carroId: string) {
  const { data, error } = await supabase
    .from("carros")
    .select("id, placa, nome, chassi, estado_venda, em_estoque, data_venda, tem_fotos, modelos(modelo)")
    .eq("id", carroId)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "CARRO_READ_FAILED", "Falha ao carregar veiculo para automacao de arquivos.", error);
  }

  if (!data) {
    throw new ApiHttpError(404, "NOT_FOUND", "Veiculo nao encontrado para automacao de arquivos.", { carroId });
  }

  return data as VehicleAutomationRow;
}

async function findActiveManagedFolder(supabase: FileAutomationSupabase, automationKey: FileAutomationFolderKey, carroId: string) {
  const { data, error } = await supabase
    .from("arquivo_automacao_folders")
    .select("*")
    .eq("automation_key", automationKey)
    .eq("carro_id", carroId)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FILE_AUTOMATION_FOLDER_READ_FAILED", "Falha ao carregar pasta gerenciada.", error);
  }

  return data as FileAutomationFolderRow | null;
}

async function deleteAutomationMapping(supabase: FileAutomationSupabase, mappingId: string) {
  const { error } = await supabase.from("arquivo_automacao_folders").delete().eq("id", mappingId);
  if (error) {
    throw new ApiHttpError(400, "FILE_AUTOMATION_MAPPING_DELETE_FAILED", "Falha ao remover vinculo de automacao.", error);
  }
}

async function deleteFolderRow(supabase: FileAutomationSupabase, folderId: string) {
  const { error } = await supabase.from("arquivos_pastas").delete().eq("id", folderId);
  if (error) {
    throw new ApiHttpError(400, "FILES_FOLDER_DELETE_FAILED", "Falha ao excluir pasta gerenciada.", error);
  }
}

async function findFolderByParentAndSlug(supabase: FileAutomationSupabase, parentFolderId: string, slug: string) {
  const { data, error } = await supabase
    .from("arquivos_pastas")
    .select("*")
    .eq("parent_folder_id", parentFolderId)
    .eq("nome_slug", slug)
    .maybeSingle();

  if (error) {
    throw new ApiHttpError(500, "FILES_FOLDER_LOOKUP_FAILED", "Falha ao procurar pasta de veiculo.", error);
  }

  return data;
}

async function createManagedFolder(input: {
  supabase: FileAutomationSupabase;
  automationKey: FileAutomationFolderKey;
  car: VehicleAutomationRow;
  repositoryFolderId: string;
  displayField: VehicleFolderDisplayField;
}) {
  const slug = toFolderSlug(input.car.id);
  const existingFolder = await findFolderByParentAndSlug(input.supabase, input.repositoryFolderId, slug);
  const folder = existingFolder
    ? existingFolder
    : await (async () => {
        const { data, error } = await input.supabase
          .from("arquivos_pastas")
          .insert({
            nome: input.car.id,
            nome_slug: slug,
            descricao: null,
            parent_folder_id: input.repositoryFolderId
          })
          .select("*")
          .single();

        if (error) {
          throw new ApiHttpError(400, "FILES_FOLDER_CREATE_FAILED", "Falha ao criar pasta do veiculo.", error);
        }

        return data;
      })();

  const { error } = await input.supabase.from("arquivo_automacao_folders").insert({
    automation_key: input.automationKey,
    folder_id: folder.id,
    carro_id: input.car.id,
    entity_snapshot: buildVehicleSnapshot(input.car, input.displayField),
    archived_at: null
  });

  if (error) {
    throw new ApiHttpError(400, "FILE_AUTOMATION_MAPPING_CREATE_FAILED", "Falha ao vincular pasta do veiculo.", error);
  }

  return folder.id;
}

async function ensureManagedFolder(input: {
  supabase: FileAutomationSupabase;
  automationKey: FileAutomationFolderKey;
  car: VehicleAutomationRow;
  repositoryFolderId: string;
  displayField: VehicleFolderDisplayField;
  createIfMissing: boolean;
}) {
  const slug = toFolderSlug(input.car.id);
  const mapping = await findActiveManagedFolder(input.supabase, input.automationKey, input.car.id);

  if (mapping) {
    const folder = await getFolderRow(input.supabase, mapping.folder_id);
    if (!folder) {
      await deleteAutomationMapping(input.supabase, mapping.id);
      return input.createIfMissing ? createManagedFolder(input) : null;
    }

    const patch: Partial<Database["public"]["Tables"]["arquivos_pastas"]["Update"]> = {};
    if (folder.parent_folder_id !== input.repositoryFolderId) patch.parent_folder_id = input.repositoryFolderId;
    if (folder.nome !== input.car.id) patch.nome = input.car.id;
    if (folder.nome_slug !== slug) patch.nome_slug = slug;

    if (Object.keys(patch).length > 0) {
      const { error } = await input.supabase.from("arquivos_pastas").update(patch).eq("id", folder.id);
      if (error) {
        throw new ApiHttpError(400, "FILES_FOLDER_UPDATE_FAILED", "Falha ao atualizar pasta gerenciada.", error);
      }
    }

    const { error } = await input.supabase
      .from("arquivo_automacao_folders")
      .update({
        entity_snapshot: buildVehicleSnapshot(input.car, input.displayField),
        archived_at: null
      })
      .eq("id", mapping.id);

    if (error) {
      throw new ApiHttpError(400, "FILE_AUTOMATION_MAPPING_UPDATE_FAILED", "Falha ao atualizar vinculo de automacao.", error);
    }

    return folder.id;
  }

  return input.createIfMissing ? createManagedFolder(input) : null;
}

async function deleteEmptyManagedFolderOrKeepSnapshot(input: {
  supabase: FileAutomationSupabase;
  mapping: FileAutomationFolderRow;
  car: VehicleAutomationRow;
  displayField: VehicleFolderDisplayField;
}) {
  const fileCount = await countFilesInFolderSubtree(input.supabase, input.mapping.folder_id);
  if (fileCount === 0) {
    await deleteFolderRow(input.supabase, input.mapping.folder_id);
    return { kept: false, fileCount };
  }

  const { error } = await input.supabase
    .from("arquivo_automacao_folders")
    .update({
      entity_snapshot: buildVehicleSnapshot(input.car, input.displayField)
    })
    .eq("id", input.mapping.id);

  if (error) {
    throw new ApiHttpError(400, "FILE_AUTOMATION_MAPPING_UPDATE_FAILED", "Falha ao preservar metadados da pasta.", error);
  }

  return { kept: true, fileCount };
}

export async function syncTemFotosForCar(supabase: FileAutomationSupabase, carroId: string) {
  const mapping = await findActiveManagedFolder(supabase, "vehicle_photos", carroId);
  const hasPhotos = mapping ? (await countFilesInFolderSubtree(supabase, mapping.folder_id)) > 0 : false;

  const { data: current, error: readError } = await supabase.from("carros").select("tem_fotos").eq("id", carroId).maybeSingle();
  if (readError) {
    throw new ApiHttpError(500, "CARRO_READ_FAILED", "Falha ao ler tem_fotos do veiculo.", readError);
  }

  if (!current) return hasPhotos;

  if (current.tem_fotos !== hasPhotos) {
    const { error } = await supabase.from("carros").update({ tem_fotos: hasPhotos }).eq("id", carroId);
    if (error) {
      throw new ApiHttpError(400, "CARRO_UPDATE_FAILED", "Falha ao sincronizar tem_fotos.", error);
    }
  }

  return hasPhotos;
}

export async function ensureVehicleFileAutomations(supabase: FileAutomationSupabase, carroId: string) {
  const [car, configs] = await Promise.all([loadVehicleRowOrThrow(supabase, carroId), loadConfigMap(supabase)]);
  const displayField = normalizeDisplayField(getConfig(configs, "vehicle_photos_active").display_field);

  await ensureManagedFolder({
    supabase,
    automationKey: "vehicle_documents",
    car,
    repositoryFolderId: getConfig(configs, "vehicle_documents_active").repository_folder_id,
    displayField,
    createIfMissing: true
  });

  const sold = isVehicleSold(car);
  const photosMapping = await findActiveManagedFolder(supabase, "vehicle_photos", car.id);

  if (sold) {
    if (photosMapping) {
      const fileCount = await countFilesInFolderSubtree(supabase, photosMapping.folder_id);
      if (fileCount > 0) {
        await ensureManagedFolder({
          supabase,
          automationKey: "vehicle_photos",
          car,
          repositoryFolderId: getConfig(configs, "vehicle_photos_sold").repository_folder_id,
          displayField,
          createIfMissing: true
        });
      } else {
        await deleteFolderRow(supabase, photosMapping.folder_id);
      }
    }
  } else {
    await ensureManagedFolder({
      supabase,
      automationKey: "vehicle_photos",
      car,
      repositoryFolderId: getConfig(configs, "vehicle_photos_active").repository_folder_id,
      displayField,
      createIfMissing: true
    });
  }

  return syncTemFotosForCar(supabase, car.id);
}

export async function handleVehicleBeforeDeleteFileAutomations(supabase: FileAutomationSupabase, carroId: string) {
  const [car, configs] = await Promise.all([loadVehicleRowOrThrow(supabase, carroId), loadConfigMap(supabase)]);
  const displayField = normalizeDisplayField(getConfig(configs, "vehicle_documents_active").display_field);

  const docsMapping = await findActiveManagedFolder(supabase, "vehicle_documents", carroId);
  if (docsMapping) {
    const fileCount = await countFilesInFolderSubtree(supabase, docsMapping.folder_id);
    if (fileCount > 0) {
      const { error: folderError } = await supabase
        .from("arquivos_pastas")
        .update({
          parent_folder_id: getConfig(configs, "vehicle_documents_archive").repository_folder_id
        })
        .eq("id", docsMapping.folder_id);

      if (folderError) {
        throw new ApiHttpError(400, "FILES_FOLDER_UPDATE_FAILED", "Falha ao arquivar pasta de documentos.", folderError);
      }

      const { error: mappingError } = await supabase
        .from("arquivo_automacao_folders")
        .update({
          carro_id: null,
          entity_snapshot: buildVehicleSnapshot(car, displayField),
          archived_at: new Date().toISOString()
        })
        .eq("id", docsMapping.id);

      if (mappingError) {
        throw new ApiHttpError(400, "FILE_AUTOMATION_MAPPING_UPDATE_FAILED", "Falha ao arquivar vinculo de documentos.", mappingError);
      }
    } else {
      await deleteFolderRow(supabase, docsMapping.folder_id);
    }
  }

  const photosMapping = await findActiveManagedFolder(supabase, "vehicle_photos", carroId);
  if (photosMapping) {
    await deleteEmptyManagedFolderOrKeepSnapshot({
      supabase,
      mapping: photosMapping,
      car,
      displayField
    });
  }
}

export async function reconcileVehicleFileAutomations(supabase: FileAutomationSupabase) {
  const { data, error } = await supabase.from("carros").select("id").order("created_at", { ascending: true });

  if (error) {
    throw new ApiHttpError(500, "CARROS_LIST_FAILED", "Falha ao listar veiculos para reconciliacao.", error);
  }

  let processed = 0;
  for (const row of data ?? []) {
    await ensureVehicleFileAutomations(supabase, row.id);
    processed += 1;
  }

  return { processed };
}

export async function assertFolderTreeDoesNotContainAutomationRepository(supabase: FileAutomationSupabase, folderId: string) {
  const subtree = await listFolderSubtreeRows(supabase, folderId);
  const folderIds = subtree.map((folder) => folder.id);
  if (folderIds.length === 0) return;

  const { data, error } = await supabase
    .from("arquivo_automacao_config")
    .select("automation_key, repository_folder_id")
    .in("repository_folder_id", folderIds);

  if (error) {
    throw new ApiHttpError(500, "FILE_AUTOMATION_CONFIG_READ_FAILED", "Falha ao validar repositorios de automacao.", error);
  }

  if (data && data.length > 0) {
    throw new ApiHttpError(409, "FILE_AUTOMATION_REPOSITORY_DELETE_BLOCKED", "Nao e possivel excluir pasta usada como repositorio de automacao.", {
      repositories: data
    });
  }
}

export async function resolvePhotoCarIdsForFolders(supabase: FileAutomationSupabase, folderIds: Array<string | null | undefined>) {
  const normalizedFolderIds = Array.from(new Set(folderIds.filter((folderId): folderId is string => Boolean(folderId))));
  if (normalizedFolderIds.length === 0) return [];

  const [folders, mappings] = await Promise.all([
    listFolderRows(supabase),
    supabase
      .from("arquivo_automacao_folders")
      .select("folder_id, carro_id")
      .eq("automation_key", "vehicle_photos")
      .not("carro_id", "is", null)
  ]);

  if (mappings.error) {
    throw new ApiHttpError(500, "FILE_AUTOMATION_FOLDER_READ_FAILED", "Falha ao carregar vinculos de fotos.", mappings.error);
  }

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const carroIdByFolderId = new Map(
    (mappings.data ?? [])
      .filter((row): row is { folder_id: string; carro_id: string } => Boolean(row.carro_id))
      .map((row) => [row.folder_id, row.carro_id])
  );
  const carroIds = new Set<string>();

  for (const folderId of normalizedFolderIds) {
    let cursor: string | null | undefined = folderId;
    while (cursor) {
      const carroId = carroIdByFolderId.get(cursor);
      if (carroId) {
        carroIds.add(carroId);
        break;
      }

      cursor = folderById.get(cursor)?.parent_folder_id;
    }
  }

  return Array.from(carroIds);
}

export async function resolvePhotoCarIdsInFolderSubtree(supabase: FileAutomationSupabase, folderId: string) {
  const subtree = await listFolderSubtreeRows(supabase, folderId);
  const folderIds = subtree.map((folder) => folder.id);
  if (folderIds.length === 0) return [];

  const { data, error } = await supabase
    .from("arquivo_automacao_folders")
    .select("carro_id")
    .eq("automation_key", "vehicle_photos")
    .in("folder_id", folderIds)
    .not("carro_id", "is", null);

  if (error) {
    throw new ApiHttpError(500, "FILE_AUTOMATION_FOLDER_READ_FAILED", "Falha ao carregar vinculos de fotos.", error);
  }

  return Array.from(new Set((data ?? []).map((row) => row.carro_id).filter((carroId): carroId is string => Boolean(carroId))));
}

export async function syncPhotoFlagsForFolders(supabase: FileAutomationSupabase, folderIds: Array<string | null | undefined>) {
  const carroIds = await resolvePhotoCarIdsForFolders(supabase, folderIds);
  for (const carroId of carroIds) {
    await syncTemFotosForCar(supabase, carroId);
  }
}

export async function syncPhotoFlagsForCarIds(supabase: FileAutomationSupabase, carroIds: string[]) {
  for (const carroId of Array.from(new Set(carroIds))) {
    await syncTemFotosForCar(supabase, carroId);
  }
}
