## Summary

<!-- What does this PR change and why? -->

## Type of change

- [ ] Bug fix
- [ ] New extraction feature
- [ ] Model addition / modification
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] Tooling / CI

## Phase 1 invariants checklist

- [ ] Output remains deterministic (same input → same IDs and ordering)
- [ ] All new entities carry an `Origin` field
- [ ] All "sorted, unique" arrays are enforced at construction
- [ ] No Phase 2+ types introduced (`UserJourney`, `Scenario`, `Execution`, etc.)

## General checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] New model fields have JSDoc comments
- [ ] ID conventions and ordering rules are respected

## Related issues

<!-- Closes #... -->
