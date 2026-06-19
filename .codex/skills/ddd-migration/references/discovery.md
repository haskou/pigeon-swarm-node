# Discovery phase

Use discovery to understand the system before changing architecture.

## Inspect

- Repository instructions and architecture docs.
- Module/folder layout.
- Entry points: controllers, routes, jobs, CLI commands, message consumers, UI flows.
- Business-rule locations.
- Persistence models and ownership.
- Public contracts: API schemas, webhooks, events, websocket messages, SDK DTOs.
- Test coverage: unit, integration, acceptance, contract, characterization.
- External integrations and legacy systems.

## Find candidate contexts

Look for clusters of language, workflows, data ownership, and rules that change together.

Signals:

- same words with different meanings;
- modules that depend on each other through internal models;
- duplicated validation or lifecycle checks;
- persistence rows passed across feature boundaries;
- controllers or jobs orchestrating business rules from multiple areas;
- public contracts coupled to internal persistence shape.

## Output

Update migration state with:

- current architecture summary;
- candidate contexts;
- context relationships;
- glossary terms;
- public contracts;
- high-risk seams;
- missing tests;
- first safe migration slices.

Do not perform large code moves in discovery.
