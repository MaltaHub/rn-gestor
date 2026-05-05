# Security and Code Quality

Treat security as part of correctness.

## Secure Coding

- Validate and normalize external input at boundaries.
- Authorize every privileged action close to the use case.
- Do not expose server-only secrets to browser code.
- Avoid logging credentials, tokens, personal data, or sensitive payloads.
- Prefer allow-lists over block-lists for dangerous operations.
- Preserve least privilege for database clients and service accounts.
- Fail closed for auth, permissions, and data access.

## Web and API Risks

- Check OWASP-style risks: broken access control, injection, auth failures, insecure design, vulnerable dependencies, logging gaps, SSRF, and unsafe deserialization.
- Use parameterized queries or structured clients instead of string-built queries.
- Make error responses useful without leaking internals.
- Include rate, size, and shape limits where abuse is plausible.

## Secrets

Run `scripts/check_secrets.py` before finalizing work that touches:

- env files
- auth
- API routes
- database clients
- integrations
- CI/CD
- deployment config

If a real secret is found in tracked files, stop and ask for rotation/remediation guidance.

## Maintainability

- Name things after domain meaning, not implementation accidents.
- Keep functions short enough to reason about, but do not split code mechanically.
- Prefer explicit data flow.
- Preserve type safety and exhaustiveness.
- Add comments only for non-obvious reasoning, invariants, or tradeoffs.

## Performance

- Avoid repeated network/database calls inside loops.
- Avoid broad re-renders or expensive derived state in UI.
- Avoid fetching data that is not needed by the workflow.
- Prefer measurement or a clear complexity argument before optimization.
