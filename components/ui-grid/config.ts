import type { SheetConfig } from "@/components/ui-grid/types";

export const SHEETS: SheetConfig[] = [
  {
    key: "carros",
    label: "CARROS",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at", "ultima_alteracao"],
    rowClassName: (row) => {
      if (row.em_estoque === false) return "sheet-row-sold";
      return "";
    }
  },
  {
    key: "anuncios",
    label: "ANUNCIOS",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"],
    rowClassName: (row) => {
      if (row.valor_anuncio == null) return "sheet-row-warning";
      return "";
    }
  },
  {
    key: "modelos",
    label: "MODELOS",
    primaryKey: "id",
    lockedColumns: ["id", "created_at", "updated_at"]
  },
  {
    key: "grupos_repetidos",
    label: "REPETIDOS_GRUPOS",
    primaryKey: "grupo_id",
    readOnly: true,
    lockedColumns: ["grupo_id", "created_at", "updated_at", "atualizado_em"],
    rowClassName: (row) => {
      if (typeof row.qtde === "number" && row.qtde > 1) return "sheet-row-repeated";
      return "";
    }
  },
  {
    key: "repetidos",
    label: "REPETIDOS",
    primaryKey: "carro_id",
    readOnly: true,
    lockedColumns: ["carro_id", "grupo_id", "created_at", "updated_at"]
  }
];

export const DEFAULT_SHEET: SheetConfig = SHEETS[0];
