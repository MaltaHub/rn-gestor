-- =====================================================================
-- Facets (opcoes distintas + contagem) de uma coluna, computados no Postgres
-- (group by), em vez de buscar todas as linhas e deduplicar no Node.
-- Usado pelo carregamento de opcoes do grid/playground (domínio cheio).
-- Retorna o valor como jsonb (preserva tipo p/ label) + contagem.
-- =====================================================================
create or replace function public.grid_column_facets(p_table text, p_column text, p_limit int default 10000)
returns table(value jsonb, n bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_column
  ) then
    raise exception 'grid_column_facets: coluna %.% inexistente', p_table, p_column;
  end if;

  return query execute format(
    'select to_jsonb(t.%I) as value, count(*)::bigint as n from public.%I t group by t.%I order by count(*) desc limit %s',
    p_column, p_table, p_column, greatest(coalesce(p_limit, 10000), 1)
  );
end;
$$;

revoke all on function public.grid_column_facets(text, text, int) from anon, authenticated;
