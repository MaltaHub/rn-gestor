-- Ordenação "Recentes" das listas do vendedor (/vender e /word): os veículos que
-- o PRÓPRIO usuário manipulou por último, lidos da auditoria do banco
-- (log_alteracoes, retenção de 30 dias). Cada evento é ligado ao carro:
--   carros/documentos/carro_caracteristicas_* -> a própria chave (pk = carro);
--   demais tabelas -> carro_id do registro (do log ou, num UPDATE, da linha atual);
--   venda_entradas -> venda -> carro.
-- Sem campos novos: só a função. Chamada pelo servidor (service_role).

create or replace function public.fn_carros_recentes_do_usuario(p_usuario_id uuid, p_limite integer default 60)
returns table (carro_id uuid, ultimo timestamptz)
language sql
stable
set search_path to ''
as $function$
  with eventos as (
    select
      l.tabela,
      case when l.pk ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then l.pk::uuid end as pk,
      l.data_hora,
      coalesce(l.dados_novos ->> 'carro_id', l.dados_anteriores ->> 'carro_id') as carro_log,
      coalesce(l.dados_novos ->> 'venda_id', l.dados_anteriores ->> 'venda_id') as venda_log
    from public.log_alteracoes l
    where l.autor_usuario_id = p_usuario_id
      and l.data_hora > now() - interval '30 days'
      and l.tabela in (
        'carros', 'documentos', 'carro_caracteristicas_visuais', 'carro_caracteristicas_tecnicas',
        'vendas', 'venda_entradas', 'venda_documentos', 'anuncios', 'observacoes',
        'controle_envelopes', 'notas_fiscais', 'pericias'
      )
  ),
  resolvidos as (
    select
      e.data_hora,
      case
        when e.tabela in ('carros', 'documentos', 'carro_caracteristicas_visuais', 'carro_caracteristicas_tecnicas') then e.pk
        when e.carro_log ~* '^[0-9a-f-]{36}$' then e.carro_log::uuid
        when e.tabela = 'vendas' then (select v.carro_id from public.vendas v where v.id = e.pk)
        when e.tabela = 'venda_entradas' then (
          select v.carro_id
          from public.vendas v
          where v.id = coalesce(
            case when e.venda_log ~* '^[0-9a-f-]{36}$' then e.venda_log::uuid end,
            (select ve.venda_id from public.venda_entradas ve where ve.id = e.pk)
          )
        )
        when e.tabela = 'venda_documentos' then (select d.carro_id from public.venda_documentos d where d.id = e.pk)
        when e.tabela = 'anuncios' then (select a.carro_id from public.anuncios a where a.id = e.pk)
        when e.tabela = 'observacoes' then (select o.carro_id from public.observacoes o where o.id = e.pk)
        when e.tabela = 'controle_envelopes' then (select ce.carro_id from public.controle_envelopes ce where ce.id = e.pk)
        when e.tabela = 'notas_fiscais' then (select nf.carro_id from public.notas_fiscais nf where nf.id = e.pk)
        when e.tabela = 'pericias' then (select pe.carro_id from public.pericias pe where pe.id = e.pk)
      end as carro_id
    from eventos e
  )
  select c.id, max(r.data_hora)
  from resolvidos r
  join public.carros c on c.id = r.carro_id
  group by c.id
  order by max(r.data_hora) desc
  limit greatest(1, least(coalesce(p_limite, 60), 200));
$function$;

revoke all on function public.fn_carros_recentes_do_usuario(uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_carros_recentes_do_usuario(uuid, integer) to service_role;

comment on function public.fn_carros_recentes_do_usuario(uuid, integer) is
  'Veículos que o usuário manipulou por último (auditoria, 30 dias): ordenação "Recentes" do /vender e do /word.';
