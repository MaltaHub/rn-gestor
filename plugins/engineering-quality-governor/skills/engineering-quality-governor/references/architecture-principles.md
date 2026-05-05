# Architecture Principles

Use these principles as a decision filter, not as a checklist to force unnecessary abstractions.

## Core Posture

- Prefer the smallest design that satisfies the requirement and preserves future change.
- Match the repository's existing architecture before introducing a new pattern.
- Separate policy from mechanism: business rules should not be hidden inside UI, route handlers, or framework glue.
- Optimize for reviewability: a clear small diff is usually better than a broad architectural rewrite.

## Boundaries

- UI components render state and dispatch user intent.
- Application services coordinate use cases.
- Domain modules hold business rules, invariants, and transformations.
- Infrastructure modules handle databases, APIs, files, queues, and external services.
- Route handlers/controllers validate transport concerns and delegate.

## Pattern Guidance

- Use SOLID to reduce coupling and clarify responsibilities; do not turn every function into a class.
- Use Clean or Hexagonal Architecture when external systems or persistence complexity justify ports/adapters.
- Use DDD tactical patterns only when the domain has meaningful language, invariants, or lifecycle rules.
- Use Strategy for interchangeable algorithms.
- Use Factory for construction that would otherwise leak environment or dependency details.
- Use Adapter for external APIs and incompatible interfaces.
- Use Facade to simplify a noisy subsystem.
- Use Repository only when it clarifies persistence boundaries; avoid wrapping simple queries just for ceremony.

## Anti-Patterns

- Moving code without reducing complexity.
- Creating abstractions before two or more real use cases exist.
- Mixing auth, persistence, formatting, and business rules in one function.
- Letting UI components own domain invariants.
- Adding global state for local workflow needs.
- Catching errors without preserving useful failure context.

## Quality Bar

Good architecture should make the likely next change easier, keep failure modes visible, and make unauthorized or invalid states harder to represent.
