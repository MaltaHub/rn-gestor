-- Titular do CRLV VIRADO vira CADASTRO (Kaic, 2026-11-07): "o cnpj ou cpf deve
-- ser ou a PK ou SK do responsavel_virado, para que o OCR possa vincular direto
-- o responsável ... os dados obrigatórios do responsavel_virado deverá ser nome
-- e cnpj/cpf". Expand: tabela nova + documentos.responsavel_virado_id; o texto
-- antigo (responsavel_virado) fica como espelho do nome até o contract.
-- Também: CRLV VIRADO classificado deixa de virar sozinho (titular vem do OCR).

-- 1) CPF/CNPJ válido (dígitos verificadores).
create or replace function public.fn_cpf_cnpj_valido(p_doc text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p_doc, ''), '\D', '', 'g');
  s int;
  r int;
  i int;
  w int[];
begin
  if length(d) = 11 then
    if d ~ '^(\d)\1{10}$' then return false; end if;
    s := 0;
    for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11;
    if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return false; end if;
    s := 0;
    for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11;
    if r = 10 then r := 0; end if;
    return r = substr(d, 11, 1)::int;
  elsif length(d) = 14 then
    if d ~ '^(\d)\1{13}$' then return false; end if;
    w := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0;
    for i in 1..12 loop s := s + substr(d, i, 1)::int * w[i]; end loop;
    r := s % 11;
    r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return false; end if;
    w := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0;
    for i in 1..13 loop s := s + substr(d, i, 1)::int * w[i]; end loop;
    r := s % 11;
    r := case when r < 2 then 0 else 11 - r end;
    return r = substr(d, 14, 1)::int;
  end if;
  return false;
end;
$$;
revoke execute on function public.fn_cpf_cnpj_valido(text) from public, anon, authenticated;

-- 2) Cadastro dos titulares: nome e CPF/CNPJ obrigatórios; CPF/CNPJ só dígitos e único (chave do OCR).
create table if not exists public.responsaveis_virado (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  cpf_cnpj text not null check (cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists responsaveis_virado_cpf_cnpj_key on public.responsaveis_virado (cpf_cnpj);
alter table public.responsaveis_virado enable row level security;

create or replace function public.fn_responsaveis_virado_normaliza()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_outro text;
begin
  new.nome := upper(btrim(coalesce(new.nome, '')));
  new.cpf_cnpj := regexp_replace(coalesce(new.cpf_cnpj, ''), '\D', '', 'g');
  if new.nome = '' then
    raise exception 'REGRA: Informe o nome do responsável.' using errcode = 'P0001';
  end if;
  if new.cpf_cnpj = '' then
    raise exception 'REGRA: Informe o CPF/CNPJ do responsável.' using errcode = 'P0001';
  end if;
  if not public.fn_cpf_cnpj_valido(new.cpf_cnpj) then
    raise exception 'REGRA: CPF/CNPJ inválido.' using errcode = 'P0001';
  end if;
  select r.nome into v_outro from public.responsaveis_virado r where r.cpf_cnpj = new.cpf_cnpj and r.id <> new.id limit 1;
  if v_outro is not null then
    raise exception 'REGRA: CPF/CNPJ já cadastrado para %.', v_outro using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_responsaveis_virado_normaliza() from public, anon, authenticated;

drop trigger if exists trg_responsaveis_virado_normaliza on public.responsaveis_virado;
create trigger trg_responsaveis_virado_normaliza
  before insert or update on public.responsaveis_virado
  for each row execute function public.fn_responsaveis_virado_normaliza();

drop trigger if exists trg_responsaveis_virado_timestamps on public.responsaveis_virado;
create trigger trg_responsaveis_virado_timestamps
  before insert or update on public.responsaveis_virado
  for each row execute function public.fn_set_timestamps();

drop trigger if exists trg_backup_row_webhook on public.responsaveis_virado;
create trigger trg_backup_row_webhook
  after insert or delete or update on public.responsaveis_virado
  for each row execute function public.backup_row_webhook();

-- 3) Os 5 titulares em uso (CPF/CNPJ informados pelo Kaic).
insert into public.responsaveis_virado (nome, cpf_cnpj) values
  ('ROBERTOAUTO', '09625553000104'),
  ('ROBERTO FILHO', '42417130840'),
  ('AZ SEGUROS', '40864999000131'),
  ('IRACEMA', '13252853825'),
  ('NICOLAS', '42417129833')
on conflict (cpf_cnpj) do nothing;

-- 4) documentos aponta para o cadastro (não dá para apagar titular em uso).
alter table public.documentos
  add column if not exists responsavel_virado_id uuid references public.responsaveis_virado (id) on delete restrict;
create index if not exists documentos_responsavel_virado_id_idx on public.documentos (responsavel_virado_id);

-- 5) Regras do CRLV com o titular pelo id (texto vira espelho do nome).
CREATE OR REPLACE FUNCTION public.fn_documentos_normaliza_crlv()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_resp text := upper(btrim(coalesce(new.responsavel_virado, '')));
  v_estado_mudou boolean;
  v_id_mudou boolean;
  v_texto_mudou boolean;
  v_id uuid;
  v_nome text;
begin
  if tg_op = 'INSERT' then
    -- No INSERT o default da coluna (AGUARDANDO) nao conta como escolha.
    v_estado_mudou := coalesce(new.estado_transferencia, 'AGUARDANDO') <> 'AGUARDANDO';
    v_id_mudou := new.responsavel_virado_id is not null;
    v_texto_mudou := v_resp <> '';
  else
    v_estado_mudou := new.estado_transferencia is distinct from old.estado_transferencia;
    v_id_mudou := new.responsavel_virado_id is distinct from old.responsavel_virado_id;
    v_texto_mudou := new.responsavel_virado is distinct from old.responsavel_virado;
  end if;

  -- Transicao: o texto antigo ainda pode chegar (codigo velho). Atalhos de
  -- situacao continuam; nome vira o CADASTRO do titular (precisa existir).
  if v_texto_mudou and not v_id_mudou then
    if v_resp in ('NÃO CHEGOU', 'NAO CHEGOU') then
      new.estado_transferencia := 'AGUARDANDO';
      v_estado_mudou := true;
    elsif v_resp in ('PROCURAÇÃO', 'PROCURACAO') then
      new.estado_transferencia := 'PROCURACAO';
      v_estado_mudou := true;
    elsif v_resp = 'BRANCO' then
      new.estado_transferencia := 'BRANCO';
      v_estado_mudou := true;
    elsif v_resp = '' then
      new.responsavel_virado_id := null;
      v_id_mudou := true;
    else
      select r.id into v_id from public.responsaveis_virado r where r.nome = v_resp limit 1;
      if v_id is null then
        raise exception 'REGRA: Titular "%" não cadastrado. Cadastre em Responsáveis (CRLV virado) com nome e CPF/CNPJ.', v_resp
          using errcode = 'P0001';
      end if;
      new.responsavel_virado_id := v_id;
      v_id_mudou := true;
    end if;
  end if;

  -- Titular informado (sem escolher a situacao) = CRLV virado no nome dele.
  if v_id_mudou and new.responsavel_virado_id is not null and not v_estado_mudou then
    new.estado_transferencia := 'VIRADO';
  end if;

  if new.estado_transferencia is null then
    new.estado_transferencia := 'AGUARDANDO';
  end if;

  -- VIRADO so com titular — sem excecao: o arquivo sozinho nao vira
  -- (Kaic, 2026-11-07). So vale quando situacao/titular mudam nesta gravacao.
  if new.estado_transferencia = 'VIRADO'
     and new.responsavel_virado_id is null
     and (v_estado_mudou or v_id_mudou or v_texto_mudou) then
    raise exception 'REGRA: O CRLV só fica VIRADO com o titular. Informe o responsável (o CRLV vira sozinho) ou escolha outra situação.'
      using errcode = 'P0001';
  end if;

  -- Titular so existe com o CRLV virado; o texto espelha o nome (backup/legado).
  if new.estado_transferencia <> 'VIRADO' then
    new.responsavel_virado_id := null;
    new.responsavel_virado := null;
  else
    select r.nome into v_nome from public.responsaveis_virado r where r.id = new.responsavel_virado_id;
    new.responsavel_virado := v_nome;
  end if;
  return new;
end;
$function$;

-- 6) Classificar CRLV VIRADO não vira sozinho.
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

    -- Mais forte vence: PROCURACAO (2) > BRANCO (1). CRLV VIRADO classificado
    -- NAO vira sozinho (Kaic, 2026-11-07): o titular vem do OCR ou a mao.
    if v_tokens ? 'crlv' and v_tokens->>'crlv' <> 'VIRADO' then
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

  insert into public.documentos as d (carro_id, estado_transferencia, envelope)
  values (p_carro_id, coalesce(v_crlv, 'AGUARDANDO'), v_envelope)
  on conflict (carro_id) do update set
    -- Arquivo nunca rebaixa a situacao (so sobe).
    estado_transferencia = case when v_crlv is not null and v_rank > coalesce(v_rank_atual, 0) then v_crlv else d.estado_transferencia end,
    envelope = coalesce(v_envelope, d.envelope),
    updated_at = now()
  where (v_crlv is not null and v_rank > coalesce(v_rank_atual, 0))
     or (v_envelope is not null and d.envelope is distinct from v_envelope);
end;
$function$;

-- 7) Liga os VIRADO atuais ao cadastro pelo nome.
update public.documentos d
   set responsavel_virado_id = r.id
  from public.responsaveis_virado r
 where d.responsavel_virado_id is null
   and upper(btrim(d.responsavel_virado)) = r.nome;
