-- Toggle de automacao por pasta de documentos do veiculo ("botao Automatizar").
--
-- Contexto: as colunas de `documentos` (tipo_de_processo, proposito, pericia,
-- chave_reserva, estado_transferencia, ...) sao preenchidas por um parser que
-- le os nomes dos arquivos da pasta de documentos do carro, disparado por
-- trigger em arquivos_arquivos (fn_documentos_handle_arquivo_change ->
-- fn_documentos_reparse_carro). Agora os campos sao editaveis a mao no form,
-- entao o usuario precisa poder BLOQUEAR a automacao numa pasta especifica para
-- que a edicao manual nao seja sobrescrita no proximo reparse.
--
-- Modelo: flag `automation_paused` no mapeamento da pasta gerenciada. Quando
-- true, o reparse para aquele carro nao mexe em `documentos` (preserva o que
-- estiver la). Padrao false => todas as pastas seguem automatizadas como hoje.

begin;

alter table public.arquivo_automacao_folders
  add column if not exists automation_paused boolean not null default false;

comment on column public.arquivo_automacao_folders.automation_paused is
  'Quando true, o reparse automatico de documentos (parser de nomes de arquivo) e ignorado para esta pasta/carro. Edicao manual em documentos passa a ser preservada. Controlado pelo botao "Automatizar" na pasta.';

-- Reescreve o reparse adicionando o guard de pausa logo apos localizar a pasta
-- gerenciada. Corpo identico ao da migration 20260527220000 fora o guard.
create or replace function public.fn_documentos_reparse_carro(p_carro_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_placa text; v_root_folder uuid; v_paused boolean; v_acc jsonb := '{}'::jsonb; v_file record;
begin
  select c.placa::text into v_placa from public.carros c where c.id = p_carro_id;
  if v_placa is null then return; end if;

  select folder_id, automation_paused into v_root_folder, v_paused
    from public.arquivo_automacao_folders
   where automation_key = 'vehicle_documents' and carro_id = p_carro_id and archived_at is null
   limit 1;
  if v_root_folder is null then return; end if;

  -- Automacao pausada para esta pasta: nao toca em documentos (edicao manual fica).
  if coalesce(v_paused, false) then return; end if;

  for v_file in
    with recursive subtree(folder_id) as (
      select v_root_folder
      union all
      select f.id from public.arquivos_pastas f join subtree s on f.parent_folder_id = s.folder_id
    )
    select a.nome_arquivo, a.created_at
      from public.arquivos_arquivos a join subtree s on s.folder_id = a.pasta_id
     order by a.created_at asc, a.id asc
  loop
    v_acc := v_acc || public.fn_documentos_parse_token(v_file.nome_arquivo, v_placa);
  end loop;

  if v_acc = '{}'::jsonb then return; end if;

  insert into public.documentos as d (
    carro_id, tipo_de_processo, proposito, chave_reserva, pericia, envelope, estado_transferencia, recibo_compra
  ) values (
    p_carro_id, v_acc->>'tipo_de_processo', v_acc->>'proposito', v_acc->>'chave_reserva',
    v_acc->>'pericia', v_acc->>'envelope', v_acc->>'estado_transferencia', v_acc->>'recibo_compra'
  )
  on conflict (carro_id) do update set
    tipo_de_processo = coalesce(excluded.tipo_de_processo, d.tipo_de_processo),
    proposito = coalesce(excluded.proposito, d.proposito),
    chave_reserva = coalesce(excluded.chave_reserva, d.chave_reserva),
    pericia = coalesce(excluded.pericia, d.pericia),
    envelope = coalesce(excluded.envelope, d.envelope),
    estado_transferencia = coalesce(excluded.estado_transferencia, d.estado_transferencia),
    recibo_compra = coalesce(excluded.recibo_compra, d.recibo_compra),
    updated_at = now();
end;
$function$;
revoke execute on function public.fn_documentos_reparse_carro(uuid) from public, anon, authenticated;

commit;
