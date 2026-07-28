-- Todo novo registro em documentos nasce com responsavel_virado = 'NÃO CHEGOU'.
--
-- 'NÃO CHEGOU' ja era o marcador de pendencia reconhecido pelo dominio
-- (isResponsavelViradoPendente em lib/domain/documentos-insights.ts), so que a
-- coluna nascia NULL: a linha nova ficava "vazia" em vez de explicitamente
-- pendente, e o insight de responsavel pendente dependia do vazio.

alter table public.documentos
  alter column responsavel_virado set default 'NÃO CHEGOU';

-- O DEFAULT so vale quando a coluna e' OMITIDA no insert. O grid manda a coluna
-- com string vazia quando o campo nao foi preenchido, e a criacao automatica de
-- documentos a partir de carros manda NULL — o trigger cobre os dois casos.
create or replace function public.documentos_default_responsavel_virado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.responsavel_virado is null or btrim(new.responsavel_virado) = '' then
    new.responsavel_virado := 'NÃO CHEGOU';
  end if;
  return new;
end;
$$;

comment on function public.documentos_default_responsavel_virado() is
  'Normaliza responsavel_virado nulo/vazio para NÃO CHEGOU no INSERT. Nao roda no UPDATE: limpar o campo de uma linha existente continua permitido.';

drop trigger if exists trg_documentos_default_responsavel_virado on public.documentos;

create trigger trg_documentos_default_responsavel_virado
  before insert on public.documentos
  for each row
  execute function public.documentos_default_responsavel_virado();
