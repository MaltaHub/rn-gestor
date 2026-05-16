import type { Database } from "@/lib/supabase/database.types";

export type PublicSchema = Database["public"];
export type Tables = PublicSchema["Tables"];
export type TableName = keyof Tables;

export type Row<T extends TableName> = Tables[T]["Row"];
export type Insert<T extends TableName> = Tables[T]["Insert"];
export type Update<T extends TableName> = Tables[T]["Update"];

export type CarroRow = Row<"carros">;
export type CarroInsert = Insert<"carros">;
export type CarroUpdate = Update<"carros">;

export type ArquivosPastaRow = Row<"arquivos_pastas">;
export type ArquivosPastaInsert = Insert<"arquivos_pastas">;
export type ArquivosArquivoRow = Row<"arquivos_arquivos">;
export type ArquivosArquivoInsert = Insert<"arquivos_arquivos">;
export type ArquivoAutomacaoConfigRow = Row<"arquivo_automacao_config">;
export type ArquivoAutomacaoFolderRow = Row<"arquivo_automacao_folders">;

export type ModeloRow = Row<"modelos">;
export type ModeloInsert = Insert<"modelos">;

export type AnuncioRow = Row<"anuncios">;
export type AnuncioInsert = Insert<"anuncios">;

export type VendaRow = Row<"vendas">;
export type VendaInsert = Insert<"vendas">;
export type VendaUpdate = Update<"vendas">;

export type AuditRow = Row<"log_alteracoes">;
export type AuditInsert = Insert<"log_alteracoes">;

export type RoleCode = Row<"lookup_user_roles">["code"];
export type SaleStatusCode = Row<"lookup_sale_statuses">["code"];
export type AnnouncementStatusCode = Row<"lookup_announcement_statuses">["code"];
export type LocationCode = Row<"lookup_locations">["code"];
