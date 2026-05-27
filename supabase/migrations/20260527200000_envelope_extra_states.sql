-- Novos estados de envelope: ABERTO, PRONTO, FECHADO.
-- (BRANCO ja existe em todos os lookups de estado desde 20260527140000.)
insert into public.lookup_estados_envelope (code, name, sort_order) values
  ('ABERTO', 'Aberto', 12),
  ('PRONTO', 'Pronto', 14),
  ('FECHADO', 'Fechado', 16)
on conflict (code) do nothing;
