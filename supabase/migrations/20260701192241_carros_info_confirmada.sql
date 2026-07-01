-- =====================================================================
-- Compliance 2.0: carros.info_confirmada — o veiculo teve suas informacoes
-- (incl. modelo) CONFIRMADAS pelo usuario. A fonte amarela do grid passa a
-- significar "nao confirmado". Regra:
--   - Enquanto faltar campo importante (ano_mod, chassi, renavam, hodometro,
--     preco_original, modelo_id), o carro NAO pode estar confirmado -> trigger
--     forca info_confirmada=false. Editar valido->valido NAO reseta (o trigger
--     so zera quando falta campo).
--   - Backfill: carros COMPLETOS comecam confirmados; incompletos, nao.
-- =====================================================================
alter table public.carros
  add column if not exists info_confirmada boolean not null default false;

comment on column public.carros.info_confirmada is
  'Informacoes do veiculo (incl. modelo) confirmadas pelo usuario. Fonte amarela no grid = false.';

create or replace function public.fn_carros_info_confirmada_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.ano_mod is null
     or NEW.chassi is null or btrim(NEW.chassi) = ''
     or NEW.renavam is null or btrim(NEW.renavam) = ''
     or NEW.hodometro is null
     or NEW.preco_original is null
     or NEW.modelo_id is null then
    NEW.info_confirmada := false;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_carros_info_confirmada_gate on public.carros;
create trigger trg_carros_info_confirmada_gate
  before insert or update on public.carros
  for each row
  execute function public.fn_carros_info_confirmada_gate();

-- Backfill: completos -> confirmados.
update public.carros
   set info_confirmada = true
 where ano_mod is not null
   and chassi is not null and btrim(chassi) <> ''
   and renavam is not null and btrim(renavam) <> ''
   and hodometro is not null
   and preco_original is not null
   and modelo_id is not null
   and info_confirmada is distinct from true;
