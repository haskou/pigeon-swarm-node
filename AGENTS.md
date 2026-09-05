# AGENTS.md

## Working agreement

- Follow the user's language in conversation. Write issue and PR titles, descriptions, comments, documentation, and commit messages in English. Do not add assistant attribution to issues or PRs.
- Preserve unrelated user changes. Work in a feature/fix branch, never commit directly to `main`, and make incremental commits for verified slices.
- Use conventional commits with gitmoji, for example `fix(calls): 🐛 Recover stalled ICE negotiation`.
- Reuse existing PRs where appropriate. Do not merge or close issues without evidence for their acceptance criteria. Local transport tests do not prove public NAT/CGNAT reachability or bidirectional WebRTC media.
- Follow the priority and dependency order in haskou/pigeon-swarm#28. Dependency updates are separate work.

## Reusable engineering skills

The canonical copies are managed by [ddd-engineer-skills](https://github.com/haskou/ddd-engineer-skills) under `.agents/skills/`. Read the relevant skill when its subject is touched; load its detailed references only for the topics needed.

- DDD, SOLID, application boundaries, repositories, contracts, tests and review: [ddd-engineer](.agents/skills/ddd-engineer/SKILL.md).
- Changes to container resolution or composition: [haskou-ddd-kernel](.agents/skills/haskou-ddd-kernel/SKILL.md).
- Changes using `@haskou/value-objects`: [haskou-value-objects](.agents/skills/haskou-value-objects/SKILL.md).
- Async coordination using `@haskou/flow`, when that dependency is present: [haskou-flow](.agents/skills/haskou-flow/SKILL.md).
- An actual incremental architecture migration: [ddd-migration](.agents/skills/ddd-migration/SKILL.md).

Install or update from the repository root:

```sh
npx github:haskou/ddd-engineer-skills install
npx github:haskou/ddd-engineer-skills update
```

Commit the installed files and `.agents/skills/.ddd-engineer-skills.json` together. Do not hand-edit managed skills; contribute reusable changes upstream. Do not use `--force` on local modifications without preserving and reviewing them.

## Pigeon Swarm conventions

These local conventions take precedence over generic examples in the skills.

- Class files use PascalCase matching the exported class, including Value Objects; do not migrate them to plural kebab-case.
- External primitive inputs enter use cases through `application/<action-name>/messages/<MessageClassName>.ts`. Do not replace this with generic commands/requests folders.
- Domain repository contracts live in `domain/repositories` and return domain objects or explicit Null Objects; `Store` names belong only to third-party infrastructure adapters.
- `src/index.ts` and app-level composition modules own bindings. `src/shared/infrastructure/dependencyInjection/DependencyInjection.ts` contains generic container mechanics only. `services.yaml` is generated.
- Resolve app components through the existing DI path. Use default exports where required by generated discovery and constructor injection rather than test-only optional dependencies.
- Aggregate creation and state changes record domain events; hydration and local-only non-replicated operations do not invent replicated events.
- Keep context diagrams aligned when domain structure changes.

## Contracts and validation

- Endpoint changes update `docs/api.md`, the relevant `src/apps/apis/*-api/swagger.yaml`, and `src/apps/apis/open-api.yaml` when included in the aggregate contract.
- Gossip/pubsub changes update `docs/pubsub-sync-protocol.md` with recipients, payload and synchronization behavior.
- Use `jest-mock-extended` where mocks are needed. Exercise production behavior rather than adding APIs only for tests.
- Run targeted regressions first, then relevant integration/acceptance tests and `yarn lint` / `yarn typecheck`. Broaden testing when the change justifies it.
- Do not claim completion with failing checks. Report exact failures, what was verified and any limits of the environment.
