-- Documentos: o CRLV só fica VIRADO com o titular (responsavel_virado).
-- Pedido do Kaic (2026-11-07): "não é possível o estado da transferência ficar
-- virado sem antes ter o responsável definido, e se o usuário definir o
-- responsável, o veículo deve ficar virado automaticamente" (a 2ª parte já
-- existia). Só muda regra de trigger — sem coluna nova. Hoje nenhum VIRADO está
-- sem titular (98/98). A automação de arquivos segue marcando VIRADO pelo
-- documento classificado (flag de transação rn.crlv_por_arquivo).

CREATE OR REPLACE FUNCTION public.fn_documentos_normaliza_crlv()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_resp text := upper(btrim(coalesce(new.responsavel_virado, '')));
  v_estado_mudou boolean;
  v_resp_mudou boolean;
begin
  if tg_op = 'INSERT' then
    -- No INSERT o default da coluna (AGUARDANDO) nao conta como escolha.
    v_estado_mudou := coalesce(new.estado_transferencia, 'AGUARDANDO') <> 'AGUARDANDO';
    v_resp_mudou := true;
  else
    v_estado_mudou := new.estado_transferencia is distinct from old.estado_transferencia;
    v_resp_mudou := new.responsavel_virado is distinct from old.responsavel_virado;
  end if;

  if v_resp in ('NÃO CHEGOU', 'NAO CHEGOU') then
    new.estado_transferencia := 'AGUARDANDO';
    new.responsavel_virado := null;
  elsif v_resp in ('PROCURAÇÃO', 'PROCURACAO') then
    new.estado_transferencia := 'PROCURACAO';
    new.responsavel_virado := null;
  elsif v_resp = 'BRANCO' then
    new.estado_transferencia := 'BRANCO';
    new.responsavel_virado := null;
  elsif v_resp = '' then
    new.responsavel_virado := null;
  elsif v_resp_mudou and not v_estado_mudou then
    -- Titular informado (sem escolher a situacao) = CRLV virado no nome dele.
    new.estado_transferencia := 'VIRADO';
  end if;

  if new.estado_transferencia is null then
    new.estado_transferencia := 'AGUARDANDO';
  end if;
  -- VIRADO so com titular (Kaic, 2026-11-07): informar o titular ja vira
  -- sozinho (acima); escolher VIRADO sem titular, ou apagar o titular de um
  -- VIRADO, e barrado. Excecao: a automacao de arquivos (CRLV VIRADO
  -- classificado) marca VIRADO pelo documento — o titular fica pendente.
  if new.estado_transferencia = 'VIRADO'
     and nullif(btrim(coalesce(new.responsavel_virado, '')), '') is null
     and (v_estado_mudou or v_resp_mudou)
     and coalesce(current_setting('rn.crlv_por_arquivo', true), '') <> 'on' then
    raise exception 'REGRA: O CRLV só fica VIRADO com o titular. Informe o responsável (o CRLV vira sozinho) ou escolha outra situação.'
      using errcode = 'P0001';
  end if;

  -- Titular so existe com o CRLV virado.
  if new.estado_transferencia <> 'VIRADO' then
    new.responsavel_virado := null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_documentos_reparse_carro(p_carro_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_placa text;
  v_root_folder uuid;
  v_paused boolean;
  v_file record;
  v_tokens jsonb;
  v_rank int := 0;
  v_file_rank int;
  v_crlv text;
  v_envelope text;
  v_rank_atual int;
begin
  select c.placa::text into v_placa from public.carros c where c.id = p_carro_id;
  if v_placa is null then return; end if;

  select folder_id, automation_paused into v_root_folder, v_paused
    from public.arquivo_automacao_folders
   where automation_key = 'vehicle_documents' and carro_id = p_carro_id and archived_at is null
   limit 1;
  if v_root_folder is null then return; end if;
  if coalesce(v_paused, false) then return; end if;

  for v_file in
    with recursive subtree(folder_id) as (
      select v_root_folder
      union all
      select f.id from public.arquivos_pastas f join subtree s on f.parent_folder_id = s.folder_id
    )
    select a.id, a.nome_arquivo
      from public.arquivos_arquivos a join subtree s on s.folder_id = a.pasta_id
     order by a.created_at asc, a.id asc
  loop
    v_tokens := public.fn_documentos_parse_token(v_file.nome_arquivo, v_placa);

    -- Mais forte vence: VIRADO (3) > PROCURACAO (2) > BRANCO (1).
    if v_tokens ? 'crlv' then
      v_file_rank := case v_tokens->>'crlv' when 'VIRADO' then 3 when 'PROCURACAO' then 2 else 1 end;
      if v_file_rank > v_rank then
        v_rank := v_file_rank;
        v_crlv := v_tokens->>'crlv';
      end if;
    end if;
    if v_tokens ? 'envelope' then v_envelope := v_tokens->>'envelope'; end if;

    if v_tokens ? 'nota' then
      insert into public.notas_fiscais (carro_id, tipo, arquivo_id)
      values (p_carro_id, v_tokens->>'nota', v_file.id)
      on conflict (arquivo_id) do nothing;
    end if;
    if v_tokens ? 'pericia' then
      insert into public.pericias (carro_id, arquivo_id)
      values (p_carro_id, v_file.id)
      on conflict (arquivo_id) do nothing;
    end if;
  end loop;

  if v_crlv is null and v_envelope is null then return; end if;

  select case d.estado_transferencia when 'VIRADO' then 3 when 'PROCURACAO' then 2 when 'BRANCO' then 1 else 0 end
    into v_rank_atual
    from public.documentos d where d.carro_id = p_carro_id;

  -- A situacao vem do ARQUIVO (CRLV VIRADO classificado): libera a regra
  -- "VIRADO so com titular" so nesta gravacao.
  perform set_config('rn.crlv_por_arquivo', 'on', true);
  insert into public.documentos as d (carro_id, estado_transferencia, envelope)
  values (p_carro_id, coalesce(v_crlv, 'AGUARDANDO'), v_envelope)
  on conflict (carro_id) do update set
    -- Arquivo nunca rebaixa a situacao (so sobe).
    estado_transferencia = case when v_crlv is not null and v_rank > coalesce(v_rank_atual, 0) then v_crlv else d.estado_transferencia end,
    envelope = coalesce(v_envelope, d.envelope),
    updated_at = now()
  where (v_crlv is not null and v_rank > coalesce(v_rank_atual, 0))
     or (v_envelope is not null and d.envelope is distinct from v_envelope);
  perform set_config('rn.crlv_por_arquivo', '', true);
end;
$function$;
