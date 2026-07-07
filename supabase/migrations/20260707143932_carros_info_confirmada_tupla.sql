-- =====================================================================
-- Confirmacao de CARROS vira TUPLA: info_confirmada passa de boolean para
-- jsonb {"campos": bool, "chave_manual": bool}.
--   - 'campos'      : mesma regra de antes — faltar campo importante
--                     (ano_mod, chassi, renavam, hodometro, modelo_id)
--                     forca false (trigger).
--   - 'chave_manual': confirmacao de chave reserva + manual. Alterar
--                     tem_chave_r ou tem_manual volta para false (trigger).
-- A fonte amarela do grid passa a exigir as DUAS posicoes true para sumir.
-- Conversao: 'campos' herda o boolean antigo; 'chave_manual' nasce false
-- (todo veiculo precisa da primeira confirmacao de chave/manual).
-- =====================================================================

-- A assinatura da RPC muda (ganha p_alvo) — drop da versao antiga.
drop function if exists public.fn_carros_confirmar_info(uuid);

alter table public.carros alter column info_confirmada drop default;
alter table public.carros
  alter column info_confirmada type jsonb
  using jsonb_build_object('campos', info_confirmada, 'chave_manual', false);
alter table public.carros
  alter column info_confirmada set default '{"campos": false, "chave_manual": false}'::jsonb;

comment on column public.carros.info_confirmada is
  'Tupla de confirmacao {"campos": bool, "chave_manual": bool}. Fonte amarela no grid enquanto qualquer posicao for false. campos: zera se faltar campo importante; chave_manual: zera se tem_chave_r/tem_manual mudarem.';

create or replace function public.fn_carros_info_confirmada_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_campos boolean := coalesce((NEW.info_confirmada ->> 'campos')::boolean, false);
  v_chave_manual boolean := coalesce((NEW.info_confirmada ->> 'chave_manual')::boolean, false);
begin
  -- posicao 'campos': faltar campo importante -> forca false (regra antiga).
  if NEW.ano_mod is null
     or NEW.chassi is null or btrim(NEW.chassi) = ''
     or NEW.renavam is null or btrim(NEW.renavam) = ''
     or NEW.hodometro is null
     or NEW.modelo_id is null then
    v_campos := false;
  end if;

  -- posicao 'chave_manual': mudar chave reserva ou manual -> volta a false.
  if TG_OP = 'UPDATE'
     and (NEW.tem_chave_r is distinct from OLD.tem_chave_r
       or NEW.tem_manual is distinct from OLD.tem_manual) then
    v_chave_manual := false;
  end if;

  -- Reescreve sempre: normaliza o shape mesmo se vier null/lixo.
  NEW.info_confirmada := jsonb_build_object('campos', v_campos, 'chave_manual', v_chave_manual);
  return NEW;
end;
$$;

-- RPC de confirmacao por alvo. p_alvo default 'campos' mantem o codigo antigo
-- funcionando durante a janela de deploy (chamada so com p_carro_id).
create or replace function public.fn_carros_confirmar_info(p_carro_id uuid, p_alvo text default 'campos')
returns public.carros
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_carro public.carros;
begin
  if p_alvo not in ('campos', 'chave_manual') then
    raise exception 'ALVO_INVALIDO' using errcode = 'invalid_parameter_value';
  end if;
  update public.carros
     set info_confirmada = info_confirmada || jsonb_build_object(p_alvo, true)
   where id = p_carro_id
   returning * into v_carro;
  if not found then
    raise exception 'CARRO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  -- O trigger BEFORE zera 'campos' se faltar campo importante; se voltou false,
  -- o carro esta incompleto e a confirmacao de campos nao vale.
  if p_alvo = 'campos' and not coalesce((v_carro.info_confirmada ->> 'campos')::boolean, false) then
    raise exception 'CARRO_INFO_INCOMPLETA' using errcode = 'check_violation';
  end if;
  return v_carro;
end;
$$;

-- Escrita passa so pelo servidor (service_role) — sem execute publico.
revoke execute on function public.fn_carros_confirmar_info(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_carros_confirmar_info(uuid, text) to service_role;
