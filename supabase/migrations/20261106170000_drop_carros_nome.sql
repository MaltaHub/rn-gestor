-- Remocao de carros.nome — etapa 2 (contract), depois do deploy de 0caed3e
-- (o app nao le nem grava mais a coluna; as views ja nao dependem dela).
-- O nome exibido do veiculo passa a ser o MODELO do catalogo.
alter table public.carros drop column if exists nome;
