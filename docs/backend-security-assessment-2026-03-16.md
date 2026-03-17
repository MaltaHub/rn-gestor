# Back-end: Estrutura, Robustez e Seguranca

Data: 2026-03-16

## Estado atual

O backend da aplicacao esta organizado em cima de:

- `App Router` com rotas em `app/api/v1/...`
- wrapper de execucao em `lib/api/execute.ts`
- resolucao de ator autenticado em `lib/api/auth.ts`
- regras de permissao por papel em `lib/domain/access.ts`
- client admin do Supabase em `lib/api/supabase-admin.ts`

## O que esta bom

### Autenticacao server-side

As rotas nao confiam em estado da UI. Elas resolvem o ator no backend a partir do `Bearer token`.

### Autorizacao centralizada

O projeto ja usa `executeAuthenticatedApi`, `executeAuthorizedApi` e `requireRole`, o que evita um backend completamente espalhado.

### Auditoria de operacoes

As principais alteracoes passam por log de auditoria.

## O que ainda era fraco antes desta rodada

### Provisionamento de usuarios inexistente

Nao havia um fluxo robusto para criar ou vincular perfis em `usuarios_acesso` quando um usuario autenticava pela primeira vez.

Consequencia:

- usuarios novos podiam autenticar no Supabase, mas nao entravam no fluxo administrativo de aprovacao
- o comportamento descrito no README sobre primeiro admin nao estava realmente garantido pelo codigo

### Gestao de usuarios dependente da grid

A tabela `usuarios_acesso` existia, mas estava presa ao modelo da planilha e nao havia um painel administrativo funcional dedicado.

Consequencia:

- aprovacao de usuarios nao era um caso de uso de negocio formal
- RBAC ficava correto no papel, mas sem operacao administrativa ergonomica

### Fronteira de seguranca ainda muito apoiada no client admin

O sistema continua com esse ponto como principal risco estrutural: o banco ainda nao e a ultima linha de defesa para grande parte da API.

## Refatoracao aplicada nesta rodada

### 1. Servico central de perfis de acesso

Foi criado `lib/api/access-users.ts` com responsabilidade por:

- localizar perfil por `auth_user_id`
- vincular perfil preexistente por email
- provisionar perfil novo automaticamente
- garantir que somente `APROVADO` entra no sistema
- atualizar `ultimo_login`
- listar usuarios administrativos
- atualizar `nome`, `cargo`, `status` e `obs`

### 2. Provisionamento inicial robusto

Fluxo novo:

- primeiro usuario autenticado recebe perfil `ADMINISTRADOR` aprovado
- proximos usuarios entram como `VENDEDOR` pendente
- usuario nao aprovado nao opera no sistema

### 3. Painel administrativo de usuarios

Foi criado um endpoint administrativo proprio e um workspace de administracao dedicado para o administrador aprovar e gerenciar usuarios.

### 4. Expansao do matcher do middleware

As rotas administrativas agora entram na mesma malha de navegacao protegida.

## Analise de robustez por area

### Sessao

Pontos fortes:

- validacao do token acontece no backend
- o ator nao vem da UI

Pontos a endurecer:

- middleware ainda usa cookie-hint e nao sessao real
- a camada cliente continua com bastante bootstrap e cache local

### RBAC

Pontos fortes:

- papel minimo por rota
- status aprovado exigido para operar

Pontos a endurecer:

- falta modelo formal de permissoes por capacidade
- hoje o sistema trabalha por hierarquia simples (`VENDEDOR` < `SECRETARIO` < `GERENTE` < `ADMINISTRADOR`)
- para crescer sem excecoes acidentais, o ideal e introduzir abilities/capabilities por caso de uso

### Validacao de input

Ponto fraco atual:

- a maior parte das rotas ainda usa validacao manual e casts

Direcao recomendada:

- introduzir schemas formais por rota
- normalizar parse de query/body
- padronizar erros de validacao

### Camada de dados

Ponto fraco atual:

- uso amplo de client admin
- pouca defesa por menor privilegio

Direcao recomendada:

- reduzir uso do client admin
- aplicar RLS nas tabelas sensiveis
- considerar RPCs para mutacoes criticas

### Observabilidade e auditoria

Pontos fortes:

- escrita de log existe

Pontos a endurecer:

- lookup de acao de auditoria ainda e resolvido a cada operacao
- falta separacao entre falha da regra principal e falha da auditoria

## Riscos que ainda permanecem

1. `app/api/v1/grid/[table]/route.ts` continua amplo demais para uma superficie tao sensivel.
2. A camada de validacao ainda nao usa schemas formais.
3. O banco ainda nao protege tudo que deveria proteger se houver bug de autorizacao na API.
4. A suite de testes do backend ainda precisa cobertura de servicos e rotas.

## Proxima refatoracao prioritaria do back-end

1. Introduzir allow-list por tabela na grid.
2. Criar schemas de request/response por rota.
3. Mover regras de dominio de `carros`, `anuncios`, `modelos` e `usuarios` para servicos.
4. Reduzir o uso do client admin a operacoes explicitamente privilegiadas.
