create index if not exists ix_arquivos_arquivos_uploaded_by
  on public.arquivos_arquivos (uploaded_by);

create index if not exists ix_arquivos_pastas_created_by
  on public.arquivos_pastas (created_by);

create index if not exists ix_arquivos_pastas_updated_by
  on public.arquivos_pastas (updated_by);

create index if not exists ix_carros_estado_veiculo_fk
  on public.carros (estado_veiculo);

create index if not exists ix_log_alteracoes_autor_cargo_fk
  on public.log_alteracoes (autor_cargo);
