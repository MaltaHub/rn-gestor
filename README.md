# RN Gestor Web (Next.js + Supabase)

Aplicação web moderna preparada para deploy na Vercel com backend no Supabase.

## Stack

- Next.js (App Router + TypeScript)
- API Routes para casos de uso de negócio
- Supabase como backend de dados e autenticação

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_PROJECT_REF` (para geração de types)
- `SUPABASE_ACCESS_TOKEN` (PAT do Supabase CLI)
- `SUPABASE_SECRET_KEY` (recomendado)
- `SUPABASE_SERVICE_ROLE_KEY` (fallback legado, opcional)

## Rodar localmente

```bash
npm install
npm run dev
```

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Configure as mesmas variáveis de ambiente no projeto.
3. Deploy automático com `next build`.

## Gerar types do banco

```bash
npm run supabase:types
```

## API v1 (MVP)

- `GET/POST /api/v1/modelos`
- `PATCH/DELETE /api/v1/modelos/:id`
- `GET/POST /api/v1/carros`
- `GET/PATCH/DELETE /api/v1/carros/:id`
- `GET/POST /api/v1/anuncios`
- `PATCH/DELETE /api/v1/anuncios/:id`
- `POST /api/v1/finalizados/:id`
- `POST /api/v1/repetidos/rebuild`
- `GET /api/v1/auditoria`
- `GET /api/v1/lookups`
- `GET/POST /api/v1/grid/:table` (contrato de planilha)
- `DELETE /api/v1/grid/:table/:id`

## Headers de autorizacao (modo desenvolvimento)

Os endpoints leem perfil por header:

- `x-user-role`: `VENDEDOR` | `SECRETARIO` | `GERENTE` | `ADMINISTRADOR`
- `x-user-name`
- `x-user-email`
- `x-user-id` (opcional)

## UI Grid (sheet emulator)

A home (`/`) agora e um emulador de planilhas orientado pelo PRD `ui-grid-prd.md`, com:

- abas por entidade (`CARROS`, `ANUNCIOS`, `MODELOS`, `REPETIDOS_GRUPOS`, `REPETIDOS`)
- filtros por coluna + busca global
- ordenacao multi-coluna (shift+click)
- selecao de linhas/celulas + navegacao por teclado
- copy/paste tabular
- edicao inline (double-click)
- resize de colunas com persistencia local
- operacoes reais no backend (`upsert`, `delete`, `finalizar`, `rebuild`)
