# Bounded contexts and context maps

Use this reference when a change crosses modules, teams, subdomains, external systems, or language boundaries.

## Bounded context ownership

Treat each bounded context as owning its own model, language, persistence, and contracts.

Do not reuse entities, value objects, DTOs, enums, repositories, or domain events across contexts unless the project has an explicit shared-kernel convention.

If two areas use the same word with different meaning, keep separate model types and name the translation explicitly.

Inspect existing context/module boundaries before moving code. A name collision across contexts is a signal to clarify language, not to force reuse.

## Ubiquitous language discovery

Before naming new concepts, inspect existing domain terms in code, tests, feature files, API docs, event names, architecture docs, and business workflow descriptions.

Prefer terms already used by the business workflow over generic technical names.

When the user or codebase uses a domain term, preserve that language unless there is evidence it is inconsistent or outdated.

## Context relationships

When integrating with another context, identify the relationship before choosing a design:

- Shared kernel: a small, stable model intentionally owned by multiple contexts.
- Customer/supplier: downstream needs influence upstream behavior or contract.
- Conformist: downstream deliberately conforms to upstream’s model.
- Anticorruption layer: downstream protects its model from an upstream or legacy model.
- Open-host service: upstream exposes a stable integration surface.
- Published language: contexts exchange a documented public language through APIs, events, schemas, or contracts.

Do not introduce a formal context-map pattern unless it clarifies the change. Use the terms to choose boundaries and explain integration choices.

## Anticorruption layers

Use an anticorruption layer when external systems, legacy modules, or other bounded contexts use concepts that do not match this context’s domain model.

Translate external DTOs, statuses, enums, identifiers, and lifecycle meanings at the boundary. Do not let foreign models leak into the domain.

Name translation classes after the integration or published language, not after generic mapping mechanics, unless the codebase already has a mapper convention.

## Shared kernel

Use a shared kernel only for small, stable concepts that multiple contexts intentionally own together.

Shared-kernel changes should be treated as public-contract changes for all consuming contexts.

Do not create a shared kernel because duplication feels uncomfortable. Duplicated names across contexts may represent different concepts.
