# PRD - ERP Web (Supabase + Vercel)

## 1. Visao do Produto
Construir uma aplicacao web moderna para operacao de estoque e venda de veiculos, com backend serverless na Vercel e persistencia no Supabase, substituindo o modelo baseado em planilhas por um modelo relacional auditavel, seguro e escalavel.

## 2. Problema
O modelo atual possui alto acoplamento entre UI, regras e armazenamento em Sheets, com riscos de inconsistencias, baixa governanca de dados e dificuldade de evolucao em times multiplos.

## 3. Objetivos
1. Centralizar dados no Supabase com schema normalizado e auditavel.
2. Isolar regras de negocio no backend serverless.
3. Garantir seguranca por acesso exclusivo via `service_role` no backend.
4. Permitir evolucao de regras de negocio sem alterar estrutura fisica de banco.

## 4. Metas de Sucesso (KPIs)
1. 99.9% de disponibilidade da API.
2. P95 de leitura < 300ms e escrita < 500ms.
3. 0 incidentes de acesso direto indevido por `anon/authenticated`.
4. 100% das mutacoes criticas auditadas em `log_alteracoes`.

## 5. Escopo
### Em escopo (MVP)
1. Gestao de carros, modelos, caracteristicas, anuncios, finalizados, usuarios e auditoria.
2. Rebuild de tabelas derivadas (`repetidos`, `repetidos_grupos`).
3. Autenticacao e autorizacao por perfil.
4. API REST serverless na Vercel.

### Fora de escopo (MVP)
1. BI/analytics avancado.
2. Motor de precificacao inteligente.
3. Integracoes externas com marketplaces.

## 6. Personas e Perfis
1. `ADMINISTRADOR`: governanca total, configuracoes e usuarios.
2. `GERENTE`: operacao tatico-estrategica.
3. `SECRETARIO`: operacoes administrativas de cadastro.
4. `VENDEDOR`: fluxo operacional de venda e consulta.

## 7. Arquitetura Alvo
1. Frontend web no novo repositorio.
2. API serverless na Vercel (Node/TypeScript).
3. Supabase Postgres como sistema de registro.
4. Acesso ao banco apenas por `service_role` no backend.
5. `anon` e `authenticated` sem acesso direto as tabelas de negocio.

## 8. Principios de Dados
1. Tipos primitivos corretos (ex.: boolean em vez de `"sim"/"nao"`).
2. Regras variaveis em tabelas de dominio (`lookup_*`), nao hardcoded em `CHECK`.
3. Relacionamentos explicitos por FK.
4. Auditoria com rastreabilidade de antes/depois em JSONB.

## 9. Modelo de Dados (Resumo)
### Entidades principais
1. `carros`
2. `anuncios`
3. `modelos`
4. `caracteristicas_visuais`
5. `caracteristicas_tecnicas`
6. `finalizados`
7. `usuarios_acesso`
8. `log_alteracoes`
9. `repetidos_grupos`
10. `repetidos`

### Entidades de dominio (business-config)
1. `lookup_user_roles`
2. `lookup_user_statuses`
3. `lookup_sale_statuses`
4. `lookup_announcement_statuses`
5. `lookup_locations`
6. `lookup_vehicle_states`
7. `lookup_audit_actions`

### Relacoes N:N
1. `carro_caracteristicas_visuais (carro_id, caracteristica_id)`
2. `carro_caracteristicas_tecnicas (carro_id, caracteristica_id)`

## 10. Requisitos Funcionais
1. RF-001: CRUD de `carros` com validacao de chaves e obrigatorios.
2. RF-002: CRUD de `modelos` e caracteristicas.
3. RF-003: CRUD de `anuncios` com unicidade de `target_id`.
4. RF-004: API para mover carro para `finalizados` conforme regra de negocio.
5. RF-005: API para rebuild de `repetidos` e `repetidos_grupos`.
6. RF-006: API de autenticacao com sessao e controle por perfil.
7. RF-007: API de auditoria para consulta de historico de alteracoes.
8. RF-008: API de administracao de tabelas `lookup_*`.
9. RF-009: Filtros, busca e paginacao para listagens.
10. RF-010: Operacoes em lote com log de auditoria consolidado.

## 11. Requisitos Nao Funcionais
1. RNF-001: Idempotencia em endpoints de escrita sensiveis.
2. RNF-002: Logs estruturados por request (request_id, actor, route, latency).
3. RNF-003: Observabilidade com metricas por endpoint e erro.
4. RNF-004: Testes automatizados de dominio e integracao.
5. RNF-005: Zero segredo no frontend.
6. RNF-006: Migrations versionadas e reversiveis.

## 12. Contrato de API (Diretrizes)
1. Padrao REST versionado (`/api/v1/...`).
2. Erros padronizados (`code`, `message`, `details`, `request_id`).
3. DTOs desacoplados do schema fisico quando necessario.
4. Paginacao por `page` e `page_size`, com metadados de total.
5. Filtros por query params + ordenacao multi-coluna.

## 13. Seguranca e Acesso
1. API valida autenticacao e perfil antes de executar caso de uso.
2. Backend usa apenas credencial `service_role`.
3. Tabelas com RLS habilitado.
4. `REVOKE ALL` para `anon` e `authenticated`.
5. Auditoria obrigatoria para mutacoes de entidades principais.

## 14. Regras de Negocio Criticas
1. Mudanca de status de venda para vendido impacta estoque.
2. Integridade referencial obrigatoria para FKs.
3. `repetidos` e `repetidos_grupos` sao dados derivados e recalculaveis.
4. Valores de status/cargo/local devem ser gerenciados via `lookup_*`.

## 15. Plano de Entrega
### Fase 1 - Fundacao
1. Provisionar Supabase, aplicar migration base e seeds `lookup_*`.
2. Configurar projeto Vercel e secrets.
3. Implementar camada de acesso a dados e middlewares de auth.

### Fase 2 - Dominio Core
1. Entregar CRUD de `carros`, `modelos`, caracteristicas e anuncios.
2. Entregar usuarios + autorizacao por perfil.
3. Entregar auditoria de mutacoes.

### Fase 3 - Operacoes Avancadas
1. Finalizacao de carros.
2. Rebuild de repetidos.
3. Operacoes em lote e validacoes de integridade.

### Fase 4 - Hardening
1. Testes E2E.
2. Monitoracao e alertas.
3. Ajuste de performance (indices/queries).

## 16. Criterios de Aceite
1. Todas as entidades do escopo com CRUD e validacao funcional.
2. Regras de acesso por perfil atendidas.
3. Auditoria persistida para 100% das mutacoes relevantes.
4. RLS ativo e acesso direto bloqueado para `anon/authenticated`.
5. Rebuild de `repetidos` funcional e consistente.
6. Testes de integracao passando em pipeline CI.

## 17. Riscos e Mitigacoes
1. Risco: divergencia entre dados legados e schema novo.
   Mitigacao: migration de compatibilidade + scripts de saneamento.
2. Risco: regras de negocio dispersas entre frontend e backend.
   Mitigacao: centralizar regra no serverless e manter frontend fino.
3. Risco: uso indevido de `service_role`.
   Mitigacao: segredo apenas no backend, rotacao periodica de chave.

## 18. Dependencias
1. Projeto Supabase criado e acessivel.
2. Repositorio da aplicacao com CI/CD.
3. Definicao final dos contratos de API com frontend.

## 19. Definition of Done (DoD)
1. Schema e migrations aplicados em ambiente de homologacao.
2. Endpoints MVP publicados e testados.
3. Politicas de seguranca validadas.
4. Documentacao tecnica e operacional publicada.
5. Go-live aprovado por validacao funcional e tecnica.
