-- Contract (Kaic, 2026-11-09: "Pode remover o campo antigo!"): o titular do
-- CRLV virado é só responsavel_virado_id (cadastro responsaveis_virado). Sai o
-- texto documentos.responsavel_virado, a tradução de texto no trigger e o
-- trigger de caixa alta (só existia para essa coluna). O app já não usa a coluna.

create or replace function public.fn_documentos_normaliza_crlv()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_estado_mudou boolean;
  v_id_mudou boolean;
begin
  if tg_op = 'INSERT' then
    -- No INSERT o default da coluna (AGUARDANDO) nao conta como escolha.
    v_estado_mudou := coalesce(new.estado_transferencia, 'AGUARDANDO') <> 'AGUARDANDO';
    v_id_mudou := new.responsavel_virado_id is not null;
  else
    v_estado_mudou := new.estado_transferencia is distinct from old.estado_transferencia;
    v_id_mudou := new.responsavel_virado_id is distinct from old.responsavel_virado_id;
  end if;

  -- Titular informado (sem escolher a situacao) = CRLV virado no nome dele.
  if v_id_mudou and new.responsavel_virado_id is not null and not v_estado_mudou then
    new.estado_transferencia := 'VIRADO';
  end if;

  if new.estado_transferencia is null then
    new.estado_transferencia := 'AGUARDANDO';
  end if;

  -- VIRADO so com titular (o arquivo sozinho nao vira). So vale quando
  -- situacao/titular mudam nesta gravacao.
  if new.estado_transferencia = 'VIRADO'
     and new.responsavel_virado_id is null
     and (v_estado_mudou or v_id_mudou) then
    raise exception 'REGRA: O CRLV só fica VIRADO com o titular. Informe o responsável (o CRLV vira sozinho) ou escolha outra situação.'
      using errcode = 'P0001';
  end if;

  -- Titular so existe com o CRLV virado.
  if new.estado_transferencia <> 'VIRADO' then
    new.responsavel_virado_id := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_documentos_uppercase on public.documentos;
drop function if exists public.fn_documentos_uppercase();

alter table public.documentos drop column if exists responsavel_virado;
