-- =====================================================================
-- Unifica os 9 lookups "puros" (dominios de documentos/vendas) numa unica
-- tabela public.lookups, preservando integridade FORTE via FK composta
-- (coluna-dominio constante + code).
--
-- Escopo (Set 1): estados_chave_reserva, estados_envelope, estados_pericia,
--   estados_recibo_compra, estados_transferencia, origens_veiculo,
--   propositos, tipos_processo, canais_cliente.
-- NAO toca: lookups de status (sale_statuses, announcement_statuses,
--   vehicle_states, locations -> FKs do core de carros/anuncios) nem os
--   sensiveis (user_roles, user_statuses, audit_actions).
--
-- Baseado no schema REAL de producao (o historico de migrations no git
-- divergiu: lookup_remetentes nao existe no remoto; a coluna e documentos.origem).
-- =====================================================================

-- 1) Tabela unificada -------------------------------------------------
create table if not exists public.lookups (
  domain      text not null,
  code        text not null,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (domain, code)
);

alter table public.lookups enable row level security;

comment on table public.lookups is
  'Tabela unica de dominios (lookups) nao sensiveis. PK (domain, code). RLS habilitada sem policy: acesso apenas via service_role.';

-- 2) Migracao de dados (ANTES do trigger de timestamps, p/ preservar created_at)
insert into public.lookups (domain, code, name, description, is_active, sort_order, created_at, updated_at)
            select 'estados_chave_reserva', code, name, description, is_active, sort_order, created_at, updated_at from public.lookup_estados_chave_reserva
  union all select 'estados_envelope',       code, name, description, is_active, sort_order, created_at, updated_at from public.lookup_estados_envelope
  union all select 'estados_pericia',         code, name, description, is_active, sort_order, created_at, updated_at from public.lookup_estados_pericia
  union all select 'estados_recibo_compra',   code, name, description, is_active, sort_order, created_at, updated_at from public.lookup_estados_recibo_compra
  union all select 'estados_transferencia',   code, name, description, is_active, sort_order, created_at, updated_at from public.lookup_estados_transferencia
  union all select 'origens_veiculo',         code, name, description, is_active, sort_order, created_at, updated_at from public.lookup_origens_veiculo
  union all select 'propositos',              code, name, description, is_active, sort_order, created_at, updated_at from public.lookup_propositos
  union all select 'tipos_processo',          code, name, description, is_active, sort_order, created_at, updated_at from public.lookup_tipos_processo
  union all select 'canais_cliente',          code, name, description, is_active, sort_order, created_at, updated_at from public.lookup_canais_cliente
on conflict (domain, code) do nothing;

-- 3) Trigger de timestamps (DEPOIS do seed) --------------------------
drop trigger if exists trg_lookups_timestamps on public.lookups;
create trigger trg_lookups_timestamps
before insert or update on public.lookups
for each row execute function public.fn_set_timestamps();

-- 4) Dropar as FKs antigas que apontam para as 9 tabelas (name-independent)
do $do$
declare r record;
begin
  for r in
    select n.nspname as sch, rel.relname as tbl, con.conname as cname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    where con.contype = 'f'
      and ref.relname in (
        'lookup_estados_chave_reserva','lookup_estados_envelope','lookup_estados_pericia',
        'lookup_estados_recibo_compra','lookup_estados_transferencia','lookup_origens_veiculo',
        'lookup_propositos','lookup_tipos_processo','lookup_canais_cliente'
      )
  loop
    execute format('alter table %I.%I drop constraint %I', r.sch, r.tbl, r.cname);
  end loop;
end
$do$;

-- 5) Reescrever como FK COMPOSTA: coluna-dominio constante + code -----
--    on update cascade on delete restrict (remocao de dominio = soft-delete is_active=false)

-- documentos (8 colunas)
alter table public.documentos
  add column if not exists chave_reserva_domain        text not null default 'estados_chave_reserva' check (chave_reserva_domain = 'estados_chave_reserva'),
  add column if not exists envelope_domain             text not null default 'estados_envelope'      check (envelope_domain = 'estados_envelope'),
  add column if not exists pericia_domain              text not null default 'estados_pericia'       check (pericia_domain = 'estados_pericia'),
  add column if not exists recibo_compra_domain        text not null default 'estados_recibo_compra' check (recibo_compra_domain = 'estados_recibo_compra'),
  add column if not exists estado_transferencia_domain text not null default 'estados_transferencia' check (estado_transferencia_domain = 'estados_transferencia'),
  add column if not exists origem_domain               text not null default 'origens_veiculo'       check (origem_domain = 'origens_veiculo'),
  add column if not exists proposito_domain            text not null default 'propositos'            check (proposito_domain = 'propositos'),
  add column if not exists tipo_de_processo_domain     text not null default 'tipos_processo'        check (tipo_de_processo_domain = 'tipos_processo');

alter table public.documentos drop constraint if exists documentos_chave_reserva_lookups_fkey;
alter table public.documentos drop constraint if exists documentos_envelope_lookups_fkey;
alter table public.documentos drop constraint if exists documentos_pericia_lookups_fkey;
alter table public.documentos drop constraint if exists documentos_recibo_compra_lookups_fkey;
alter table public.documentos drop constraint if exists documentos_estado_transferencia_lookups_fkey;
alter table public.documentos drop constraint if exists documentos_origem_lookups_fkey;
alter table public.documentos drop constraint if exists documentos_proposito_lookups_fkey;
alter table public.documentos drop constraint if exists documentos_tipo_de_processo_lookups_fkey;

alter table public.documentos
  add constraint documentos_chave_reserva_lookups_fkey        foreign key (chave_reserva_domain, chave_reserva)               references public.lookups (domain, code) on update cascade on delete restrict,
  add constraint documentos_envelope_lookups_fkey             foreign key (envelope_domain, envelope)                         references public.lookups (domain, code) on update cascade on delete restrict,
  add constraint documentos_pericia_lookups_fkey              foreign key (pericia_domain, pericia)                           references public.lookups (domain, code) on update cascade on delete restrict,
  add constraint documentos_recibo_compra_lookups_fkey        foreign key (recibo_compra_domain, recibo_compra)               references public.lookups (domain, code) on update cascade on delete restrict,
  add constraint documentos_estado_transferencia_lookups_fkey foreign key (estado_transferencia_domain, estado_transferencia) references public.lookups (domain, code) on update cascade on delete restrict,
  add constraint documentos_origem_lookups_fkey              foreign key (origem_domain, origem)                             references public.lookups (domain, code) on update cascade on delete restrict,
  add constraint documentos_proposito_lookups_fkey            foreign key (proposito_domain, proposito)                       references public.lookups (domain, code) on update cascade on delete restrict,
  add constraint documentos_tipo_de_processo_lookups_fkey     foreign key (tipo_de_processo_domain, tipo_de_processo)         references public.lookups (domain, code) on update cascade on delete restrict;

-- vendas (1 coluna)
alter table public.vendas
  add column if not exists canal_cliente_domain text not null default 'canais_cliente' check (canal_cliente_domain = 'canais_cliente');
alter table public.vendas drop constraint if exists vendas_canal_cliente_lookups_fkey;
alter table public.vendas
  add constraint vendas_canal_cliente_lookups_fkey foreign key (canal_cliente_domain, canal_cliente) references public.lookups (domain, code) on update cascade on delete restrict;

-- 6) Reescrever fn_documentos_parse_token para ler de public.lookups --
create or replace function public.fn_documentos_parse_token(p_filename text, p_carro_placa text)
returns jsonb
language plpgsql
stable
set search_path to ''
as $fn$
declare
  v_norm text; v_placa text; v_result jsonb := '{}'::jsonb; v_match text;
begin
  if p_filename is null or p_carro_placa is null then return '{}'::jsonb; end if;
  v_norm := lower(p_filename);
  v_placa := lower(btrim(p_carro_placa));
  if v_placa = '' then return '{}'::jsonb; end if;

  select code into v_match from public.lookups
   where domain = 'tipos_processo' and is_active and v_norm like '%tipo_de_processo_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('tipo_de_processo', v_match); v_match := null; end if;

  select code into v_match from public.lookups
   where domain = 'propositos' and is_active and v_norm like '%proposito_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('proposito', v_match); v_match := null; end if;

  select code into v_match from public.lookups
   where domain = 'estados_chave_reserva' and is_active and v_norm like '%chave_reserva_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('chave_reserva', v_match); v_match := null; end if;

  select code into v_match from public.lookups
   where domain = 'estados_pericia' and is_active and v_norm like '%pericia_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('pericia', v_match); v_match := null; end if;

  select code into v_match from public.lookups
   where domain = 'estados_envelope' and is_active and v_norm like '%envelope_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('envelope', v_match); v_match := null; end if;

  select code into v_match from public.lookups
   where domain = 'estados_transferencia' and is_active and v_norm like '%estado_transferencia_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('estado_transferencia', v_match); v_match := null; end if;

  select code into v_match from public.lookups
   where domain = 'estados_recibo_compra' and is_active and v_norm like '%recibo_compra_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('recibo_compra', v_match); v_match := null; end if;

  return v_result;
end;
$fn$;

-- 7) Dropar as 9 tabelas do Set 1 ------------------------------------
drop table public.lookup_estados_chave_reserva;
drop table public.lookup_estados_envelope;
drop table public.lookup_estados_pericia;
drop table public.lookup_estados_recibo_compra;
drop table public.lookup_estados_transferencia;
drop table public.lookup_origens_veiculo;
drop table public.lookup_propositos;
drop table public.lookup_tipos_processo;
drop table public.lookup_canais_cliente;
