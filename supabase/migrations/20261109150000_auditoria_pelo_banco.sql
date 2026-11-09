-- Auditoria pelo BANCO (substitui a gravação manual que o app fazia em cada serviço).
--
-- Problema: o app só auditava o que ele mesmo gravava; tudo que as automações do banco faziam
-- (classificar um CRLV vira VIRADO, envelope, cascatas, finalização, cron) ficava de fora, e o
-- log guardava a linha inteira antes/depois — regravar o mesmo valor aparecia como "só updated_at".
--
-- Agora:
--  * 1 trigger genérica (trg_00_auditoria → fn_auditoria_registrar) em cada tabela auditada;
--  * UPDATE guarda SÓ os campos que mudaram (sem updated_at & cia); se nada mudou, não registra;
--  * autor = usuário do app (cabeçalhos x-rn-* que o servidor manda em cada chamada);
--    alteração automática (feita por outra trigger, cascata, cron ou rotina sem usuário) = SISTEMA,
--    com o "efeito da ação de <usuário>" em detalhes;
--  * lote_id = id da requisição: junta a ação do usuário com o que a automação fez em seguida;
--  * o veículo (carro_id + placa) vai em "__veiculo" nos dados, para filtrar por placa;
--  * retenção por tabela: 30 dias OU as 5.000 linhas mais novas (o que for menor), de hora em hora.
--
-- Sem campo novo: usa as colunas que log_alteracoes já tem.

-- ------------------------------------------------------------------ base64 (cabeçalhos UTF-8)
create or replace function public.fn_auditoria_b64(p_valor text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_valor is null or p_valor = '' then
    return null;
  end if;
  return convert_from(decode(p_valor, 'base64'), 'UTF8');
exception when others then
  return null;
end;
$$;

-- ------------------------------------------------------------------ veículo da linha (placa)
create or replace function public.fn_auditoria_veiculo(p_tabela text, p_linha jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_carro uuid;
  v_placa text;
  v_pasta uuid;
  v_nivel integer := 0;
begin
  if p_linha is null then
    return null;
  end if;

  if p_tabela = 'carros' then
    return jsonb_build_object('carro_id', p_linha ->> 'id', 'placa', p_linha ->> 'placa');
  elsif p_tabela = 'finalizados' then
    return jsonb_build_object('placa', p_linha ->> 'placa');
  elsif p_tabela = 'venda_entradas' then
    select v.carro_id into v_carro from public.vendas v where v.id = (p_linha ->> 'venda_id')::uuid;
  elsif p_tabela = 'anuncios_insight_verifications' then
    select a.carro_id into v_carro from public.anuncios a where a.id = (p_linha ->> 'anuncio_id')::uuid;
  elsif p_tabela in ('arquivos_arquivos', 'arquivos_pastas') then
    -- Sobe a árvore até a pasta de automação do veículo.
    v_pasta := case when p_tabela = 'arquivos_arquivos' then (p_linha ->> 'pasta_id')::uuid else (p_linha ->> 'id')::uuid end;
    while v_pasta is not null and v_nivel < 8 loop
      select f.carro_id into v_carro
      from public.arquivo_automacao_folders f
      where f.folder_id = v_pasta and f.carro_id is not null
      limit 1;
      exit when v_carro is not null;
      if v_nivel = 0 and p_tabela = 'arquivos_pastas' then
        v_pasta := (p_linha ->> 'parent_folder_id')::uuid;
      else
        select p.parent_folder_id into v_pasta from public.arquivos_pastas p where p.id = v_pasta;
      end if;
      v_nivel := v_nivel + 1;
    end loop;
  elsif p_linha ? 'carro_id' then
    v_carro := nullif(p_linha ->> 'carro_id', '')::uuid;
  end if;

  if v_carro is null then
    return null;
  end if;
  select c.placa::text into v_placa from public.carros c where c.id = v_carro;
  return jsonb_strip_nulls(jsonb_build_object('carro_id', v_carro, 'placa', v_placa));
exception when others then
  return null;
end;
$$;

-- ------------------------------------------------------------------ trigger genérica
-- Argumentos: 0 = colunas da PK (separadas por vírgula); 1 = colunas grandes (registra só
-- "alterado", sem o conteúdo); 2 = colunas que não contam como alteração (além das globais).
create or replace function public.fn_auditoria_registrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pk_cols text[] := string_to_array(coalesce(nullif(tg_argv[0], ''), 'id'), ',');
  v_omitir text[] := string_to_array(coalesce(tg_argv[1], ''), ',');
  v_ignorar text[] := array['updated_at', 'ultima_alteracao', 'updated_by', 'updated_by_user_id']
    || string_to_array(coalesce(tg_argv[2], ''), ',');
  v_tabela text := case when tg_table_schema = 'public' then tg_table_name else tg_table_schema || '.' || tg_table_name end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_linha jsonb := coalesce(v_new, v_old);
  v_omitido jsonb := jsonb_build_object('__omitido', true);
  v_antes jsonb;
  v_depois jsonb;
  v_coluna text;
  v_pk text;
  v_veiculo jsonb;
  v_headers jsonb;
  v_papel text;
  v_ator_id uuid;
  v_ator_nome text;
  v_ator_email text;
  v_ator_cargo text;
  v_detalhe text;
  v_lote text;
  v_em_lote boolean := false;
  v_automatico boolean := pg_trigger_depth() > 1;
  v_autor text;
  v_detalhes text;
begin
  begin
    -- 1) O que mudou.
    if tg_op = 'UPDATE' then
      v_antes := '{}'::jsonb;
      v_depois := '{}'::jsonb;
      for v_coluna in select jsonb_object_keys(v_new) loop
        continue when v_coluna = any(v_ignorar);
        if (v_old -> v_coluna) is distinct from (v_new -> v_coluna) then
          if v_coluna = any(v_omitir) then
            v_antes := v_antes || jsonb_build_object(v_coluna, v_omitido);
            v_depois := v_depois || jsonb_build_object(v_coluna, v_omitido);
          else
            v_antes := v_antes || jsonb_build_object(v_coluna, v_old -> v_coluna);
            v_depois := v_depois || jsonb_build_object(v_coluna, v_new -> v_coluna);
          end if;
        end if;
      end loop;
      if v_depois = '{}'::jsonb then
        return null; -- só carimbo de data/autor: não é alteração
      end if;
    elsif tg_op = 'INSERT' then
      v_depois := v_new - v_omitir;
      foreach v_coluna in array v_omitir loop
        if v_new ? v_coluna and jsonb_typeof(v_new -> v_coluna) <> 'null' then
          v_depois := v_depois || jsonb_build_object(v_coluna, v_omitido);
        end if;
      end loop;
    else
      v_antes := v_old - v_omitir;
      foreach v_coluna in array v_omitir loop
        if v_old ? v_coluna and jsonb_typeof(v_old -> v_coluna) <> 'null' then
          v_antes := v_antes || jsonb_build_object(v_coluna, v_omitido);
        end if;
      end loop;
    end if;

    select string_agg(coalesce(v_linha ->> t.coluna, ''), '/' order by t.ordem)
      into v_pk
      from unnest(v_pk_cols) with ordinality as t(coluna, ordem);

    v_veiculo := public.fn_auditoria_veiculo(v_tabela, v_linha);
    if v_veiculo is not null then
      if tg_op = 'DELETE' then
        v_antes := v_antes || jsonb_build_object('__veiculo', v_veiculo);
      else
        v_depois := v_depois || jsonb_build_object('__veiculo', v_veiculo);
      end if;
    end if;

    -- 2) Quem pediu (cabeçalhos do servidor do app; o cliente anon/authenticated não conta).
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    v_papel := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    if v_headers is not null and coalesce(v_papel, 'service_role') not in ('anon', 'authenticated') then
      if coalesce(v_headers ->> 'x-rn-ator-id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_ator_id := (v_headers ->> 'x-rn-ator-id')::uuid;
      end if;
      v_ator_nome := public.fn_auditoria_b64(v_headers ->> 'x-rn-ator-nome');
      v_detalhe := left(public.fn_auditoria_b64(v_headers ->> 'x-rn-detalhe'), 500);
      v_lote := left(nullif(v_headers ->> 'x-rn-requisicao', ''), 80);
      v_em_lote := coalesce(v_headers ->> 'x-rn-lote', '') = '1';
    end if;
    if v_ator_id is not null then
      select u.nome::text, u.email::text, u.cargo
        into v_ator_nome, v_ator_email, v_ator_cargo
        from public.usuarios_acesso u
        where u.id = v_ator_id;
      if not found then
        v_ator_id := null;
        v_ator_nome := public.fn_auditoria_b64(v_headers ->> 'x-rn-ator-nome');
      end if;
    end if;

    -- 3) Usuário ou SISTEMA.
    if v_automatico or (v_ator_id is null and v_ator_nome is null) then
      v_autor := 'SISTEMA';
      v_detalhes := case
        when v_ator_nome is not null then
          'Automático: efeito da ação de ' || v_ator_nome || coalesce(' — ' || v_detalhe, '')
        when v_automatico then
          'Automático' || coalesce(': ' || v_detalhe, ' (efeito de outra alteração).')
        else
          coalesce(v_detalhe, 'Automático (rotina do banco, sem usuário do app).')
      end;
      v_ator_id := null;
      v_ator_email := null;
      v_ator_cargo := null;
    else
      v_autor := v_ator_nome;
      v_detalhes := v_detalhe;
    end if;

    insert into public.log_alteracoes (
      acao, tabela, pk, autor, autor_usuario_id, autor_email, autor_cargo,
      dados_anteriores, dados_novos, detalhes, lote_id, em_lote
    ) values (
      tg_op, v_tabela, v_pk, v_autor, v_ator_id, v_ator_email, v_ator_cargo,
      v_antes, v_depois, v_detalhes, coalesce(v_lote, 'tx:' || txid_current()::text), v_em_lote
    );
  exception when others then
    -- A auditoria nunca derruba a gravação.
    raise warning 'auditoria falhou em %: %', v_tabela, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.fn_auditoria_b64(text) from public, anon, authenticated;
revoke all on function public.fn_auditoria_veiculo(text, jsonb) from public, anon, authenticated;
revoke all on function public.fn_auditoria_registrar() from public, anon, authenticated;

-- ------------------------------------------------------------------ tabelas auditadas
do $$
declare
  v_alvo record;
begin
  for v_alvo in
    select * from (values
      -- operação
      ('carros', 'id', '', 'os_supply_appscript_check'),
      ('documentos', 'carro_id', '', ''),
      ('vendas', 'id', '', ''),
      ('venda_entradas', 'id', '', ''),
      ('venda_documentos', 'id', 'conteudo', ''),
      ('anuncios', 'id', '', ''),
      ('anuncios_insight_verifications', 'anuncio_id,insight_code', '', ''),
      ('observacoes', 'id', '', ''),
      ('controle_envelopes', 'id', '', ''),
      ('modelos', 'id', '', ''),
      ('remetentes', 'id', '', ''),
      ('responsaveis_virado', 'id', '', ''),
      ('notas_fiscais', 'id', '', ''),
      ('pericias', 'id', '', ''),
      ('carro_caracteristicas_visuais', 'carro_id,caracteristica_id', '', ''),
      ('carro_caracteristicas_tecnicas', 'carro_id,caracteristica_id', '', ''),
      ('caracteristicas_visuais', 'id', '', ''),
      ('caracteristicas_tecnicas', 'id', '', ''),
      ('finalizados', 'id', 'snapshot', ''),
      ('arquivos_arquivos', 'id', '', ''),
      ('arquivos_pastas', 'id', '', ''),
      -- acesso e configuração
      ('usuarios_acesso', 'id', '', 'ultimo_login'),
      ('lookups', 'domain,code', '', ''),
      ('lookup_announcement_statuses', 'code', '', ''),
      ('lookup_locations', 'code', '', ''),
      ('lookup_sale_statuses', 'code', '', ''),
      ('lookup_user_roles', 'code', '', ''),
      ('lookup_user_statuses', 'code', '', ''),
      ('lookup_vehicle_states', 'code', '', ''),
      ('ocr_templates', 'id', 'exemplo_ocr', ''),
      ('documento_templates', 'id', 'conteudo', ''),
      ('arquivo_automacao_config', 'automation_key', '', ''),
      ('arquivo_automacao_regras', 'id', '', ''),
      ('arquivo_automacao_folders', 'id', '', 'entity_snapshot')
    ) as t(tabela, pk, omitir, ignorar)
  loop
    execute format('drop trigger if exists trg_00_auditoria on public.%I', v_alvo.tabela);
    execute format(
      'create trigger trg_00_auditoria after insert or update or delete on public.%I '
      || 'for each row execute function public.fn_auditoria_registrar(%L, %L, %L)',
      v_alvo.tabela, v_alvo.pk, v_alvo.omitir, v_alvo.ignorar
    );
  end loop;
end;
$$;

-- Configuração interna: só o liga/desliga da finalização (as outras chaves são segredos).
drop trigger if exists trg_00_auditoria on internal.app_settings;
create trigger trg_00_auditoria
  after update on internal.app_settings
  for each row
  when (new.key = 'finalizacao_ativa')
  execute function public.fn_auditoria_registrar('key', '', '');

-- ------------------------------------------------------------------ leitura e retenção
alter table public.log_alteracoes alter column autor set default 'SISTEMA';

create index if not exists ix_log_alteracoes_tabela_data on public.log_alteracoes (tabela, data_hora desc, id desc);
create index if not exists ix_log_alteracoes_lote on public.log_alteracoes (lote_id);
drop index if exists public.ix_log_alteracoes_tabela;

-- Por tabela auditada: no máximo 30 dias e no máximo as 5.000 linhas mais novas.
create or replace function public.fn_auditoria_retencao()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removidas integer := 0;
  v_parcial integer;
begin
  delete from public.log_alteracoes where data_hora < now() - interval '30 days';
  get diagnostics v_parcial = row_count;
  v_removidas := v_parcial;

  delete from public.log_alteracoes l
  using (
    select x.id
    from (
      select a.id, row_number() over (partition by a.tabela order by a.data_hora desc, a.id desc) as posicao
      from public.log_alteracoes a
    ) x
    where x.posicao > 5000
  ) excedentes
  where l.id = excedentes.id;
  get diagnostics v_parcial = row_count;

  return v_removidas + v_parcial;
end;
$$;

revoke all on function public.fn_auditoria_retencao() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'rn-gestor-auditoria-retencao';
select cron.schedule('rn-gestor-auditoria-retencao', '17 * * * *', 'select public.fn_auditoria_retencao()');
