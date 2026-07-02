-- =====================================================================
-- Confirmação de informações de CARROS: preco_original DEIXA de ser critério.
-- Campos exigidos passam a ser: ano_mod, chassi, renavam, hodometro, modelo_id.
-- Re-backfill: carros completos sob o novo critério (mesmo sem preço) viram
-- confirmados — antes só ficavam de fora por causa do preço.
-- =====================================================================
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
     or NEW.modelo_id is null then
    NEW.info_confirmada := false;
  end if;
  return NEW;
end;
$$;

update public.carros
   set info_confirmada = true
 where ano_mod is not null
   and chassi is not null and btrim(chassi) <> ''
   and renavam is not null and btrim(renavam) <> ''
   and hodometro is not null
   and modelo_id is not null
   and info_confirmada is distinct from true;
