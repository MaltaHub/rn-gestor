-- Controle de envelopes/chave reserva (livro-razao) e observacoes (post-its)
-- por veiculo. Acesso pelo service_role (RLS habilitada sem policies);
-- autorizacao por cargo e feita na camada de servico/endpoints da API.

-- =====================================================================
-- controle_envelopes: cada retirada de envelope OU chave reserva por um
-- usuario gera uma linha. "Devolver" fecha a linha (status=devolvido).
-- Regra: nao pode existir mais de uma retirada ABERTA do mesmo item para
-- o mesmo carro -> garantido pelo indice unico parcial abaixo.
-- =====================================================================
create table if not exists public.controle_envelopes (
  id uuid primary key default gen_random_uuid(),
  carro_id uuid not null references public.carros(id) on update cascade on delete cascade,
  item text not null check (item in ('envelope', 'chave_reserva')),
  status text not null default 'com_usuario' check (status in ('com_usuario', 'devolvido')),
  usuario_auth_user_id uuid references auth.users(id) on update cascade on delete set null,
  observacao text,
  retirado_em timestamptz not null default now(),
  devolvido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.controle_envelopes enable row level security;

-- Regra de negocio: no maximo 1 retirada aberta por (carro, item).
create unique index if not exists uq_controle_envelopes_aberto
  on public.controle_envelopes (carro_id, item)
  where (status = 'com_usuario');

create index if not exists ix_controle_envelopes_carro
  on public.controle_envelopes (carro_id);
create index if not exists ix_controle_envelopes_usuario
  on public.controle_envelopes (usuario_auth_user_id);
create index if not exists ix_controle_envelopes_retirado_em
  on public.controle_envelopes (retirado_em desc);

comment on table public.controle_envelopes is
  'Livro-razao de retiradas de envelope/chave reserva por veiculo. Uma retirada aberta por (carro,item).';
comment on column public.controle_envelopes.item is
  'Item retirado: envelope ou chave_reserva.';
comment on column public.controle_envelopes.status is
  'com_usuario (em posse de alguem) ou devolvido (linha fechada).';

create or replace function public.fn_controle_envelopes_touch()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  new.updated_at := now();
  if new.status = 'devolvido' and old.status is distinct from 'devolvido' and new.devolvido_em is null then
    new.devolvido_em := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_controle_envelopes_touch() from public, anon, authenticated;

drop trigger if exists trg_controle_envelopes_touch on public.controle_envelopes;
create trigger trg_controle_envelopes_touch
  before update on public.controle_envelopes
  for each row
  execute function public.fn_controle_envelopes_touch();

-- =====================================================================
-- observacoes: post-its por veiculo. Um veiculo pode ter varios. Tipo
-- urgente deixa o atalho vermelho enquanto status=ativo.
-- =====================================================================
create table if not exists public.observacoes (
  id uuid primary key default gen_random_uuid(),
  carro_id uuid not null references public.carros(id) on update cascade on delete cascade,
  tipo text not null check (tipo in ('urgente', 'observacao')),
  texto text not null check (length(btrim(texto)) > 0),
  status text not null default 'ativo' check (status in ('ativo', 'resolvido')),
  autor_auth_user_id uuid references auth.users(id) on update cascade on delete set null,
  resolvido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.observacoes enable row level security;

create index if not exists ix_observacoes_carro
  on public.observacoes (carro_id, status);
-- Indice para o contador de urgentes ativos (botao vermelho).
create index if not exists ix_observacoes_urgentes_ativos
  on public.observacoes (created_at desc)
  where (tipo = 'urgente' and status = 'ativo');

comment on table public.observacoes is
  'Post-its por veiculo. tipo=urgente + status=ativo aciona o alerta vermelho no atalho do grid.';

create or replace function public.fn_observacoes_touch()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  new.updated_at := now();
  if new.status = 'resolvido' and old.status is distinct from 'resolvido' and new.resolvido_em is null then
    new.resolvido_em := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_observacoes_touch() from public, anon, authenticated;

drop trigger if exists trg_observacoes_touch on public.observacoes;
create trigger trg_observacoes_touch
  before update on public.observacoes
  for each row
  execute function public.fn_observacoes_touch();
