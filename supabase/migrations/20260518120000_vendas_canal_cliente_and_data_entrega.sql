-- Adiciona o canal pelo qual o cliente chegou (instagram, youtube, lead,
-- familiar, amigo, etc.) e a data de entrega do veiculo ao comprador.
--
-- data_venda ja existia (default current_date). data_entrega entra como
-- nullable porque a entrega pode ocorrer depois do registro da venda.
--
-- canal_cliente vira FK para lookup_canais_cliente para que o admin possa
-- ampliar a lista sem nova migracao.

create table if not exists public.lookup_canais_cliente (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lookup_canais_cliente enable row level security;

drop trigger if exists trg_lookup_canais_cliente_timestamps on public.lookup_canais_cliente;
create trigger trg_lookup_canais_cliente_timestamps
before insert or update on public.lookup_canais_cliente
for each row
execute function public.fn_set_timestamps();

insert into public.lookup_canais_cliente (code, name, sort_order) values
  ('instagram', 'Instagram', 10),
  ('youtube', 'YouTube', 20),
  ('facebook', 'Facebook', 30),
  ('whatsapp', 'WhatsApp', 40),
  ('lead', 'Lead', 50),
  ('familiar', 'Familiar', 60),
  ('amigo', 'Amigo', 70)
on conflict (code) do nothing;

comment on table public.lookup_canais_cliente is 'Canais pelos quais o cliente conheceu o veiculo/negocio (origem do lead).';

alter table public.vendas
  add column if not exists canal_cliente text
    references public.lookup_canais_cliente(code)
    on update cascade
    on delete set null,
  add column if not exists data_entrega date;

create index if not exists ix_vendas_canal_cliente
  on public.vendas (canal_cliente)
  where canal_cliente is not null;

create index if not exists ix_vendas_data_entrega
  on public.vendas (data_entrega desc)
  where data_entrega is not null;

comment on column public.vendas.canal_cliente is 'Codigo do canal de origem do cliente (FK lookup_canais_cliente).';
comment on column public.vendas.data_entrega is 'Data em que o veiculo foi entregue ao comprador. Pode ser posterior a data_venda.';
