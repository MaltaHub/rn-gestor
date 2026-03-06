create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  price numeric(12,2) not null check (price >= 0),
  status text not null check (status in ('available', 'sold')),
  created_at timestamptz not null default now()
);

create table if not exists public.sales_summary (
  month text primary key,
  gross_revenue numeric(14,2) not null check (gross_revenue >= 0),
  sold_vehicles integer not null check (sold_vehicles >= 0)
);

alter table public.vehicles enable row level security;
alter table public.sales_summary enable row level security;

create policy "read vehicles" on public.vehicles
for select
using (true);

create policy "read sales summary" on public.sales_summary
for select
using (true);
