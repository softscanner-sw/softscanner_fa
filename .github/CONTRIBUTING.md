# Contributing to SoftScanner Frontend Analyzer

Thank you for your interest in contributing. This document covers the process, conventions, and non-negotiable constraints for Phase 1.

---

## Ground rules

1. **No Phase 2+ artifacts in Phase 1 models.** The `models/` package must never contain `UserJourney`, `Scenario`, `WorkflowResult`, `Screenshot`, `Execution`, or `CoverageResult`. If you are not sure which phase something belongs to, open an issue first.
2. **Determinism is a hard requirement.** Any change to extraction logic must produce the same output for the same input. Add a test that asserts ID stability before submitting.
3. **Every entity needs provenance.** All new model types that represent source-derived artifacts must carry an `Origin` field.
4. **Arrays must be sorted + unique.** All array fields marked "sorted, unique" in the spec must be enforced at construction, not assumed.

---

## Development setup

```bash
# Install dependencies
npm install

# Typecheck
npm run typecheck

# Run tests
npm test

# Build
npm run build
```

---

## Branch naming

| Prefix | Use |
|---|---|
| `feat/` | New feature or model addition |
| `fix/` | Bug fix |
| `refactor/` | Refactoring with no behavior change |
| `docs/` | Documentation only |
| `chore/` | Tooling, CI, dependency updates |

Example: `feat/widget-validator-extraction`

---

## Commit style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`

Scope examples: `models`, `routes`, `widgets`, `graph`, `config`

---

## Pull request checklist

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm test` passes
- [ ] New/changed model fields are documented with JSDoc
- [ ] ID conventions and ordering rules are respected
- [ ] No Phase 2+ types introduced into `models/`
- [ ] `CHANGELOG.md` entry added (if user-facing change)

---

## Reporting issues

Use the GitHub Issue templates:
- **Bug report** — unexpected extraction output or crash
- **Model proposal** — new field/type for the Phase 1 model
- **Feature request** — new extraction capability

---

## Code of conduct

Be constructive, respectful, and precise. This is a technical project — focus feedback on the code, the spec, and the invariants.
