-- Sistema de controle de vendas: tabela `vendas` registrando cada venda
-- finalizada com dados do comprador, financiamento, seguro e troca opcionais.
-- Trigger encadeia carros.estado_venda='VENDIDO' quando venda fecha,
-- alimentando o pipeline ja existente de resolve_carro_estado_anuncio.

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),

  -- Relacionamentos
  carro_id uuid not null references public.carros(id)
    on update cascade
    on delete restrict,
  vendedor_auth_user_id uuid not null references auth.users(id)
    on update cascade
    on delete restrict,

  -- Dados basicos da venda
  data_venda date not null default current_date,
  valor_total numeric(12, 2) not null check (valor_total >= 0),
  valor_entrada numeric(12, 2) check (valor_entrada is null or valor_entrada >= 0),
  forma_pagamento text not null check (forma_pagamento in (
    'a_vista', 'financiado', 'consorcio', 'parcelado', 'misto'
  )),
  estado_venda text not null default 'concluida' check (estado_venda in (
    'concluida', 'cancelada'
  )),
  observacao text,

  -- Comprador
  comprador_nome text not null check (length(btrim(comprador_nome)) > 0),
  comprador_documento text,
  comprador_telefone text,
  comprador_email text,
  comprador_endereco text,

  -- Financiamento (NULLABLE; preenchido quando forma_pagamento envolve credito)
  financ_banco text,
  financ_parcelas_qtde integer check (financ_parcelas_qtde is null or financ_parcelas_qtde > 0),
  financ_parcela_valor numeric(12, 2) check (financ_parcela_valor is null or financ_parcela_valor >= 0),
  financ_taxa_mensal numeric(7, 5) check (financ_taxa_mensal is null or financ_taxa_mensal >= 0),
  financ_primeira_em date,

  -- Seguro (NULLABLE)
  seguro_seguradora text,
  seguro_apolice text,
  seguro_valor numeric(12, 2) check (seguro_valor is null or seguro_valor >= 0),
  seguro_validade date,

  -- Carro na troca (NULLABLE)
  troca_marca text,
  troca_modelo text,
  troca_ano integer check (troca_ano is null or troca_ano between 1900 and 2200),
  troca_placa text,
  troca_valor numeric(12, 2) check (troca_valor is null or troca_valor >= 0),

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id)
    on update cascade
    on delete set null
);

alter table public.vendas enable row level security;

-- Apenas uma venda 'concluida' por carro. Cancelamento libera o slot para
-- registrar nova venda (cenario de reversao + revenda).
create unique index if not exists ux_vendas_carro_concluida
  on public.vendas (carro_id)
  where estado_venda = 'concluida';

create index if not exists ix_vendas_vendedor_user_id
  on public.vendas (vendedor_auth_user_id);

create index if not exists ix_vendas_data_venda
  on public.vendas (data_venda desc);

create index if not exists ix_vendas_estado_venda
  on public.vendas (estado_venda);

create index if not exists ix_vendas_carro_id
  on public.vendas (carro_id);

-- created_at / updated_at automaticos (reusa funcao existente do projeto).
drop trigger if exists trg_vendas_timestamps on public.vendas;
create trigger trg_vendas_timestamps
before insert or update on public.vendas
for each row
execute function public.fn_set_timestamps();

-- Cascata: quando a venda fica 'concluida', o carro vira VENDIDO. Encadeia
-- direto no pipeline de anuncios via resolve_carro_estado_anuncio - o anuncio
-- correspondente recebe SUBSTITUIR_ANUNCIO_REPRESENTANTE (se houver outro
-- carro do grupo de repetidos disponivel) ou APAGAR_ANUNCIO_RECOMENDADO.
-- Cancelamento NAO reverte automaticamente: operador decide manualmente se o
-- carro volta para DISPONIVEL.
create or replace function public.fn_vendas_cascade_carro_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado_venda = 'concluida' then
    update public.carros
       set estado_venda = 'VENDIDO'
     where id = new.carro_id
       and estado_venda is distinct from 'VENDIDO';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendas_cascade_carro_status on public.vendas;
create trigger trg_vendas_cascade_carro_status
after insert or update of estado_venda on public.vendas
for each row
execute function public.fn_vendas_cascade_carro_status();

revoke all on function public.fn_vendas_cascade_carro_status() from public, anon, authenticated;

comment on table public.vendas is 'Vendas finalizadas. Uma row = uma venda. Trigger automatica seta carros.estado_venda=VENDIDO quando estado_venda=concluida; cancelamento NAO reverte (operador decide).';
comment on column public.vendas.vendedor_auth_user_id is 'Vendedor responsavel pela venda (FK auth.users).';
comment on column public.vendas.estado_venda is 'concluida (default, venda valida e contabilizada) ou cancelada (revertida).';
comment on column public.vendas.forma_pagamento is 'Forma do pagamento: a_vista, financiado, consorcio, parcelado, misto.';
comment on column public.vendas.financ_taxa_mensal is 'Taxa de juros mensal em fracao decimal (ex: 0.0125 = 1,25 por cento ao mes).';
