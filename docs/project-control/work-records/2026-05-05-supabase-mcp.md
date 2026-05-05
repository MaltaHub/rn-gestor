# Work Record: Supabase MCP Setup

Date: 2026-05-05
Status: configured
Risk: medium

## Scope

Configure a project-scoped Supabase MCP for `rn-gestor` in the local Codex user configuration.

## Configuration

- MCP name: `supabase-rn-gestor`
- Transport: streamable HTTP
- URL: `https://mcp.supabase.com/mcp?project_ref=ppcwxswgsrnrvpojzedc&read_only=true`
- Token source: `SUPABASE_ACCESS_TOKEN`
- Repository secrets: none added

## Security Decision

The MCP is scoped to one Supabase project and uses `read_only=true`. The bearer token is read from an environment variable and must not be committed to the repository.

## Validation Evidence

- `codex mcp add supabase-rn-gestor --url ... --bearer-token-env-var SUPABASE_ACCESS_TOKEN`: added the MCP server.
- `codex mcp list`: shows `supabase-rn-gestor` enabled with bearer-token auth.
- `SUPABASE_ACCESS_TOKEN`: not set in the current shell session at setup time.
- `manage_tool_registry.py . add`: registered `supabase-mcp-rn-gestor` as a project-scoped MCP.

## Follow-Up

- Set `SUPABASE_ACCESS_TOKEN` in the local shell/user environment before using the MCP.
- Restart Codex after setting the token so the new MCP server and environment variable are loaded in the active session.
- Use manual approval for any database-related tool calls, even in read-only mode.

## Rollback

- Run `codex mcp remove supabase-rn-gestor`.
- Unset or remove `SUPABASE_ACCESS_TOKEN` from the local environment.
- Remove the `supabase-mcp-rn-gestor` entry from `docs/project-control/tool-registry.json` if the MCP is no longer part of the project workflow.
