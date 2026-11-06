/**
 * Catálogo de destinos do OCR = colunas EDITÁVEIS das tabelas do grid que se
 * ligam ao veículo da pasta: a própria `carros`, tabelas com `carro_id` (1
 * registro por veículo, ex.: documentos) e tabelas com `arquivo_id` (1 registro
 * por ARQUIVO: notas fiscais, perícias — grava no registro do arquivo enviado).
 *
 * Invariante #4: o cliente só manda a chave `tabela.coluna`; o servidor
 * reconstrói este catálogo a partir de GRID_TABLE_POLICIES/grid-config e
 * recusa qualquer chave fora dele. Puro (recebe as configs), testável.
 */

export type OcrColumnType = "string" | "number" | "boolean" | "date" | "unknown";

export type OcrCatalogColumn = {
  key: string;
  table: string;
  column: string;
  label: string;
  type: OcrColumnType;
};

export type OcrCatalogTable = {
  table: string;
  label: string;
  /** Como a linha é achada: o próprio veículo, o registro com carro_id dele ou o do arquivo. */
  link: "vehicle" | "carro_id" | "arquivo";
  columns: OcrCatalogColumn[];
};

export type OcrCatalogSourceConfig = {
  table: string;
  label: string;
  primaryKey: string;
  readOnly?: boolean;
  readableColumns: string[];
  editableColumns: string[];
  virtualColumns: string[];
  columnTypes?: Record<string, OcrColumnType>;
};

/** Tabelas de vínculo N:N (PK composta) não fazem sentido como destino. */
const EXCLUDED_TABLES = new Set(["carro_caracteristicas_tecnicas", "carro_caracteristicas_visuais"]);

const COLUMN_LABELS: Record<string, string> = {
  placa: "Placa",
  chassi: "Chassi",
  renavam: "Renavam",
  ano_fab: "Ano de fabricação",
  ano_mod: "Ano do modelo",
  ano_ipva_pago: "Ano do IPVA pago",
  hodometro: "Hodômetro (km)",
  cor: "Cor",
  nome: "Nome",
  local: "Local",
  estado_venda: "Estado de venda",
  estado_veiculo: "Estado do veículo",
  estado_anuncio: "Estado do anúncio",
  crv: "CRV (número)",
  crv_codigo_seguranca: "Código de segurança do CRV",
  estado_transferencia: "Situação do CRLV",
  responsavel_virado: "Titular do CRLV virado",
  contato: "Contato",
  valor_compra: "Valor de compra",
  preco_original: "Preço original",
  data_entrada: "Data de entrada",
  data_venda: "Data da venda",
  observacao: "Observação",
  numero: "Número",
  serie: "Série",
  chave_acesso: "Chave de acesso (44 dígitos)",
  data_emissao: "Data de emissão",
  valor: "Valor",
  autorizada: "Autorizada",
  data_pericia: "Data da perícia",
  status: "Status"
};

/**
 * Colunas que o OCR não grava: FKs (uuid não sai de documento), o vínculo com o
 * arquivo e o tipo da nota (vem do tipo do documento classificado).
 */
function isOcrWritableColumn(table: string, column: string) {
  if (column.endsWith("_id")) return false;
  return !(table === "notas_fiscais" && column === "tipo");
}

export function humanizeColumn(column: string) {
  const known = COLUMN_LABELS[column];
  if (known) return known;
  const text = column.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildOcrCatalog(configs: OcrCatalogSourceConfig[]): OcrCatalogTable[] {
  const tables: OcrCatalogTable[] = [];
  for (const config of configs) {
    if (config.readOnly || EXCLUDED_TABLES.has(config.table)) continue;
    const link =
      config.table === "carros"
        ? "vehicle"
        : config.readableColumns.includes("arquivo_id") && config.readableColumns.includes("carro_id")
          ? "arquivo"
          : config.readableColumns.includes("carro_id")
            ? "carro_id"
            : null;
    if (!link) continue;
    const virtual = new Set(config.virtualColumns);
    const columns = config.editableColumns
      .filter(
        (column) =>
          column !== config.primaryKey &&
          column !== "id" &&
          !column.startsWith("__") &&
          !virtual.has(column) &&
          isOcrWritableColumn(config.table, column)
      )
      .map((column) => ({
        key: `${config.table}.${column}`,
        table: config.table,
        column,
        label: humanizeColumn(column),
        type: config.columnTypes?.[column] ?? "unknown"
      }));
    if (columns.length > 0) tables.push({ table: config.table, label: config.label, link, columns });
  }
  // Veículo primeiro; o resto por nome.
  return tables.sort((left, right) => (left.table === "carros" ? -1 : right.table === "carros" ? 1 : left.label.localeCompare(right.label, "pt-BR")));
}

export function findCatalogColumn(catalog: OcrCatalogTable[], key: string) {
  for (const table of catalog) {
    const column = table.columns.find((entry) => entry.key === key);
    if (column) return { table, column };
  }
  return null;
}

// ------------------------------------------------- validação/format por tipo

function parseNumber(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "");
  // "45.000" / "1.234,56" (pt-BR) e "1234.56".
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, "") : cleaned;
  const number = Number(normalized);
  return normalized !== "" && Number.isFinite(number) ? number : null;
}

function parseBoolean(value: string) {
  const token = value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (["sim", "s", "true", "verdadeiro", "x", "1", "ok"].includes(token)) return true;
  if (["nao", "n", "false", "falso", "0", "-"].includes(token)) return false;
  return null;
}

function parseDate(value: string) {
  const text = value.trim();
  const br = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const [year, month, day] = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : [];
  if (!year) return null;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day) ? null : `${year}-${month}-${day}`;
}

/** Validação/format genéricos pelo tipo da coluna (as especiais têm regra própria em destinations.ts). */
export function typedValue(type: OcrColumnType, raw: string): { ok: true; value: string | number | boolean } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Vazio." };
  if (type === "number") {
    const number = parseNumber(value);
    return number === null ? { ok: false, error: "Número inválido." } : { ok: true, value: number };
  }
  if (type === "boolean") {
    const bool = parseBoolean(value);
    return bool === null ? { ok: false, error: "Use sim/não." } : { ok: true, value: bool };
  }
  if (type === "date") {
    const date = parseDate(value);
    return date === null ? { ok: false, error: "Data inválida (dd/mm/aaaa)." } : { ok: true, value: date };
  }
  return value.length > 4000 ? { ok: false, error: "Texto longo demais." } : { ok: true, value };
}
