# Avaliacao Tecnica do Banco de Dados

Data da analise: 2026-03-09

Base analisada:
- Projeto Supabase remoto `ppcwxswgsrnrvpojzedc` (`rn-gestor`)
- Schema efetivo extraido do banco remoto em `/tmp/rn-gestor-public-schema.sql`
- Estatisticas gerais obtidas com `supabase inspect db db-stats`

## Resumo Executivo

O banco apresenta uma base estrutural boa para um ERP enxuto: modelagem relacional coerente, constraints relevantes de integridade, chaves estrangeiras bem definidas, uso consistente de `uuid`, normalizacao parcial com tabelas lookup e trilha de auditoria dedicada. Para o estagio atual do produto, o schema esta funcional e defensavel.

O principal ponto tecnico nao e modelagem relacional, e sim postura de seguranca e governanca. Hoje a arquitetura esta claramente orientada a acesso via backend com `service_role`, enquanto o banco remoto permanece com `RLS` habilitado mas com politicas quase inexistentes e com `default privileges` excessivamente permissivos para `anon` e `authenticated`. Isso nao quebra a aplicacao atual se todo acesso passa pelo backend, mas aumenta risco operacional e dificulta evolucao para uma arquitetura moderna com acesso direto controlado pelo Supabase.

Tambem ha espaco claro para amadurecimento em performance e arquitetura de dados:
- faltam alguns indices compostos e indices alinhados com os `ORDER BY` usados pela API;
- o mecanismo de repetidos parece materializado manualmente via rebuild, o que tende a degradar manutenibilidade;
- autenticacao e usuarios ainda estao modelados em tabela propria no schema `public`, o que sugere uma camada de identidade caseira que deveria ser revista.

## Inventario do Schema

Panorama do schema `public`:
- 21 tabelas
- 2 funcoes trigger
- 18 triggers
- 29 indices
- 2 policies RLS explicitas

Principais grupos de tabelas:
- Operacional: `carros`, `anuncios`, `modelos`, `finalizados`
- Classificacao/relacionamento: `caracteristicas_tecnicas`, `caracteristicas_visuais`, `carro_caracteristicas_tecnicas`, `carro_caracteristicas_visuais`
- Analitico/materializado: `grupos_repetidos`, `repetidos`
- Seguranca/auditoria: `usuarios_acesso`, `log_alteracoes`
- Dominios: `lookup_*`
- Legado/exemplo: `vehicles`, `sales_summary`

Objetos estruturais relevantes:
- `carros` e a entidade central do dominio
- `anuncios` possui relacao 1:1 com `carros` por `uq_anuncios_target` em `carro_id`
- `finalizados` funciona como snapshot denormalizado de venda
- `log_alteracoes` guarda auditoria rica com `jsonb` antes/depois
- `lookup_*` padronizam dominio textual com FKs

## Qualidades Tecnicas Observadas

Pontos positivos do desenho atual:
- Integridade relacional bem aplicada com FKs para estados, localizacao, modelo, cargo e status.
- Uso de `citext` em campos sensiveis a case como `placa`, `modelo`, `nome` e `email`.
- Checks defensivos para anos, valores monetarios, hodometro e datas.
- Triggers de timestamp consistentes em quase todas as tabelas operacionais.
- Indices funcionais para unicidade normalizada, como placa e modelo.
- Auditoria estruturada com `dados_anteriores` e `dados_novos` em `jsonb`.
- RLS habilitado em quase todo o schema, o que ao menos impede exposicao acidental via politicas implícitas.

## Diagnostico de Arquitetura

### 1. Modelo de dominio

O modelo central esta coerente para estoque e venda de veiculos:
- `carros` representa o ativo principal
- `anuncios` desacopla publicacao/comercializacao do veiculo
- `finalizados` preserva historico de venda sem depender do estado corrente do carro
- `grupos_repetidos` e `repetidos` suportam deteccao de similaridade

Esse desenho e pragmatico. O ponto de atencao e que o banco mistura:
- dados transacionais;
- identidade/acesso;
- auditoria;
- tabelas legado/exemplo;
- projeções analiticas/materializadas.

Para uma arquitetura moderna, eu separaria melhor as responsabilidades:
- `public`: apenas entidades de negocio consumidas pela app
- `app_private` ou `internal`: funcoes internas, tabelas tecnicas e processos auxiliares
- `reporting` ou `analytics`: projeções agregadas e tabelas derivadas
- `auth`: usar a camada nativa do Supabase sempre que possivel

### 2. Identidade e autenticacao

`usuarios_acesso` em `public` com `senha_hash` e `senha_salt` indica autenticacao customizada no proprio banco/aplicacao. Tecnicamente isso funciona, mas fica abaixo do padrao moderno se comparado ao que o Supabase ja entrega.

Riscos e limitacoes:
- superficie de seguranca maior do que o necessario;
- responsabilidade propria por hash, rotacao, reset, bloqueio e trilha de acesso;
- maior risco de exposicao indevida por consultas ou grants futuros;
- dificuldade de integrar MFA, recuperacao, magic links, SSO e politicas de sessao.

Recomendacao de alto nivel:
- migrar identidade para `auth.users` e manter `usuarios_acesso` apenas como perfil de aplicacao;
- remover `senha_hash` e `senha_salt` do schema de negocio;
- vincular `usuarios_acesso.id` ao `auth.users.id`;
- mover autorizacao para claims/JWT + RLS ou para backend com claims assinadas.

### 3. Dados derivados e rebuild manual

`grupos_repetidos` e `repetidos` parecem ser tabelas derivadas reconstruidas pela aplicacao. Isso e aceitavel no inicio, mas tende a gerar:
- drift entre base transacional e projeção;
- custo operacional de rebuild manual;
- maior risco de inconsistencias após falhas parciais.

Arquitetura mais moderna para esse caso:
- materialized view com refresh controlado, se a consistencia eventual for aceitavel;
- job assíncrono orientado a eventos, se a volumetria crescer;
- trigger ou fila de eventos para atualizacao incremental, se a consistencia precisar ser quase imediata.

## Diagnostico de Seguranca

### 1. RLS habilitado, mas praticamente sem politicas

O schema tem `RLS` habilitado em quase todas as tabelas, mas so existem duas policies explicitas:
- `read vehicles`
- `read sales summary`

Na pratica, isso significa:
- para `anon` e `authenticated`, quase todas as tabelas ficam inacessiveis por padrao;
- a aplicacao provavelmente depende de `service_role` no backend para tudo;
- qualquer futura exposicao direta via client Supabase exigira um reprojeto de politicas.

Isso nao e necessariamente errado, mas revela uma arquitetura 100% server-side. Se essa for a decisao, vale explicitar isso na documentacao e endurecer grants.

### 2. Default privileges excessivamente permissivos

O dump mostra:
- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon/authenticated/service_role`
- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon/authenticated/service_role`
- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON SEQUENCES TO anon/authenticated/service_role`

Esse e o principal achado de seguranca do banco hoje.

Impacto:
- qualquer tabela nova criada em `public` nasce com grants amplos para `anon` e `authenticated`;
- qualquer funcao nova tambem nasce exposta a esses papeis;
- se futuramente alguma tabela receber policy permissiva por engano, o grant ja estara aberto;
- funcoes `SECURITY DEFINER` futuras podem virar vetor serio de privilegio.

Recomendacao objetiva:
- revogar default privileges amplos para `anon` e `authenticated`;
- conceder apenas `USAGE`/`EXECUTE`/`SELECT` de forma explicitamente minima e por objeto;
- tratar `service_role` separadamente;
- evitar criar novos objetos de app diretamente em `public` sem regra de grants controlada.

### 3. Grants desnecessarios em funcoes trigger

As funcoes:
- `fn_set_timestamps`
- `fn_set_carros_timestamps`

estao com `GRANT ALL` para `anon`, `authenticated` e `service_role`.

Como sao funcoes de trigger, nao ha ganho real em expo-las dessa forma. O ideal e:
- restringir `EXECUTE` apenas aos papeis necessarios;
- manter essas funcoes em schema interno quando possivel.

### 4. Tabelas legado legiveis por `anon` e `authenticated`

`vehicles` e `sales_summary` recebem grants amplos e policies de leitura publica. Mesmo que sejam tabelas de exemplo/legado, elas:
- ampliam a superficie publica do banco;
- introduzem ruido arquitetural;
- podem induzir erro de consumo por novos devs.

Se nao fazem parte do produto:
- remover do banco;
- ou mover para schema sandbox/demo separado;
- ou marcar explicitamente como nao produtivas.

## Diagnostico de Performance

### 1. Base pequena no momento

Estatisticas gerais coletadas:
- tamanho do banco: `12 MB`
- total de indices: `648 kB`
- total de tabelas: `88 kB`
- table hit rate: `1.00`
- index hit rate: `0.98`
- WAL acumulado: `80 MB`

Interpretacao:
- o banco esta muito pequeno;
- hoje nao ha pressao real de capacidade;
- as recomendacoes de performance aqui sao preventivas, nao corretivas.

### 2. Faltam indices alinhados com consultas da API

Pelo codigo da aplicacao, a listagem de `carros` ordena por `created_at desc`. No schema atual, nao aparece indice dedicado em `carros.created_at`.

Possiveis ganhos:
- criar indice para `carros(created_at desc)`;
- avaliar indice para `anuncios(created_at desc)`, se a API listar por data com frequencia;
- criar indices compostos para filtros combinados de `carros`, conforme padrao real de consulta.

Exemplos provaveis:
- `carros(local, estado_venda, created_at desc)`
- `carros(modelo_id, em_estoque, created_at desc)`

Esses indices so devem ser criados apos confirmar padrao de filtro dominante. Sem isso, ha risco de over-indexing.

### 3. Busca textual ainda e simples

As buscas principais parecem usar `ILIKE` em campos como:
- `placa`
- `nome`
- `modelo`

Em baixa escala, isso e suficiente. Em escala media, o proximo passo natural e:
- `pg_trgm` com indices GIN/GIST para buscas fuzzy;
- ou `tsvector` se houver necessidade de busca semantica por varios campos.

### 4. Auditoria pode crescer mais rapido que o core

`log_alteracoes` tem bons indices, inclusive GIN em `jsonb`, mas e candidata natural a crescimento continuo. Em medio prazo:
- particionar por mes ou trimestre;
- definir politica de retencao para detalhes muito antigos;
- separar trilha operacional e trilha analitica/exportacao.

## Diagnostico de Modelagem

### 1. Uso de texto para dominios controlados

As tabelas `lookup_*` com FKs em texto sao uma escolha valida e flexivel. Para ERP, eu considero essa abordagem melhor que `enum` quando o dominio pode mudar.

Pontos de melhoria:
- padronizar todos os codigos como `citext` ou `text` uppercase com check consistente;
- adicionar comentarios de dominio em tabelas e colunas;
- garantir sementeamento idempotente versionado para todos os lookups.

### 2. Snapshot de venda em `finalizados`

`finalizados` como snapshot denormalizado e boa decisao para historico. Isso desacopla relatorio de venda da mutabilidade de `carros`.

Melhorias possiveis:
- adicionar campos de origem como `carro_id` explicito, caso `id` hoje esteja reaproveitando o id do carro;
- padronizar nomenclatura temporal (`created_at`, `finalizado_em`, `data_venda`, `data_entrega`);
- considerar tabela de eventos de venda separada se houver necessidade de reversoes, renegociacoes ou multiplos status.

### 3. Relacoes N:N estao corretas

As tabelas de relacionamento:
- `carro_caracteristicas_tecnicas`
- `carro_caracteristicas_visuais`

estao bem modeladas com PK composta e FKs adequadas. Isso esta acima da media para apps CRUD simples.

### 4. Falta estrategia de soft delete

Hoje o desenho parece operar com `DELETE` fisico em varias tabelas. Para um ERP, isso costuma ser insuficiente quando o sistema amadurece.

Sugestao:
- adotar `deleted_at` ou `is_deleted` nas entidades sensiveis, se houver demanda de compliance/recuperacao;
- manter hard delete apenas em tabelas derivadas ou puramente tecnicas.

## Achados Prioritarios

### Prioridade alta

1. Revogar `ALTER DEFAULT PRIVILEGES ... GRANT ALL` para `anon` e `authenticated`.
2. Revisar a estrategia de autenticacao customizada em `usuarios_acesso` e planejar migracao para Supabase Auth.
3. Definir se a arquitetura sera:
   - estritamente backend-only com `service_role`; ou
   - hibrida com acesso direto e RLS real por usuario.

### Prioridade media

1. Adicionar indices alinhados ao `ORDER BY created_at` das listagens mais usadas.
2. Evoluir `repetidos`/`grupos_repetidos` para mecanismo derivado mais robusto que rebuild manual.
3. Separar tabelas legado (`vehicles`, `sales_summary`) do schema principal produtivo.
4. Planejar crescimento de `log_alteracoes` com retencao e possivel particionamento.

### Prioridade baixa

1. Adicionar comentarios `COMMENT ON` em tabelas e colunas criticas.
2. Padronizar convencoes de nomenclatura temporal e status.
3. Considerar trigram/full text search se a busca textual crescer.

## Roadmap Recomendado

### Fase 1: endurecimento de seguranca

- Revogar default privileges amplos.
- Revisar grants em funcoes e tabelas.
- Documentar claramente quais acessos sao via backend e quais sao via Supabase client.
- Remover ou isolar tabelas demo/legado.

### Fase 2: maturidade de identidade e autorizacao

- Migrar autenticacao para Supabase Auth.
- Transformar `usuarios_acesso` em perfil de dominio vinculado ao usuario autenticado.
- Introduzir RLS real se houver necessidade de acesso direto do cliente.

### Fase 3: performance e operacao

- Instrumentar consultas reais e mapear top queries.
- Criar indices compostos dirigidos por uso.
- Avaliar particionamento de `log_alteracoes`.
- Substituir rebuild manual por materializacao controlada ou pipeline incremental.

### Fase 4: arquitetura de dados

- Separar schemas por responsabilidade.
- Definir camada `reporting` para agregados e projeções.
- Consolidar convencoes de modelagem, comments e observabilidade.

## Minha Avaliacao Final

Para o porte atual, o banco esta bem acima do minimo esperado para um CRUD improvisado. Ha preocupacao real com integridade, auditoria e modelagem relacional. O que mais precisa evoluir nao e o desenho das tabelas centrais, e sim o desenho de seguranca e governanca do ambiente Supabase.

Se eu tivesse que resumir em uma frase tecnica:

`o core relacional esta bom, mas a postura de acesso e privilegios ainda esta abaixo do nivel desejavel para um ambiente de producao maduro`

## Limitacoes da Analise

Esta avaliacao foi feita sobre o schema remoto real extraido em 2026-03-09 e sobre estatisticas gerais do banco. Nao foi possivel coletar, via `supabase inspect`, metricas detalhadas de:
- uso individual de indices;
- estimativa de linhas por tabela;
- estatisticas de vacuum por tabela.

Alguns comandos de inspecao falharam por autenticacao no pooler com o papel `cli_login_postgres`. Portanto, as recomendacoes de performance foram feitas a partir do schema efetivo, do codigo da aplicacao e das estatisticas globais do banco, nao de planos de execucao reais.
