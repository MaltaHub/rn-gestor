-- =====================================================================
-- CONTRACT: remove a maquina de BACKFILL do backup (nao escalava via
-- Apps Script: limite de 6 min/execucao, cota de UrlFetch, throughput do
-- Sheets). A carga inicial passa a ser MANUAL (Importer de CSV no proprio
-- Apps Script) e o espelho e mantido pela trigger de CONTENCAO.
--
-- MANTIDOS (contencao — NAO remover):
--   - public.backup_row_webhook()        (trigger generica nas 34 tabelas)
--   - public.dispatch_backup_payload()   (POST fire-and-forget p/ Apps Script)
--   - trigger trg_backup_row_webhook em cada tabela
--
-- REMOVIDOS (backfill — orfaos apos apagar a rota/UI /admin/backup):
-- =====================================================================
drop function if exists public.backup_backfill(text[], integer);
drop function if exists public.backup_plan();
drop function if exists public.backup_chunk(text, int, int);
drop function if exists public.backup_target();
drop function if exists public.backup_tables_();
