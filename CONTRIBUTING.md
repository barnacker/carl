# Contributing to CARL

Contributions are welcome under the Apache License 2.0.

## Before opening a significant PR

Open an issue first when the change affects any of the following:

- core architecture or named invariants;
- the Cortex, Nervous System, Immune System, Synapse, Reflex, or Faculty model;
- System Evolution Boundary lifecycle rules;
- security, trust, authority propagation, or audit semantics;
- public terminology or claims about autonomy, cognition, learning, or safety.

Small documentation fixes, typo corrections, formatting fixes, and repository hygiene changes can be proposed directly.

## Contribution expectations

A contribution should preserve the architecture's central constraints:

1. Cortex is the only authority that can originate durable decision policy.
2. Faculties execute through Synapse and never bypass the Nervous System.
3. Reflex is cached policy execution, not an independent decision-maker.
4. Security claims must identify concrete enforcement and falsification conditions.
5. Biological terminology is navigational language, not a proof of cognition.

## Documentation changes

For documentation-only changes:

- keep terminology aligned between `README.md` and `SPEC.md`;
- avoid broad claims that are not tied to a named mechanism;
- prefer precise language over aspirational language;
- keep limitations and falsification conditions visible near capability claims.

## Implementation changes

For implementation PRs, include:

- the stage or invariant the change supports;
- tests or validation steps;
- any new authority boundary, permission, schema, or audit event;
- any threat model or failure mode introduced by the change.

## License

By submitting a PR, contributors grant a perpetual, worldwide, non-exclusive, royalty-free license under Apache License 2.0 for their contribution, consistent with the repository license.
