alter table public.documentos
  add column if not exists tipo varchar(64),
  add column if not exists observacao text,
  add column if not exists responsavel varchar(64),
  add column if not exists nota_entrada numeric,
  add column if not exists nota_saida numeric;

-- Trigger forca UPPERCASE em campos texto controlados.
create or replace function public.fn_documentos_uppercase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo is not null then
    new.tipo := upper(btrim(new.tipo));
  end if;
  if new.responsavel is not null then
    new.responsavel := upper(btrim(new.responsavel));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_documentos_uppercase on public.documentos;
create trigger trg_documentos_uppercase
  before insert or update on public.documentos
  for each row
  execute function public.fn_documentos_uppercase();

comment on column public.documentos.tipo is 'Tipo do documento (CRLV, CRV, etc.). Armazenado em UPPERCASE via trigger.';
comment on column public.documentos.observacao is 'Anotacoes livres sobre o documento.';
comment on column public.documentos.responsavel is 'Pessoa responsavel pelo documento. Armazenado em UPPERCASE via trigger.';
comment on column public.documentos.nota_entrada is 'Valor numerico associado a nota de entrada.';
comment on column public.documentos.nota_saida is 'Valor numerico associado a nota de saida.';
