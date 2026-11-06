# Arquitetura e Prioridades de Refatoracao

Data: 2026-03-16

## Resumo executivo

A aplicacao usa um stack moderno (`Next 15`, `React 19`, `TypeScript`, `Supabase`) e ja tem alguns sinais positivos:

- autenticacao real baseada em `Bearer token`
- autorizacao centralizada por papel no backend
- tipos derivados do banco
- auditoria server-side
- extracoes recentes do monolito da grid

Mesmo assim, os maiores riscos de manutencao, seguranca e escalabilidade ainda estao concentrados em cinco areas:

1. `grid` generico com superficie de dados ampla demais
2. uso extensivo de client admin do Supabase
3. regras de dominio espalhadas entre rotas especificas e rota generica
4. monolitos de frontend e CSS global
5. estrategia de testes pouco fatiada

## Pontos criticos

### 1. Grid generico com risco de exposicao e escrita acidental

O endpoint `app/api/v1/grid/[table]/route.ts` faz `select("*")`, resolve o header por descoberta dinamica e usa `lockedColumns` como deny-list no write.

Impacto:

- coluna nova no banco pode aparecer no painel sem revisao funcional
- coluna nova pode virar editavel por acidente
- filtro, sort e leitura ficam mais permissivos do que deveriam
- schema drift vira risco de seguranca e de regressao

Direcao recomendada:

- migrar para allow-list por tabela (`readable`, `editable`, `filterable`, `sortable`)
- separar leitura de escrita no contrato da grid
- impedir `select("*")` para tabelas operacionais e sensiveis

### 2. Fronteira de seguranca concentrada no Next

Hoje o backend usa client admin com `SUPABASE_SECRET_KEY`/`SERVICE_ROLE` em praticamente toda a API.

Impacto:

- a protecao real depende da qualidade do codigo das rotas
- um bug de autorizacao na API nao encontra uma segunda barreira no banco
- fica dificil aplicar principio de menor privilegio

Direcao recomendada:

- reservar client admin para operacoes realmente privilegiadas
- mover regras sensiveis para RLS ou RPCs especificas
- padronizar clients do Supabase e eliminar duplicidade

### 3. Dominio dividido entre rotas especificas e rota generica

O mesmo agregado (`carros`, `modelos`, `anuncios`) pode ser alterado por rotas dedicadas e pelo contrato da planilha.

Impacto:

- validacoes divergem
- auditoria e enrichments podem ficar inconsistentes
- bugs passam a depender de qual rota o frontend usou

Direcao recomendada:

- criar camada de servicos por agregado
- deixar as rotas finas, apenas parseando request e chamando caso de uso
- fazer a grid consumir os mesmos servicos das rotas dedicadas

### 4. Monolitos de frontend

Ainda existem blocos grandes demais:

- `components/ui-grid/holistic-sheet.tsx`
- `components/files/file-manager-workspace.tsx`
- `components/auth/auth-provider.tsx`
- `app/globals.css`

Impacto:

- leitura lenta
- revisao dificil
- mudancas com alto raio de impacto
- queda de testabilidade

Direcao recomendada:

- continuar extracoes por feature
- separar hooks, renderers e logica de dominio
- reduzir CSS global em favor de estilos modulares

### 5. Testes ainda concentrados

Existe cobertura E2E, mas quase toda a superficie esta concentrada em um unico arquivo de teste.

Impacto:

- feedback lento
- depuracao cara
- pouca blindagem para modulos puros e backend

Direcao recomendada:

- testes unitarios para parsers, matching e formatadores
- testes de servico para casos de uso do backend
- E2E apenas para fluxos criticos

## O que ja foi melhorado

Nos refactors recentes:

- logica de impressao foi extraida em modulos dedicados
- filtro/sort local da grid saiu do componente principal
- chrome reutilizavel da sheet foi extraido
- utilitarios de formulario e bulk insert sairam do monolito

## Roadmap sugerido

### P0

- hardening do backend da grid
- schemas formais de entrada
- governanca robusta de usuarios e RBAC
- eliminar exposicao acidental de colunas

### P1

- service layer por agregado
- continuar quebra da `holistic-sheet`
- modularizar gerenciador de arquivos
- reduzir `globals.css`

### P2

- suite unit/integration
- melhorias de performance em arquivos e auditoria
- consolidacao de contratos de API
- limpeza de codigo morto
