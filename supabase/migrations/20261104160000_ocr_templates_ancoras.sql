-- Ancoras do template de OCR: valores que o DOCUMENTO precisa conter (ex.: a
-- placa do veiculo da pasta de destino). Faltou ancora -> upload/gravacao
-- cancelados. Validadas no app (lib/domain/ocr/schemas.ts). Aditiva.

alter table public.ocr_templates
  add column if not exists ancoras jsonb not null default '[]'::jsonb;

alter table public.ocr_templates
  drop constraint if exists ocr_templates_ancoras_check;

alter table public.ocr_templates
  add constraint ocr_templates_ancoras_check check (jsonb_typeof(ancoras) = 'array');
