-- Remove o sistema de fluxos /editor (inutilizado): tabelas + funcoes set_updated_at.
-- Os triggers caem junto com as tabelas; a FK editor_flow_runs_flow_id_fkey e interna
-- (runs -> flows). Nenhuma tabela externa referencia as editor_*.
drop table if exists public.editor_flow_runs cascade;
drop table if exists public.editor_flows cascade;
drop table if exists public.editor_user_variables cascade;
drop function if exists public.fn_editor_flow_runs_set_updated_at() cascade;
drop function if exists public.fn_editor_flows_set_updated_at() cascade;
drop function if exists public.fn_editor_user_variables_set_updated_at() cascade;
