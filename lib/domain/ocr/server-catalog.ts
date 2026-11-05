import { listGridTableConfigs } from "@/lib/api/grid-config";
import { buildOcrCatalog, type OcrCatalogTable } from "@/lib/domain/ocr/catalog";

let cached: OcrCatalogTable[] | null = null;

/** Catálogo de destinos do OCR derivado da config do grid (fonte única da allow-list). */
export function getOcrCatalog(): OcrCatalogTable[] {
  cached ??= buildOcrCatalog(
    listGridTableConfigs().map((config) => ({
      table: config.table,
      label: config.label,
      primaryKey: config.primaryKey,
      readOnly: config.readOnly,
      readableColumns: config.readableColumns,
      editableColumns: config.editableColumns,
      virtualColumns: config.virtualColumns,
      columnTypes: config.columnTypes
    }))
  );
  return cached;
}
