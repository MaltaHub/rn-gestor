# Supabase backend

Esta pasta contem a migracao inicial para os casos de uso expostos em:

- `GET /api/use-cases/inventory`
- `GET /api/use-cases/sales`

Ajuste os nomes de colunas conforme seu modelo final de negocio.

## Edge Functions

- `consulta-placa`
  - Arquivo: `supabase/functions/consulta-placa/index.ts`
  - Secret obrigatoria: `API_PLACAS_TOKEN`
  - Secret obrigatoria: `EDGE_INTERNAL_KEY`
  - Config: `verify_jwt = false` em `supabase/config.toml`
  - Resposta normalizada: `fipe` retorna a melhor FIPE por `score`, `fipes` retorna todas as candidatas ordenadas
  - Deploy: `npx supabase functions deploy consulta-placa`
  - Secrets:
    - `npx supabase secrets set API_PLACAS_TOKEN="seu_token"`
    - `npx supabase secrets set EDGE_INTERNAL_KEY="seu_token_interno"`
