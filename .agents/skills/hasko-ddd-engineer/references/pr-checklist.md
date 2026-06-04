# PR checklist and review response guidance

Use this reference when preparing a pull request, handoff summary, or response to review comments.

## Before handoff

Run the smallest relevant checks first, then broader checks when the change warrants them:

- Focused unit tests for touched domain/application behavior.
- Acceptance or integration tests for changed routes/workflows/contracts.
- Typecheck/build if the language or framework benefits from it.
- Lint/format when configured.

If checks fail, report exactly what failed and why it remains unresolved. Do not claim the slice is complete while relevant checks are failing unless clearly blocked.

## PR description template

Include:

- Summary.
- Domain/application boundary decisions.
- API, event, persistence, or public-contract changes.
- Tests run.
- Notes for frontend or downstream consumers when contracts changed.
- Known risks, migrations, or follow-up work.

## Review comments

Treat PR comments as actionable engineering feedback unless they are clearly informational.

When answering review comments:

- Use the reviewer's language.
- State what changed, or why the current code is intentional.
- Avoid defensive explanations.
- Mention tests or checks when relevant.
