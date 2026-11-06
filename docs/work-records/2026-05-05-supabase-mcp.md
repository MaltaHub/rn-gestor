# Work Record: Supabase MCP Setup

Date: 2026-05-05
Status: configured, write-enabled on approval
Risk: medium

## Scope

Configure a project-scoped Supabase MCP for `rn-gestor` in the local Codex user configuration.

## Configuration

- MCP name: `supabase-rn-gestor`
- Transport: streamable HTTP
- URL: `https://mcp.supabase.com/mcp?project_ref=ppcwxswgsrnrvpojzedc&read_only=false`
- Token source: `SUPABASE_ACCESS_TOKEN`
- Repository secrets: none added

## Security Decision

The MCP is scoped to one Supabase project and is write-enabled after explicit user approval on 2026-05-06. The bearer token is read from an environment variable and must not be committed to the repository.

## Validation Evidence

- `codex mcp add supabase-rn-gestor --url ... --bearer-token-env-var SUPABASE_ACCESS_TOKEN`: added the MCP server.
- `codex mcp list`: shows `supabase-rn-gestor` enabled with bearer-token auth.
- `SUPABASE_ACCESS_TOKEN`: not set in the current shell session at setup time.
- `manage_tool_registry.py . add`: registered `supabase-mcp-rn-gestor` as a project-scoped MCP.
- `codex mcp get supabase-rn-gestor`: confirmed `read_only=false` on 2026-05-06.
- Direct streamable HTTP MCP call: applied `harden_trigger_function_search_path` because the active Codex session still had the previous read-only connector cached.

## Follow-Up

- Keep `SUPABASE_ACCESS_TOKEN` in the local shell/user environment before using the MCP.
- Restart Codex after MCP URL changes so the active session reloads the write-enabled connector.
- Use explicit user approval for database writes and prefer local migrations plus advisor checks before remote DDL.

## Rollback

- Run `codex mcp remove supabase-rn-gestor`.
- Or set the URL back to `read_only=true` if only inspection is needed.
- Unset or remove `SUPABASE_ACCESS_TOKEN` from the local environment.
- Remove the `supabase-mcp-rn-gestor` entry from `docs/project-control/tool-registry.json` if the MCP is no longer part of the project workflow.
